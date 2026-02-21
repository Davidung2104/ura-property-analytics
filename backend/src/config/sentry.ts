/**
 * config/sentry.ts — Sentry error tracking (opt-in)
 *
 * Enable by setting SENTRY_DSN in environment.
 * When disabled, all functions are no-ops.
 *
 * Features:
 *   - Automatic error capture with Express integration
 *   - Performance tracing (configurable sample rate)
 *   - User context attachment
 *   - Environment and release tagging
 */

// NOTE: @sentry/node is an optional dependency.
// Install with: npm install @sentry/node
// If not installed, all exports are safe no-ops.

let Sentry: any = null;
let initialized = false;

/**
 * Initialize Sentry. Call once at server startup.
 * No-op if SENTRY_DSN is not set or @sentry/node is not installed.
 */
export async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('ℹ️  Sentry disabled (no SENTRY_DSN)');
    return;
  }

  try {
    Sentry = await import('@sentry/node');
  } catch {
    console.warn('⚠️  @sentry/node not installed — error tracking disabled');
    console.warn('   Install with: npm install @sentry/node');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version || 'unknown',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Scrub sensitive data
    beforeSend(event: any) {
      // Remove authorization headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });

  initialized = true;
  console.log('✅ Sentry initialized');
}

/**
 * Capture an exception manually.
 */
export function captureException(err: Error, context?: Record<string, unknown>): void {
  if (!initialized || !Sentry) return;
  if (context) {
    Sentry.withScope((scope: any) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
      Sentry.captureException(err);
    });
  } else {
    Sentry.captureException(err);
  }
}

/**
 * Capture a message (non-error event).
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (!initialized || !Sentry) return;
  Sentry.captureMessage(message, level);
}

/**
 * Set user context for error reports.
 */
export function setUser(user: { id: string; email?: string; plan?: string } | null): void {
  if (!initialized || !Sentry) return;
  Sentry.setUser(user);
}

/**
 * Express error handler middleware. Place LAST in middleware chain.
 * Falls back to a standard error handler if Sentry is not available.
 */
export function sentryErrorHandler() {
  if (initialized && Sentry?.expressErrorHandler) {
    return Sentry.expressErrorHandler();
  }
  // No-op passthrough middleware
  return (_err: any, _req: any, _res: any, next: any) => next(_err);
}

/**
 * Flush pending events before shutdown.
 */
export async function flushSentry(timeout = 2000): Promise<void> {
  if (!initialized || !Sentry) return;
  await Sentry.flush(timeout);
}
