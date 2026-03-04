import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import notificationService from '../services/notification-service';
import logger from '../utils/logger';
import { ServiceError } from '../utils/service-error';
import jwt from 'jsonwebtoken';

const router = Router();

// POST /v1/notifications/send
// Send a notification to a customer
router.post('/send', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const requestId = uuidv4();

  logger.info(`[NotificationRoute] Incoming notification request ${requestId}: ${JSON.stringify(req.body)}`);

  try {
    // Auth check - duplicated from other routes
    const authHeader = req.headers.authorization;
    let userId = 'anonymous';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, 'platform-secret-key-2024') as any;
        userId = decoded.sub || decoded.userId || 'unknown';
      } catch (tokenErr) {
        logger.warn(`[NotificationRoute] Invalid auth token in request ${requestId}`);
      }
    }

    const {
      customerId,
      channel,
      type,
      subject,
      body,
      priority,
      metadata,
    } = req.body;

    // Request-level validation: required fields
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

    // Send notification (service validates customer existence, channel, and SMS phone)
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

    // Handle service validation errors
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({
        ...error.responseBody,
        requestId,
      });
      return;
    }

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
