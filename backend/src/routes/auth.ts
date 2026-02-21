/**
 * routes/auth.ts — Authentication endpoints
 *
 * POST /api/auth/register   — Create account
 * POST /api/auth/login      — Get tokens
 * POST /api/auth/refresh    — Rotate tokens
 * POST /api/auth/logout     — Revoke all tokens
 * GET  /api/auth/me         — Get profile
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  register, login, refresh, revokeAllTokens, getUserProfile, AuthError,
} from '../services/auth/auth.service.ts';
import { requireAuth } from '../services/auth/auth.middleware.ts';

const router = Router();

// ── Schemas ──

const RegisterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  displayName: z.string().max(100).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ── Routes ──

router.post('/register', async (req: Request, res: Response) => {
  try {
    const body = RegisterSchema.parse(req.body);
    const tokens = await register(body.email, body.password, body.displayName);
    res.status(201).json({ success: true, data: tokens });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: err.errors });
    } else if (err instanceof AuthError) {
      res.status(err.status).json({ success: false, error: err.message, code: err.code });
    } else {
      console.error('[Auth] Register error:', err);
      res.status(500).json({ success: false, error: 'Registration failed' });
    }
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const body = LoginSchema.parse(req.body);
    const tokens = await login(body.email, body.password);
    res.json({ success: true, data: tokens });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: err.errors });
    } else if (err instanceof AuthError) {
      res.status(err.status).json({ success: false, error: err.message, code: err.code });
    } else {
      console.error('[Auth] Login error:', err);
      res.status(500).json({ success: false, error: 'Login failed' });
    }
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const body = RefreshSchema.parse(req.body);
    const tokens = await refresh(body.refreshToken);
    res.json({ success: true, data: tokens });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: err.errors });
    } else if (err instanceof AuthError) {
      res.status(err.status).json({ success: false, error: err.message, code: err.code });
    } else {
      console.error('[Auth] Refresh error:', err);
      res.status(500).json({ success: false, error: 'Token refresh failed' });
    }
  }
});

router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  try {
    await revokeAllTokens(req.userId!);
    res.json({ success: true, message: 'All sessions revoked' });
  } catch (err) {
    console.error('[Auth] Logout error:', err);
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const profile = await getUserProfile(req.userId!);
    if (!profile) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    res.json({ success: true, data: profile });
  } catch (err) {
    console.error('[Auth] Profile error:', err);
    res.status(500).json({ success: false, error: 'Failed to load profile' });
  }
});

export default router;
