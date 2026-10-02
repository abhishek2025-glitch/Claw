import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { eventStore } from '@/lib/storage/event-store';
import { redactSecrets } from '@/lib/policy/redact';
import { SecurityEvent, ActionType, LogLevel } from '@/lib/types/action';
import { verifyBearerToken } from '@/lib/policy/auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-AgentShield-Secret, X-Agent-Id',
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const configuredSecret = process.env.WEBHOOK_SECRET || process.env.AGENTSHIELD_SECRET;

    // Check bearer token if configured
    if (!verifyBearerToken(authHeader, configuredSecret)) {
      return NextResponse.json({ error: 'Unauthorized: invalid bearer token' }, { status: 401 });
    }

    const body = await req.json();

    if (!body.action || !body.level || !body.message) {
      return NextResponse.json(
        { error: 'Missing required payload fields: action, level, message' },
        { status: 400 }
      );
    }

    // Server-Side Risk Derivation - Invariant 10: Never trust client-provided isFlagged
    const rawAction = String(body.action).toUpperCase() as ActionType;
    const rawLevel = String(body.level).toUpperCase() as LogLevel;
    const isRiskyAction = ['DELETE', 'EXEC', 'HTTP'].includes(rawAction);
    const isRiskyLevel = ['WARN', 'ERROR', 'CRITICAL'].includes(rawLevel);

    let derivedRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    let isFlagged = false;
    let flagReason: string | undefined = undefined;

    if (rawLevel === 'CRITICAL' || (isRiskyAction && rawLevel === 'ERROR')) {
      derivedRisk = 'CRITICAL';
      isFlagged = true;
      flagReason = body.flagReason || `Critical severity event detected in ${rawAction} stream`;
    } else if (isRiskyAction && isRiskyLevel) {
      derivedRisk = 'HIGH';
      isFlagged = true;
      flagReason = body.flagReason || `Elevated risk heuristic: ${rawAction} executed with ${rawLevel} severity`;
    } else if (rawLevel === 'WARN') {
      derivedRisk = 'MEDIUM';
      isFlagged = true;
      flagReason = body.flagReason || 'Warning diagnostic emitted by agent';
    }

    // Redact any secrets in the message
    const cleanMessage = redactSecrets(String(body.message));

    const eventId = body.id || `ev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const correlationId = body.correlationId || `corr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const environment = body.environment === 'simulation' ? 'simulation' : 'production';

    const tokenCount = typeof body.tokens === 'number' ? body.tokens : (body.tokens?.totalTokens || 0);

    const securityEvent: SecurityEvent = {
      eventId,
      correlationId,
      actionId: body.actionId,
      timestamp: body.timestamp || new Date().toISOString(),
      eventType: 'TELEMETRY_LOG',
      action: rawAction,
      level: rawLevel,
      message: cleanMessage,
      agentId: body.agentId || 'default-agent',
      agentName: body.agentName || body.agentId || 'Agent',
      tokens: {
        totalTokens: tokenCount,
        promptTokens: body.tokens?.promptTokens,
        completionTokens: body.tokens?.completionTokens,
        model: body.model || body.tokens?.model,
        provider: body.provider || body.tokens?.provider,
        isExact: typeof body.tokens?.promptTokens === 'number',
      },
      decision: isFlagged ? (derivedRisk === 'CRITICAL' ? 'DENY' : 'AUDIT_ONLY') : 'ALLOW',
      risk: derivedRisk,
      reasons: flagReason ? [flagReason] : undefined,
      environment,
      metadata: {
        isFlagged,
        flagReason,
      },
    };

    // Durable append (Non-blocking response)
    await eventStore.append(securityEvent);

    const orgId = body.organizationId || 'org-default';
    db.upsertAgent(orgId, {
      agentId: securityEvent.agentId,
      name: securityEvent.agentName || securityEvent.agentId || 'Agent',
      framework: body.framework || 'Autonomous Agent',
    }).catch(() => {});

    db.appendAuditEvent({
      organizationId: orgId,
      eventId,
      actionId: securityEvent.actionId,
      correlationId,
      timestamp: securityEvent.timestamp,
      eventType: securityEvent.eventType,
      action: securityEvent.action,
      level: securityEvent.level,
      message: securityEvent.message,
      tokens: tokenCount,
      risk: derivedRisk,
      decision: securityEvent.decision || 'ALLOW',
      metadataJson: JSON.stringify(securityEvent.metadata || {}),
    }).catch(() => {});

    return NextResponse.json(
      {
        success: true,
        eventId,
        correlationId,
        isFlagged,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[AgentShield Webhook Ingestion Error]:', error);
    return NextResponse.json({ error: 'Invalid payload structure' }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get('limit')) || 100, 500);
  const environment = searchParams.get('env') === 'simulation' ? 'simulation' : 'production';
  const agentId = searchParams.get('agentId') || undefined;

  const events = await eventStore.getRecent(limit, { environment, agentId });

  // Map to format consumed by the dashboard components for compatibility
  const logs = events.map((ev) => ({
    id: ev.eventId,
    timestamp: ev.timestamp,
    level: ev.level,
    action: ev.action,
    message: ev.message,
    tokens: ev.tokens?.totalTokens || 0,
    isFlagged: ev.risk === 'HIGH' || ev.risk === 'CRITICAL' || (ev.metadata?.isFlagged as boolean),
    flagReason: ev.reasons?.[0] || (ev.metadata?.flagReason as string) || undefined,
    agentId: ev.agentId,
    agentName: ev.agentName,
    correlationId: ev.correlationId,
    decision: ev.decision,
    risk: ev.risk,
  }));

  return NextResponse.json({ logs, total: logs.length });
}

// Invariant 26: Audit Log Immutability. Production audit history CANNOT be casually deleted.
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isSimulation = searchParams.get('env') === 'simulation';

  if (isSimulation) {
    await eventStore.clearSimulationOnly();
    return NextResponse.json({ success: true, message: 'Simulation cache cleared' });
  }

  // Deny destructive audit log deletion in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Audit log immutability violation: production audit trails cannot be deleted.' },
      { status: 403 }
    );
  }

  // In development, clear simulation cache only
  await eventStore.clearSimulationOnly();
  return NextResponse.json({
    success: true,
    message: 'Development simulation buffer reset. Production durable audit trail preserved.',
  });
}
