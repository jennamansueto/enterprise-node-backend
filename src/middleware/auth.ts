import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import logger from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  let userId = 'anonymous';
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, config.jwtSecret) as any;
      userId = decoded.sub || decoded.userId || 'unknown';
    } catch (tokenErr) {
      logger.warn(`[AuthMiddleware] Invalid auth token in request`);
    }
  }

  req.userId = userId;
  next();
}
