/**
 * AgentShield OpenClaw Integration Engine
 * Conforms to Section 7 of Master Specification.
 * Intercepts tool calls, subprocesses, filesystem mutations, and network egress.
 */

import { ActionRequest, PolicyDecision } from '../types/action';
import { policyEngine } from '../policy/engine';
import { approvalManager } from '../approval/manager';
import { shellExecutor, fileExecutor, httpExecutor } from '../executors';

export interface OpenClawToolCall {
  name: string;
  arguments: Record<string, any>;
  callId?: string;
}

export interface InterceptionResult {
  allowed: boolean;
  decision: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';
  reasons: string[];
  actionHash?: string;
  pendingActionId?: string;
  output?: any;
  error?: string;
}

/**
 * Maps OpenClaw canonical tool definitions to AgentShield security actions.
 */
export function normalizeOpenClawTool(toolCall: OpenClawToolCall, agentId = 'openclaw-agent'): ActionRequest {
  const name = toolCall.name.toLowerCase();
  const args = toolCall.arguments || {};
  const id = toolCall.callId || `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // 1. Shell & Subprocess Execution
  if (['bash', 'shell', 'exec', 'execute_command', 'run_terminal_cmd', 'terminal'].includes(name)) {
    const cmd = args.command || args.cmd || args.script || '';
    return {
      id,
      correlationId: `corr-${Date.now()}`,
      agentId,
      agentName: 'OpenClaw Autonomous Agent',
      action: 'EXEC',
      operation: cmd,
      arguments: args,
      requestedAt: new Date().toISOString(),
    };
  }

  // 2. Filesystem Mutation: Write
  if (['write_file', 'create_file', 'edit_file', 'save_file', 'patch_file'].includes(name)) {
    const filePath = args.filePath || args.path || args.filename || '';
    return {
      id,
      correlationId: `corr-${Date.now()}`,
      agentId,
      agentName: 'OpenClaw Autonomous Agent',
      action: 'WRITE',
      operation: filePath,
      arguments: args,
      requestedAt: new Date().toISOString(),
    };
  }

  // 3. Filesystem Mutation: Delete
  if (['delete_file', 'remove_file', 'unlink', 'delete_dir'].includes(name)) {
    const filePath = args.filePath || args.path || args.filename || '';
    return {
      id,
      correlationId: `corr-${Date.now()}`,
      agentId,
      agentName: 'OpenClaw Autonomous Agent',
      action: 'DELETE',
      operation: filePath,
      arguments: args,
      requestedAt: new Date().toISOString(),
    };
  }

  // 4. Filesystem Read
  if (['read_file', 'view_file', 'cat_file', 'inspect_file'].includes(name)) {
    const filePath = args.filePath || args.path || args.filename || '';
    return {
      id,
      correlationId: `corr-${Date.now()}`,
      agentId,
      agentName: 'OpenClaw Autonomous Agent',
      action: 'READ',
      operation: filePath,
      arguments: args,
      requestedAt: new Date().toISOString(),
    };
  }

  // 5. Outbound Network & Web
  if (['http_request', 'fetch', 'curl', 'web_search', 'download_url', 'api_call'].includes(name)) {
    const url = args.url || args.endpoint || args.uri || '';
    return {
      id,
      correlationId: `corr-${Date.now()}`,
      agentId,
      agentName: 'OpenClaw Autonomous Agent',
      action: 'HTTP',
      operation: url,
      arguments: args,
      requestedAt: new Date().toISOString(),
    };
  }

  // Fallback Generic Tool Execution
  return {
    id,
    correlationId: `corr-${Date.now()}`,
    agentId,
    agentName: 'OpenClaw Autonomous Agent',
    action: 'EXEC',
    operation: `openclaw_tool:${name}`,
    arguments: args,
    requestedAt: new Date().toISOString(),
  };
}

/**
 * Universal OpenClaw Tool Interceptor.
 * Directly executes in-process or before subprocess invocation.
 */
export async function interceptOpenClawTool(
  toolCall: OpenClawToolCall,
  agentId = 'openclaw-agent',
  organizationId = 'org-default'
): Promise<InterceptionResult> {
  const actionReq = normalizeOpenClawTool(toolCall, agentId);

  // 1. Evaluate through Policy Engine
  const decision: PolicyDecision = policyEngine.evaluateAction(actionReq);

  // 2. DENY: Immediate Block
  if (decision.decision === 'DENY') {
    return {
      allowed: false,
      decision: 'DENY',
      reasons: decision.reasons,
      error: `[AgentShield Policy Blocked] ${decision.reasons.join('; ')}`,
    };
  }

  // 3. REQUIRE_APPROVAL: Pause and register in pending approval queue
  if (decision.decision === 'REQUIRE_APPROVAL') {
    const pending = await approvalManager.registerPendingAction(actionReq, decision.reasons, organizationId);
    return {
      allowed: false,
      decision: 'REQUIRE_APPROVAL',
      reasons: decision.reasons,
      actionHash: pending.actionHash,
      pendingActionId: pending.actionId,
      error: `[AgentShield Approval Required] Action '${actionReq.operation}' suspended. Operator approval required (${pending.actionId})`,
    };
  }

  // 4. ALLOW: Execute through isolated executor
  let output: any = null;
  try {
    if (actionReq.action === 'EXEC') {
      const execResult = await shellExecutor.executeDirect(actionReq.operation, actionReq.arguments);
      output = execResult;
    } else if (actionReq.action === 'HTTP') {
      const httpResult = await httpExecutor.executeDirect(actionReq.operation, actionReq.arguments);
      output = httpResult;
    } else if (['READ', 'WRITE', 'DELETE'].includes(actionReq.action)) {
      const fileResult = await fileExecutor.executeDirect(
        actionReq.action as 'READ' | 'WRITE' | 'DELETE',
        actionReq.operation,
        actionReq.arguments
      );
      output = fileResult;
    }
  } catch (err: any) {
    return {
      allowed: true,
      decision: 'ALLOW',
      reasons: decision.reasons,
      error: err.message,
    };
  }

  return {
    allowed: true,
    decision: 'ALLOW',
    reasons: decision.reasons,
    output,
  };
}
