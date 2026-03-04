import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import logger from '../utils/logger';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Express middleware that parses a JWT Bearer token from the Authorization header
 * and attaches the decoded userId to `req.userId`.
 *
 * - If no token is present, `req.userId` defaults to `'anonymous'`.
 * - If the token is invalid, `req.userId` defaults to `'anonymous'` and a warning is logged.
 * - Requests are never rejected for missing/invalid tokens (backward compatibility).
 */
export function parseAuthToken(req: Request, _res: Response, next: NextFunction): void {
  let userId = 'anonymous';

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, config.jwtSecret) as any;
      userId = decoded.sub || decoded.userId || 'unknown';
    } catch (tokenErr) {
      logger.warn(`[AuthMiddleware] Invalid auth token on ${req.method} ${req.path}`);
    }
  }

  req.userId = userId;
  next();
}
