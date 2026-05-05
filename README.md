# Enterprise Service Platform

Core internal platform for customer billing, appointment scheduling, notifications, and account management. Used by operations teams to process payments, manage recurring service appointments, send customer notifications, and provide consolidated account summaries.

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Express
- **Database**: SQLite (via better-sqlite3)
- **Testing**: Jest + Supertest
- **Linting**: ESLint + Prettier
- **CI**: GitHub Actions
- **Containerization**: Docker + Docker Compose
- **Code Quality**: SonarQube, jscpd, ESLint complexity rules

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Docker & Docker Compose (for SonarQube and containerized deployment)

### Setup

```bash
npm install
npm run build
npm test
```

### Run Locally

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

The server starts on `http://localhost:3000` by default.

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment name | `development` |
| `DB_PATH` | SQLite database path | `:memory:` |
| `JWT_SECRET` | JWT signing/verification secret. **Required in production** — the app will refuse to start without it. In `development` and `test`, an insecure dev-only fallback is used and a warning is logged. | *(no default; required in production)* |
| `LOG_LEVEL` | Winston log level | `info` |
| `EMAIL_SERVICE_URL` | Email service endpoint | *(see config)* |
| `SMS_SERVICE_URL` | SMS gateway endpoint | *(see config)* |
| `PAYMENT_GATEWAY_URL` | Payment gateway endpoint | *(see config)* |
| `PAYMENT_API_KEY` | Payment gateway API key | *(see config)* |
| `MAX_RETRIES` | Max retry attempts for external calls | `3` |
| `RETRY_DELAY_MS` | Delay between retries (ms) | `1000` |

## API Endpoints

### Billing
- `POST /v1/billing/charge` — Process a billing charge
- `GET /v1/billing/history/:customerId` — Get billing history
- `GET /v1/billing/estimate/:customerId` — Get charge estimate

### Appointments
- `POST /v1/appointments/schedule` — Schedule an appointment
- `GET /v1/appointments/customer/:customerId` — Get customer appointments
- `POST /v1/appointments/:id/cancel` — Cancel an appointment

### Notifications
- `POST /v1/notifications/send` — Send a notification
- `GET /v1/notifications/history/:customerId` — Get notification history
- `GET /v1/notifications/stats` — Get delivery statistics

### Customers
- `GET /v1/customers/:id/summary` — Get comprehensive account summary
- `GET /v1/customers/:id` — Get customer details
- `PUT /v1/customers/:id/tier` — Update customer tier

### Health
- `GET /health` — Service health check

## NPM Scripts

| Script | Description |
|---|---|
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled server |
| `npm run dev` | Run in development mode with ts-node |
| `npm test` | Run test suite |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run format` | Run Prettier |
| `npm run complexity` | Generate complexity report |
| `npm run duplication` | Run jscpd duplication detection |
| `npm run benchmark` | Run load test benchmarks |
| `npm run security` | Run security scans (npm audit + ESLint security rules) |
| `npm run sonar` | Start SonarQube via Docker |

## Running SonarQube

```bash
# Start SonarQube
docker compose up -d sonarqube

# Wait for SonarQube to start (usually ~60 seconds)
# Access at http://localhost:9000 (default credentials: admin/admin)

# Run analysis (requires sonar-scanner CLI)
# sonar-scanner
```

## Docker

```bash
# Build and run the full stack
docker compose up -d

# Run only the application
docker compose up -d app

# Tear down
docker compose down
```

## Project Structure

```
├── src/
│   ├── config/          # Configuration and constants
│   ├── database/        # Database initialization and schema
│   ├── routes/          # Express route handlers
│   ├── services/        # Business logic services
│   ├── utils/           # Shared utilities
│   ├── app.ts           # Express app setup
│   └── server.ts        # Server entry point
├── tests/               # Jest test suites
├── benchmarks/          # Performance benchmarks
├── docs/                # Engineering documentation
├── artifacts/baseline/  # Analysis baseline reports
└── .github/workflows/   # CI pipeline
```

## Documentation

See the `/docs` directory for detailed documentation:

- [Architecture Overview](docs/architecture.md)
- [API Overview](docs/api-overview.md)
- [Coding Standards](docs/coding-standards.md)
- [Engineering Guidelines](docs/engineering-guidelines.md)
