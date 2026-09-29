import { NextRequest, NextResponse } from 'next/server';
import { ActionRequest, computeActionHash } from '@/lib/types/action';
import { policyEngine } from '@/lib/policy/engine';
import { approvalManager } from '@/lib/approval/manager';
import { eventStore } from '@/lib/storage/event-store';
import { metricsCollector } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const secret = process.env.WEBHOOK_SECRET || process.env.AGENTSHIELD_SECRET;

    if (secret && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized: invalid bearer token' }, { status: 401 });
    }

    const body = await req.json();
    const { action, operation, arguments: args, agentId, agentName, correlationId } = body;

    if (!action || !operation || !agentId) {
      return NextResponse.json(
        { error: 'Missing required fields: action, operation, agentId' },
        { status: 400 }
      );
    }

    const actionId = body.id || `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const corrId = correlationId || body.correlationId || `corr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const actionHash = computeActionHash({
      action,
      operation,
      arguments: args,
      agentId,
    });

    const request: ActionRequest = {
      id: actionId,
      correlationId: corrId,
      agentId,
      agentName: agentName || agentId,
      action,
      operation,
      arguments: args,
      requestedAt: body.requestedAt || new Date().toISOString(),
      actionHash,
      environment: body.environment || 'production',
      metadata: body.metadata,
    };

    // Evaluate through Policy Engine
    const startT = performance.now();
    const policy = policyEngine.evaluateAction(request);
    const duration = performance.now() - startT;

    metricsCollector.recordPolicyEvaluation(duration, policy.decision);

    let pendingEntry = null;
    if (policy.decision === 'REQUIRE_APPROVAL') {
      pendingEntry = approvalManager.registerPendingAction(request, policy.reasons);
    }

    // Record Event to Durable Store (Async)
    eventStore.append({
      eventId: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      correlationId: corrId,
      actionId,
      timestamp: new Date().toISOString(),
      eventType: policy.decision === 'REQUIRE_APPROVAL' ? 'APPROVAL_REQUESTED' : policy.decision === 'DENY' ? 'ACTION_DENIED' : 'ACTION_ALLOWED',
      action,
      level: policy.decision === 'DENY' ? 'CRITICAL' : policy.decision === 'REQUIRE_APPROVAL' ? 'WARN' : 'INFO',
      message: `Enforcement decision: [${policy.decision}] for ${action} on '${operation}'`,
      agentId,
      agentName: request.agentName,
      decision: policy.decision,
      risk: policy.risk,
      reasons: policy.reasons,
      environment: request.environment || 'production',
    }).catch((e) => console.error('[Propose] EventStore append error:', e));

    return NextResponse.json({
      actionId,
      correlationId: corrId,
      actionHash,
      decision: policy.decision,
      risk: policy.risk,
      reasons: policy.reasons,
      policyIds: policy.policyIds,
      pendingApproval: pendingEntry ? { actionId, expiresAt: pendingEntry.expiresAt } : null,
      evaluatedAt: policy.evaluatedAt,
    });
  } catch (err: any) {
    console.error('Action proposal error:', err);
    return NextResponse.json(
      {
        decision: policyEngine.getConfig().policyFailureMode === 'CLOSED' ? 'DENY' : 'ALLOW',
        risk: 'CRITICAL',
        reasons: [`Internal gateway error: ${err?.message || 'unknown'}`],
      },
      { status: 500 }
    );
  }
}
