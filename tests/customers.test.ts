import request from 'supertest';
import app from '../src/app';
import { resetDatabase, closeDatabase } from '../src/database';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(() => {
  closeDatabase();
});

describe('GET /v1/customers/:id/summary', () => {
  it('should return a comprehensive customer summary', async () => {
    const res = await request(app)
      .get('/v1/customers/cust_001/summary');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    const summary = res.body.data;

    // Customer info
    expect(summary.customer).toBeDefined();
    expect(summary.customer.id).toBe('cust_001');
    expect(summary.customer.firstName).toBe('John');
    expect(summary.customer.lastName).toBe('Smith');
    expect(summary.customer.tier).toBe('premium');

    // Billing info
    expect(summary.billing).toBeDefined();
    expect(summary.billing.totalSpent).toBeDefined();
    expect(summary.billing.transactionCount).toBeDefined();

    // Appointments info
    expect(summary.appointments).toBeDefined();
    expect(summary.appointments.totalAppointments).toBeDefined();

    // Notifications info
    expect(summary.notifications).toBeDefined();
    expect(summary.notifications.totalSent).toBeDefined();

    // Account health
    expect(summary.accountHealth).toBeDefined();
    expect(summary.accountHealth.score).toBeGreaterThanOrEqual(0);
    expect(summary.accountHealth.score).toBeLessThanOrEqual(100);
    expect(summary.accountHealth.tier).toBe('premium');
  });

  it('should show loyalty discount availability for eligible customers', async () => {
    const res = await request(app)
      .get('/v1/customers/cust_001/summary');

    expect(res.status).toBe(200);
    // cust_001 has 24 months loyalty
    expect(res.body.data.accountHealth.discountsAvailable).toContain('loyalty_10pct');
  });

  it('should show volume discount for customers with many services', async () => {
    const res = await request(app)
      .get('/v1/customers/cust_003/summary');

    expect(res.status).toBe(200);
    // cust_003 has 7 active services
    expect(res.body.data.accountHealth.discountsAvailable).toContain('volume_15pct');
  });

  it('should include upgrade eligibility', async () => {
    const res = await request(app)
      .get('/v1/customers/cust_002/summary');

    expect(res.status).toBe(200);
    expect(res.body.data.accountHealth.eligibleForUpgrade).toBeDefined();
  });

  it('should flag high balance customers', async () => {
    // cust_002 has balance of 150.50, not high enough for flag
    const res = await request(app)
      .get('/v1/customers/cust_002/summary');

    expect(res.status).toBe(200);
    expect(res.body.data.accountHealth.riskFlags).toBeDefined();
    expect(Array.isArray(res.body.data.accountHealth.riskFlags)).toBe(true);
  });

  it('should flag new customer churn risk', async () => {
    const res = await request(app)
      .get('/v1/customers/cust_004/summary');

    expect(res.status).toBe(200);
    // cust_004 is basic tier with 2 months loyalty
    expect(res.body.data.accountHealth.riskFlags).toContain('new_customer_churn_risk');
  });

  it('should return 404 for non-existent customer', async () => {
    const res = await request(app)
      .get('/v1/customers/cust_nonexistent/summary');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('should include billing data after a charge', async () => {
    // Process a charge
    await request(app)
      .post('/v1/billing/charge')
      .send({
        customerId: 'cust_001',
        paymentMethod: 'credit_card',
        applyDiscounts: false,
      });

    const res = await request(app)
      .get('/v1/customers/cust_001/summary');

    expect(res.status).toBe(200);
    expect(res.body.data.billing.transactionCount).toBeGreaterThan(0);
    expect(res.body.data.billing.totalSpent).toBeGreaterThan(0);
  });

  it('should include appointment data after scheduling', async () => {
    await request(app)
      .post('/v1/appointments/schedule')
      .send({
        customerId: 'cust_001',
        serviceType: 'consultation',
        scheduledDate: '2026-06-15',
        scheduledTime: '10:00',
      });

    const res = await request(app)
      .get('/v1/customers/cust_001/summary');

    expect(res.status).toBe(200);
    expect(res.body.data.appointments.totalAppointments).toBeGreaterThan(0);
  });

  it('should include notification data after sending', async () => {
    await request(app)
      .post('/v1/notifications/send')
      .send({
        customerId: 'cust_001',
        channel: 'email',
        body: 'Test notification.',
      });

    const res = await request(app)
      .get('/v1/customers/cust_001/summary');

    expect(res.status).toBe(200);
    expect(res.body.data.notifications.totalSent).toBeGreaterThan(0);
  });
});

describe('GET /v1/customers/:id', () => {
  it('should return customer details', async () => {
    const res = await request(app)
      .get('/v1/customers/cust_001');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('cust_001');
  });

  it('should return 404 for non-existent customer', async () => {
    const res = await request(app)
      .get('/v1/customers/nonexistent');

    expect(res.status).toBe(404);
  });
});

describe('PUT /v1/customers/:id/tier', () => {
  it('should update customer tier', async () => {
    const res = await request(app)
      .put('/v1/customers/cust_004/tier')
      .send({ tier: 'standard' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.newTier).toBe('standard');
    expect(res.body.data.previousTier).toBe('basic');
  });

  it('should return 400 for missing tier', async () => {
    const res = await request(app)
      .put('/v1/customers/cust_001/tier')
      .send({});

    expect(res.status).toBe(400);
  });

  it('should return 400 for invalid tier', async () => {
    const res = await request(app)
      .put('/v1/customers/cust_001/tier')
      .send({ tier: 'diamond' });

    expect(res.status).toBe(400);
  });
});

describe('Health check', () => {
  it('should return health status', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('enterprise-service-platform');
    expect(res.body.version).toBe('2.14.3');
  });
});

describe('404 handler', () => {
  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/v1/unknown');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
  });
});
