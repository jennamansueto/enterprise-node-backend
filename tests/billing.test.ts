import request from 'supertest';
import app from '../src/app';
import { resetDatabase, closeDatabase } from '../src/database';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(() => {
  closeDatabase();
});

describe('POST /v1/billing/charge', () => {
  it('should process a charge for a valid customer', async () => {
    const res = await request(app)
      .post('/v1/billing/charge')
      .send({
        customerId: 'cust_001',
        paymentMethod: 'credit_card',
        tier: 'premium',
        applyDiscounts: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.transactionId).toBeDefined();
    expect(res.body.data.customerId).toBe('cust_001');
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.finalAmount).toBeGreaterThan(0);
  });

  it('should apply loyalty discount for eligible customers', async () => {
    const res = await request(app)
      .post('/v1/billing/charge')
      .send({
        customerId: 'cust_001', // 24 months loyalty
        paymentMethod: 'credit_card',
        tier: 'premium',
        applyDiscounts: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.discountApplied).toBeGreaterThan(0);
    expect(res.body.data.discountReason).toContain('loyalty');
  });

  it('should apply volume discount for customers with 5+ services', async () => {
    const res = await request(app)
      .post('/v1/billing/charge')
      .send({
        customerId: 'cust_003', // 7 active services
        paymentMethod: 'credit_card',
        applyDiscounts: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.discountReason).toContain('volume');
  });

  it('should apply bundle discount for non-basic tier with 3+ services', async () => {
    const res = await request(app)
      .post('/v1/billing/charge')
      .send({
        customerId: 'cust_001', // premium tier, 3 services
        paymentMethod: 'credit_card',
        applyDiscounts: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.discountReason).toContain('bundle');
  });

  it('should apply early payment discount for bank transfers', async () => {
    const res = await request(app)
      .post('/v1/billing/charge')
      .send({
        customerId: 'cust_001',
        paymentMethod: 'bank_transfer',
        applyDiscounts: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.discountReason).toContain('early_payment');
  });

  it('should skip discounts when applyDiscounts is false', async () => {
    const res = await request(app)
      .post('/v1/billing/charge')
      .send({
        customerId: 'cust_001',
        paymentMethod: 'credit_card',
        applyDiscounts: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.discountApplied).toBe(0);
  });

  it('should use override amount when provided', async () => {
    const res = await request(app)
      .post('/v1/billing/charge')
      .send({
        customerId: 'cust_001',
        paymentMethod: 'credit_card',
        overrideAmount: 500,
        applyDiscounts: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.originalAmount).toBe(500);
  });

  it('should return 400 when customerId is missing', async () => {
    const res = await request(app)
      .post('/v1/billing/charge')
      .send({
        paymentMethod: 'credit_card',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('customerId');
  });

  it('should return 400 when paymentMethod is missing', async () => {
    const res = await request(app)
      .post('/v1/billing/charge')
      .send({
        customerId: 'cust_001',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('paymentMethod');
  });

  it('should return 404 when customer does not exist', async () => {
    const res = await request(app)
      .post('/v1/billing/charge')
      .send({
        customerId: 'cust_nonexistent',
        paymentMethod: 'credit_card',
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('should return 400 for invalid payment method', async () => {
    const res = await request(app)
      .post('/v1/billing/charge')
      .send({
        customerId: 'cust_001',
        paymentMethod: 'bitcoin',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid payment method');
  });

  it('should use tier rate when no amount specified', async () => {
    const res = await request(app)
      .post('/v1/billing/charge')
      .send({
        customerId: 'cust_004', // basic tier
        paymentMethod: 'credit_card',
        applyDiscounts: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.originalAmount).toBe(29.99); // basic tier rate
  });

  it('should handle charge with explicit amount', async () => {
    const res = await request(app)
      .post('/v1/billing/charge')
      .send({
        customerId: 'cust_001',
        amount: 200,
        paymentMethod: 'credit_card',
        applyDiscounts: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.originalAmount).toBe(200);
  });
});

describe('GET /v1/billing/history/:customerId', () => {
  it('should return billing history for a customer', async () => {
    // First create a charge
    await request(app)
      .post('/v1/billing/charge')
      .send({
        customerId: 'cust_001',
        paymentMethod: 'credit_card',
        applyDiscounts: false,
      });

    const res = await request(app)
      .get('/v1/billing/history/cust_001');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('should return error for non-existent customer', async () => {
    const res = await request(app)
      .get('/v1/billing/history/cust_nonexistent');

    expect(res.status).toBe(404);
  });
});

describe('GET /v1/billing/estimate/:customerId', () => {
  it('should return an estimate for a customer', async () => {
    const res = await request(app)
      .get('/v1/billing/estimate/cust_001?tier=premium');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.estimate).toBeDefined();
    expect(res.body.estimate.baseAmount).toBeGreaterThan(0);
  });

  it('should return 404 for non-existent customer', async () => {
    const res = await request(app)
      .get('/v1/billing/estimate/cust_nonexistent');

    expect(res.status).toBe(404);
  });
});
