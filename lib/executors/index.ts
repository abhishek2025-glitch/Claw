import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import {
  ActionRequest,
  ActionExecution,
  PolicyDecision,
  SecurityEvent,
  computeActionHash,
} from '../types/action';
import { policyEngine } from '../policy/engine';
import { eventStore } from '../storage/event-store';
import { approvalManager } from '../approval/manager';
import { metricsCollector } from '../metrics';

const execAsync = promisify(exec);

export class PolicyDeniedError extends Error {
  public decision: PolicyDecision;
  public actionRequest: ActionRequest;

  constructor(decision: PolicyDecision, request: ActionRequest) {
    super(`Action denied by policy: ${decision.reasons.join('; ')}`);
    this.name = 'PolicyDeniedError';
    this.decision = decision;
    this.actionRequest = request;
  }
}

export class ApprovalRequiredError extends Error {
  public actionId: string;
  public reasons: string[];

  constructor(actionId: string, reasons: string[]) {
    super(`Action requires human operator approval before execution: ${reasons.join('; ')}`);
    this.name = 'ApprovalRequiredError';
    this.actionId = actionId;
    this.reasons = reasons;
  }
}

/**
 * Base Execution Pipeline.
 * Enforces policy before any side effect can occur.
 */
export abstract class BaseExecutor {
  protected async processThroughPolicy(request: ActionRequest): Promise<PolicyDecision> {
    const startT = performance.now();
    let decision: PolicyDecision;
    let failed = false;

    try {
      decision = policyEngine.evaluateAction(request);
    } catch (err: any) {
      failed = true;
      decision = {
        decision: policyEngine.getConfig().policyFailureMode === 'CLOSED' ? 'DENY' : 'ALLOW',
        risk: 'CRITICAL',
        reasons: [`Policy evaluation failure: ${err?.message || 'unknown'}`],
        policyIds: ['POL-FAILSAFE'],
        evaluatedAt: new Date().toISOString(),
      };
    }

    const duration = performance.now() - startT;
    metricsCollector.recordPolicyEvaluation(duration, decision.decision, failed);

    // Record Proposal and Policy Evaluation Events (Async Telemetry - Fail-Open)
    this.safeEmitEvent({
      eventId: `ev-${Math.random().toString(36).substring(2, 9)}`,
      correlationId: request.correlationId,
      actionId: request.id,
      timestamp: new Date().toISOString(),
      eventType: 'POLICY_EVALUATED',
      action: request.action,
      level: decision.decision === 'DENY' ? 'CRITICAL' : decision.decision === 'REQUIRE_APPROVAL' ? 'WARN' : 'INFO',
      message: `Policy decision: [${decision.decision}] for ${request.action} on '${request.operation}'`,
      agentId: request.agentId,
      agentName: request.agentName,
      decision: decision.decision,
      risk: decision.risk,
      reasons: decision.reasons,
      environment: request.environment || 'production',
    });

    return decision;
  }

  protected async safeEmitEvent(event: SecurityEvent): Promise<void> {
    try {
      await eventStore.append(event);
    } catch (err) {
      metricsCollector.recordPersistenceFailure();
      // Fail-open telemetry: Never crash the execution pipeline merely because telemetry was unavailable
      if (policyEngine.getConfig().telemetryFailureMode === 'CLOSED') {
        console.error('[AgentShield SafeEmit] Critical telemetry failure under fail-closed mode:', err);
        throw err;
      } else {
        console.warn('[AgentShield SafeEmit] Non-blocking telemetry persistence warning:', err);
      }
    }
  }
}

export class ShellExecutor extends BaseExecutor {
  public async execute(request: ActionRequest): Promise<ActionExecution> {
    const actionHash = computeActionHash(request);
    const enrichedRequest: ActionRequest = { ...request, actionHash };

    const policy = await this.processThroughPolicy(enrichedRequest);

    if (policy.decision === 'DENY') {
      throw new PolicyDeniedError(policy, enrichedRequest);
    }

    if (policy.decision === 'REQUIRE_APPROVAL') {
      approvalManager.registerPendingAction(enrichedRequest, policy.reasons);
      throw new ApprovalRequiredError(enrichedRequest.id, policy.reasons);
    }

    // Simulation Isolation: Never execute shell in simulation mode
    if (enrichedRequest.environment === 'simulation') {
      return {
        request: enrichedRequest,
        policy,
        status: 'SUCCEEDED',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        result: { stdout: `[SIMULATION] Executed command '${enrichedRequest.operation}'`, stderr: '' },
      };
    }

    const startedAt = new Date().toISOString();
    const startT = performance.now();

    try {
      const { stdout, stderr } = await execAsync(enrichedRequest.operation, {
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 5, // 5MB buffer
      });

      const completedAt = new Date().toISOString();
      const executionLatencyMs = Math.round(performance.now() - startT);

      this.safeEmitEvent({
        eventId: `ev-${Math.random().toString(36).substring(2, 9)}`,
        correlationId: enrichedRequest.correlationId,
        actionId: enrichedRequest.id,
        timestamp: completedAt,
        eventType: 'EXECUTION_SUCCEEDED',
        action: 'EXEC',
        level: 'INFO',
        message: `Command completed in ${executionLatencyMs}ms: ${enrichedRequest.operation}`,
        agentId: enrichedRequest.agentId,
        agentName: enrichedRequest.agentName,
        environment: enrichedRequest.environment || 'production',
      });

      return {
        request: enrichedRequest,
        policy,
        status: 'SUCCEEDED',
        startedAt,
        completedAt,
        result: { stdout, stderr },
        executionLatencyMs,
      };
    } catch (err: any) {
      metricsCollector.recordExecutionFailure();
      const completedAt = new Date().toISOString();

      this.safeEmitEvent({
        eventId: `ev-${Math.random().toString(36).substring(2, 9)}`,
        correlationId: enrichedRequest.correlationId,
        actionId: enrichedRequest.id,
        timestamp: completedAt,
        eventType: 'EXECUTION_FAILED',
        action: 'EXEC',
        level: 'ERROR',
        message: `Command execution failed: ${err?.message || 'Unknown error'}`,
        agentId: enrichedRequest.agentId,
        agentName: enrichedRequest.agentName,
        environment: enrichedRequest.environment || 'production',
      });

      return {
        request: enrichedRequest,
        policy,
        status: 'FAILED',
        startedAt,
        completedAt,
        error: err?.message || 'Execution failed',
      };
    }
  }
}

export class HttpExecutor extends BaseExecutor {
  public async execute(request: ActionRequest): Promise<ActionExecution> {
    const actionHash = computeActionHash(request);
    const enrichedRequest: ActionRequest = { ...request, actionHash };

    const policy = await this.processThroughPolicy(enrichedRequest);

    if (policy.decision === 'DENY') {
      throw new PolicyDeniedError(policy, enrichedRequest);
    }

    if (policy.decision === 'REQUIRE_APPROVAL') {
      approvalManager.registerPendingAction(enrichedRequest, policy.reasons);
      throw new ApprovalRequiredError(enrichedRequest.id, policy.reasons);
    }

    if (enrichedRequest.environment === 'simulation') {
      return {
        request: enrichedRequest,
        policy,
        status: 'SUCCEEDED',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        result: { status: 200, statusText: 'OK (Simulation)' },
      };
    }

    const startedAt = new Date().toISOString();
    const startT = performance.now();

    try {
      const httpArgs = (enrichedRequest.arguments as any) || {};
      const method = httpArgs.method || 'GET';
      const headers = httpArgs.headers || {};
      const body = httpArgs.body ? JSON.stringify(httpArgs.body) : undefined;

      const response = await fetch(enrichedRequest.operation, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(15000),
      });

      const completedAt = new Date().toISOString();
      const executionLatencyMs = Math.round(performance.now() - startT);

      return {
        request: enrichedRequest,
        policy,
        status: response.ok ? 'SUCCEEDED' : 'FAILED',
        startedAt,
        completedAt,
        result: { status: response.status, statusText: response.statusText },
        executionLatencyMs,
      };
    } catch (err: any) {
      metricsCollector.recordExecutionFailure();
      return {
        request: enrichedRequest,
        policy,
        status: 'FAILED',
        startedAt,
        completedAt: new Date().toISOString(),
        error: err?.message || 'HTTP request failed',
      };
    }
  }
}

export class FileExecutor extends BaseExecutor {
  public async execute(request: ActionRequest): Promise<ActionExecution> {
    const actionHash = computeActionHash(request);
    const enrichedRequest: ActionRequest = { ...request, actionHash };

    const policy = await this.processThroughPolicy(enrichedRequest);

    if (policy.decision === 'DENY') {
      throw new PolicyDeniedError(policy, enrichedRequest);
    }

    if (policy.decision === 'REQUIRE_APPROVAL') {
      approvalManager.registerPendingAction(enrichedRequest, policy.reasons);
      throw new ApprovalRequiredError(enrichedRequest.id, policy.reasons);
    }

    if (enrichedRequest.environment === 'simulation') {
      return {
        request: enrichedRequest,
        policy,
        status: 'SUCCEEDED',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        result: { operation: enrichedRequest.action, path: enrichedRequest.operation, simulated: true },
      };
    }

    const startedAt = new Date().toISOString();

    try {
      let result: any = null;

      if (enrichedRequest.action === 'READ') {
        const data = await fs.readFile(enrichedRequest.operation, 'utf-8');
        result = { bytes: Buffer.byteLength(data), preview: data.substring(0, 200) };
      } else if (enrichedRequest.action === 'WRITE') {
        const content = (enrichedRequest.arguments as any)?.content || '';
        await fs.writeFile(enrichedRequest.operation, content, 'utf-8');
        result = { bytesWritten: Buffer.byteLength(content) };
      } else if (enrichedRequest.action === 'DELETE') {
        await fs.unlink(enrichedRequest.operation);
        result = { deleted: true };
      }

      return {
        request: enrichedRequest,
        policy,
        status: 'SUCCEEDED',
        startedAt,
        completedAt: new Date().toISOString(),
        result,
      };
    } catch (err: any) {
      metricsCollector.recordExecutionFailure();
      return {
        request: enrichedRequest,
        policy,
        status: 'FAILED',
        startedAt,
        completedAt: new Date().toISOString(),
        error: err?.message || 'File operation failed',
      };
    }
  }
}

export const shellExecutor = new ShellExecutor();
export const httpExecutor = new HttpExecutor();
export const fileExecutor = new FileExecutor();
