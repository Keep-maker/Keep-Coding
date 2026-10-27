import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';

/**
 * Shared-token auth for the API and the agent WebSocket.
 *
 * This server runs an agent that can execute arbitrary shell commands inside the
 * workspace, so it must never be reachable anonymously. When
 * CURSOR_FORK_AUTH_TOKEN is set every /api route except the status probe and
 * the socket handshake requires a matching bearer token.
 */

export const TOKEN_HEADER = 'x-keep-coding-token';

function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) {
    // Still do a comparison so the failure path costs the same.
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function readRawToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const bearer = /^Bearer\s+(.+)$/i.exec(trimmed);
  return bearer ? bearer[1].trim() : trimmed;
}

/** True when no token is configured, i.e. local development. */
export function authDisabled(): boolean {
  return !config.authToken;
}

/** Pulls a candidate token from the Authorization header or the custom header. */
export function tokenFromRequest(req: Request): string | null {
  return readRawToken(req.get('authorization')) ?? readRawToken(req.get(TOKEN_HEADER));
}

export function isAuthorized(candidate: string | null | undefined): boolean {
  if (authDisabled()) return true;
  const token = readRawToken(candidate);
  if (!token) return false;
  return timingSafeEqual(token, config.authToken);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (isAuthorized(tokenFromRequest(req))) {
    next();
    return;
  }
  res.status(401).json({ error: 'Unauthorized', requiresAuth: true });
}

/**
 * Browsers cannot set custom headers on a WebSocket handshake, so the token
 * travels as a query parameter (or as the subprotocol) for that one request.
 */
export function isAuthorizedUpgrade(url: string | undefined): boolean {
  if (authDisabled()) return true;
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url, 'http://localhost');
  } catch {
    return false;
  }
  return isAuthorized(parsed.searchParams.get('token'));
}
