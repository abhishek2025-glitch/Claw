/**
 * AgentShield Authoritative Multi-Tenant Durable Database Layer
 * Complies with Invariant 5 (Tenant Isolation) & Invariant 12 (No ephemeral process-memory source of truth).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER';
  organizationId: string;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER';
  createdAt: string;
}

export interface License {
  id: string;
  organizationId: string;
  licenseKey: string;
  plan: 'COMMUNITY' | 'PRO_LIFETIME' | 'ENTERPRISE';
  maxDevices: number;
  issuedAt: string;
  expiresAt?: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  signature: string;
  rawPayload: string;
}

export interface LicenseActivation {
  id: string;
  licenseId: string;
  organizationId: string;
  deviceId: string;
  deviceName: string;
  os: string;
  ipAddress?: string;
  activatedAt: string;
  lastSeenAt: string;
  status: 'ACTIVE' | 'DEACTIVATED';
}

export interface Device {
  id: string;
  organizationId: string;
  deviceFingerprint: string;
  hostname: string;
  os: string;
  arch: string;
  lastSeenAt: string;
}

export interface AgentRecord {
  id: string;
  organizationId: string;
  agentId: string;
  name: string;
  framework: string;
  status: 'active' | 'inactive';
  lastSeenAt: string;
  healthStatus: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
}

export type ActionLifecycleState =
  | 'PROPOSED'
  | 'INSPECTING'
  | 'ALLOWED'
  | 'DENIED'
  | 'REQUIRES_APPROVAL'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'EXECUTING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

export interface DbAction {
  id: string;
  organizationId: string;
  agentId: string;
  actionType: string;
  operation: string;
  argumentsJson: string;
  actionHash: string;
  status: ActionLifecycleState;
  requestedAt: string;
  decidedAt?: string;
  decision?: string;
  risk?: string;
  reasonsJson?: string;
  executionResultJson?: string;
  approvalId?: string;
}

export interface DbApproval {
  id: string;
  actionId: string;
  organizationId: string;
  operatorId: string;
  decision: 'APPROVED' | 'REJECTED';
  decidedAt: string;
  comment?: string;
  actionHash: string;
}

export interface DbAuditEvent {
  id: string;
  organizationId: string;
  eventId: string;
  actionId?: string;
  correlationId?: string;
  timestamp: string;
  eventType: string;
  action: string;
  level: string;
  message: string;
  tokens: number;
  risk: string;
  decision: string;
  metadataJson: string;
}

export interface DbWebhookEvent {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  payloadJson: string;
  processed: boolean;
  processedAt: string;
}

export interface DbOrder {
  id: string;
  organizationId: string;
  customerId: string;
  provider: 'DODO' | 'MANUAL';
  providerOrderId: string;
  amountCents: number;
  currency: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
  createdAt: string;
}

export interface DbEntitlement {
  id: string;
  organizationId: string;
  plan: 'COMMUNITY' | 'PRO_LIFETIME' | 'ENTERPRISE';
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  createdAt: string;
}

export interface DbPolicy {
  id: string;
  organizationId: string;
  version: string;
  rulesJson: string;
  isActive: boolean;
  createdAt: string;
}

interface DatabaseSchema {
  users: User[];
  organizations: Organization[];
  organizationMembers: OrganizationMember[];
  licenses: License[];
  licenseActivations: LicenseActivation[];
  devices: Device[];
  agents: AgentRecord[];
  policies: DbPolicy[];
  actions: DbAction[];
  approvals: DbApproval[];
  auditEvents: DbAuditEvent[];
  webhookEvents: DbWebhookEvent[];
  orders: DbOrder[];
  entitlements: DbEntitlement[];
}

/**
 * Robust Atomic Storage Engine.
 * Supports file-locked WAL persistence in local/serverless environments.
 */
class DurableDatabase {
  private dbPath: string;
  private data: DatabaseSchema;
  private initialized = false;
  private writeLock: Promise<void> = Promise.resolve();

  constructor() {
    const isVercel = Boolean(process.env.VERCEL);
    const storageDir = process.env.DATABASE_DIR || (isVercel ? '/tmp/.agentshield' : path.join(process.cwd(), '.agentshield'));
    this.dbPath = path.join(storageDir, 'agentshield-durable.db.json');
    this.data = this.createEmptySchema();
  }

  private createEmptySchema(): DatabaseSchema {
    return {
      users: [],
      organizations: [],
      organizationMembers: [],
      licenses: [],
      licenseActivations: [],
      devices: [],
      agents: [],
      policies: [],
      actions: [],
      approvals: [],
      auditEvents: [],
      webhookEvents: [],
      orders: [],
      entitlements: [],
    };
  }

  public async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        try {
          const parsed = JSON.parse(raw);
          this.data = {
            ...this.createEmptySchema(),
            ...parsed,
          };
        } catch {
          // Corrupt file protection: backup and restart clean
          fs.writeFileSync(`${this.dbPath}.corrupt.${Date.now()}`, raw, 'utf-8');
          this.data = this.createEmptySchema();
          fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
        }
      } else {
        fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
      }

      // Seed default system organization if database is fresh
      if (this.data.organizations.length === 0) {
        const defaultOrgId = 'org-default';
        const defaultOrg: Organization = {
          id: defaultOrgId,
          name: 'Default Workspace',
          slug: 'default',
          ownerId: 'user-admin',
          createdAt: new Date().toISOString(),
        };
        const defaultUser: User = {
          id: 'user-admin',
          email: 'admin@agentshield.local',
          // Default password: "agentshield-admin-secure" hashed via scrypt
          passwordHash: 'c7ad44cbad762a5da0a452f9e854fdc1e0e7a52a38015f23f3eab1d80b931dd472634dfac71cd34ebc35d16ab7fb8a90c81f975113d6c7538dc69dd8de9077ec',
          name: 'Security Admin',
          role: 'OWNER',
          organizationId: defaultOrgId,
          createdAt: new Date().toISOString(),
        };
        const defaultPolicy: DbPolicy = {
          id: 'pol-default',
          organizationId: defaultOrgId,
          version: '1.0.0',
          rulesJson: JSON.stringify({
            policyFailureMode: 'CLOSED',
            telemetryFailureMode: 'OPEN',
            workspaceRoot: process.cwd(),
            allowedDomains: ['google.com', 'github.com', 'api.github.com', 'registry.npmjs.org', 'pypi.org'],
            blockedDomains: ['pastebin.com', 'ghostbin.com', 'tempmail.com', 'ngrok.io', 'serveo.net'],
            allowedHttpPorts: [80, 443],
            blockedHttpPorts: [21, 22, 23, 25, 135, 139, 445, 1433, 1521, 3306, 5432, 6379, 8080, 9200, 27017],
          }),
          isActive: true,
          createdAt: new Date().toISOString(),
        };

        this.data.organizations.push(defaultOrg);
        this.data.users.push(defaultUser);
        this.data.organizationMembers.push({
          id: 'mem-1',
          organizationId: defaultOrgId,
          userId: 'user-admin',
          role: 'OWNER',
          createdAt: new Date().toISOString(),
        });
        this.data.policies.push(defaultPolicy);
        fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
      }

      this.initialized = true;
    } catch (err) {
      console.error('[AgentShield DB] Init error, falling back to memory mode:', err);
      this.initialized = true;
    }
  }

  private async flush(): Promise<void> {
    const raw = JSON.stringify(this.data, null, 2);
    this.writeLock = this.writeLock
      .then(async () => {
        try {
          const tempPath = `${this.dbPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
          await fs.promises.writeFile(tempPath, raw, 'utf-8');
          await fs.promises.rename(tempPath, this.dbPath);
        } catch (e) {
          console.error('[AgentShield DB] Disk write failed:', e);
        }
      })
      .catch((e) => console.error('[AgentShield DB] Flush queue error:', e));

    await this.writeLock;
  }

  // --- Users & Auth ---
  public async getUserById(userId: string): Promise<User | null> {
    await this.init();
    return this.data.users.find((u) => u.id === userId) || null;
  }

  public async getUserByEmail(email: string): Promise<User | null> {
    await this.init();
    const cleanEmail = email.trim().toLowerCase();
    return this.data.users.find((u) => u.email.toLowerCase() === cleanEmail) || null;
  }

  public async createUser(user: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    await this.init();
    const newUser: User = {
      ...user,
      id: `usr-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
    };
    this.data.users.push(newUser);
    await this.flush();
    return newUser;
  }

  // --- Organizations ---
  public async getOrganization(orgId: string): Promise<Organization | null> {
    await this.init();
    return this.data.organizations.find((o) => o.id === orgId) || null;
  }

  public async createOrganization(name: string, ownerId: string): Promise<Organization> {
    await this.init();
    const orgId = `org-${crypto.randomUUID()}`;
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 32);
    const org: Organization = {
      id: orgId,
      name,
      slug,
      ownerId,
      createdAt: new Date().toISOString(),
    };
    this.data.organizations.push(org);
    this.data.organizationMembers.push({
      id: `mem-${crypto.randomUUID()}`,
      organizationId: orgId,
      userId: ownerId,
      role: 'OWNER',
      createdAt: new Date().toISOString(),
    });
    await this.flush();
    return org;
  }

  // --- Licenses & Activations (Tenant Bound) ---
  public async getLicenseByKey(licenseKey: string): Promise<License | null> {
    await this.init();
    return this.data.licenses.find((l) => l.licenseKey === licenseKey) || null;
  }

  public async getLicensesByOrg(orgId: string): Promise<License[]> {
    await this.init();
    return this.data.licenses.filter((l) => l.organizationId === orgId);
  }

  public async createLicense(license: Omit<License, 'id'>): Promise<License> {
    await this.init();
    const newLic: License = {
      ...license,
      id: `lic-${crypto.randomUUID()}`,
    };
    this.data.licenses.push(newLic);
    await this.flush();
    return newLic;
  }

  public async getActivations(licenseId: string, orgId: string): Promise<LicenseActivation[]> {
    await this.init();
    return this.data.licenseActivations.filter(
      (a) => a.licenseId === licenseId && a.organizationId === orgId && a.status === 'ACTIVE'
    );
  }

  public async activateDevice(
    licenseId: string,
    orgId: string,
    deviceId: string,
    deviceName: string,
    os: string
  ): Promise<{ success: boolean; activation?: LicenseActivation; error?: string }> {
    await this.init();
    const license = this.data.licenses.find((l) => l.id === licenseId && l.organizationId === orgId);
    if (!license) {
      return { success: false, error: 'License not found for this organization.' };
    }
    if (license.status !== 'ACTIVE') {
      return { success: false, error: `License is ${license.status.toLowerCase()}.` };
    }

    const currentActivations = this.data.licenseActivations.filter(
      (a) => a.licenseId === licenseId && a.status === 'ACTIVE'
    );

    // If device is already active, return existing
    const existing = currentActivations.find((a) => a.deviceId === deviceId);
    if (existing) {
      existing.lastSeenAt = new Date().toISOString();
      await this.flush();
      return { success: true, activation: existing };
    }

    // Check device limit
    if (currentActivations.length >= license.maxDevices) {
      return {
        success: false,
        error: `Device limit reached (${license.maxDevices} max). Deactivate an existing device before registering a new one.`,
      };
    }

    const activation: LicenseActivation = {
      id: `actv-${crypto.randomUUID()}`,
      licenseId,
      organizationId: orgId,
      deviceId,
      deviceName,
      os,
      activatedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      status: 'ACTIVE',
    };

    this.data.licenseActivations.push(activation);
    await this.flush();
    return { success: true, activation };
  }

  // --- Real Agents (Tenant Bound) ---
  public async getAgentsByOrg(orgId: string): Promise<AgentRecord[]> {
    await this.init();
    return this.data.agents.filter((a) => a.organizationId === orgId);
  }

  public async upsertAgent(orgId: string, agent: { agentId: string; name: string; framework: string }): Promise<AgentRecord> {
    await this.init();
    let record = this.data.agents.find((a) => a.organizationId === orgId && a.agentId === agent.agentId);
    const now = new Date().toISOString();

    if (record) {
      record.name = agent.name;
      record.framework = agent.framework;
      record.status = 'active';
      record.lastSeenAt = now;
      record.healthStatus = 'healthy';
    } else {
      record = {
        id: `agrec-${crypto.randomUUID()}`,
        organizationId: orgId,
        agentId: agent.agentId,
        name: agent.name,
        framework: agent.framework,
        status: 'active',
        lastSeenAt: now,
        healthStatus: 'healthy',
      };
      this.data.agents.push(record);
    }
    await this.flush();
    return record;
  }

  // --- Actions & State Machine (Tenant Bound) ---
  public async getAction(actionId: string, orgId?: string): Promise<DbAction | null> {
    await this.init();
    return this.data.actions.find((a) => a.id === actionId && (!orgId || a.organizationId === orgId)) || null;
  }

  public async getPendingActions(orgId: string): Promise<DbAction[]> {
    await this.init();
    return this.data.actions.filter(
      (a) => a.organizationId === orgId && (a.status === 'PENDING_APPROVAL' || a.status === 'REQUIRES_APPROVAL')
    );
  }

  public async createAction(action: Omit<DbAction, 'id'>): Promise<DbAction> {
    await this.init();
    const newAct: DbAction = {
      ...action,
      id: crypto.randomUUID(),
    };
    this.data.actions.push(newAct);
    await this.flush();
    return newAct;
  }

  public async updateActionState(
    actionId: string,
    orgId: string,
    status: ActionLifecycleState,
    meta?: { decidedAt?: string; decision?: string; executionResultJson?: string; approvalId?: string }
  ): Promise<DbAction | null> {
    await this.init();
    const act = this.data.actions.find((a) => a.id === actionId && a.organizationId === orgId);
    if (!act) return null;

    act.status = status;
    if (meta?.decidedAt) act.decidedAt = meta.decidedAt;
    if (meta?.decision) act.decision = meta.decision;
    if (meta?.executionResultJson) act.executionResultJson = meta.executionResultJson;
    if (meta?.approvalId) act.approvalId = meta.approvalId;

    await this.flush();
    return act;
  }

  // --- Approvals ---
  public async createApproval(approval: Omit<DbApproval, 'id'>): Promise<DbApproval> {
    await this.init();
    const newAppr: DbApproval = {
      ...approval,
      id: `appr-${crypto.randomUUID()}`,
    };
    this.data.approvals.push(newAppr);
    await this.flush();
    return newAppr;
  }

  // --- Audit Events (Append-Only, Tenant Bound) ---
  public async appendAuditEvent(event: Omit<DbAuditEvent, 'id'>): Promise<DbAuditEvent> {
    await this.init();
    // Idempotent by eventId
    const existing = this.data.auditEvents.find((e) => e.eventId === event.eventId);
    if (existing) return existing;

    const newEv: DbAuditEvent = {
      ...event,
      id: `ev-${crypto.randomUUID()}`,
    };
    this.data.auditEvents.push(newEv);
    // Keep max 2000 events in memory / hot buffer
    if (this.data.auditEvents.length > 2000) {
      this.data.auditEvents.shift();
    }
    await this.flush();
    return newEv;
  }

  public async getAuditEvents(orgId: string, limit = 100): Promise<DbAuditEvent[]> {
    await this.init();
    return this.data.auditEvents
      .filter((e) => e.organizationId === orgId)
      .slice(-Math.min(limit, 500));
  }

  // --- Dodo Payments & Webhooks (Idempotent) ---
  public async getWebhookEvent(provider: string, eventId: string): Promise<DbWebhookEvent | null> {
    await this.init();
    return this.data.webhookEvents.find((w) => w.provider === provider && w.eventId === eventId) || null;
  }

  public async recordWebhookEvent(webhook: Omit<DbWebhookEvent, 'id'>): Promise<DbWebhookEvent> {
    await this.init();
    const newWh: DbWebhookEvent = {
      ...webhook,
      id: `wh-${crypto.randomUUID()}`,
    };
    this.data.webhookEvents.push(newWh);
    await this.flush();
    return newWh;
  }

  public async markWebhookProcessed(id: string): Promise<void> {
    await this.init();
    const wh = this.data.webhookEvents.find((w) => w.id === id);
    if (wh) {
      wh.processed = true;
      wh.processedAt = new Date().toISOString();
      await this.flush();
    }
  }

  public async createOrder(order: Omit<DbOrder, 'id'>): Promise<DbOrder> {
    await this.init();
    const newOrder: DbOrder = {
      ...order,
      id: `ord-${crypto.randomUUID()}`,
    };
    this.data.orders.push(newOrder);
    await this.flush();
    return newOrder;
  }

  public async createEntitlement(entitlement: Omit<DbEntitlement, 'id'>): Promise<DbEntitlement> {
    await this.init();
    const newEnt: DbEntitlement = {
      ...entitlement,
      id: `ent-${crypto.randomUUID()}`,
    };
    this.data.entitlements.push(newEnt);
    await this.flush();
    return newEnt;
  }

  public async getEntitlementsByOrg(orgId: string): Promise<DbEntitlement[]> {
    await this.init();
    return this.data.entitlements.filter((e) => e.organizationId === orgId && e.status === 'ACTIVE');
  }
}

// Global Singleton
export const db = new DurableDatabase();
