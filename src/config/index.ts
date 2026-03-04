// Enterprise Service Platform - Configuration Module
// Centralized configuration for the service platform

export interface AppConfig {
  port: number;
  environment: string;
  dbPath: string;
  jwtSecret: string;
  logLevel: string;
  emailServiceUrl: string;
  smsServiceUrl: string;
  paymentGatewayUrl: string;
  paymentGatewayApiKey: string;
  maxRetries: number;
  retryDelayMs: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  appointmentBufferMinutes: number;
  notificationTimeoutMs: number;
  enableSmsFailover: boolean;
  enablePaymentRetry: boolean;
}

const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  environment: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || ':memory:',
  jwtSecret: process.env.JWT_SECRET || 'platform-secret-key-2024',
  logLevel: process.env.LOG_LEVEL || 'info',
  emailServiceUrl: process.env.EMAIL_SERVICE_URL || 'https://email-api.internal.corp.net/v2/send',
  smsServiceUrl: process.env.SMS_SERVICE_URL || 'https://sms-gateway.internal.corp.net/v1/dispatch',
  paymentGatewayUrl: process.env.PAYMENT_GATEWAY_URL || 'https://payments.internal.corp.net/v3/process',
  paymentGatewayApiKey: process.env.PAYMENT_API_KEY || 'pk_live_51N3xK2GhR7vMqPzT8wXyZ9',
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
  retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '1000', 10),
  rateLimitWindowMs: 60000,
  rateLimitMaxRequests: 100,
  appointmentBufferMinutes: 30,
  notificationTimeoutMs: 5000,
  enableSmsFailover: true,
  enablePaymentRetry: true,
};

export default config;
