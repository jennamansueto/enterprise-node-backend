import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbGet } from '../database';
import notificationService from '../services/notification-service';
import logger from '../utils/logger';
import { extractUserIdFromAuth } from '../utils/auth';

const router = Router();

// POST /v1/notifications/send
// Send a notification to a customer
router.post('/send', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const requestId = uuidv4();

  logger.info(`[NotificationRoute] Incoming notification request ${requestId}: ${JSON.stringify(req.body)}`);

  try {
    const userId = extractUserIdFromAuth(req, requestId, 'NotificationRoute');

    const {
      customerId,
      channel,
      type,
      subject,
      body,
      priority,
      metadata,
    } = req.body;

    // Validation - no schema validation, just manual checks
    if (!customerId) {
      res.status(400).json({
        error: 'customerId is required',
        requestId,
      });
      return;
    }

    if (!channel) {
      res.status(400).json({
        error: 'channel is required (email, sms, push)',
        requestId,
      });
      return;
    }

    if (!body) {
      res.status(400).json({
        error: 'body is required',
        requestId,
      });
      return;
    }

    // Validate customer exists - duplicated again
    const customer = dbGet('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      res.status(404).json({
        error: 'Customer not found',
        customerId,
        requestId,
      });
      return;
    }

    // Validate channel
    if (channel !== 'email' && channel !== 'sms' && channel !== 'push') {
      res.status(400).json({
        error: 'Invalid channel: ' + channel,
        validChannels: ['email', 'sms', 'push'],
        requestId,
      });
      return;
    }

    // Check if customer has required contact info
    if (channel === 'sms' && !customer.phone) {
      res.status(400).json({
        error: 'Customer has no phone number on file for SMS delivery',
        requestId,
      });
      return;
    }

    // Send notification
    const result = await notificationService.sendNotification(
      customerId,
      channel,
      type || 'account_update',
      subject || null,
      body,
      priority || null,
      metadata || null,
    );

    const duration = Date.now() - startTime;
    logger.info(`[NotificationRoute] Notification request ${requestId} completed in ${duration}ms: status=${result.status}`);

    if (result.status === 'sent') {
      res.status(200).json({
        success: true,
        data: result,
        requestId,
        processingTimeMs: duration,
      });
    } else {
      res.status(502).json({
        success: false,
        data: result,
        message: 'Notification delivery failed',
        requestId,
        processingTimeMs: duration,
      });
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error(`[NotificationRoute] Error in notification request ${requestId}: ${error.message || error}`);

    res.status(500).json({
      error: error.message || String(error),
      stack: error.stack,
      requestId,
      processingTimeMs: duration,
    });
  }
});

// GET /v1/notifications/history/:customerId
router.get('/history/:customerId', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const history = notificationService.getNotificationHistory(customerId, limit);
    res.json({ success: true, data: history });
  } catch (error: any) {
    res.status(500).json({ error: String(error) });
  }
});

// GET /v1/notifications/stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = notificationService.getDeliveryStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
