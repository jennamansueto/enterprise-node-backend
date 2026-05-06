import jwt from 'jsonwebtoken';
import config from '../config';
import logger from './logger';

const BEARER_PREFIX = 'Bearer ';
const ANONYMOUS_USER = 'anonymous';
const UNKNOWN_USER = 'unknown';

export function resolveUserIdFromAuthHeader(
  authHeader: string | undefined,
  routeName: string,
  requestId: string,
): string {
  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    return ANONYMOUS_USER;
  }
  try {
    const token = authHeader.substring(BEARER_PREFIX.length);
    const decoded = jwt.verify(token, config.jwtSecret) as { sub?: string; userId?: string };
    return decoded.sub || decoded.userId || UNKNOWN_USER;
  } catch {
    logger.warn(`[${routeName}] Invalid auth token in request ${requestId}`);
    return ANONYMOUS_USER;
  }
}
