/**
 * Custom error thrown when a customer is not found in the database.
 * Used by services as the single source of truth for customer existence validation.
 */
export class CustomerNotFoundError extends Error {
  public readonly customerId: string;

  constructor(customerId: string) {
    super('Customer not found: ' + customerId);
    this.name = 'CustomerNotFoundError';
    this.customerId = customerId;
  }
}
