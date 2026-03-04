# Architecture Overview

## System Design

The Enterprise Service Platform is a monolithic Node.js/TypeScript application that serves as the backend for customer-facing operations. It exposes a RESTful API consumed by internal operations dashboards and partner integrations.

## Component Layers

### Routes Layer
Express route handlers that receive HTTP requests, perform input validation, and delegate to service layer methods. Routes handle response formatting and HTTP status code mapping.

### Services Layer
Core business logic for each domain area:

- **BillingService** — Handles charge processing, discount calculation, payment gateway integration, and retry logic.
- **AppointmentService** — Manages appointment scheduling, conflict detection, provider assignment, and cancellation workflows.
- **NotificationService** — Orchestrates multi-channel notification delivery (email, SMS, push) with fallback and retry.
- **CustomerService** — Aggregates data across billing, appointments, and notifications to produce account summaries and health scores.

### Database Layer
SQLite persistence via better-sqlite3. The database module handles schema initialization, data seeding, and connection management. Tables include:

- `customers` — Customer records with tier, loyalty, and service counts
- `billing_transactions` — Payment transaction history
- `appointments` — Scheduled appointments with provider assignment
- `notifications` — Notification delivery records
- `audit_log` — System-wide audit trail

### Configuration
Centralized configuration module that reads from environment variables with sensible defaults. Constants for business rules (tier rates, discount thresholds, status enums) are defined separately.

## External Integrations

The platform integrates with the following internal services:

- **Payment Gateway** — Processes customer payments (credit card, bank transfer, invoice, wallet)
- **Email Service** — Sends transactional emails
- **SMS Gateway** — Delivers SMS notifications
- **Push Service** — Sends push notifications

All external calls include retry logic with configurable retry counts and delays.

## Data Flow

```
Client Request
  → Express Middleware (body parsing, logging)
  → Route Handler (validation, auth)
  → Service Layer (business logic)
  → Database / External Service
  → Response
```

## Authentication

Token-based authentication using JWT. Tokens are validated in route handlers. The platform supports both authenticated and unauthenticated requests for backward compatibility with legacy integrations.

## Error Handling

Errors are caught at the route level and returned as structured JSON responses with request IDs for traceability. The audit log captures significant business events for compliance and debugging.
