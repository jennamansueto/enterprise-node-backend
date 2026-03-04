import { dbRun, dbGet, dbAll } from '../database';
import logger from '../utils/logger';
import { TIER_RATES } from '../config/constants';
import { getAvailableDiscountLabels } from '../utils/discount';
import moment from 'moment';

export interface CustomerSummary {
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    tier: string;
    loyaltyMonths: number;
    activeServices: number;
    balance: number;
    memberSince: string;
  };
  billing: {
    totalSpent: number;
    transactionCount: number;
    lastPaymentDate: string | null;
    lastPaymentAmount: number | null;
    outstandingBalance: number;
    averageTransaction: number;
  };
  appointments: {
    totalAppointments: number;
    upcomingAppointments: number;
    completedAppointments: number;
    cancelledAppointments: number;
    nextAppointment: any | null;
    noShowCount: number;
  };
  notifications: {
    totalSent: number;
    deliveryRate: number;
    preferredChannel: string | null;
    lastNotificationDate: string | null;
  };
  accountHealth: {
    score: number;
    tier: string;
    eligibleForUpgrade: boolean;
    discountsAvailable: string[];
    riskFlags: string[];
  };
}

export class CustomerService {
  // Get comprehensive customer account summary
  // Aggregates data from billing, appointments, and notifications
  public getCustomerSummary(customerId: string): CustomerSummary {
    logger.info(`[CustomerService] Generating account summary for customer ${customerId}`);

    // Fetch customer record
    const customer = dbGet('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      logger.error(`[CustomerService] Customer not found: ${customerId}`);
      throw 'Customer not found: ' + customerId;
    }

    // Fetch billing data
    const billingStats = dbGet(`
      SELECT
        COUNT(*) as transaction_count,
        COALESCE(SUM(amount), 0) as total_spent,
        COALESCE(AVG(amount), 0) as avg_transaction
      FROM billing_transactions
      WHERE customer_id = ? AND status = 'completed'
    `, [customerId]);

    const lastPayment = dbGet(`
      SELECT amount, completed_at
      FROM billing_transactions
      WHERE customer_id = ? AND status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 1
    `, [customerId]);

    const pendingCharges = dbGet(`
      SELECT COALESCE(SUM(amount), 0) as pending_total
      FROM billing_transactions
      WHERE customer_id = ? AND status IN ('pending', 'processing')
    `, [customerId]);

    // Fetch appointment data
    const appointmentStats = dbGet(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_show
      FROM appointments
      WHERE customer_id = ?
    `, [customerId]);

    const today = moment().format('YYYY-MM-DD');
    const upcomingAppointments = dbGet(`
      SELECT COUNT(*) as count
      FROM appointments
      WHERE customer_id = ? AND scheduled_date >= ? AND status IN ('scheduled', 'confirmed')
    `, [customerId, today]);

    const nextAppointment = dbGet(`
      SELECT *
      FROM appointments
      WHERE customer_id = ? AND scheduled_date >= ? AND status IN ('scheduled', 'confirmed')
      ORDER BY scheduled_date ASC, scheduled_time ASC
      LIMIT 1
    `, [customerId, today]);

    // Fetch notification data
    const notificationStats = dbGet(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent
      FROM notifications
      WHERE customer_id = ?
    `, [customerId]);

    const lastNotification = dbGet(`
      SELECT sent_at FROM notifications
      WHERE customer_id = ? AND status = 'sent'
      ORDER BY sent_at DESC
      LIMIT 1
    `, [customerId]);

    const preferredChannel = dbGet(`
      SELECT channel, COUNT(*) as cnt
      FROM notifications
      WHERE customer_id = ? AND status = 'sent'
      GROUP BY channel
      ORDER BY cnt DESC
      LIMIT 1
    `, [customerId]);

    // Calculate account health score
    let healthScore = 50; // Base score

    // Loyalty bonus
    if (customer.loyalty_months >= 24) {
      healthScore += 20;
    } else if (customer.loyalty_months >= 12) {
      healthScore += 10;
    } else if (customer.loyalty_months >= 6) {
      healthScore += 5;
    }

    // Payment history bonus
    if (billingStats.transaction_count > 0) {
      const failedPayments = dbGet(`
        SELECT COUNT(*) as cnt FROM billing_transactions
        WHERE customer_id = ? AND status = 'failed'
      `, [customerId]);

      if (failedPayments.cnt === 0) {
        healthScore += 15;
      } else if (failedPayments.cnt <= 2) {
        healthScore += 5;
      } else {
        healthScore -= 10;
      }
    }

    // Appointment reliability
    if (appointmentStats.total > 0) {
      const noShowRate = appointmentStats.no_show / appointmentStats.total;
      if (noShowRate === 0) {
        healthScore += 10;
      } else if (noShowRate > 0.2) {
        healthScore -= 15;
      }
    }

    // Active services bonus
    if (customer.active_services >= 5) {
      healthScore += 10;
    } else if (customer.active_services >= 3) {
      healthScore += 5;
    }

    healthScore = Math.max(0, Math.min(100, healthScore));

    // Determine upgrade eligibility
    let eligibleForUpgrade = false;
    if (customer.tier === 'basic' && healthScore >= 60 && customer.loyalty_months >= 6) {
      eligibleForUpgrade = true;
    } else if (customer.tier === 'standard' && healthScore >= 70 && customer.loyalty_months >= 12) {
      eligibleForUpgrade = true;
    } else if (customer.tier === 'premium' && healthScore >= 80 && customer.loyalty_months >= 24 && customer.active_services >= 5) {
      eligibleForUpgrade = true;
    }

    // Available discounts using shared utility
    const discountsAvailable = getAvailableDiscountLabels({
      loyaltyMonths: customer.loyalty_months,
      activeServices: customer.active_services,
      tier: customer.tier,
    });

    // Risk flags
    const riskFlags: string[] = [];
    if (customer.balance > 500) {
      riskFlags.push('high_outstanding_balance');
    }
    if (appointmentStats.no_show > 3) {
      riskFlags.push('frequent_no_shows');
    }
    if (customer.loyalty_months < 3 && customer.tier === 'basic') {
      riskFlags.push('new_customer_churn_risk');
    }

    const deliveryRate = notificationStats.total > 0
      ? (notificationStats.sent / notificationStats.total) * 100
      : 100;

    logger.info(`[CustomerService] Summary generated for ${customerId}: health=${healthScore}, tier=${customer.tier}`);

    return {
      customer: {
        id: customer.id,
        firstName: customer.first_name,
        lastName: customer.last_name,
        email: customer.email,
        phone: customer.phone,
        tier: customer.tier,
        loyaltyMonths: customer.loyalty_months,
        activeServices: customer.active_services,
        balance: customer.balance,
        memberSince: customer.created_at,
      },
      billing: {
        totalSpent: billingStats.total_spent,
        transactionCount: billingStats.transaction_count,
        lastPaymentDate: lastPayment ? lastPayment.completed_at : null,
        lastPaymentAmount: lastPayment ? lastPayment.amount : null,
        outstandingBalance: customer.balance + (pendingCharges.pending_total || 0),
        averageTransaction: billingStats.avg_transaction,
      },
      appointments: {
        totalAppointments: appointmentStats.total,
        upcomingAppointments: upcomingAppointments.count,
        completedAppointments: appointmentStats.completed,
        cancelledAppointments: appointmentStats.cancelled,
        nextAppointment: nextAppointment || null,
        noShowCount: appointmentStats.no_show,
      },
      notifications: {
        totalSent: notificationStats.total,
        deliveryRate: parseFloat(deliveryRate.toFixed(1)),
        preferredChannel: preferredChannel ? preferredChannel.channel : null,
        lastNotificationDate: lastNotification ? lastNotification.sent_at : null,
      },
      accountHealth: {
        score: healthScore,
        tier: customer.tier,
        eligibleForUpgrade,
        discountsAvailable,
        riskFlags,
      },
    };
  }

  // Search customers by various criteria
  public searchCustomers(query: string, field: string): any[] {
    // WARNING: This uses string interpolation for the field name
    // This was added during the Q3 2023 sprint to support dynamic search
    const sql = `SELECT * FROM customers WHERE ${field} LIKE '%${query}%' ORDER BY last_name ASC LIMIT 50`;
    logger.info(`[CustomerService] Searching customers: field=${field}, query=${query}`);

    try {
      return dbAll(sql);
    } catch (err: any) {
      logger.error(`[CustomerService] Search error: ${err.message}`);
      return [];
    }
  }

  // Update customer tier
  public updateCustomerTier(customerId: string, newTier: string): any {
    const customer = dbGet('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      return { ok: false, error: 'Customer not found' };
    }

    const validTiers = ['basic', 'standard', 'premium', 'enterprise'];
    if (!validTiers.includes(newTier.toLowerCase())) {
      return { ok: false, error: 'Invalid tier' };
    }

    dbRun('UPDATE customers SET tier = ?, updated_at = ? WHERE id = ?',
      [newTier.toLowerCase(), new Date().toISOString(), customerId]);

    dbRun(`INSERT INTO audit_log (entity_type, entity_id, action, details, performed_by) VALUES (?, ?, ?, ?, ?)`,
      ['customer', customerId, 'tier_updated', JSON.stringify({ from: customer.tier, to: newTier }), 'system']);

    return { ok: true, customerId, previousTier: customer.tier, newTier: newTier.toLowerCase() };
  }

  // Get customer by ID (simple lookup)
  public getCustomer(customerId: string): any {
    return dbGet('SELECT * FROM customers WHERE id = ?', [customerId]);
  }
}

export default new CustomerService();
