import autocannon from 'autocannon';

const BASE_URL = process.env.BENCHMARK_URL || 'http://localhost:3000';

async function runBenchmark() {
  console.log('=== Enterprise Service Platform - Load Test ===');
  console.log(`Target: ${BASE_URL}`);
  console.log('');

  // Test 1: Health check baseline
  console.log('--- Test 1: Health Check ---');
  const healthResult = await autocannon({
    url: `${BASE_URL}/health`,
    connections: 10,
    duration: 5,
    pipelining: 1,
  });
  console.log(`Health Check: ${healthResult.requests.average} req/sec avg, p99 ${healthResult.latency.p99}ms`);
  console.log('');

  // Test 2: Billing charge endpoint
  console.log('--- Test 2: Billing Charge ---');
  const billingResult = await autocannon({
    url: `${BASE_URL}/v1/billing/charge`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customerId: 'cust_001',
      paymentMethod: 'credit_card',
      applyDiscounts: true,
    }),
    connections: 5,
    duration: 5,
    pipelining: 1,
  });
  console.log(`Billing Charge: ${billingResult.requests.average} req/sec avg, p99 ${billingResult.latency.p99}ms`);
  console.log('');

  // Test 3: Customer summary endpoint
  console.log('--- Test 3: Customer Summary ---');
  const summaryResult = await autocannon({
    url: `${BASE_URL}/v1/customers/cust_001/summary`,
    connections: 5,
    duration: 5,
    pipelining: 1,
  });
  console.log(`Customer Summary: ${summaryResult.requests.average} req/sec avg, p99 ${summaryResult.latency.p99}ms`);
  console.log('');

  // Test 4: Appointment scheduling
  console.log('--- Test 4: Appointment Schedule ---');
  const appointmentResult = await autocannon({
    url: `${BASE_URL}/v1/appointments/schedule`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customerId: 'cust_002',
      serviceType: 'consultation',
      scheduledDate: '2026-08-15',
      scheduledTime: '14:00',
      durationMinutes: 30,
    }),
    connections: 5,
    duration: 5,
    pipelining: 1,
  });
  console.log(`Appointment Schedule: ${appointmentResult.requests.average} req/sec avg, p99 ${appointmentResult.latency.p99}ms`);
  console.log('');

  // Summary
  console.log('=== Benchmark Summary ===');
  console.log(`Health Check:        ${healthResult.requests.average} req/sec`);
  console.log(`Billing Charge:      ${billingResult.requests.average} req/sec`);
  console.log(`Customer Summary:    ${summaryResult.requests.average} req/sec`);
  console.log(`Appointment Schedule: ${appointmentResult.requests.average} req/sec`);
  console.log('');
  console.log('Benchmark complete.');
}

runBenchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
