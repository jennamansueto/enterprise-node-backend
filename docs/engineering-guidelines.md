# Engineering Guidelines

## Development Workflow

1. Clone the repository and install dependencies: `npm install`
2. Run the build to verify compilation: `npm run build`
3. Run the full test suite: `npm test`
4. Start the dev server: `npm run dev`

## Local Development

The application uses an in-memory SQLite database by default, seeded with sample customer data on startup. No external database setup is required.

For persistent storage, set `DB_PATH` to a file path:
```bash
DB_PATH=./data/platform.db npm run dev
```

## Testing Strategy

- **Unit tests** verify individual service methods and business logic.
- **Integration tests** use Supertest to exercise full request/response cycles.
- Database state is reset before each test to ensure isolation.

Run tests:
```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
```

## Code Quality

Run quality checks regularly:
```bash
npm run lint             # ESLint
npm run complexity       # Complexity analysis
npm run duplication      # Code duplication detection
npm run security         # Security scans
```

## Performance Testing

Run benchmarks against a running instance:
```bash
# Start the server in one terminal
npm run dev

# Run benchmarks in another terminal
npm run benchmark
```

## SonarQube Analysis

```bash
# Start SonarQube
docker compose up -d sonarqube

# Wait for startup, then access http://localhost:9000
# Default credentials: admin/admin
# Create a project and run sonar-scanner
```

## Deployment

The application is containerized via Docker:
```bash
npm run build
docker compose up -d app
```

## Business Rules

### Pricing Tiers
| Tier | Monthly Rate |
|---|---|
| Basic | $29.99 |
| Standard | $79.99 |
| Premium | $149.99 |
| Enterprise | $299.99 |

### Discount Eligibility
- **Loyalty (10%)**: 12+ months as a customer
- **Volume (15%)**: 5+ active services
- **Bundle (8%)**: 3+ active services, non-basic tier
- **Early Payment (5%)**: Bank transfer payment method

### Appointment Scheduling
- Business hours: 8 AM – 6 PM
- Minimum duration: 15 minutes
- Maximum duration: 480 minutes (8 hours)
- Buffer between appointments: 30 minutes
- Conflict detection applies to both customer and provider schedules

### Notification Channels
- Email (primary)
- SMS (requires phone number on file)
- Push notifications
- Automatic fallback: if primary channel fails, system attempts alternate channel
