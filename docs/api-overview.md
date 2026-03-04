# API Overview

## Base URL

```
http://localhost:3000
```

## Authentication

All endpoints accept an optional `Authorization: Bearer <token>` header. Tokens are JWTs signed with the configured secret. Unauthenticated requests are permitted for backward compatibility.

---

## Billing

### POST /v1/billing/charge

Process a billing charge for a customer.

**Request Body:**
```json
{
  "customerId": "cust_001",
  "amount": 149.99,
  "tier": "premium",
  "paymentMethod": "credit_card",
  "description": "Monthly service charge",
  "applyDiscounts": true,
  "overrideAmount": null,
  "metadata": {}
}
```

**Required Fields:** `customerId`, `paymentMethod`

**Payment Methods:** `credit_card`, `bank_transfer`, `invoice`, `wallet`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "transactionId": "uuid",
    "customerId": "cust_001",
    "originalAmount": 149.99,
    "finalAmount": 119.99,
    "discountApplied": 30.00,
    "discountReason": "loyalty+bundle",
    "status": "completed",
    "paymentReference": "pay_xxxxxxxxxxxx",
    "retryCount": 0,
    "timestamp": "2024-01-15T10:30:00.000Z"
  },
  "requestId": "uuid",
  "processingTimeMs": 250
}
```

### GET /v1/billing/history/:customerId

Returns billing transaction history for a customer.

### GET /v1/billing/estimate/:customerId?tier=premium

Returns an estimated charge calculation including applicable discounts.

---

## Appointments

### POST /v1/appointments/schedule

Schedule a new appointment.

**Request Body:**
```json
{
  "customerId": "cust_001",
  "serviceType": "consultation",
  "providerId": "prov_101",
  "scheduledDate": "2024-06-15",
  "scheduledTime": "10:00",
  "durationMinutes": 60,
  "notes": "Annual review",
  "location": "Main Office",
  "priority": "normal",
  "recurring": false
}
```

**Required Fields:** `customerId`, `serviceType`, `scheduledDate`, `scheduledTime`

**Service Types:** `consultation`, `maintenance`, `installation`, `repair`, `inspection`, `assessment`, `follow_up`

**Response (201):**
```json
{
  "success": true,
  "data": {
    "appointmentId": "uuid",
    "customerId": "cust_001",
    "serviceType": "consultation",
    "providerId": "prov_101",
    "scheduledDate": "2024-06-15",
    "scheduledTime": "10:00",
    "durationMinutes": 60,
    "status": "scheduled",
    "conflicts": [],
    "location": "Main Office",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

**Conflict Response (409):** Returned when the requested time slot conflicts with an existing appointment.

### GET /v1/appointments/customer/:customerId

Returns all appointments for a customer. Supports optional `?status=` query parameter.

### POST /v1/appointments/:id/cancel

Cancel a scheduled appointment.

---

## Notifications

### POST /v1/notifications/send

Send a notification to a customer.

**Request Body:**
```json
{
  "customerId": "cust_001",
  "channel": "email",
  "type": "billing_receipt",
  "subject": "Payment Confirmation",
  "body": "Hello {{first_name}}, your payment of $149.99 has been processed.",
  "priority": "normal",
  "metadata": {}
}
```

**Required Fields:** `customerId`, `channel`, `body`

**Channels:** `email`, `sms`, `push`

**Notification Types:** `billing_receipt`, `appointment_reminder`, `appointment_confirmation`, `payment_failed`, `account_update`

**Template Variables:** `{{first_name}}`, `{{last_name}}`, `{{email}}`, `{{customer_id}}`

---

## Customers

### GET /v1/customers/:id/summary

Returns a comprehensive account summary including billing, appointment, notification, and account health data.

### GET /v1/customers/:id

Returns customer record.

### PUT /v1/customers/:id/tier

Update customer tier. Body: `{ "tier": "premium" }`

---

## Health

### GET /health

Returns service health status.
