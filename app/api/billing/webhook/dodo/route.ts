import { NextRequest, NextResponse } from 'next/server';
import { verifyDodoSignature, processDodoWebhook, DodoWebhookPayload } from '@/lib/billing/dodo';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('webhook-signature') || req.headers.get('x-dodo-signature');

    // 1. Authoritative Signature Verification
    if (!verifyDodoSignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Unauthorized: Invalid webhook signature' }, { status: 401 });
    }

    let payload: DodoWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    if (!payload.id || !payload.type) {
      return NextResponse.json({ error: 'Missing required webhook fields: id, type' }, { status: 400 });
    }

    // 2. Idempotent Processing
    const result = await processDodoWebhook(payload);

    return NextResponse.json({
      success: true,
      message: result.message,
      licenseKey: result.licenseKey,
    });
  } catch (error: any) {
    console.error('[Dodo Webhook Route Error]:', error);
    return NextResponse.json({ error: error.message || 'Webhook processing failed' }, { status: 500 });
  }
}
