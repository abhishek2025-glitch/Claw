import { NextRequest, NextResponse } from 'next/server';
import { approvalManager } from '@/lib/approval/manager';
import { eventStore } from '@/lib/storage/event-store';
import { verifyBearerToken } from '@/lib/policy/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const secret = process.env.WEBHOOK_SECRET || process.env.AGENTSHIELD_SECRET;

    if (!verifyBearerToken(authHeader, secret)) {
      // In production, approving sensitive actions requires operator authentication
      return NextResponse.json({ error: 'Unauthorized operator' }, { status: 401 });
    }

    const body = await req.json();
    const { actionId, decision, operatorId, operatorComment, currentActionRequest } = body;

    if (!actionId || !decision || !['APPROVED', 'REJECTED'].includes(decision)) {
      return NextResponse.json(
        { error: "Invalid payload: actionId and decision ('APPROVED' | 'REJECTED') are required." },
        { status: 400 }
      );
    }

    const outcome = approvalManager.decideAction(
      actionId,
      decision,
      operatorId || 'operator-admin',
      operatorComment,
      currentActionRequest
    );

    if (!outcome.success) {
      return NextResponse.json({ error: outcome.error }, { status: 400 });
    }

    // Record immutable audit event
    const pending = approvalManager.getPendingAction(actionId);
    eventStore.append({
      eventId: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      correlationId: pending?.request.correlationId || `corr-${actionId}`,
      actionId,
      timestamp: new Date().toISOString(),
      eventType: decision === 'APPROVED' ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED',
      action: pending?.request.action || 'EXEC',
      level: decision === 'APPROVED' ? 'INFO' : 'WARN',
      message: `Operator ${operatorId || 'operator-admin'} ${decision.toLowerCase()} action ${actionId}: '${pending?.request.operation || ''}'`,
      agentId: pending?.request.agentId || 'unknown',
      agentName: pending?.request.agentName,
      environment: pending?.request.environment || 'production',
      metadata: {
        approval: outcome.approval,
      },
    }).catch((e) => console.error('[Approve] EventStore error:', e));

    return NextResponse.json({
      success: true,
      approval: outcome.approval,
    });
  } catch (err: any) {
    console.error('Approval endpoint error:', err);
    return NextResponse.json({ error: err?.message || 'Approval execution failed' }, { status: 500 });
  }
}
