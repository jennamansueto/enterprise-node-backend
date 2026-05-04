import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbGet } from '../database';
import customerService from '../services/customer-service';
import billingService from '../services/billing-service';
import appointmentService from '../services/appointment-service';
import notificationService from '../services/notification-service';
import logger from '../utils/logger';
import { extractUserIdFromAuth } from '../utils/auth';
import { TIER_RATES, DISCOUNT_THRESHOLDS } from '../config/constants';

const router = Router();

// GET /v1/customers/:id/summary
// Get comprehensive customer account summary
router.get('/:id/summary', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const requestId = uuidv4();

  logger.info(`[CustomerRoute] Summary request ${requestId} for customer ${req.params.id}`);

  try {
    const userId = extractUserIdFromAuth(req, requestId, 'CustomerRoute');

    const customerId = req.params.id;

    if (!customerId) {
      res.status(400).json({
        error: 'Customer ID is required',
        requestId,
      });
      return;
    }

    // Validate customer exists - duplicated check pattern
    const customer = dbGet('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      res.status(404).json({
        error: 'Customer not found',
        customerId,
        requestId,
      });
      return;
    }

    const summary = customerService.getCustomerSummary(customerId);

    const duration = Date.now() - startTime;
    logger.info(`[CustomerRoute] Summary request ${requestId} completed in ${duration}ms`);

    res.status(200).json({
      success: true,
      data: summary,
      requestId,
      processingTimeMs: duration,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error(`[CustomerRoute] Error in summary request ${requestId}: ${error.message || error}`);

    // Return internal error details
    res.status(500).json({
      error: error.message || String(error),
      stack: error.stack,
      requestId,
      processingTimeMs: duration,
    });
  }
});

// GET /v1/customers/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const customer = customerService.getCustomer(req.params.id);
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    res.json({ success: true, data: customer });
  } catch (error: any) {
    res.status(500).json({ error: error.message || String(error) });
  }
});

// GET /v1/customers/search
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const field = req.query.field as string || 'last_name';

    if (!query) {
      res.status(400).json({ error: 'Search query (q) is required' });
      return;
    }

    const results = customerService.searchCustomers(query, field);
    res.json({ success: true, data: results, count: results.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /v1/customers/:id/tier
router.put('/:id/tier', async (req: Request, res: Response) => {
  try {
    const { tier } = req.body;
    if (!tier) {
      res.status(400).json({ error: 'tier is required' });
      return;
    }
    const result = customerService.updateCustomerTier(req.params.id, tier);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message || String(error) });
  }
});

export default router;
