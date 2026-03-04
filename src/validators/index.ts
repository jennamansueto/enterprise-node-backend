/**
 * Shared validation constants and helpers.
 *
 * These are the single source of truth for enum-like value lists and
 * format checks that were previously duplicated across route handlers
 * and service functions.
 */

export const VALID_SERVICE_TYPES: string[] = [
  'consultation',
  'maintenance',
  'installation',
  'repair',
  'inspection',
  'assessment',
  'follow_up',
];

export const VALID_PAYMENT_METHODS: string[] = [
  'credit_card',
  'bank_transfer',
  'invoice',
  'wallet',
];

export const VALID_NOTIFICATION_CHANNELS: string[] = [
  'email',
  'sms',
  'push',
];

export const VALID_TIERS: string[] = [
  'basic',
  'standard',
  'premium',
  'enterprise',
];

/** Returns true when `date` matches the YYYY-MM-DD format. */
export function isValidDateFormat(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/** Returns true when `time` matches the HH:MM format. */
export function isValidTimeFormat(time: string): boolean {
  return /^\d{2}:\d{2}$/.test(time);
}
