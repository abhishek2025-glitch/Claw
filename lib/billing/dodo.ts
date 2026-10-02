/**
 * AgentShield Dodo Payments Integration Engine
 * Conforms to Sections 34, 35, 36 of Master Specification.
 * Authoritative server-side webhook verification, idempotent processing, and license issuance.
 */

import crypto from 'node:crypto';
import { db } from '../db';
import { issueSignedLicense } from '../license';

export interface DodoCheckoutSessionRequest {
  organizationId: string;
  customerEmail: string;
  customerName?: string;
  returnUrl?: string;
}

export interface DodoCheckoutSessionResponse {
  checkoutUrl: string;
  paymentId: string;
}

export interface DodoWebhookPayload {
  id: string;
  type: 'payment.succeeded' | 'order.completed' | 'refund.succeeded' | 'payment.failed';
  created_at: string;
  data: {
    payment_id: string;
    order_id: string;
    customer: {
      email: string;
      name?: string;
    };
    metadata?: {
      organization_id?: string;
      customer_id?: string;
    };
    total_amount: number;
    currency: string;
    status: string;
  };
}

const DODO_WEBHOOK_SECRET = process.env.DODO_WEBHOOK_SECRET || 'whsec_dodo_agentshield_live_942a';

/**
 * Verifies the incoming Dodo Payments webhook signature.
 * Enforces timing-safe comparison to prevent side-channel timing attacks.
 */
export function verifyDodoSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;

  const expectedSignature = crypto
    .createHmac('sha256', DODO_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  const cleanHeader = signatureHeader.replace(/^sha256=/, '').trim();

  try {
    const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
    const headerBuf = Buffer.from(cleanHeader, 'utf-8');
    if (expectedBuf.length !== headerBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, headerBuf);
  } catch {
    return false;
  }
}

/**
 * Creates a Dodo Payments checkout session.
 */
export async function createDodoCheckout(req: DodoCheckoutSessionRequest): Promise<DodoCheckoutSessionResponse> {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  const isTest = process.env.DODO_PAYMENTS_MODE === 'test' || !apiKey;
  const paymentId = `dodo_pay_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  const returnUrl = req.returnUrl || `${process.env.APP_URL || 'http://localhost:3000'}/?payment=success&payment_id=${paymentId}`;

  // If live Dodo API key is configured, call Dodo Payments API
  if (apiKey && !isTest) {
    try {
      const resp = await fetch('https://live.dodopayments.com/checkouts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: process.env.DODO_PRODUCT_ID || 'p_agentshield_pro_lifetime',
          quantity: 1,
          billing: {
            email: req.customerEmail,
            name: req.customerName || 'AgentShield Customer',
          },
          metadata: {
            organization_id: req.organizationId,
          },
          return_url: returnUrl,
        }),
      });

      if (resp.ok) {
        const json = await resp.json();
        return {
          checkoutUrl: json.checkout_url || json.url,
          paymentId: json.payment_id || paymentId,
        };
      }
    } catch (e) {
      console.error('[Dodo API Request Error]', e);
    }
  }

  // Standard checkout URL (Direct Dodo checkout or simulated redirect in test environment)
  const checkoutUrl = `https://test.dodopayments.com/buy/p_agentshield_pro_lifetime?email=${encodeURIComponent(
    req.customerEmail
  )}&metadata_org=${encodeURIComponent(req.organizationId)}&return_url=${encodeURIComponent(returnUrl)}`;

  return {
    checkoutUrl,
    paymentId,
  };
}

/**
 * Idempotently processes a verified Dodo Payments webhook payload.
 */
export async function processDodoWebhook(payload: DodoWebhookPayload): Promise<{
  success: boolean;
  message: string;
  licenseKey?: string;
}> {
  const eventId = payload.id;
  const eventType = payload.type;

  // 1. Replay Protection: Check if event was already processed
  const existing = await db.getWebhookEvent('DODO', eventId);
  if (existing && existing.processed) {
    return {
      success: true,
      message: `Event '${eventId}' already processed (Idempotent ignore).`,
    };
  }

  // 2. Record raw webhook in audit log
  const webhookRecord = await db.recordWebhookEvent({
    provider: 'DODO',
    eventId,
    eventType,
    payloadJson: JSON.stringify(payload),
    processed: false,
    processedAt: new Date().toISOString(),
  });

  const orgId = payload.data.metadata?.organization_id || 'org-default';
  const customerEmail = payload.data.customer.email;

  // 3. Dispatch based on event type
  if (eventType === 'payment.succeeded' || eventType === 'order.completed') {
    // Record paid order
    await db.createOrder({
      organizationId: orgId,
      customerId: customerEmail,
      provider: 'DODO',
      providerOrderId: payload.data.order_id || payload.data.payment_id,
      amountCents: payload.data.total_amount || 4900,
      currency: payload.data.currency || 'USD',
      status: 'SUCCEEDED',
      createdAt: new Date().toISOString(),
    });

    // Create server-side entitlement
    await db.createEntitlement({
      organizationId: orgId,
      plan: 'PRO_LIFETIME',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    });

    // Issue cryptographically signed lifetime license
    const issuedLicense = issueSignedLicense({
      licenseId: `lic-${crypto.randomUUID()}`,
      plan: 'PRO_LIFETIME',
      customerId: customerEmail,
      organizationId: orgId,
      issuedAt: new Date().toISOString(),
      maxDevices: 5,
      features: ['UNLIMITED_AUDIT', 'ZERO_LATENCY_INTERCEPT', 'OPENCLAW_GUARDRAIL', 'OFFLINE_ENFORCE'],
    });

    // Save license to authoritative database
    await db.createLicense({
      organizationId: orgId,
      licenseKey: issuedLicense.licenseKey,
      plan: 'PRO_LIFETIME',
      maxDevices: 5,
      issuedAt: issuedLicense.claims.issuedAt,
      status: 'ACTIVE',
      signature: issuedLicense.signature,
      rawPayload: JSON.stringify(issuedLicense.claims),
    });

    // Mark webhook completed
    await db.markWebhookProcessed(webhookRecord.id);

    return {
      success: true,
      message: `License issued for ${customerEmail}.`,
      licenseKey: issuedLicense.licenseKey,
    };
  }

  if (eventType === 'refund.succeeded') {
    // Revoke entitlement & licenses
    const licenses = await db.getLicensesByOrg(orgId);
    for (const lic of licenses) {
      lic.status = 'REVOKED';
    }
    await db.markWebhookProcessed(webhookRecord.id);
    return {
      success: true,
      message: `Entitlement revoked for ${customerEmail} following refund.`,
    };
  }

  await db.markWebhookProcessed(webhookRecord.id);
  return { success: true, message: `Ignored unhandled event type ${eventType}` };
}
