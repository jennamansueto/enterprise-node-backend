# Coding Standards

## Language & Style

- TypeScript is the primary language for all application code and tests.
- Follow the project ESLint and Prettier configurations.
- Use `const` by default; use `let` only when reassignment is necessary.
- Prefer async/await over raw Promises.
- Use descriptive variable and function names.

## File Organization

- Route handlers go in `src/routes/`.
- Business logic goes in `src/services/`.
- Shared utilities go in `src/utils/`.
- Configuration goes in `src/config/`.
- Database logic goes in `src/database/`.

## Naming Conventions

- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Interfaces: `PascalCase` (prefix with `I` is optional)
- Functions and variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Database columns: `snake_case`

## Error Handling

- Always catch errors at the route level.
- Return structured JSON error responses with request IDs.
- Log errors with sufficient context for debugging.
- Never silently swallow exceptions without logging.

## Testing

- All new features require corresponding tests.
- Tests should be independent and not rely on execution order.
- Use `beforeEach` for test setup and database reset.
- Integration tests use Supertest against the Express app.
- Aim for meaningful assertions, not just status code checks.

## Logging

- Use the Winston logger (`src/utils/logger.ts`).
- Include context in log messages (service name, request ID, entity IDs).
- Use appropriate log levels: `error`, `warn`, `info`, `debug`.

## Dependencies

- Keep dependencies up to date.
- Run `npm audit` regularly to check for vulnerabilities.
- Prefer well-maintained, widely-used packages.

## Git Practices

- Write clear, descriptive commit messages.
- Reference ticket numbers when applicable.
- Keep commits focused on a single change.
- Ensure tests pass before pushing.
