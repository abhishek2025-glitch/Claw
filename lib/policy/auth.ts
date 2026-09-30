import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time bearer token verification to prevent timing side-channel attacks.
 * If expectedSecret is undefined or empty, returns true (allows development/unconfigured mode).
 */
export function verifyBearerToken(authHeader: string | null, expectedSecret?: string): boolean {
  if (!expectedSecret) {
    return true; // Secret not configured in environment
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
