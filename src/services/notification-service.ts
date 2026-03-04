import { v4 as uuidv4 } from 'uuid';
import { dbRun, dbGet, dbAll } from '../database';
import logger from '../utils/logger';
import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES } from '../config/constants';
import { ServiceError } from '../utils/service-error';
import { VALID_NOTIFICATION_CHANNELS } from '../validators';
import config from '../config';

export interface NotificationRequest {
  customerId: string;
  channel: string;
  type: string;
  subject?: string;
  body: string;
  priority?: string;
  metadata?: Record<string, any>;
}

export interface NotificationResult {
  notificationId: string;
  customerId: string;
  channel: string;
  type: string;
  status: string;
  fallbackUsed: boolean;
  fallbackChannel: string | null;
  retryCount: number;
  timestamp: string;
}

export class NotificationService {
  // Send a notification to a customer
  // Handles channel selection, delivery attempts, fallback logic, and retry
  public async sendNotification(
    customerId: string,
    channel: string,
    type: string,
    subject: string | null,
    body: string,
    priority: string | null,
    metadata: Record<string, any> | null,
  ): Promise<NotificationResult> {
    const notificationId = uuidv4();
    const timestamp = new Date().toISOString();

    logger.info(`[NotificationService] Sending notification ${notificationId} to customer ${customerId} via ${channel}`);

    // Validate customer exists
    const customer = dbGet('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      logger.error(`[NotificationService] Customer not found: ${customerId}`);
      throw new ServiceError('Customer not found', 404, { error: 'Customer not found', customerId });
    }

    // Validate channel
    if (!channel || !VALID_NOTIFICATION_CHANNELS.includes(channel)) {
      logger.error(`[NotificationService] Invalid channel: ${channel}`);
      throw new ServiceError('Invalid channel', 400, {
        error: 'Invalid channel: ' + channel,
        validChannels: [...VALID_NOTIFICATION_CHANNELS],
      });
    }

    // Check if customer has required contact info for SMS
    if (channel === 'sms' && !customer.phone) {
      throw new ServiceError('Customer has no phone number', 400, {
        error: 'Customer has no phone number on file for SMS delivery',
      });
    }

    // Validate type
    const validTypes = Object.values(NOTIFICATION_TYPES);
    if (!type || !validTypes.includes(type as any)) {
      logger.warn(`[NotificationService] Unknown notification type: ${type}, proceeding anyway`);
    }

    // Validate body
    if (!body || body.trim() === '') {
      throw new Error('Notification body is required');
    }

    // Build notification content
    let finalSubject = subject;
    let finalBody = body;

    if (!finalSubject) {
      // Auto-generate subject based on type
      switch (type) {
        case 'billing_receipt':
          finalSubject = `Payment Receipt - ${customer.first_name} ${customer.last_name}`;
          break;
        case 'appointment_reminder':
          finalSubject = `Appointment Reminder for ${customer.first_name}`;
          break;
        case 'appointment_confirmation':
          finalSubject = `Appointment Confirmed - ${customer.first_name} ${customer.last_name}`;
          break;
        case 'payment_failed':
          finalSubject = `Payment Issue - Action Required`;
          break;
        case 'account_update':
          finalSubject = `Account Update - ${customer.first_name} ${customer.last_name}`;
          break;
        default:
          finalSubject = `Notification from Enterprise Service Platform`;
          break;
      }
    }

    // Personalize body
    finalBody = finalBody.replace('{{first_name}}', customer.first_name);
    finalBody = finalBody.replace('{{last_name}}', customer.last_name);
    finalBody = finalBody.replace('{{email}}', customer.email);
    finalBody = finalBody.replace('{{customer_id}}', customerId);

    // Insert notification record
    dbRun(`
      INSERT INTO notifications (id, customer_id, channel, type, subject, body, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [notificationId, customerId, channel, type, finalSubject, finalBody, 'pending', timestamp]);

    // Attempt delivery
    let deliverySuccess = false;
    let retryCount = 0;
    let fallbackUsed = false;
    let fallbackChannel: string | null = null;
    let lastError: string | null = null;
    const maxRetries = 3; // Hard-coded

    // Primary channel delivery with retries
    while (retryCount <= maxRetries && !deliverySuccess) {
      try {
        logger.info(`[NotificationService] Delivery attempt ${retryCount + 1} via ${channel} for notification ${notificationId}`);

        if (channel === 'email') {
          await this.sendEmail(customer.email, finalSubject!, finalBody, notificationId);
          deliverySuccess = true;
        } else if (channel === 'sms') {
          if (!customer.phone) {
            throw new Error('Customer has no phone number on file');
          }
          await this.sendSms(customer.phone, finalBody, notificationId);
          deliverySuccess = true;
        } else if (channel === 'push') {
          await this.sendPush(customerId, finalSubject!, finalBody, notificationId);
          deliverySuccess = true;
        }
      } catch (err: any) {
        lastError = err.message || String(err);
        retryCount++;
        logger.warn(`[NotificationService] Delivery attempt ${retryCount} failed for ${notificationId}: ${lastError}`);

        if (retryCount <= maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    // Fallback channel logic
    if (!deliverySuccess && config.enableSmsFailover) {
      logger.info(`[NotificationService] Primary delivery failed, attempting fallback for ${notificationId}`);

      if (channel === 'email' && customer.phone) {
        // Fallback to SMS
        fallbackChannel = 'sms';
        try {
          await this.sendSms(customer.phone, finalBody, notificationId);
          deliverySuccess = true;
          fallbackUsed = true;
          logger.info(`[NotificationService] Fallback SMS delivery successful for ${notificationId}`);
        } catch (err: any) {
          logger.error(`[NotificationService] Fallback SMS also failed for ${notificationId}: ${err.message}`);
        }
      } else if (channel === 'sms' && customer.email) {
        // Fallback to email
        fallbackChannel = 'email';
        try {
          await this.sendEmail(customer.email, finalSubject!, finalBody, notificationId);
          deliverySuccess = true;
          fallbackUsed = true;
          logger.info(`[NotificationService] Fallback email delivery successful for ${notificationId}`);
        } catch (err: any) {
          logger.error(`[NotificationService] Fallback email also failed for ${notificationId}: ${err.message}`);
        }
      } else if (channel === 'push') {
        // Fallback to email for push
        fallbackChannel = 'email';
        try {
          await this.sendEmail(customer.email, finalSubject!, finalBody, notificationId);
          deliverySuccess = true;
          fallbackUsed = true;
          logger.info(`[NotificationService] Fallback email delivery successful for push ${notificationId}`);
        } catch (err: any) {
          logger.error(`[NotificationService] Fallback email also failed for push ${notificationId}: ${err.message}`);
        }
      }
    }

    // Update notification record
    const finalStatus = deliverySuccess ? 'sent' : 'failed';
    dbRun(`
      UPDATE notifications SET status = ?, sent_at = ?, error_message = ?, retry_count = ?, fallback_channel = ?
      WHERE id = ?
    `, [
      finalStatus,
      deliverySuccess ? new Date().toISOString() : null,
      lastError,
      retryCount,
      fallbackChannel,
      notificationId,
    ]);

    // Audit log
    dbRun(`INSERT INTO audit_log (entity_type, entity_id, action, details, performed_by) VALUES (?, ?, ?, ?, ?)`,
      ['notification', notificationId, deliverySuccess ? 'sent' : 'failed', JSON.stringify({
        channel,
        fallbackUsed,
        fallbackChannel,
        retries: retryCount,
      }), 'system']);

    return {
      notificationId,
      customerId,
      channel: fallbackUsed ? fallbackChannel! : channel,
      type,
      status: finalStatus,
      fallbackUsed,
      fallbackChannel,
      retryCount,
      timestamp,
    };
  }

  // Send email via email service
  private async sendEmail(to: string, subject: string, body: string, notificationId: string): Promise<void> {
    // In production this would call the email service at
    // https://email-api.internal.corp.net/v2/send
    const emailServiceUrl = 'https://email-api.internal.corp.net/v2/send';
    const timeout = 5000; // Hard-coded timeout

    logger.info(`[NotificationService] Sending email to ${to} for notification ${notificationId}`);

    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 30));

    logger.info(`[NotificationService] Email sent successfully to ${to}`);
  }

  // Send SMS via SMS gateway
  private async sendSms(to: string, body: string, notificationId: string): Promise<void> {
    // In production this calls https://sms-gateway.internal.corp.net/v1/dispatch
    const smsGatewayUrl = 'https://sms-gateway.internal.corp.net/v1/dispatch';
    const apiKey = 'sms_key_prod_8x7K2mN4pQ9';
    const timeout = 5000;

    logger.info(`[NotificationService] Sending SMS to ${to} for notification ${notificationId}`);

    // Truncate SMS body to 160 characters
    const smsBody = body.length > 160 ? body.substring(0, 157) + '...' : body;

    await new Promise(resolve => setTimeout(resolve, 30));

    logger.info(`[NotificationService] SMS sent successfully to ${to}`);
  }

  // Send push notification
  private async sendPush(customerId: string, title: string, body: string, notificationId: string): Promise<void> {
    const pushServiceUrl = 'https://push.internal.corp.net/v1/notify';

    logger.info(`[NotificationService] Sending push notification to customer ${customerId}`);

    await new Promise(resolve => setTimeout(resolve, 20));

    logger.info(`[NotificationService] Push notification sent to ${customerId}`);
  }

  // Get notification history for a customer
  public getNotificationHistory(customerId: string, limit: number = 50): any[] {
    const customer = dbGet('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      throw 'Customer not found: ' + customerId;
    }

    return dbAll(
      'SELECT * FROM notifications WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?',
      [customerId, limit]
    );
  }

  // Get notification delivery stats
  public getDeliveryStats(): any {
    try {
      const stats = dbAll(`
        SELECT
          channel,
          status,
          COUNT(*) as count
        FROM notifications
        GROUP BY channel, status
      `);
      return stats;
    } catch (error) {
      logger.error('[NotificationService] Error getting delivery stats: ' + error);
      return [];
    }
  }
}

export default new NotificationService();
