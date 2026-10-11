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
// Note: This must be replaced with the owner's own public key in production deployments.
export const AGENTSHIELD_ROOT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAiK3m+xZ9P9b2Y7uN8kC9aW0yF5vT3rQ8sM1nL2xP0k4=
-----END PUBLIC KEY-----`;

function getEffectivePublicKey(overridePem?: string): string {
  if (overridePem) return overridePem;
  if (process.env.AGENTSHIELD_LICENSE_PUBLIC_KEY) {
    return process.env.AGENTSHIELD_LICENSE_PUBLIC_KEY.replace(/\\n/g, '\n');
  }
  return AGENTSHIELD_ROOT_PUBLIC_KEY;
}

function getSigningPrivateKey(): string {
  const envKey = process.env.LICENSE_SIGNING_PRIVATE_KEY;
  if (!envKey) {
    throw new Error('LICENSE_SIGNING_PRIVATE_KEY is not configured; refusing to issue licenses.');
  }
  return envKey.replace(/\\n/g, '\n');
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
  const rawKey = privateKeyPem ? privateKeyPem.replace(/\\n/g, '\n') : getSigningPrivateKey();

  // Create Ed25519 signature
  const signature = crypto.sign(null, payloadBytes, rawKey).toString('base64url');

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
  publicKeyPem?: string
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

  // Guard against malformed claims
  if (!claims || typeof claims !== 'object' || !Array.isArray(claims.features)) {
    return { valid: false, error: 'Malformed license claims' };
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

  // 3. Cryptographic Signature Verification (Ed25519 only)
  const canonicalBytes = canonicalizeClaims(claims);
  const effectivePublicKey = getEffectivePublicKey(publicKeyPem);

  let isVerified = false;
  try {
    isVerified = crypto.verify(
      null,
      canonicalBytes,
      effectivePublicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    isVerified = false;
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

