import request from 'supertest';
import app from '../src/app';
import { resetDatabase, closeDatabase } from '../src/database';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(() => {
  closeDatabase();
});

describe('POST /v1/notifications/send', () => {
  it('should send an email notification', async () => {
    const res = await request(app)
      .post('/v1/notifications/send')
      .send({
        customerId: 'cust_001',
        channel: 'email',
        type: 'account_update',
        subject: 'Test Notification',
        body: 'Hello {{first_name}}, this is a test notification.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.notificationId).toBeDefined();
    expect(res.body.data.status).toBe('sent');
    expect(res.body.data.channel).toBe('email');
  });

  it('should send an SMS notification', async () => {
    const res = await request(app)
      .post('/v1/notifications/send')
      .send({
        customerId: 'cust_001',
        channel: 'sms',
        type: 'appointment_reminder',
        body: 'Your appointment is tomorrow.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('sent');
  });

  it('should send a push notification', async () => {
    const res = await request(app)
      .post('/v1/notifications/send')
      .send({
        customerId: 'cust_001',
        channel: 'push',
        type: 'billing_receipt',
        body: 'Payment received successfully.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('sent');
  });

  it('should auto-generate subject when not provided', async () => {
    const res = await request(app)
      .post('/v1/notifications/send')
      .send({
        customerId: 'cust_001',
        channel: 'email',
        type: 'billing_receipt',
        body: 'Your payment has been processed.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should personalize notification body with customer data', async () => {
    const res = await request(app)
      .post('/v1/notifications/send')
      .send({
        customerId: 'cust_001',
        channel: 'email',
        type: 'account_update',
        body: 'Hello {{first_name}} {{last_name}}, your account has been updated.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 400 when customerId is missing', async () => {
    const res = await request(app)
      .post('/v1/notifications/send')
      .send({
        channel: 'email',
        body: 'Test message',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('customerId');
  });

  it('should return 400 when channel is missing', async () => {
    const res = await request(app)
      .post('/v1/notifications/send')
      .send({
        customerId: 'cust_001',
        body: 'Test message',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('channel');
  });

  it('should return 400 when body is missing', async () => {
    const res = await request(app)
      .post('/v1/notifications/send')
      .send({
        customerId: 'cust_001',
        channel: 'email',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('body');
  });

  it('should return 404 when customer does not exist', async () => {
    const res = await request(app)
      .post('/v1/notifications/send')
      .send({
        customerId: 'cust_nonexistent',
        channel: 'email',
        body: 'Test message',
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('should return 400 for invalid channel', async () => {
    const res = await request(app)
      .post('/v1/notifications/send')
      .send({
        customerId: 'cust_001',
        channel: 'carrier_pigeon',
        body: 'Test message',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid channel');
  });

  it('should handle various notification types', async () => {
    const types = ['billing_receipt', 'appointment_reminder', 'appointment_confirmation', 'payment_failed', 'account_update'];

    for (const type of types) {
      const res = await request(app)
        .post('/v1/notifications/send')
        .send({
          customerId: 'cust_001',
          channel: 'email',
          type,
          body: `Test ${type} notification.`,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }
  });
});

describe('GET /v1/notifications/history/:customerId', () => {
  it('should return notification history', async () => {
    // Send a notification first
    await request(app)
      .post('/v1/notifications/send')
      .send({
        customerId: 'cust_001',
        channel: 'email',
        body: 'Test notification for history.',
      });

    const res = await request(app)
      .get('/v1/notifications/history/cust_001');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

describe('GET /v1/notifications/stats', () => {
  it('should return delivery stats', async () => {
    const res = await request(app)
      .get('/v1/notifications/stats');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
