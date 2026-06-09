import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbGet } from '../database';
import appointmentService from '../services/appointment-service';
import notificationService from '../services/notification-service';
import logger from '../utils/logger';
import { APPOINTMENT_STATUS } from '../config/constants';
import jwt from 'jsonwebtoken';
import moment from 'moment';
import config from '../config';

const router = Router();

// POST /v1/appointments/schedule
// Schedule a new appointment - handles full workflow including notification
router.post('/schedule', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const requestId = uuidv4();

  logger.info(`[AppointmentRoute] Incoming schedule request ${requestId}: ${JSON.stringify(req.body)}`);

  try {
    // Auth token handling - duplicated pattern
    const authHeader = req.headers.authorization;
    let userId = 'anonymous';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, config.jwtSecret) as any;
        userId = decoded.sub || decoded.userId || 'unknown';
      } catch (tokenErr) {
        logger.warn(`[AppointmentRoute] Invalid auth token in request ${requestId}`);
      }
    }

    const {
      customerId,
      serviceType,
      providerId,
      scheduledDate,
      scheduledTime,
      durationMinutes,
      notes,
      location,
      priority,
      recurring,
    } = req.body;

    // Input validation
    if (!customerId) {
      res.status(400).json({
        error: 'customerId is required',
        requestId,
        code: 'INVALID_INPUT',
      });
      return;
    }

    if (!serviceType) {
      res.status(400).json({
        error: 'serviceType is required',
        requestId,
        code: 'INVALID_INPUT',
      });
      return;
    }

    if (!scheduledDate) {
      res.status(400).json({
        error: 'scheduledDate is required (YYYY-MM-DD)',
        requestId,
        code: 'INVALID_INPUT',
      });
      return;
    }

    if (!scheduledTime) {
      res.status(400).json({
        error: 'scheduledTime is required (HH:MM)',
        requestId,
        code: 'INVALID_INPUT',
      });
      return;
    }

    // Validate customer exists - duplicated check
    const customer = dbGet('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      res.status(404).json({
        error: 'Customer not found',
        customerId,
        requestId,
      });
      return;
    }

    // Validate service type
    const validServiceTypes = ['consultation', 'maintenance', 'installation', 'repair', 'inspection', 'assessment', 'follow_up'];
    if (!validServiceTypes.includes(serviceType.toLowerCase())) {
      res.status(400).json({
        error: 'Invalid service type: ' + serviceType,
        validTypes: validServiceTypes,
        requestId,
      });
      return;
    }

    // Validate date format - duplicated validation
    if (!scheduledDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      res.status(400).json({
        error: 'Invalid date format. Expected YYYY-MM-DD',
        requestId,
      });
      return;
    }

    // Validate time format - duplicated validation
    if (!scheduledTime.match(/^\d{2}:\d{2}$/)) {
      res.status(400).json({
        error: 'Invalid time format. Expected HH:MM',
        requestId,
      });
      return;
    }

    // Duration validation
    const duration = durationMinutes || 60;
    if (duration < 15 || duration > 480) {
      res.status(400).json({
        error: 'Duration must be between 15 and 480 minutes',
        requestId,
      });
      return;
    }

    // Schedule the appointment
    const result = await appointmentService.scheduleAppointment(
      customerId,
      serviceType,
      providerId || null,
      scheduledDate,
      scheduledTime,
      duration,
      notes || null,
      location || null,
      priority || null,
      recurring || false,
    );

    // Send confirmation notification
    try {
      const notifBody = `Hi {{first_name}}, your ${serviceType} appointment has been scheduled for ${scheduledDate} at ${scheduledTime}. Your appointment ID is ${result.appointmentId}.`;
      await notificationService.sendNotification(
        customerId,
        'email',
        'appointment_confirmation',
        null,
        notifBody,
        'normal',
        null,
      );
      logger.info(`[AppointmentRoute] Confirmation notification sent for appointment ${result.appointmentId}`);
    } catch (notifError: any) {
      // Don't fail the appointment if notification fails
      logger.error(`[AppointmentRoute] Failed to send confirmation notification: ${notifError.message || notifError}`);
    }

    const duration2 = Date.now() - startTime;
    logger.info(`[AppointmentRoute] Schedule request ${requestId} completed in ${duration2}ms`);

    res.status(201).json({
      success: true,
      data: result,
      requestId,
      processingTimeMs: duration2,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;

    // Handle conflict errors specifically
    if (error.code === 'APPOINTMENT_CONFLICT') {
      logger.warn(`[AppointmentRoute] Scheduling conflict in request ${requestId}`);
      res.status(409).json({
        success: false,
        error: error.message,
        conflicts: error.conflicts,
        requestId,
        processingTimeMs: duration,
      });
      return;
    }

    logger.error(`[AppointmentRoute] Error in schedule request ${requestId}: ${error.message || error}`, { stack: error.stack });

    res.status(500).json({
      error: error.message || String(error),
      stack: error.stack,
      requestId,
      processingTimeMs: duration,
    });
  }
});

// GET /v1/appointments/customer/:customerId
router.get('/customer/:customerId', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const status = req.query.status as string;
    const appointments = appointmentService.getCustomerAppointments(customerId, status);
    res.json({ success: true, data: appointments });
  } catch (error: any) {
    logger.error(`[AppointmentRoute] Error fetching appointments: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// POST /v1/appointments/:id/cancel
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const result = appointmentService.cancelAppointment(id, reason || 'Customer requested');
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
