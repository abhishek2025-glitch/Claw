/**
 * AgentShield Real Execution Adapters & Security Isolation Boundary
 * Conforms to Sections 8, 9, 10, 13 of Master Specification.
 */

import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import dns from 'node:dns';
import path from 'node:path';
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
import { redactSecrets } from '../policy/redact';

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

function isProhibitedIP(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, '').trim().toLowerCase();
  if (clean === 'localhost' || clean === '127.0.0.1' || clean === '::1' || clean === '0.0.0.0') return true;
  if (clean.startsWith('::ffff:')) {
    return isProhibitedIP(clean.replace('::ffff:', ''));
  }
  const parts = clean.split('.').map(Number);
  if (parts.length === 4 && !parts.some(isNaN)) {
    if (parts[0] === 127) return true; // Loopback
    if (parts[0] === 10) return true; // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
    if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16 (IMDS)
    if (parts[0] === 0) return true;
  }
  if (clean.startsWith('fc') || clean.startsWith('fd') || clean.startsWith('fe80:')) return true;
  return false;
}

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

    // Record Event
    this.safeEmitEvent({
      eventId: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
      if (policyEngine.getConfig().telemetryFailureMode === 'CLOSED') {
        throw err;
      }
    }
  }
}

export class ShellExecutor extends BaseExecutor {
  /**
   * Evaluates policy and executes if permitted.
   */
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

    // Direct Execution
    const startT = performance.now();
    const startedAt = new Date().toISOString();

    const result = await this.executeDirect(enrichedRequest.operation, enrichedRequest.arguments);
    const completedAt = new Date().toISOString();
    const executionLatencyMs = Math.round(performance.now() - startT);

    return {
      request: enrichedRequest,
      policy,
      status: result.success ? 'SUCCEEDED' : 'FAILED',
      startedAt,
      completedAt,
      result: { stdout: result.stdout, stderr: result.stderr },
      executionLatencyMs,
      error: result.error,
    };
  }

  /**
   * Directly executes an approved or authorized shell command with strict environment isolation.
   */
  public async executeDirect(
    command: string,
    args?: any
  ): Promise<{ success: boolean; stdout: string; stderr: string; error?: string }> {
    // Controlled environment with sensitive secrets stripped
    const safeEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      HOME: process.env.HOME || '/tmp',
      USER: process.env.USER || 'agentshield',
      SHELL: '/bin/bash',
      AGENTSHIELD_ISOLATION: 'active',
      NODE_ENV: process.env.NODE_ENV || 'production',
    };

    const cwd = args?.cwd ? path.resolve(args.cwd) : process.cwd();

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        env: safeEnv,
        timeout: 25000, // 25s timeout
        maxBuffer: 1024 * 1024 * 5, // 5MB buffer limit
      });

      return {
        success: true,
        stdout: redactSecrets(stdout),
        stderr: redactSecrets(stderr),
      };
    } catch (err: any) {
      metricsCollector.recordExecutionFailure();
      return {
        success: false,
        stdout: redactSecrets(err.stdout || ''),
        stderr: redactSecrets(err.stderr || ''),
        error: redactSecrets(err.message || 'Execution error'),
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

    const startT = performance.now();
    const startedAt = new Date().toISOString();

    const result = await this.executeDirect(enrichedRequest.operation, enrichedRequest.arguments);
    const completedAt = new Date().toISOString();
    const executionLatencyMs = Math.round(performance.now() - startT);

    return {
      request: enrichedRequest,
      policy,
      status: result.success ? 'SUCCEEDED' : 'FAILED',
      startedAt,
      completedAt,
      result,
      executionLatencyMs,
      error: result.error,
    };
  }

  /**
   * Executes HTTP request with real DNS revalidation against SSRF.
   */
  public async executeDirect(
    targetUrl: string,
    args?: any
  ): Promise<{ success: boolean; status?: number; statusText?: string; data?: any; error?: string }> {
    let url: URL;
    try {
      url = new URL(targetUrl);
    } catch {
      return { success: false, error: 'Malformed URL format' };
    }

    // SSRF DNS revalidation check
    try {
      const lookup = await dns.promises.lookup(url.hostname);
      if (isProhibitedIP(lookup.address)) {
        return {
          success: false,
          error: `SSRF Blocked: Host '${url.hostname}' resolved to prohibited address '${lookup.address}'`,
        };
      }
    } catch (dnsErr: any) {
      return { success: false, error: `DNS resolution failed for ${url.hostname}: ${dnsErr.message}` };
    }

    const method = args?.method || 'GET';
    const headers = args?.headers || {};
    const body = args?.body ? JSON.stringify(args.body) : undefined;

    try {
      const resp = await fetch(targetUrl, {
        method,
        headers,
        body,
        redirect: 'manual', // Prevent automatic unverified redirection to private IPs
        signal: AbortSignal.timeout(12000),
      });

      return {
        success: resp.ok,
        status: resp.status,
        statusText: resp.statusText,
      };
    } catch (err: any) {
      metricsCollector.recordExecutionFailure();
      return {
        success: false,
        error: redactSecrets(err.message || 'HTTP request failed'),
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

    const startT = performance.now();
    const startedAt = new Date().toISOString();

    const result = await this.executeDirect(
      enrichedRequest.action as 'READ' | 'WRITE' | 'DELETE',
      enrichedRequest.operation,
      enrichedRequest.arguments
    );

    const completedAt = new Date().toISOString();
    const executionLatencyMs = Math.round(performance.now() - startT);

    return {
      request: enrichedRequest,
      policy,
      status: result.success ? 'SUCCEEDED' : 'FAILED',
      startedAt,
      completedAt,
      result,
      executionLatencyMs,
      error: result.error,
    };
  }

  public async executeDirect(
    action: 'READ' | 'WRITE' | 'DELETE',
    targetPath: string,
    args?: any
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const normalized = path.resolve(targetPath);
    const workspaceRoot = policyEngine.getConfig().workspaceRoot;

    // Check workspace containment
    const relative = path.relative(workspaceRoot, normalized);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return {
        success: false,
        error: `Filesystem Policy Violation: Path '${targetPath}' escapes workspace root '${workspaceRoot}'`,
      };
    }

    try {
      if (action === 'READ') {
        const content = await fs.readFile(normalized, 'utf-8');
        return {
          success: true,
          result: { bytes: Buffer.byteLength(content), preview: content.slice(0, 200) },
        };
      } else if (action === 'WRITE') {
        const content = args?.content || '';
        await fs.mkdir(path.dirname(normalized), { recursive: true });
        await fs.writeFile(normalized, content, 'utf-8');
        return {
          success: true,
          result: { bytesWritten: Buffer.byteLength(content) },
        };
      } else if (action === 'DELETE') {
        await fs.unlink(normalized);
        return {
          success: true,
          result: { deleted: true },
        };
      }
      return { success: false, error: `Unsupported file action: ${action}` };
    } catch (err: any) {
      metricsCollector.recordExecutionFailure();
      return { success: false, error: err.message || 'File operation failed' };
    }
  }
}

export const shellExecutor = new ShellExecutor();
export const httpExecutor = new HttpExecutor();
export const fileExecutor = new FileExecutor();
