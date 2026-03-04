import app from './app';
import config from './config';
import { initDatabase } from './database';
import logger from './utils/logger';

const PORT = config.port;

// Initialize database on startup
async function start() {
  await initDatabase();

  const server = app.listen(PORT, () => {
    logger.info(`Enterprise Service Platform started on port ${PORT}`);
    logger.info(`Environment: ${config.environment}`);
    logger.info(`Database: ${config.dbPath}`);
    logger.info(`Log level: ${config.logLevel}`);
  });

  return server;
}

const serverPromise = start();
let server: any;

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

export default server;
