import jwt from 'jsonwebtoken';
import config from '../config';
import logger from './logger';

/**
 * Resolve the calling user's id from a Bearer token in the Authorization header.
 *
 * Returns 'anonymous' when no Bearer header is present and 'unknown' when the
 * token is well-formed but does not carry a recognizable subject claim.
 * Invalid / expired tokens are logged at warn level and treated as anonymous,
 * preserving the historical behavior of the route handlers that previously
 * inlined this logic.
 */
export function resolveUserIdFromAuthHeader(
  authHeader: string | undefined,
  routeName: string,
  requestId: string,
): string {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return 'anonymous';
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as Record<string, unknown>;
    const sub = typeof decoded.sub === 'string' ? decoded.sub : undefined;
    const userId = typeof decoded.userId === 'string' ? decoded.userId : undefined;
    return sub || userId || 'unknown';
  } catch {
    logger.warn(`[${routeName}] Invalid auth token in request ${requestId}`);
    return 'anonymous';
  }
}
