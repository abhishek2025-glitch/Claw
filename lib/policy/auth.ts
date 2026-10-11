import { timingSafeEqual } from 'node:crypto';

let warnedUnconfiguredInDev = false;
let warnedUnconfiguredInProd = false;

/**
 * Constant-time bearer token verification to prevent timing side-channel attacks.
 * In production (NODE_ENV === 'production'), if no secret is configured, fails closed (returns false).
 * In development, unconfigured secret allows requests but logs a clear warning.
 */
export function verifyBearerToken(authHeader: string | null, expectedSecret?: string): boolean {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!expectedSecret) {
    if (isProduction) {
      if (!warnedUnconfiguredInProd) {
        console.error('[SECURITY WARNING] No bearer secret (WEBHOOK_SECRET/AGENTSHIELD_SECRET) configured in production. Protected routes fail closed.');
        warnedUnconfiguredInProd = true;
      }
      return false; // Fail-closed in production
    }

    if (!warnedUnconfiguredInDev) {
      console.warn('[SECURITY WARNING] No bearer secret configured. Authentication is open in development mode.');
      warnedUnconfiguredInDev = true;
    }
    return true; // Open in development
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7).trim();
  const tokenBuf = Buffer.from(token, 'utf-8');
  const expectedBuf = Buffer.from(expectedSecret, 'utf-8');

  // If buffer lengths differ, perform constant-time dummy compare to prevent timing leakage
  if (tokenBuf.length !== expectedBuf.length) {
    timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }

  return timingSafeEqual(tokenBuf, expectedBuf);
}

