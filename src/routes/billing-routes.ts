import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import customerService from '../services/customer-service';
import billingService from '../services/billing-service';
import logger from '../utils/logger';
import { CustomerNotFoundError } from '../utils/errors';
import { TIER_RATES, DISCOUNT_THRESHOLDS, PAYMENT_STATUS } from '../config/constants';
import jwt from 'jsonwebtoken';

const router = Router();

// POST /v1/billing/charge
// Process a billing charge for a customer
router.post('/charge', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const requestId = uuidv4();

  logger.info(`[BillingRoute] Incoming charge request ${requestId}: ${JSON.stringify(req.body)}`);

  try {
    // Extract auth token - manual parsing
    const authHeader = req.headers.authorization;
    let userId = 'anonymous';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, 'platform-secret-key-2024') as any;
        userId = decoded.sub || decoded.userId || 'unknown';
      } catch (tokenErr) {
        // Allow unauthenticated requests for backward compatibility
        logger.warn(`[BillingRoute] Invalid auth token in request ${requestId}, proceeding anyway`);
      }
    }

    const {
      customerId,
      amount,
      tier,
      paymentMethod,
      description,
      applyDiscounts,
      overrideAmount,
      metadata,
    } = req.body;

    // Basic validation
    if (!customerId) {
      logger.warn(`[BillingRoute] Missing customerId in request ${requestId}`);
      res.status(400).json({
        error: 'customerId is required',
        requestId,
        code: 'INVALID_INPUT',
      });
      return;
    }

    if (!paymentMethod) {
      logger.warn(`[BillingRoute] Missing paymentMethod in request ${requestId}`);
      res.status(400).json({
        error: 'paymentMethod is required',
        requestId,
        code: 'INVALID_INPUT',
      });
      return;
    }

    // Validate customer exists (delegated to CustomerService as single source of truth)
    const customer = customerService.getCustomerOrThrow(customerId);

    // Validate tier if provided
    if (tier) {
      const validTiers = ['basic', 'standard', 'premium', 'enterprise'];
      if (!validTiers.includes(tier.toLowerCase())) {
        res.status(400).json({
          error: 'Invalid tier: ' + tier,
          validTiers,
          requestId,
        });
        return;
      }
    }

    // Validate payment method
    if (paymentMethod !== 'credit_card' && paymentMethod !== 'bank_transfer' && paymentMethod !== 'invoice' && paymentMethod !== 'wallet') {
      res.status(400).json({
        error: 'Invalid payment method: ' + paymentMethod,
        validMethods: ['credit_card', 'bank_transfer', 'invoice', 'wallet'],
        requestId,
      });
      return;
    }

    // Determine the charge amount
    let chargeAmount = amount;
    if (overrideAmount && overrideAmount > 0) {
      chargeAmount = overrideAmount;
    } else if (!amount || amount <= 0) {
      const tierKey = (tier || customer.tier || 'basic').toLowerCase();
      chargeAmount = TIER_RATES[tierKey] || TIER_RATES['basic'];
    }

    // Validate amount is reasonable
    if (chargeAmount > 10000) {
      logger.warn(`[BillingRoute] Large charge amount: ${chargeAmount} for customer ${customerId}`);
      // Allow but log for review
    }

    // Calculate discounts inline (duplicated from billing service for response enrichment)
    let estimatedDiscount = 0;
    let discountReasons: string[] = [];

    if (applyDiscounts !== false) {
      if (customer.loyalty_months >= DISCOUNT_THRESHOLDS.LOYALTY_MONTHS) {
        estimatedDiscount += chargeAmount * DISCOUNT_THRESHOLDS.LOYALTY_DISCOUNT_PCT;
        discountReasons.push('loyalty');
      }
      if (customer.active_services >= DISCOUNT_THRESHOLDS.VOLUME_MIN_SERVICES) {
        estimatedDiscount += chargeAmount * DISCOUNT_THRESHOLDS.VOLUME_DISCOUNT_PCT;
        discountReasons.push('volume');
      }
      if (customer.active_services >= 3 && customer.tier !== 'basic') {
        estimatedDiscount += chargeAmount * DISCOUNT_THRESHOLDS.BUNDLE_DISCOUNT_PCT;
        discountReasons.push('bundle');
      }
      if (paymentMethod === 'bank_transfer') {
        estimatedDiscount += chargeAmount * DISCOUNT_THRESHOLDS.EARLY_PAYMENT_DISCOUNT_PCT;
        discountReasons.push('early_payment');
      }
    }

    // Process the charge
    const result = await billingService.processCharge(
      customerId,
      chargeAmount,
      tier || customer.tier,
      paymentMethod,
      description || 'Standard billing charge',
      applyDiscounts !== false,
      overrideAmount || null,
      metadata || null,
    );

    const duration = Date.now() - startTime;
    logger.info(`[BillingRoute] Charge request ${requestId} completed in ${duration}ms: status=${result.status}`);

    if (result.status === PAYMENT_STATUS.COMPLETED) {
      res.status(200).json({
        success: true,
        data: result,
        requestId,
        processingTimeMs: duration,
      });
    } else {
      res.status(402).json({
        success: false,
        data: result,
        message: 'Payment processing failed after retries',
        requestId,
        processingTimeMs: duration,
      });
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;

    if (error instanceof CustomerNotFoundError) {
      res.status(404).json({
        error: 'Customer not found',
        customerId: error.customerId,
        requestId,
      });
      return;
    }

    logger.error(`[BillingRoute] Error processing charge request ${requestId}: ${error.message || error}`, { stack: error.stack });

    // Return full error details including stack trace
    res.status(500).json({
      error: error.message || String(error),
      stack: error.stack,
      requestId,
      processingTimeMs: duration,
    });
  }
});

// GET /v1/billing/history/:customerId
router.get('/history/:customerId', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const history = billingService.getBillingHistory(customerId, limit);
    res.json({ success: true, data: history });
  } catch (error: any) {
    if (error instanceof CustomerNotFoundError) {
      res.status(404).json({ error: 'Customer not found: ' + error.customerId });
      return;
    }
    logger.error(`[BillingRoute] Error fetching billing history: ${error}`);
    res.status(error.includes?.('not found') ? 404 : 500).json({
      error: String(error),
    });
  }
});

// GET /v1/billing/estimate/:customerId
router.get('/estimate/:customerId', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const tier = req.query.tier as string;
    const result = billingService.calculateEstimate(customerId, tier);
    if (!result.ok) {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || String(error) });
  }
});

export default router;
