// Server-only admin auth helpers. The `.server.ts` suffix prevents Vite from
// bundling this into any client chunk.
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import {
  getCookie,
  setCookie,
  deleteCookie,
  getRequestIP,
} from "@tanstack/react-start/server";

const COOKIE_NAME = "admin_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 jours

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function getSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("ADMIN_SESSION_SECRET missing or too short");
  }
  return s;
}

function getAdminPassword(): string {
  const p = process.env.ADMIN_PASSWORD;
  if (!p || p.length < 8) {
    throw new Error("ADMIN_PASSWORD missing or too short");
  }
  return p;
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", getSecret()).update(payload).digest());
}

function signSession(expiresAt: number): string {
  return `${expiresAt}.${sign(String(expiresAt))}`;
}

function verifySession(token: string | undefined | null): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = sign(expStr);
  const a = b64urlDecode(sig);
  const b = b64urlDecode(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isAdminAuthenticated(): boolean {
  return verifySession(getCookie(COOKIE_NAME));
}

export function requireAdminOrThrow(): void {
  if (!isAdminAuthenticated()) {
    throw new Error("Unauthorized");
  }
}

// Rate-limit en mémoire (par instance Worker). Suffisant pour ralentir un brute-force.
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000; // 10 min

function rateLimitKey(): string {
  try {
    return getRequestIP({ xForwardedFor: true }) ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function checkRateLimit(): { ok: boolean; retryInSec: number } {
  const key = rateLimitKey();
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.resetAt < now) {
    attempts.set(key, { count: 0, resetAt: now + WINDOW_MS });
    return { ok: true, retryInSec: 0 };
  }
  if (rec.count >= MAX_ATTEMPTS) {
    return { ok: false, retryInSec: Math.ceil((rec.resetAt - now) / 1000) };
  }
  return { ok: true, retryInSec: 0 };
}

export function noteAttempt(success: boolean): void {
  const key = rateLimitKey();
  const now = Date.now();
  if (success) {
    attempts.delete(key);
    return;
  }
  const rec = attempts.get(key);
  if (!rec || rec.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    rec.count++;
  }
}

export function verifyPasswordConstantTime(submitted: string): boolean {
  const expected = getAdminPassword();
  const a = Buffer.from(submitted ?? "", "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    // Toujours faire un timingSafeEqual sur des buffers de même taille pour
    // ne pas leaker la longueur via le timing.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function issueSessionCookie(): void {
  const expiresAt = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  setCookie(COOKIE_NAME, signSession(expiresAt), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(): void {
  deleteCookie(COOKIE_NAME, { path: "/" });
}

// Génère un secret aléatoire que l'utilisateur peut copier pour ADMIN_SESSION_SECRET.
// Non utilisé par le runtime mais utile pour debug en console.
export function generateSecret(): string {
  return b64url(randomBytes(32));
}
