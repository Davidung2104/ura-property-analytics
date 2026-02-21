/**
 * shared/metrics.ts — Prometheus metrics via prom-client
 *
 * Exposes: /api/metrics (protected by admin key in production)
 *
 * Metrics:
 *   http_requests_total          — Counter by method/route/status
 *   http_request_duration_seconds — Histogram by method/route/status
 *   cache_operations_total       — Counter by type (hit/miss/set/del)
 *   ura_ingestion_duration_seconds — Histogram for ingestion jobs
 *   active_connections           — Gauge for current connections
 *   data_store_size              — Gauge for in-memory store sizes
 */
import {
  Registry, Counter, Histogram, Gauge, Summary,
  collectDefaultMetrics,
} from 'prom-client';
import type { Request, Response, NextFunction } from 'express';

export const registry = new Registry();

// Collect Node.js runtime metrics (event loop lag, GC, memory, etc.)
collectDefaultMetrics({ register: registry, prefix: 'ura_' });

// ── HTTP Metrics ──

export const httpRequestsTotal = new Counter({
  name: 'ura_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'ura_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const httpRequestSize = new Summary({
  name: 'ura_http_response_size_bytes',
  help: 'HTTP response size in bytes',
  labelNames: ['method', 'route'] as const,
  registers: [registry],
});

// ── Cache Metrics ──

export const cacheOperations = new Counter({
  name: 'ura_cache_operations_total',
  help: 'Cache operations by type',
  labelNames: ['operation', 'cache_key'] as const, // hit, miss, set, del, invalidate
  registers: [registry],
});

// ── Ingestion Metrics ──

export const ingestionDuration = new Histogram({
  name: 'ura_ingestion_duration_seconds',
  help: 'URA data ingestion duration in seconds',
  labelNames: ['job_type', 'status'] as const,
  buckets: [10, 30, 60, 120, 300, 600, 1200],
  registers: [registry],
});

export const ingestionRecords = new Counter({
  name: 'ura_ingestion_records_total',
  help: 'Total records ingested',
  labelNames: ['type'] as const, // sales, rental
  registers: [registry],
});

// ── Business Metrics ──

export const activeConnections = new Gauge({
  name: 'ura_active_connections',
  help: 'Current active HTTP connections',
  registers: [registry],
});

export const dataStoreSize = new Gauge({
  name: 'ura_data_store_size',
  help: 'Number of records in data stores',
  labelNames: ['store'] as const, // sales, rental, projects
  registers: [registry],
});

export const authOperations = new Counter({
  name: 'ura_auth_operations_total',
  help: 'Authentication operations',
  labelNames: ['operation', 'status'] as const, // login/register/refresh × success/failure
  registers: [registry],
});

// ── Express Middleware ──

/**
 * Normalize route for metric labels.
 * Collapses path params: /api/project/THE%20LANDMARK → /api/project/:name
 */
function normalizeRoute(req: Request): string {
  const url = req.route?.path || req.originalUrl || req.url;
  // Collapse known dynamic segments
  return url
    .replace(/\/api\/project\/[^/?]+/, '/api/project/:name')
    .replace(/\/api\/search\/[^/?]+/, '/api/search/:type')
    .replace(/\/api\/user\/[^/?]+/, '/api/user/:id')
    .split('?')[0]; // Strip query params
}

/**
 * Metrics collection middleware. Place early in the middleware chain.
 */
export function metricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip metrics endpoint itself
    if (req.url === '/api/metrics') return next();

    activeConnections.inc();
    const end = httpRequestDuration.startTimer();

    const origEnd = res.end;
    res.end = function (...args: any[]) {
      activeConnections.dec();
      const route = normalizeRoute(req);
      const labels = { method: req.method, route, status_code: String(res.statusCode) };

      end(labels);
      httpRequestsTotal.inc(labels);

      // Response size
      const contentLength = res.getHeader('content-length');
      if (contentLength) {
        httpRequestSize.observe({ method: req.method, route }, Number(contentLength));
      }

      return origEnd.apply(res, args);
    } as any;

    next();
  };
}

/**
 * Metrics endpoint handler. Returns Prometheus text format.
 */
export async function metricsEndpoint(_req: Request, res: Response): Promise<void> {
  try {
    res.set('Content-Type', registry.contentType);
    const metrics = await registry.metrics();
    res.end(metrics);
  } catch (err) {
    res.status(500).end('Error collecting metrics');
  }
}
