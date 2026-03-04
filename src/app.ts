import express from 'express';
import bodyParser from 'body-parser';
import billingRoutes from './routes/billing-routes';
import appointmentRoutes from './routes/appointment-routes';
import notificationRoutes from './routes/notification-routes';
import customerRoutes from './routes/customer-routes';
import logger from './utils/logger';
import { parseAuthToken } from './middleware/auth';

const app = express();

// Body parsing middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'enterprise-service-platform',
    version: '2.14.3',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Auth token parsing middleware
app.use(parseAuthToken);

// API routes
app.use('/v1/billing', billingRoutes);
app.use('/v1/appointments', appointmentRoutes);
app.use('/v1/notifications', notificationRoutes);
app.use('/v1/customers', customerRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method,
  });
});

// Error handler
app.use((err: any, req: any, res: any, next: any) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({
    error: err.message,
    stack: err.stack,
  });
});

export default app;
