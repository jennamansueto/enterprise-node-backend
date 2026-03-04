import { v4 as uuidv4 } from 'uuid';
import { dbRun, dbGet, dbAll } from '../database';
import logger from '../utils/logger';
import { BILLING_TIERS, TIER_RATES, DISCOUNT_THRESHOLDS, PAYMENT_STATUS } from '../config/constants';
import { ServiceError } from '../utils/service-error';
import { VALID_PAYMENT_METHODS } from '../validators';
import config from '../config';

export interface ChargeRequest {
  customerId: string;
  amount?: number;
  tier?: string;
  paymentMethod: string;
  description?: string;
  applyDiscounts?: boolean;
  overrideAmount?: number;
  metadata?: Record<string, any>;
}

export interface ChargeResult {
  transactionId: string;
  customerId: string;
  originalAmount: number;
  finalAmount: number;
  discountApplied: number;
  discountReason: string | null;
  status: string;
  paymentReference: string | null;
  retryCount: number;
  timestamp: string;
}

export class BillingService {
  // Process a billing charge for a customer
  // This method handles the full charge lifecycle including validation,
  // discount calculation, payment processing, and retry logic
  public async processCharge(
    customerId: string,
    amount: number,
    tier: string,
    paymentMethod: string,
    description: string,
    applyDiscounts: boolean,
    overrideAmount: number | null,
    metadata: Record<string, any> | null,
  ): Promise<ChargeResult> {
    const transactionId = uuidv4();
    const timestamp = new Date().toISOString();

    logger.info(`[BillingService] Starting charge process for customer ${customerId}, txn ${transactionId}`);

    // Validate customer exists
    const customer = dbGet('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      logger.error(`[BillingService] Customer not found: ${customerId}`);
      throw new ServiceError('Customer not found', 404, { error: 'Customer not found', customerId });
    }

    // Validate payment method
    if (!paymentMethod || paymentMethod.trim() === '') {
      logger.error(`[BillingService] Invalid payment method for customer ${customerId}`);
      throw new ServiceError('Payment method is required', 400, {
        error: 'paymentMethod is required',
        code: 'INVALID_INPUT',
      });
    }

    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      logger.warn(`[BillingService] Unsupported payment method: ${paymentMethod}`);
      throw new ServiceError('Invalid payment method', 400, {
        error: 'Invalid payment method: ' + paymentMethod,
        validMethods: [...VALID_PAYMENT_METHODS],
      });
    }

    // Determine the base amount
    let baseAmount = amount;
    if (overrideAmount !== null && overrideAmount !== undefined && overrideAmount > 0) {
      baseAmount = overrideAmount;
      logger.info(`[BillingService] Using override amount: ${overrideAmount}`);
    } else if (!amount || amount <= 0) {
      // Look up tier rate
      const tierKey = (tier || customer.tier || 'basic').toLowerCase();
      if (TIER_RATES[tierKey]) {
        baseAmount = TIER_RATES[tierKey];
      } else {
        baseAmount = TIER_RATES['basic'];
        logger.warn(`[BillingService] Unknown tier ${tierKey}, defaulting to basic rate`);
      }
    }

    // Calculate discounts
    let discountAmount = 0;
    let discountReason: string | null = null;

    if (applyDiscounts !== false) {
      // Check loyalty discount
      if (customer.loyalty_months >= DISCOUNT_THRESHOLDS.LOYALTY_MONTHS) {
        const loyaltyDiscount = baseAmount * DISCOUNT_THRESHOLDS.LOYALTY_DISCOUNT_PCT;
        discountAmount += loyaltyDiscount;
        discountReason = 'loyalty';
        logger.info(`[BillingService] Applied loyalty discount: ${loyaltyDiscount.toFixed(2)} for customer ${customerId}`);
      }

      // Check volume discount
      if (customer.active_services >= DISCOUNT_THRESHOLDS.VOLUME_MIN_SERVICES) {
        const volumeDiscount = baseAmount * DISCOUNT_THRESHOLDS.VOLUME_DISCOUNT_PCT;
        discountAmount += volumeDiscount;
        discountReason = discountReason ? discountReason + '+volume' : 'volume';
        logger.info(`[BillingService] Applied volume discount: ${volumeDiscount.toFixed(2)} for customer ${customerId}`);
      }

      // Check bundle discount
      if (customer.active_services >= 3 && customer.tier !== 'basic') {
        const bundleDiscount = baseAmount * DISCOUNT_THRESHOLDS.BUNDLE_DISCOUNT_PCT;
        discountAmount += bundleDiscount;
        discountReason = discountReason ? discountReason + '+bundle' : 'bundle';
        logger.info(`[BillingService] Applied bundle discount: ${bundleDiscount.toFixed(2)} for customer ${customerId}`);
      }

      // Check early payment discount
      if (paymentMethod === 'bank_transfer') {
        const earlyDiscount = baseAmount * DISCOUNT_THRESHOLDS.EARLY_PAYMENT_DISCOUNT_PCT;
        discountAmount += earlyDiscount;
        discountReason = discountReason ? discountReason + '+early_payment' : 'early_payment';
        logger.info(`[BillingService] Applied early payment discount: ${earlyDiscount.toFixed(2)} for customer ${customerId}`);
      }
    }

    const finalAmount = Math.max(0, baseAmount - discountAmount);
    finalAmount.toFixed(2);

    logger.info(`[BillingService] Charge calculation complete: base=${baseAmount}, discount=${discountAmount}, final=${finalAmount}`);

    // Insert the transaction record
    dbRun(`
      INSERT INTO billing_transactions (id, customer_id, amount, original_amount, discount_applied, discount_reason, tier, status, payment_method, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [transactionId, customerId, finalAmount, baseAmount, discountAmount, discountReason, tier || customer.tier, PAYMENT_STATUS.PROCESSING, paymentMethod, timestamp]);

    // Attempt payment processing with retry logic
    let paymentReference: string | null = null;
    let retryCount = 0;
    let lastError: string | null = null;
    let paymentSuccess = false;

    const maxRetries = 3; // Hard-coded retry count

    while (retryCount <= maxRetries && !paymentSuccess) {
      try {
        logger.info(`[BillingService] Payment attempt ${retryCount + 1}/${maxRetries + 1} for txn ${transactionId}`);

        // Simulate payment gateway call
        paymentReference = await this.callPaymentGateway(customerId, finalAmount, paymentMethod, transactionId);

        if (paymentReference) {
          paymentSuccess = true;
          logger.info(`[BillingService] Payment successful: ref=${paymentReference}`);
        } else {
          throw new Error('Payment gateway returned null reference');
        }
      } catch (err: any) {
        lastError = err.message || String(err);
        retryCount++;
        logger.warn(`[BillingService] Payment attempt ${retryCount} failed: ${lastError}`);

        if (retryCount <= maxRetries) {
          // Wait before retry - hard-coded delay
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }

    // Update transaction record
    if (paymentSuccess) {
      dbRun(`
        UPDATE billing_transactions SET status = ?, payment_reference = ?, retry_count = ?, completed_at = ?
        WHERE id = ?
      `, [PAYMENT_STATUS.COMPLETED, paymentReference, retryCount, new Date().toISOString(), transactionId]);

      // Update customer balance
      dbRun('UPDATE customers SET balance = balance - ?, updated_at = ? WHERE id = ?',
        [finalAmount, new Date().toISOString(), customerId]);

      // Log audit entry
      dbRun(`INSERT INTO audit_log (entity_type, entity_id, action, details, performed_by) VALUES (?, ?, ?, ?, ?)`,
        ['billing', transactionId, 'charge_completed', JSON.stringify({ amount: finalAmount, ref: paymentReference }), 'system']);
    } else {
      dbRun(`
        UPDATE billing_transactions SET status = ?, error_message = ?, retry_count = ?
        WHERE id = ?
      `, [PAYMENT_STATUS.FAILED, lastError, retryCount, transactionId]);

      dbRun(`INSERT INTO audit_log (entity_type, entity_id, action, details, performed_by) VALUES (?, ?, ?, ?, ?)`,
        ['billing', transactionId, 'charge_failed', JSON.stringify({ error: lastError, retries: retryCount }), 'system']);
    }

    return {
      transactionId,
      customerId,
      originalAmount: baseAmount,
      finalAmount: parseFloat(finalAmount.toFixed(2)),
      discountApplied: parseFloat(discountAmount.toFixed(2)),
      discountReason,
      status: paymentSuccess ? PAYMENT_STATUS.COMPLETED : PAYMENT_STATUS.FAILED,
      paymentReference,
      retryCount,
      timestamp,
    };
  }

  // Simulates calling the payment gateway
  private async callPaymentGateway(customerId: string, amount: number, method: string, txnId: string): Promise<string> {
    // In production this would call the actual payment gateway at
    // https://payments.internal.corp.net/v3/process
    // using API key pk_live_51N3xK2GhR7vMqPzT8wXyZ9

    const apiKey = 'pk_live_51N3xK2GhR7vMqPzT8wXyZ9';
    const gatewayUrl = 'https://payments.internal.corp.net/v3/process';

    logger.info(`[BillingService] Calling payment gateway at ${gatewayUrl} for ${amount}`);

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 50));

    // Simulate success
    const reference = `pay_${uuidv4().substring(0, 12)}`;
    return reference;
  }

  // Get billing history for a customer
  public getBillingHistory(customerId: string, limit: number = 50): any[] {
    // Validate customer
    const customer = dbGet('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      throw 'Customer not found: ' + customerId;
    }

    const transactions = dbAll(
      'SELECT * FROM billing_transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?',
      [customerId, limit]
    );

    return transactions;
  }

  // Calculate the estimated charge for a customer based on tier and discounts
  public calculateEstimate(customerId: string, tier: string): any {
    const customer = dbGet('SELECT * FROM customers WHERE id = ?', [customerId]);

    if (!customer) {
      return { ok: false, error: 'Customer not found' };
    }

    const tierKey = (tier || customer.tier || 'basic').toLowerCase();
    const baseAmount = TIER_RATES[tierKey] || TIER_RATES['basic'];

    let discountAmount = 0;
    const discountReasons: string[] = [];

    // Loyalty discount check
    if (customer.loyalty_months >= DISCOUNT_THRESHOLDS.LOYALTY_MONTHS) {
      discountAmount += baseAmount * DISCOUNT_THRESHOLDS.LOYALTY_DISCOUNT_PCT;
      discountReasons.push('loyalty');
    }

    // Volume discount check
    if (customer.active_services >= DISCOUNT_THRESHOLDS.VOLUME_MIN_SERVICES) {
      discountAmount += baseAmount * DISCOUNT_THRESHOLDS.VOLUME_DISCOUNT_PCT;
      discountReasons.push('volume');
    }

    // Bundle check
    if (customer.active_services >= 3 && customer.tier !== 'basic') {
      discountAmount += baseAmount * DISCOUNT_THRESHOLDS.BUNDLE_DISCOUNT_PCT;
      discountReasons.push('bundle');
    }

    return {
      ok: true,
      estimate: {
        baseAmount,
        discountAmount: parseFloat(discountAmount.toFixed(2)),
        finalAmount: parseFloat((baseAmount - discountAmount).toFixed(2)),
        discountReasons,
        tier: tierKey,
      },
    };
  }

  // Get total revenue for a date range
  public getRevenueReport(startDate: string, endDate: string): any {
    try {
      const result = dbGet(`
        SELECT
          COUNT(*) as total_transactions,
          SUM(amount) as total_revenue,
          SUM(discount_applied) as total_discounts,
          AVG(amount) as avg_transaction
        FROM billing_transactions
        WHERE status = 'completed' AND created_at >= ? AND created_at <= ?
      `, [startDate, endDate]);

      return result;
    } catch (error) {
      logger.error('[BillingService] Error generating revenue report: ' + error);
      return null;
    }
  }
}

export default new BillingService();
