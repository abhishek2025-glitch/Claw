import {
  ActionRequest,
  ActionType,
  PolicyDecision,
  computeActionHash,
} from '../../types/action';

export class AgentShieldNodeClient {
  private endpointUrl: string;
  private agentId: string;
  private agentName: string;
  private apiSecret: string;
  private policyFailureMode: 'CLOSED' | 'OPEN';
  private telemetryFailureMode: 'CLOSED' | 'OPEN';

  constructor(options?: {
    endpointUrl?: string;
    agentId?: string;
    agentName?: string;
    apiSecret?: string;
    policyFailureMode?: 'CLOSED' | 'OPEN';
    telemetryFailureMode?: 'CLOSED' | 'OPEN';
  }) {
    this.endpointUrl = options?.endpointUrl || process.env.AGENTSHIELD_ENDPOINT || 'http://localhost:3000';
    this.agentId = options?.agentId || process.env.AGENT_ID || 'agent-node-client';
    this.agentName = options?.agentName || process.env.AGENT_NAME || 'Node.js Autonomous Agent';
    this.apiSecret = options?.apiSecret || process.env.WEBHOOK_SECRET || process.env.AGENTSHIELD_SECRET || '';
    this.policyFailureMode = (options?.policyFailureMode || process.env.POLICY_FAILURE_MODE || 'CLOSED').toUpperCase() as any;
    this.telemetryFailureMode = (options?.telemetryFailureMode || process.env.TELEMETRY_FAILURE_MODE || 'OPEN').toUpperCase() as any;
  }

  public async proposeAction(
    action: ActionType,
    operation: string,
    args?: unknown,
    correlationId?: string
  ): Promise<{ decision: string; reasons: string[]; actionId: string; policy: PolicyDecision }> {
    const aid = `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const cid = correlationId || `corr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const actionHash = computeActionHash({
      action,
      operation,
      arguments: args,
      agentId: this.agentId,
    });

    const requestPayload: ActionRequest = {
      id: aid,
      correlationId: cid,
      agentId: this.agentId,
      agentName: this.agentName,
      action,
      operation,
      arguments: args,
      requestedAt: new Date().toISOString(),
      actionHash,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'AgentShield-Node-SDK/2.0',
    };
    if (this.apiSecret) {
      headers['Authorization'] = `Bearer ${this.apiSecret}`;
    }

    try {
      const res = await fetch(`${this.endpointUrl.replace(/\/$/, '')}/api/actions/propose`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(3500),
      });

      if (!res.ok) {
        throw new Error(`Enforcement gateway returned status ${res.status}`);
      }

      return await res.json();
    } catch (err: any) {
      if (this.policyFailureMode === 'CLOSED') {
        throw new Error(`AgentShield Policy [DENY]: Enforcement gateway unreachable. Fail-closed enforced.`);
      }
      return {
        decision: 'ALLOW',
        reasons: ['Enforcement gateway unreachable; fallback to configured FAIL-OPEN mode'],
        actionId: aid,
        policy: {
          decision: 'ALLOW',
          risk: 'HIGH',
          reasons: ['Gateway unreachable; fallback to FAIL-OPEN'],
          policyIds: ['POL-FAIL-OPEN'],
          evaluatedAt: new Date().toISOString(),
        },
      };
    }
  }

  public async emitTelemetry(
    action: ActionType,
    level: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL',
    message: string,
    tokens = 0,
    correlationId?: string
  ): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'AgentShield-Node-SDK/2.0',
    };
    if (this.apiSecret) {
      headers['Authorization'] = `Bearer ${this.apiSecret}`;
    }

    try {
      await fetch(`${this.endpointUrl.replace(/\/$/, '')}/api/webhook`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agentId: this.agentId,
          agentName: this.agentName,
          action,
          level,
          message,
          tokens,
          correlationId: correlationId || `corr-${Date.now()}`,
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(1500),
      });
    } catch (err) {
      if (this.telemetryFailureMode === 'CLOSED') {
        throw err;
      }
      // Fail-open telemetry: do not crash client
    }
  }
}
