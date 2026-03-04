import request from 'supertest';
import app from '../src/app';
import { resetDatabase, closeDatabase } from '../src/database';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(() => {
  closeDatabase();
});

describe('POST /v1/appointments/schedule', () => {
  it('should schedule a valid appointment', async () => {
    const res = await request(app)
      .post('/v1/appointments/schedule')
      .send({
        customerId: 'cust_001',
        serviceType: 'consultation',
        scheduledDate: '2026-06-15',
        scheduledTime: '10:00',
        durationMinutes: 60,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.appointmentId).toBeDefined();
    expect(res.body.data.customerId).toBe('cust_001');
    expect(res.body.data.serviceType).toBe('consultation');
    expect(res.body.data.status).toBe('scheduled');
  });

  it('should auto-assign a provider when not specified', async () => {
    const res = await request(app)
      .post('/v1/appointments/schedule')
      .send({
        customerId: 'cust_001',
        serviceType: 'maintenance',
        scheduledDate: '2026-06-15',
        scheduledTime: '14:00',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.providerId).toBeDefined();
    expect(res.body.data.providerId).toBeTruthy();
  });

  it('should use specified provider', async () => {
    const res = await request(app)
      .post('/v1/appointments/schedule')
      .send({
        customerId: 'cust_001',
        serviceType: 'consultation',
        scheduledDate: '2026-06-15',
        scheduledTime: '10:00',
        providerId: 'prov_101',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.providerId).toBe('prov_101');
  });

  it('should assign default location based on service type', async () => {
    const res = await request(app)
      .post('/v1/appointments/schedule')
      .send({
        customerId: 'cust_001',
        serviceType: 'installation',
        scheduledDate: '2026-06-15',
        scheduledTime: '10:00',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.location).toBe('Customer Site');
  });

  it('should use custom location when provided', async () => {
    const res = await request(app)
      .post('/v1/appointments/schedule')
      .send({
        customerId: 'cust_001',
        serviceType: 'consultation',
        scheduledDate: '2026-06-15',
        scheduledTime: '10:00',
        location: 'Branch Office B',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.location).toBe('Branch Office B');
  });

  it('should default duration to 60 minutes', async () => {
    const res = await request(app)
      .post('/v1/appointments/schedule')
      .send({
        customerId: 'cust_001',
        serviceType: 'consultation',
        scheduledDate: '2026-06-15',
        scheduledTime: '10:00',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.durationMinutes).toBe(60);
  });

  it('should detect scheduling conflicts for same customer', async () => {
    // Schedule first appointment
    await request(app)
      .post('/v1/appointments/schedule')
      .send({
        customerId: 'cust_001',
        serviceType: 'consultation',
        scheduledDate: '2026-06-20',
        scheduledTime: '10:00',
        durationMinutes: 60,
      });

    // Try to schedule overlapping appointment
    const res = await request(app)
      .post('/v1/appointments/schedule')
      .send({
        customerId: 'cust_001',
        serviceType: 'maintenance',
        scheduledDate: '2026-06-20',
        scheduledTime: '10:30',
        durationMinutes: 60,
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.conflicts).toBeDefined();
  });

  it('should return 400 when customerId is missing', async () => {
    const res = await request(app)
      .post('/v1/appointments/schedule')
      .send({
        serviceType: 'consultation',
        scheduledDate: '2026-06-15',
        scheduledTime: '10:00',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('customerId');
  });

  it('should return 400 when serviceType is missing', async () => {
    const res = await request(app)
      .post('/v1/appointments/schedule')
      .send({
        customerId: 'cust_001',
        scheduledDate: '2026-06-15',
        scheduledTime: '10:00',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('serviceType');
  });

  it('should return 400 when scheduledDate is missing', async () => {
    const res = await request(app)
      .post('/v1/appointments/schedule')
      .send({
        customerId: 'cust_001',
        serviceType: 'consultation',
        scheduledTime: '10:00',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('scheduledDate');
  });

  it('should return 400 when scheduledTime is missing', async () => {
    const res = await request(app)
      .post('/v1/appointments/schedule')
      .send({
        customerId: 'cust_001',
        serviceType: 'consultation',
        scheduledDate: '2026-06-15',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('scheduledTime');
  });

  it('should return 404 when customer does not exist', async () => {
    const res = await request(app)
      .post('/v1/appointments/schedule')
      .send({
        customerId: 'cust_nonexistent',
        serviceType: 'consultation',
        scheduledDate: '2026-06-15',
        scheduledTime: '10:00',
      });

    expect(res.status).toBe(404);
  });

  it('should return 400 for invalid service type', async () => {
    const res = await request(app)
      .post('/v1/appointments/schedule')
      .send({
        customerId: 'cust_001',
        serviceType: 'magic',
        scheduledDate: '2026-06-15',
        scheduledTime: '10:00',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid service type');
  });

  it('should return 400 for invalid date format', async () => {
    const res = await request(app)
      .post('/v1/appointments/schedule')
      .send({
        customerId: 'cust_001',
        serviceType: 'consultation',
        scheduledDate: '15-06-2026',
        scheduledTime: '10:00',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('date format');
  });

  it('should return 400 for invalid time format', async () => {
    const res = await request(app)
      .post('/v1/appointments/schedule')
      .send({
        customerId: 'cust_001',
        serviceType: 'consultation',
        scheduledDate: '2026-06-15',
        scheduledTime: '10:00:00',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('time format');
  });

  it('should accept all valid service types', async () => {
    const types = ['consultation', 'maintenance', 'installation', 'repair', 'inspection', 'assessment', 'follow_up'];

    for (let i = 0; i < types.length; i++) {
      const res = await request(app)
        .post('/v1/appointments/schedule')
        .send({
          customerId: 'cust_001',
          serviceType: types[i],
          scheduledDate: `2026-07-${(10 + i).toString().padStart(2, '0')}`,
          scheduledTime: '10:00',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.serviceType).toBe(types[i]);
    }
  });
});

describe('POST /v1/appointments/:id/cancel', () => {
  it('should cancel a scheduled appointment', async () => {
    // First schedule an appointment
    const scheduleRes = await request(app)
      .post('/v1/appointments/schedule')
      .send({
        customerId: 'cust_001',
        serviceType: 'consultation',
        scheduledDate: '2026-06-15',
        scheduledTime: '10:00',
      });

    const appointmentId = scheduleRes.body.data.appointmentId;

    const cancelRes = await request(app)
      .post(`/v1/appointments/${appointmentId}/cancel`)
      .send({ reason: 'Customer rescheduling' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.success).toBe(true);
    expect(cancelRes.body.data.status).toBe('cancelled');
  });

  it('should return error for non-existent appointment', async () => {
    const res = await request(app)
      .post('/v1/appointments/fake_id/cancel')
      .send({ reason: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

describe('GET /v1/appointments/customer/:customerId', () => {
  it('should return appointments for a customer', async () => {
    // Schedule an appointment first
    await request(app)
      .post('/v1/appointments/schedule')
      .send({
        customerId: 'cust_001',
        serviceType: 'consultation',
        scheduledDate: '2026-06-15',
        scheduledTime: '10:00',
      });

    const res = await request(app)
      .get('/v1/appointments/customer/cust_001');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
