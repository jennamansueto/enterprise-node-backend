import { DISCOUNT_THRESHOLDS } from '../config/constants';

export interface DiscountInput {
  baseAmount: number;
  loyaltyMonths: number;
  activeServices: number;
  tier: string;
  paymentMethod?: string;
}

export interface DiscountResult {
  totalDiscount: number;
  reasons: string[];
}

/**
 * Calculate all applicable discounts for a charge.
 *
 * This is the single source of truth for discount computation.
 * Covers loyalty, volume, bundle, and early-payment discounts.
 */
export function calculateDiscounts(input: DiscountInput): DiscountResult {
  const { baseAmount, loyaltyMonths, activeServices, tier, paymentMethod } = input;

  let totalDiscount = 0;
  const reasons: string[] = [];

  // Loyalty discount
  if (loyaltyMonths >= DISCOUNT_THRESHOLDS.LOYALTY_MONTHS) {
    totalDiscount += baseAmount * DISCOUNT_THRESHOLDS.LOYALTY_DISCOUNT_PCT;
    reasons.push('loyalty');
  }

  // Volume discount
  if (activeServices >= DISCOUNT_THRESHOLDS.VOLUME_MIN_SERVICES) {
    totalDiscount += baseAmount * DISCOUNT_THRESHOLDS.VOLUME_DISCOUNT_PCT;
    reasons.push('volume');
  }

  // Bundle discount
  if (activeServices >= 3 && tier !== 'basic') {
    totalDiscount += baseAmount * DISCOUNT_THRESHOLDS.BUNDLE_DISCOUNT_PCT;
    reasons.push('bundle');
  }

  // Early payment discount (bank transfer)
  if (paymentMethod === 'bank_transfer') {
    totalDiscount += baseAmount * DISCOUNT_THRESHOLDS.EARLY_PAYMENT_DISCOUNT_PCT;
    reasons.push('early_payment');
  }

  return { totalDiscount, reasons };
}

export interface DiscountEligibilityInput {
  loyaltyMonths: number;
  activeServices: number;
  tier: string;
}

/**
 * Return human-readable labels for discounts the customer is eligible for.
 *
 * Used in customer account summaries to show available discounts without
 * computing actual amounts.
 */
export function getAvailableDiscountLabels(input: DiscountEligibilityInput): string[] {
  const { loyaltyMonths, activeServices, tier } = input;
  const labels: string[] = [];

  if (loyaltyMonths >= DISCOUNT_THRESHOLDS.LOYALTY_MONTHS) {
    labels.push(`loyalty_${Math.round(DISCOUNT_THRESHOLDS.LOYALTY_DISCOUNT_PCT * 100)}pct`);
  }

  if (activeServices >= DISCOUNT_THRESHOLDS.VOLUME_MIN_SERVICES) {
    labels.push(`volume_${Math.round(DISCOUNT_THRESHOLDS.VOLUME_DISCOUNT_PCT * 100)}pct`);
  }

  if (activeServices >= 3 && tier !== 'basic') {
    labels.push(`bundle_${Math.round(DISCOUNT_THRESHOLDS.BUNDLE_DISCOUNT_PCT * 100)}pct`);
  }

  return labels;
}
