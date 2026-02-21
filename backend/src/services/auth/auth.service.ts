/**
 * services/auth/auth.service.ts — JWT authentication
 *
 * Provides: register, login, refresh, verify.
 * Uses bcrypt for password hashing, JWT for tokens.
 * Refresh tokens stored in DB for revocation support.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { env } from '../../config/env.ts';
import { getDb } from '../../config/database.ts';
import { users, refreshTokens, type User } from '../../db/schema.ts';

const SALT_ROUNDS = 12;

export interface JwtPayload {
  sub: string;        // user id
  email: string;
  plan: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  plan: string | null;
}

/**
 * Register a new user. Throws if email already exists.
 */
export async function register(email: string, password: string, displayName?: string): Promise<AuthTokens> {
  const db = getDb();
  const normalized = email.toLowerCase().trim();

  // Check for existing user
  const existing = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);

  if (existing.length > 0) {
    throw new AuthError('Email already registered', 'EMAIL_EXISTS', 409);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Create user
  const result = await db.insert(users)
    .values({ email: normalized, passwordHash, displayName: displayName || null })
    .returning({ id: users.id, email: users.email, plan: users.plan });

  const user = result[0];
  if (!user) throw new AuthError('Failed to create user', 'CREATE_FAILED', 500);
  return issueTokens({ id: user.id, email: user.email, plan: user.plan });
}

/**
 * Login with email + password. Returns tokens or throws.
 */
export async function login(email: string, password: string): Promise<AuthTokens> {
  const db = getDb();
  const normalized = email.toLowerCase().trim();

  const [user] = await db.select()
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);

  if (!user) {
    throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
  }

  // Update last login
  await db.update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  return issueTokens({ id: user.id, email: user.email, plan: user.plan });
}

/**
 * Refresh tokens using a valid refresh token.
 */
export async function refresh(token: string): Promise<AuthTokens> {
  const db = getDb();
  const hash = hashToken(token);

  // Find non-revoked, non-expired refresh token
  const [stored] = await db.select({
    id: refreshTokens.id,
    userId: refreshTokens.userId,
  })
    .from(refreshTokens)
    .where(and(
      eq(refreshTokens.tokenHash, hash),
      isNull(refreshTokens.revokedAt),
      gt(refreshTokens.expiresAt, new Date()),
    ))
    .limit(1);

  if (!stored) {
    throw new AuthError('Invalid or expired refresh token', 'INVALID_REFRESH', 401);
  }

  // Revoke the used refresh token (rotation)
  await db.update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, stored.id));

  // Get user
  const [user] = await db.select({ id: users.id, email: users.email, plan: users.plan })
    .from(users)
    .where(eq(users.id, stored.userId))
    .limit(1);

  if (!user) {
    throw new AuthError('User not found', 'USER_NOT_FOUND', 401);
  }

  return issueTokens(user);
}

/**
 * Verify a JWT access token. Returns payload or throws.
 */
export function verifyAccessToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch (err) {
    if ((err as Error).name === 'TokenExpiredError') {
      throw new AuthError('Token expired', 'TOKEN_EXPIRED', 401);
    }
    throw new AuthError('Invalid token', 'INVALID_TOKEN', 401);
  }
}

/**
 * Revoke all refresh tokens for a user (logout everywhere).
 */
export async function revokeAllTokens(userId: string): Promise<void> {
  const db = getDb();
  await db.update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(refreshTokens.userId, userId),
      isNull(refreshTokens.revokedAt),
    ));
}

/**
 * Get user profile by ID.
 */
export async function getUserProfile(userId: string): Promise<AuthUser | null> {
  const db = getDb();
  const [user] = await db.select({
    id: users.id,
    email: users.email,
    displayName: users.displayName,
    plan: users.plan,
  })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user || null;
}

// ── Internal helpers ──

async function issueTokens(user: { id: string; email: string; plan: string | null }): Promise<AuthTokens> {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    plan: user.plan || 'free',
  };

  const accessToken = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as string,
  } as jwt.SignOptions);

  // Generate refresh token (opaque random string)
  const rawRefresh = randomBytes(48).toString('base64url');
  const hash = hashToken(rawRefresh);

  // Parse refresh expiry for DB storage
  const refreshMs = parseDuration(env.JWT_REFRESH_EXPIRES_IN);
  const expiresAt = new Date(Date.now() + refreshMs);

  // Store refresh token in DB
  const db = getDb();
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: hash,
    expiresAt,
  } as any);

  return {
    accessToken,
    refreshToken: rawRefresh,
    expiresIn: env.JWT_EXPIRES_IN,
  };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseDuration(dur: string): number {
  const match = dur.match(/^(\d+)(d|h|m|s)$/);
  if (!match || !match[1] || !match[2]) return 7 * 24 * 60 * 60 * 1000; // default 7d
  const n = parseInt(match[1]);
  switch (match[2]) {
    case 'd': return n * 86_400_000;
    case 'h': return n * 3_600_000;
    case 'm': return n * 60_000;
    case 's': return n * 1_000;
    default: return 7 * 86_400_000;
  }
}

// ── Error class ──

export class AuthError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
  }
}
