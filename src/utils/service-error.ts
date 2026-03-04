/**
 * ServiceError is thrown by service-layer validation to communicate
 * structured error responses back to route handlers.
 *
 * Routes catch ServiceError instances and return the attached
 * statusCode and responseBody, preserving identical API behaviour
 * after validation logic is consolidated into services.
 */
export class ServiceError extends Error {
  statusCode: number;
  responseBody: Record<string, unknown>;

  constructor(message: string, statusCode: number, responseBody: Record<string, unknown>) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}
