import { ActionRequest, ApprovalRecord, computeActionHash } from '../types/action';

export interface PendingActionEntry {
  actionId: string;
  request: ActionRequest;
  actionHash: string;
  reasons: string[];
  requestedAt: string;
  expiresAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approval?: ApprovalRecord;
}

export class ApprovalManager {
  private pendingActions = new Map<string, PendingActionEntry>();
  private readonly defaultExpiryMs = 15 * 60 * 1000; // 15 minutes TTL

  /**
   * Registers an action requiring operator approval.
   * Computes and locks the canonical SHA-256 hash.
   */
  public registerPendingAction(request: ActionRequest, reasons: string[]): PendingActionEntry {
    const actionHash = computeActionHash(request);
    const requestedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + this.defaultExpiryMs).toISOString();

    const entry: PendingActionEntry = {
      actionId: request.id,
      request: { ...request, actionHash },
      actionHash,
      reasons,
      requestedAt,
      expiresAt,
      status: 'PENDING',
    };

    this.pendingActions.set(request.id, entry);
    return entry;
  }

  /**
   * Retrieves a pending action by its unique ID.
   */
  public getPendingAction(actionId: string): PendingActionEntry | undefined {
    this.cleanupExpired();
    return this.pendingActions.get(actionId);
  }

  /**
   * Lists all current pending actions awaiting human authorization.
   */
  public listPendingActions(): PendingActionEntry[] {
    this.cleanupExpired();
    return Array.from(this.pendingActions.values()).filter((a) => a.status === 'PENDING');
  }

  /**
   * Approves or rejects an action with cryptographic hash verification.
   * If the submitted action has mutated from the proposed action, approval is rejected.
   */
  public decideAction(
    actionId: string,
    decision: 'APPROVED' | 'REJECTED',
    operatorId: string,
    operatorComment?: string,
    currentActionRequest?: ActionRequest
  ): { success: boolean; error?: string; approval?: ApprovalRecord } {
    this.cleanupExpired();

    const entry = this.pendingActions.get(actionId);
    if (!entry) {
      return { success: false, error: `Action '${actionId}' not found or expired` };
    }

    if (entry.status !== 'PENDING') {
      return { success: false, error: `Action '${actionId}' has already been decided (${entry.status})` };
    }

    // Cryptographic Action Hash Verification
    if (currentActionRequest) {
      const currentHash = computeActionHash(currentActionRequest);
      if (currentHash !== entry.actionHash) {
        return {
          success: false,
          error: `Tampering detected: canonical action hash (${currentHash}) does not match approval proposal hash (${entry.actionHash})`,
        };
      }
    }

    const decidedAt = new Date().toISOString();
    const approval: ApprovalRecord = {
      approvalId: `appr-${Math.random().toString(36).substring(2, 9)}`,
      actionId,
      actionHash: entry.actionHash,
      status: decision,
      requestedAt: entry.requestedAt,
      decidedAt,
      operatorId: operatorId || 'anonymous-operator',
      operatorComment,
    };

    entry.status = decision;
    entry.approval = approval;

    return { success: true, approval };
  }

  private cleanupExpired() {
    const now = Date.now();
    for (const [id, entry] of this.pendingActions.entries()) {
      if (entry.status === 'PENDING' && new Date(entry.expiresAt).getTime() < now) {
        entry.status = 'REJECTED';
        entry.approval = {
          approvalId: `exp-${Math.random().toString(36).substring(2, 9)}`,
          actionId: id,
          actionHash: entry.actionHash,
          status: 'REJECTED',
          requestedAt: entry.requestedAt,
          decidedAt: new Date().toISOString(),
          operatorId: 'system-ttl-expirer',
          operatorComment: 'Approval expired after timeout',
        };
      }
    }
  }

  public getQueueDepth(): number {
    this.cleanupExpired();
    return Array.from(this.pendingActions.values()).filter((a) => a.status === 'PENDING').length;
  }
}

export const approvalManager = new ApprovalManager();
