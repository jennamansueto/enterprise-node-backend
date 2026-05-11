import jwt from 'jsonwebtoken';
import config from '../config';

export interface ParseBearerOptions {
  onInvalidToken?: (err: unknown) => void;
}

export function parseBearerUserId(
  authHeader: string | undefined,
  options: ParseBearerOptions = {},
): string {
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, config.jwtSecret) as { sub?: string; userId?: string };
      return decoded.sub || decoded.userId || 'unknown';
    } catch (err) {
      options.onInvalidToken?.(err);
    }
  }
  return 'anonymous';
}
