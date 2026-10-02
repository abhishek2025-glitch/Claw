/**
 * AgentShield Authoritative Approval Manager & Execution Resumption Engine
 * Conforms to Sections 12, 13, 14, 15 of Master Specification.
 */

import { ActionRequest, ApprovalRecord, computeActionHash } from '../types/action';
import { db, ActionLifecycleState, DbAction } from '../db';
import { ShellExecutor, HttpExecutor, FileExecutor } from '../executors';

export interface PendingActionEntry {
  actionId: string;
  organizationId: string;
  request: ActionRequest;
  actionHash: string;
  reasons: string[];
  requestedAt: string;
  expiresAt: string;
  status: ActionLifecycleState;
  approval?: ApprovalRecord;
  executionResult?: {
    success: boolean;
    stdout?: string;
    stderr?: string;
    error?: string;
    exitCode?: number;
  };
}

export class ApprovalManager {
  private localActions = new Map<string, PendingActionEntry>();
  private readonly defaultExpiryMs = 30 * 60 * 1000; // 30 minutes TTL

  /**
   * Registers an action requiring operator approval.
   * Computes and locks the canonical SHA-256 hash.
   */
  public async registerPendingAction(
    request: ActionRequest,
    reasons: string[],
    organizationId = 'org-default'
  ): Promise<PendingActionEntry> {
    const actionHash = computeActionHash(request);
    const requestedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + this.defaultExpiryMs).toISOString();

    const entry: PendingActionEntry = {
      actionId: request.id,
      organizationId,
      request: { ...request, actionHash },
      actionHash,
      reasons,
      requestedAt,
      expiresAt,
      status: 'PENDING_APPROVAL',
    };

    this.localActions.set(request.id, entry);

    // Persist to authoritative durable DB
    try {
      await db.createAction({
        organizationId,
        agentId: request.agentId,
        actionType: request.action,
        operation: request.operation,
        argumentsJson: JSON.stringify(request.arguments || {}),
        actionHash,
        status: 'PENDING_APPROVAL',
        requestedAt,
        reasonsJson: JSON.stringify(reasons),
      });
    } catch (e) {
      console.warn('[ApprovalManager] DB action save warning:', e);
    }

    return entry;
  }

  /**
   * Retrieves a pending action by its unique ID.
   */
  public getPendingAction(actionId: string): PendingActionEntry | undefined {
    this.cleanupExpired();
    return this.localActions.get(actionId);
  }

  /**
   * Lists all current pending actions awaiting human authorization.
   */
  public listPendingActions(organizationId?: string): PendingActionEntry[] {
    this.cleanupExpired();
    return Array.from(this.localActions.values()).filter(
      (a) =>
        (a.status === 'PENDING_APPROVAL' || a.status === 'REQUIRES_APPROVAL') &&
        (!organizationId || a.organizationId === organizationId)
    );
  }

  /**
   * Approves or rejects an action with cryptographic hash verification AND executes it.
   */
  public async decideAndExecuteAction(
    actionId: string,
    decision: 'APPROVED' | 'REJECTED',
    operatorId: string,
    organizationId = 'org-default',
    operatorComment?: string,
    currentActionRequest?: ActionRequest
  ): Promise<{
    success: boolean;
    error?: string;
    approval?: ApprovalRecord;
    executionResult?: any;
    status: ActionLifecycleState;
  }> {
    this.cleanupExpired();

    const entry = this.localActions.get(actionId);
    if (!entry) {
      return {
        success: false,
        error: `Action '${actionId}' not found or expired`,
        status: 'EXPIRED',
      };
    }

    // Tenant boundary check (Invariant 5)
    if (entry.organizationId !== organizationId && organizationId !== 'org-default') {
      return {
        success: false,
        error: `Cross-tenant authorization violation: action belongs to another organization.`,
        status: 'DENIED',
      };
    }

    if (entry.status !== 'PENDING_APPROVAL' && entry.status !== 'REQUIRES_APPROVAL') {
      return {
        success: false,
        error: `Action '${actionId}' has already been decided (${entry.status})`,
        status: entry.status,
      };
    }

    // Expiry Check
    if (Date.now() > new Date(entry.expiresAt).getTime()) {
      entry.status = 'EXPIRED';
      return {
        success: false,
        error: `Approval request for '${actionId}' has expired.`,
        status: 'EXPIRED',
      };
    }

    // Cryptographic Action Hash Verification (Invariant 11)
    if (currentActionRequest) {
      const currentHash = computeActionHash(currentActionRequest);
      if (currentHash !== entry.actionHash) {
        return {
          success: false,
          error: `Tampering detected: canonical action hash (${currentHash}) does not match approval proposal hash (${entry.actionHash})`,
          status: 'REJECTED',
        };
      }
    }

    const decidedAt = new Date().toISOString();
    const approvalRecord: ApprovalRecord = {
      approvalId: `appr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actionId,
      actionHash: entry.actionHash,
      status: decision,
      requestedAt: entry.requestedAt,
      decidedAt,
      operatorId,
      operatorComment,
    };

    entry.approval = approvalRecord;

    // If rejected, mark state terminal
    if (decision === 'REJECTED') {
      entry.status = 'REJECTED';
      await db.updateActionState(actionId, entry.organizationId, 'REJECTED', {
        decidedAt,
        decision: 'REJECTED',
        approvalId: approvalRecord.approvalId,
      });
      return {
        success: true,
        approval: approvalRecord,
        status: 'REJECTED',
      };
    }

    // If APPROVED: Execute the exact approved action immediately (Section 13)
    entry.status = 'EXECUTING';
    await db.updateActionState(actionId, entry.organizationId, 'EXECUTING', {
      decidedAt,
      decision: 'APPROVED',
      approvalId: approvalRecord.approvalId,
    });

    let executionResult: any = null;
    let finalState: ActionLifecycleState = 'SUCCEEDED';

    try {
      if (entry.request.action === 'EXEC') {
        const shell = new ShellExecutor();
        executionResult = await shell.executeDirect(entry.request.operation, entry.request.arguments);
      } else if (entry.request.action === 'HTTP') {
        const http = new HttpExecutor();
        executionResult = await http.executeDirect(entry.request.operation, entry.request.arguments);
      } else if (['READ', 'WRITE', 'DELETE'].includes(entry.request.action)) {
        const file = new FileExecutor();
        executionResult = await file.executeDirect(
          entry.request.action as 'READ' | 'WRITE' | 'DELETE',
          entry.request.operation,
          entry.request.arguments
        );
      } else {
        executionResult = { success: true, message: `Completed action ${entry.request.action}` };
      }
      finalState = 'SUCCEEDED';
    } catch (execErr: any) {
      finalState = 'FAILED';
      executionResult = { success: false, error: execErr.message };
    }

    entry.status = finalState;
    entry.executionResult = executionResult;

    await db.updateActionState(actionId, entry.organizationId, finalState, {
      executionResultJson: JSON.stringify(executionResult),
    });

    return {
      success: finalState === 'SUCCEEDED',
      approval: approvalRecord,
      executionResult,
      status: finalState,
    };
  }

  public async decideAction(
    actionId: string,
    decision: 'APPROVED' | 'REJECTED',
    operatorId: string,
    operatorComment?: string,
    currentActionRequest?: ActionRequest,
    organizationId = 'org-default'
  ) {
    return this.decideAndExecuteAction(
      actionId,
      decision,
      operatorId,
      organizationId,
      operatorComment,
      currentActionRequest
    );
  }

  public getQueueDepth(): number {
    this.cleanupExpired();
    let count = 0;
    for (const entry of this.localActions.values()) {
      if (entry.status === 'PENDING_APPROVAL' || entry.status === 'REQUIRES_APPROVAL') {
        count++;
      }
    }
    return count;
  }

  private cleanupExpired() {
    const now = Date.now();
    for (const [id, entry] of this.localActions.entries()) {
      if (
        (entry.status === 'PENDING_APPROVAL' || entry.status === 'REQUIRES_APPROVAL') &&
        new Date(entry.expiresAt).getTime() < now
      ) {
        entry.status = 'EXPIRED';
      }
    }
  }
}

export const approvalManager = new ApprovalManager();
