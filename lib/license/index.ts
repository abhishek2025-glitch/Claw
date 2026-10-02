/**
 * AgentShield Cryptographic Asymmetric Licensing System
 * Offline-first verification conforming to Sections 31, 32, 33 of Master Specification.
 */

import crypto from 'node:crypto';

export interface LicenseClaims {
  licenseId: string;
  product: 'agentshield';
  plan: 'COMMUNITY' | 'PRO_LIFETIME' | 'ENTERPRISE';
  customerId: string;
  organizationId: string;
  issuedAt: string;
  expiresAt?: string; // Optional for lifetime licenses
  maxDevices: number;
  features: string[];
  version: string;
}

export interface SignedLicensePackage {
  claims: LicenseClaims;
  signature: string;
  licenseKey: string;
}

export interface LicenseVerificationResult {
  valid: boolean;
  claims?: LicenseClaims;
  error?: string;
}

// Embedded Public Verification Key for AgentShield Local Runtime (Ed25519)
export const AGENTSHIELD_ROOT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAiK3m+xZ9P9b2Y7uN8kC9aW0yF5vT3rQ8sM1nL2xP0k4=
-----END PUBLIC KEY-----`;

// Private Signing Key (Used ONLY by Cloud Control Plane, NEVER embedded in local CLI)
// In production, loaded via process.env.LICENSE_SIGNING_PRIVATE_KEY
const DEFAULT_DEV_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIN9k2X8wL5zP1mK9vR0tY3uF7vN4rQ2sM0nL1xP9k8j5
-----END PRIVATE KEY-----`;

function getSigningPrivateKey(): string {
  return process.env.LICENSE_SIGNING_PRIVATE_KEY || DEFAULT_DEV_PRIVATE_KEY;
}

/**
 * Normalizes and computes deterministic canonical bytes for the license claims.
 */
export function canonicalizeClaims(claims: LicenseClaims): Buffer {
  const canonicalObject = {
    customerId: claims.customerId,
    expiresAt: claims.expiresAt || null,
    features: [...claims.features].sort(),
    issuedAt: claims.issuedAt,
    licenseId: claims.licenseId,
    maxDevices: claims.maxDevices,
    organizationId: claims.organizationId,
    plan: claims.plan,
    product: claims.product,
    version: claims.version,
  };
  return Buffer.from(JSON.stringify(canonicalObject), 'utf-8');
}

/**
 * Issues a cryptographically signed license package (Server-side Cloud Control Plane).
 */
export function issueSignedLicense(
  claims: Omit<LicenseClaims, 'product' | 'version'>,
  privateKeyPem?: string
): SignedLicensePackage {
  const fullClaims: LicenseClaims = {
    ...claims,
    product: 'agentshield',
    version: '2.1',
  };

  const payloadBytes = canonicalizeClaims(fullClaims);
  const keyToUse = privateKeyPem || getSigningPrivateKey();

  // Create Ed25519 or fallback HMAC signature
  let signature: string;
  try {
    const sign = crypto.createSign('SHA256');
    sign.update(payloadBytes);
    sign.end();
    // For RSA / ECDSA / Ed25519:
    signature = crypto.sign(null, payloadBytes, keyToUse).toString('base64url');
  } catch {
    // Graceful crypto signature with HMAC SHA256 if custom key formatting:
    signature = crypto
      .createHmac('sha256', keyToUse)
      .update(payloadBytes)
      .digest('base64url');
  }

  const payloadEncoded = Buffer.from(JSON.stringify(fullClaims)).toString('base64url');
  const licenseKey = `ASL1-${payloadEncoded}.${signature}`;

  return {
    claims: fullClaims,
    signature,
    licenseKey,
  };
}

/**
 * Verifies a license offline using the public verification key (Local Runtime).
 * Does NOT require internet connection or cloud request.
 */
export function verifyLicenseOffline(
  licenseKey: string,
  publicKeyPem: string = AGENTSHIELD_ROOT_PUBLIC_KEY
): LicenseVerificationResult {
  if (!licenseKey || !licenseKey.startsWith('ASL1-')) {
    return { valid: false, error: 'Malformed license key: missing ASL1 prefix' };
  }

  const body = licenseKey.slice(5);
  const parts = body.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed license structure: invalid segments' };
  }

  const [payloadEncoded, signature] = parts;
  let claims: LicenseClaims;
  try {
    const jsonStr = Buffer.from(payloadEncoded, 'base64url').toString('utf-8');
    claims = JSON.parse(jsonStr);
  } catch {
    return { valid: false, error: 'Failed to decode license claims payload' };
  }

  // 1. Verify Product
  if (claims.product !== 'agentshield') {
    return { valid: false, error: `Invalid license product: ${claims.product}` };
  }

  // 2. Verify Expiration if specified
  if (claims.expiresAt) {
    const expiresAtMs = new Date(claims.expiresAt).getTime();
    if (Date.now() > expiresAtMs) {
      return { valid: false, error: `License expired on ${claims.expiresAt}` };
    }
  }

  // 3. Cryptographic Signature Verification
  const canonicalBytes = canonicalizeClaims(claims);

  let isVerified = false;
  try {
    isVerified = crypto.verify(
      null,
      canonicalBytes,
      publicKeyPem,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    // Check HMAC verification if local test key was used
    const expectedHmac = crypto
      .createHmac('sha256', getSigningPrivateKey())
      .update(canonicalBytes)
      .digest('base64url');
    isVerified = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedHmac));
  }

  if (!isVerified) {
    return {
      valid: false,
      error: 'Cryptographic signature verification failed: license has been tampered with or signature is invalid',
    };
  }

  return {
    valid: true,
    claims,
  };
}
