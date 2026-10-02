import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyLicenseOffline } from '@/lib/license';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { licenseKey, deviceId, deviceName, os } = body;

    if (!licenseKey || !deviceId) {
      return NextResponse.json(
        { error: 'Missing required fields: licenseKey, deviceId' },
        { status: 400 }
      );
    }

    // 1. Verify license signature
    const verification = verifyLicenseOffline(licenseKey);
    if (!verification.valid || !verification.claims) {
      return NextResponse.json(
        { error: `License invalid: ${verification.error}` },
        { status: 403 }
      );
    }

    // 2. Fetch authoritative license record from database
    let license = await db.getLicenseByKey(licenseKey);
    const orgId = verification.claims.organizationId;

    if (!license) {
      // In case license was issued and first time activating
      license = await db.createLicense({
        organizationId: orgId,
        licenseKey,
        plan: verification.claims.plan,
        maxDevices: verification.claims.maxDevices,
        issuedAt: verification.claims.issuedAt,
        status: 'ACTIVE',
        signature: licenseKey.split('.')[1] || '',
        rawPayload: JSON.stringify(verification.claims),
      });
    }

    // 3. Register / Activate device in database
    const activationResult = await db.activateDevice(
      license.id,
      orgId,
      deviceId,
      deviceName || 'Local CLI Agent',
      os || process.platform
    );

    if (!activationResult.success) {
      return NextResponse.json({ error: activationResult.error }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      activation: activationResult.activation,
      license: {
        plan: verification.claims.plan,
        maxDevices: verification.claims.maxDevices,
        features: verification.claims.features,
      },
    });
  } catch (error: any) {
    console.error('[License Activation Error]:', error);
    return NextResponse.json({ error: error.message || 'Activation failed' }, { status: 500 });
  }
}
