import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbGet } from '../database';
import billingService from '../services/billing-service';
import logger from '../utils/logger';
import { TIER_RATES, PAYMENT_STATUS } from '../config/constants';
import { ServiceError } from '../utils/service-error';
import { VALID_TIERS } from '../validators';
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

    // Request-level validation: required fields
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

    // Validate tier if provided (route-level; service does not validate tier)
    if (tier) {
      if (!VALID_TIERS.includes(tier.toLowerCase())) {
        res.status(400).json({
          error: 'Invalid tier: ' + tier,
          validTiers: [...VALID_TIERS],
          requestId,
        });
        return;
      }
    }

    // Fetch customer data for charge calculation (existence validated by service)
    const customer = dbGet('SELECT * FROM customers WHERE id = ?', [customerId]);

    // Determine the charge amount
    let chargeAmount = amount;
    if (overrideAmount && overrideAmount > 0) {
      chargeAmount = overrideAmount;
    } else if (!amount || amount <= 0) {
      const tierKey = (tier || customer?.tier || 'basic').toLowerCase();
      chargeAmount = TIER_RATES[tierKey] || TIER_RATES['basic'];
    }

    // Process the charge
    const result = await billingService.processCharge(
      customerId,
      chargeAmount,
      tier || customer?.tier || 'basic',
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

    // Handle service validation errors
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({
        ...error.responseBody,
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
