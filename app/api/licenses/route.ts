import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyLicenseOffline } from '@/lib/license';
import { verifyBearerToken } from '@/lib/policy/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const secret = process.env.WEBHOOK_SECRET || process.env.AGENTSHIELD_SECRET;

  // Fail-closed: If neither secret is configured or token is invalid, return 401
  if (!secret || !verifyBearerToken(authHeader, secret)) {
    return NextResponse.json({ error: 'Unauthorized: Valid Bearer token required' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId') || 'org-default';

  const licenses = await db.getLicensesByOrg(orgId);
  const entitlements = await db.getEntitlementsByOrg(orgId);

  return NextResponse.json({
    licenses: licenses.map((l) => {
      const ver = verifyLicenseOffline(l.licenseKey);
      return {
        id: l.id,
        licenseKey: l.licenseKey,
        plan: l.plan,
        maxDevices: l.maxDevices,
        issuedAt: l.issuedAt,
        status: l.status,
        isValid: ver.valid,
        claims: ver.claims,
      };
    }),
    entitlements,
  });
}
