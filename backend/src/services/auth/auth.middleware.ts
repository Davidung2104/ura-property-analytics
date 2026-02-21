/**
 * services/auth/auth.middleware.ts — Express authentication middleware
 *
 * Two modes:
 *   requireAuth  — 401 if no valid token (for protected endpoints)
 *   optionalAuth — Attaches user if token present, continues if not
 *
 * ENABLE_AUTH=false bypasses all checks (for development / gradual rollout).
 */
import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env.ts';
import { verifyAccessToken, type JwtPayload, AuthError } from './auth.service.ts';

// Extend Express Request with user info
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      userId?: string;
    }
  }
}

/**
 * Extract Bearer token from Authorization header.
 */
function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

/**
 * Require authentication. Returns 401 if token missing or invalid.
 * Skips check when ENABLE_AUTH=false (dev mode).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Skip auth in dev mode
  if (!env.ENABLE_AUTH) {
    req.userId = 'dev-user';
    req.user = { sub: 'dev-user', email: 'dev@local', plan: 'pro' };
    return next();
  }

  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: 'Authentication required', code: 'NO_TOKEN' });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    req.userId = payload.sub;
    next();
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ success: false, error: err.message, code: err.code });
    } else {
      res.status(401).json({ success: false, error: 'Invalid token', code: 'INVALID_TOKEN' });
    }
  }
}

/**
 * Optional authentication. Attaches user if valid token present, continues either way.
 * Useful for endpoints that work for both anonymous and authenticated users.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  if (!env.ENABLE_AUTH) {
    req.userId = 'dev-user';
    req.user = { sub: 'dev-user', email: 'dev@local', plan: 'pro' };
    return next();
  }

  const token = extractToken(req);
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    req.userId = payload.sub;
  } catch {
    // Invalid token — continue without auth (don't block)
  }

  next();
}

/**
 * Require a specific plan level. Must be used AFTER requireAuth.
 */
export function requirePlan(...plans: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!env.ENABLE_AUTH) return next();

    const userPlan = req.user?.plan || 'free';
    if (!plans.includes(userPlan)) {
      res.status(403).json({
        success: false,
        error: `This feature requires a ${plans.join(' or ')} plan`,
        code: 'PLAN_REQUIRED',
      });
      return;
    }
    next();
  };
}
