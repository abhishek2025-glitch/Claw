import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: auth.user.id,
        email: auth.user.email,
        name: auth.user.name,
        role: auth.user.role,
        organizationId: auth.user.organizationId,
      },
      organization: auth.organization,
    });
  } catch (error: any) {
    console.error('[Auth Me Route Error]:', error);
    return NextResponse.json({ error: error.message || 'Auth check failed' }, { status: 500 });
  }
}
