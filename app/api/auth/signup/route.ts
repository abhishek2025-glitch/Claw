import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, signSessionToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name, organizationName } = body;

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Missing required signup fields: email, password, name.' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      );
    }

    const existing = await db.getUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email address already exists.' },
        { status: 409 }
      );
    }

    // 1. Create Organization
    const org = await db.createOrganization(organizationName || `${name}'s Fleet`, 'pending-owner');

    // 2. Create User
    const user = await db.createUser({
      email,
      name,
      passwordHash: hashPassword(password),
      role: 'OWNER',
      organizationId: org.id,
    });

    // 3. Issue Session Token
    const token = signSessionToken({
      userId: user.id,
      email: user.email,
      organizationId: org.id,
      role: user.role,
    });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: org.id,
      },
      organization: org,
    });
  } catch (error: any) {
    console.error('[Signup Route Error]:', error);
    return NextResponse.json({ error: error.message || 'Signup failed' }, { status: 500 });
  }
}
