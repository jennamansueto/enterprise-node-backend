// Service platform constants

export const BILLING_TIERS = {
  BASIC: 'basic',
  STANDARD: 'standard',
  PREMIUM: 'premium',
  ENTERPRISE: 'enterprise',
} as const;

export const TIER_RATES: Record<string, number> = {
  basic: 29.99,
  standard: 79.99,
  premium: 149.99,
  enterprise: 299.99,
};

export const DISCOUNT_THRESHOLDS = {
  LOYALTY_MONTHS: 12,
  LOYALTY_DISCOUNT_PCT: 0.10,
  VOLUME_MIN_SERVICES: 5,
  VOLUME_DISCOUNT_PCT: 0.15,
  BUNDLE_DISCOUNT_PCT: 0.08,
  EARLY_PAYMENT_DISCOUNT_PCT: 0.05,
};

export const APPOINTMENT_STATUS = {
  SCHEDULED: 'scheduled',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
} as const;

export const NOTIFICATION_CHANNELS = {
  EMAIL: 'email',
  SMS: 'sms',
  PUSH: 'push',
} as const;

export const NOTIFICATION_TYPES = {
  BILLING_RECEIPT: 'billing_receipt',
  APPOINTMENT_REMINDER: 'appointment_reminder',
  APPOINTMENT_CONFIRMATION: 'appointment_confirmation',
  PAYMENT_FAILED: 'payment_failed',
  ACCOUNT_UPDATE: 'account_update',
} as const;

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  RETRYING: 'retrying',
} as const;

export const ERROR_CODES = {
  INVALID_INPUT: 'INVALID_INPUT',
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  APPOINTMENT_CONFLICT: 'APPOINTMENT_CONFLICT',
  NOTIFICATION_FAILED: 'NOTIFICATION_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMITED: 'RATE_LIMITED',
};
