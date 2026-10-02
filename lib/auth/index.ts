/**
 * AgentShield Authentication & Multi-Tenant Authorization Engine
 * Conforms to Sections 20 & 21 of Master Specification.
 */

import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { db, User, Organization } from '../db';

const JWT_SECRET = process.env.AUTH_SECRET || 'agentshield_auth_secret_key_prod_948f2a';

export interface SessionPayload {
  userId: string;
  email: string;
  organizationId: string;
  role: 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER';
  exp: number;
}

export function hashPassword(password: string): string {
  const salt = 'agentshield_salt_fixed';
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function verifyPassword(password: string, hash: string): boolean {
  const computed = hashPassword(password);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}

export function signSessionToken(payload: Omit<SessionPayload, 'exp'>, ttlHours = 24): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlHours * 3600,
  };

  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(payloadB64).digest('base64url');
  return `ast_${payloadB64}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || !token.startsWith('ast_')) return null;

  const parts = token.slice(4).split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(payloadB64).digest('base64url');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return null;
  }

  try {
    const payload: SessionPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (Date.now() / 1000 > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Authenticates request from Bearer session token or fallback admin secret.
 */
export async function authenticateRequest(
  req: NextRequest
): Promise<{ user: User; organization: Organization } | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return null;

  const [type, token] = authHeader.split(' ');
  if (type !== 'Bearer' || !token) return null;

  // 1. Session Token verification
  const session = verifySessionToken(token);
  if (session) {
    const user = await db.getUserById(session.userId);
    const org = await db.getOrganization(session.organizationId);
    if (user && org) {
      return { user, organization: org };
    }
  }

  // 2. Machine Bearer token fallback for CLI / Webhooks
  const configuredSecret = process.env.WEBHOOK_SECRET || process.env.AGENTSHIELD_SECRET;
  if (configuredSecret && token === configuredSecret) {
    // Return system owner context
    const adminUser = await db.getUserByEmail('admin@agentshield.local');
    const adminOrg = await db.getOrganization('org-default');
    if (adminUser && adminOrg) {
      return { user: adminUser, organization: adminOrg };
    }
  }

  return null;
}

const ROLE_HIERARCHY: Record<string, number> = {
  OWNER: 4,
  ADMIN: 3,
  OPERATOR: 2,
  VIEWER: 1,
};

export function hasRequiredRole(userRole: string, requiredRole: 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER'): boolean {
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[requiredRole] || 0);
}
