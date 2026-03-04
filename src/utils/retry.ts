import logger from './logger';

export interface RetryOptions {
  /** Maximum number of retry attempts after the initial try. Defaults to 3. */
  maxRetries: number;
  /** Delay in milliseconds between retry attempts. Defaults to 200. */
  delayMs: number;
  /** Log prefix for contextual logging (e.g., "[BillingService]"). */
  logPrefix: string;
  /** Optional description of the operation for log messages. */
  operationName?: string;
}

export interface RetryResult<T> {
  /** The result of the operation if it succeeded, or null if all attempts failed. */
  result: T | null;
  /** Whether the operation eventually succeeded. */
  success: boolean;
  /** The number of retry attempts made (0 means first attempt succeeded). */
  retryCount: number;
  /** The last error message if the operation failed, or null if it succeeded. */
  lastError: string | null;
}

/**
 * Execute an async operation with retry logic.
 *
 * Attempts the operation up to `maxRetries + 1` times total (1 initial + maxRetries retries).
 * On failure, waits `delayMs` between each retry attempt.
 *
 * @param operation - Async function to execute on each attempt.
 * @param options - Configuration for retry behavior and logging.
 * @returns A RetryResult containing the outcome, retry count, and any error.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<RetryResult<T>> {
  const { maxRetries, delayMs, logPrefix, operationName } = options;
  const opLabel = operationName || 'operation';

  let retryCount = 0;
  let lastError: string | null = null;

  while (retryCount <= maxRetries) {
    try {
      logger.info(`${logPrefix} ${opLabel} attempt ${retryCount + 1}/${maxRetries + 1}`);

      const result = await operation();

      return {
        result,
        success: true,
        retryCount,
        lastError: null,
      };
    } catch (err: any) {
      lastError = err.message || String(err);
      retryCount++;
      logger.warn(`${logPrefix} ${opLabel} attempt ${retryCount} failed: ${lastError}`);

      if (retryCount <= maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  return {
    result: null,
    success: false,
    retryCount,
    lastError,
  };
}
