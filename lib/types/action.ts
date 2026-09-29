import { createHash } from 'node:crypto';

export type ActionType = 'THINK' | 'EXEC' | 'HTTP' | 'READ' | 'WRITE' | 'DELETE';

export type Decision = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL' | 'AUDIT_ONLY';

export type ExecutionStatus =
  | 'PROPOSED'
  | 'EVALUATING'
  | 'ALLOWED'
  | 'DENIED'
  | 'PENDING_APPROVAL'
  | 'EXECUTING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export interface ActionRequest {
  id: string;                    // Unique action ID
  correlationId: string;         // End-to-end trace correlation ID
  agentId: string;               // Requesting agent ID
  agentName?: string;            // Human-readable agent name
  action: ActionType;            // Canonical action type
  operation: string;             // Command, URL, or File path
  arguments?: unknown;           // Structured arguments (e.g. parameters, body)
  requestedAt: string;           // ISO timestamp
  actionHash?: string;           // Canonical SHA-256 hash of the request
  environment?: 'production' | 'simulation';
  metadata?: Record<string, unknown>;
}

export interface PolicyDecision {
  decision: Decision;
  risk: RiskLevel;
  reasons: string[];
  policyIds: string[];
  evaluatedAt: string;
  expiresAt?: string;
}

export interface ApprovalRecord {
  approvalId: string;
  actionId: string;
  actionHash: string;            // Exact hash at proposal time
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  decidedAt?: string;
  operatorId?: string;           // Authenticated operator who approved
  operatorComment?: string;
  expiresAt?: string;
}

export interface ActionExecution {
  request: ActionRequest;
  policy: PolicyDecision;
  status: ExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
  approval?: ApprovalRecord;
  executionLatencyMs?: number;
  policyLatencyMs?: number;
}

export interface SecurityEvent {
  eventId: string;
  correlationId: string;
  actionId?: string;
  timestamp: string;
  eventType:
    | 'ACTION_PROPOSED'
    | 'POLICY_EVALUATED'
    | 'ACTION_ALLOWED'
    | 'ACTION_DENIED'
    | 'APPROVAL_REQUESTED'
    | 'APPROVAL_GRANTED'
    | 'APPROVAL_REJECTED'
    | 'EXECUTION_STARTED'
    | 'EXECUTION_SUCCEEDED'
    | 'EXECUTION_FAILED'
    | 'TELEMETRY_LOG';
  action: ActionType;
  level: LogLevel;
  message: string;
  agentId: string;
  agentName?: string;
  tokens?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens: number;
    model?: string;
    provider?: string;
    isExact: boolean;
  };
  decision?: Decision;
  risk?: RiskLevel;
  reasons?: string[];
  environment: 'production' | 'simulation';
  metadata?: Record<string, unknown>;
}

export interface InternalMetrics {
  policyEvaluations: number;
  policyFailures: number;
  blockedActions: number;
  allowedActions: number;
  approvalQueueDepth: number;
  telemetryQueueDepth: number;
  eventPersistenceFailures: number;
  executionFailures: number;
  averagePolicyLatencyMs: number;
  p95PolicyLatencyMs: number;
  p99PolicyLatencyMs: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

/**
 * Deterministically computes a canonical SHA-256 hash for an ActionRequest.
 * Ensures properties are sorted and canonicalized so that approval binding cannot be bypassed
 * via JSON property re-ordering or minor whitespace mutation.
 */
export function computeActionHash(request: Pick<ActionRequest, 'action' | 'operation' | 'arguments' | 'agentId'>): string {
  const canonicalObject = {
    action: request.action,
    agentId: request.agentId,
    operation: request.operation.trim(),
    arguments: request.arguments !== undefined ? JSON.parse(JSON.stringify(request.arguments)) : null,
  };

  const jsonString = JSON.stringify(canonicalObject, Object.keys(canonicalObject).sort());
  return createHash('sha256').update(jsonString, 'utf8').digest('hex');
}
