/**
 * shared/logger.ts — Structured logging via Pino
 *
 * Development: pino-pretty (colorized, human-readable)
 * Production:  JSON lines (machine-parseable, ELK/Datadog/CloudWatch compatible)
 *
 * Features:
 *   - Request/response serializers (method, url, status, duration)
 *   - Redacts sensitive headers (authorization, cookie)
 *   - Child loggers with request ID correlation
 *   - Express middleware for automatic request logging
 */
import pino from 'pino';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { env } from '../config/env.ts';

export const logger = pino({
  level: process.env.LOG_LEVEL || (env.NODE_ENV === 'production' ? 'info' : 'debug'),
  transport: env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
    : undefined, // JSON in production
  base: {
    service: 'ura-api',
    version: process.env.npm_package_version || '4.0.0',
    env: env.NODE_ENV,
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: (req: any) => ({
      method: req.method,
      url: req.url,
      id: req.id,
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
    }),
    res: (res: any) => ({
      statusCode: res.statusCode,
    }),
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash', '*.token'],
    censor: '[REDACTED]',
  },
});

/**
 * Express middleware: logs every API request with duration and status.
 * Attaches child logger to req.log for per-request context.
 * Skips static asset requests.
 */
export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip static assets
    if (req.url.startsWith('/assets/') || req.url.endsWith('.js') || req.url.endsWith('.css') || req.url.endsWith('.map')) {
      return next();
    }

    const start = Date.now();
    const reqId = req.headers['x-request-id'] as string || randomUUID().slice(0, 8);

    // Attach to request for downstream use
    (req as any).id = reqId;
    (req as any).log = logger.child({ reqId });
    res.setHeader('X-Request-Id', reqId);

    // Intercept response end to measure duration
    const origEnd = res.end;
    res.end = function (...args: any[]) {
      const duration = Date.now() - start;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

      (req as any).log[level]({
        req: { method: req.method, url: req.originalUrl, ip: req.ip },
        res: { statusCode: res.statusCode },
        duration,
      }, `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);

      return origEnd.apply(res, args);
    } as any;

    next();
  };
}

/**
 * Create a child logger with additional context.
 * Usage: const log = childLogger({ module: 'ingestion', batchId });
 */
export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
