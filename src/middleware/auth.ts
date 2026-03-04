import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'platform-secret-key-2024';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

/**
 * Express middleware that extracts userId from a JWT Bearer token.
 * On token verification failure, logs a warning and continues
 * (maintaining backward compatibility for unauthenticated requests).
 */
export function extractUserId(req: Request, res: Response, next: NextFunction): void {
  let userId = 'anonymous';

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      userId = decoded.sub || decoded.userId || 'unknown';
    } catch (tokenErr) {
      logger.warn(`[AuthMiddleware] Invalid auth token, proceeding as anonymous`);
    }
  }

  req.userId = userId;
  next();
}

/**
 * Helper to retrieve the userId from the request object.
 */
export function getUserId(req: Request): string {
  return req.userId || 'anonymous';
}
