// Jest setup: provide required environment variables before modules are
// loaded. Use a deterministic, obviously-non-production value so tests are
// hermetic and config.jwtSecret is always defined.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-do-not-use-in-production';
