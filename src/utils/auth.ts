import { Request } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import logger from './logger';

// Best-effort extraction of the calling user's ID from a Bearer token.
// Returns 'anonymous' when no token is supplied and 'unknown' when the
// token verifies but does not carry an identifier. Verification failures
// are logged at warn level and resolve to 'anonymous' so route handlers
// can keep their backward-compatible behaviour.
export function extractUserIdFromAuth(
  req: Request,
  requestId: string,
  routeLabel: string,
): string {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return 'anonymous';
  }
  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.jwtSecret) as Record<string, unknown>;
    const sub = decoded.sub;
    const userId = decoded.userId;
    if (typeof sub === 'string' && sub.length > 0) {
      return sub;
    }
    if (typeof userId === 'string' && userId.length > 0) {
      return userId;
    }
    return 'unknown';
  } catch (tokenErr) {
    logger.warn(`[${routeLabel}] Invalid auth token in request ${requestId}`);
    return 'anonymous';
  }
}
