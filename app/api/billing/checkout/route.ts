import { NextRequest, NextResponse } from 'next/server';
import { createDodoCheckout } from '@/lib/billing/dodo';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { organizationId = 'org-default', customerEmail, customerName } = body;

    if (!customerEmail) {
      return NextResponse.json({ error: 'Customer email is required.' }, { status: 400 });
    }

    const session = await createDodoCheckout({
      organizationId,
      customerEmail,
      customerName,
      returnUrl: `${req.nextUrl.origin}/?payment=success`,
    });

    return NextResponse.json(session);
  } catch (error: any) {
    console.error('[Billing Checkout Route Error]:', error);
    return NextResponse.json({ error: error.message || 'Checkout creation failed' }, { status: 500 });
  }
}
