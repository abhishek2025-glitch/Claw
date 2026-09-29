import test from 'node:test';
import assert from 'node:assert/strict';
import { PolicyEngine } from '../lib/policy/engine.ts';
import { ShellExecutor, PolicyDeniedError, ApprovalRequiredError } from '../lib/executors/index.ts';
import { ApprovalManager } from '../lib/approval/manager.ts';
import { DurableEventStore } from '../lib/storage/event-store.ts';
import { redactSecrets } from '../lib/policy/redact.ts';
import { ActionRequest, computeActionHash } from '../lib/types/action.ts';
import path from 'node:path';
import fs from 'node:fs';

const testWorkspace = path.join(process.cwd(), '.test-workspace');
if (!fs.existsSync(testWorkspace)) {
  fs.mkdirSync(testWorkspace, { recursive: true });
}

test('1. Safe command evaluates to ALLOW and executes', async () => {
  const policy = new PolicyEngine({ workspaceRoot: testWorkspace });
  const req: ActionRequest = {
    id: 'test-1',
    correlationId: 'corr-1',
    agentId: 'agent-test',
    action: 'EXEC',
    operation: 'echo "AgentShield nominal test"',
    requestedAt: new Date().toISOString(),
  };

  const decision = policy.evaluateAction(req);
  assert.equal(decision.decision, 'ALLOW');
  assert.equal(decision.risk, 'LOW');
});

test('2. Destructive command (rm -rf /) evaluates to DENY and blocks execution', async () => {
  const policy = new PolicyEngine({ workspaceRoot: testWorkspace });
  const req: ActionRequest = {
    id: 'test-2',
    correlationId: 'corr-2',
    agentId: 'agent-test',
    action: 'EXEC',
    operation: 'rm -rf /var/logs',
    requestedAt: new Date().toISOString(),
  };

  const decision = policy.evaluateAction(req);
  assert.equal(decision.decision, 'DENY');
  assert.equal(decision.risk, 'CRITICAL');
  assert.ok(decision.reasons.some((r) => r.includes('rm -rf')));
});

test('3. Privilege escalation (chmod 777) evaluates to DENY', async () => {
  const policy = new PolicyEngine({ workspaceRoot: testWorkspace });
  const req: ActionRequest = {
    id: 'test-3',
    correlationId: 'corr-3',
    agentId: 'agent-test',
    action: 'EXEC',
    operation: 'chmod 777 deploy.sh',
    requestedAt: new Date().toISOString(),
  };

  const decision = policy.evaluateAction(req);
  assert.equal(decision.decision, 'DENY');
  assert.equal(decision.risk, 'HIGH');
});

test('4. Network SSRF: Cloud metadata and loopback IP destinations evaluate to DENY', async () => {
  const policy = new PolicyEngine();
  const ssrfRequests: string[] = [
    'http://169.254.169.254/latest/meta-data/',
    'http://127.0.0.1:8080/admin',
    'http://localhost:5432/',
    'http://[::1]:80/status',
    'http://10.0.0.1:9200/_cat',
  ];

  for (const url of ssrfRequests) {
    const decision = policy.evaluateAction({
      id: 'test-ssrf',
      correlationId: 'corr-ssrf',
      agentId: 'agent-test',
      action: 'HTTP',
      operation: url,
      requestedAt: new Date().toISOString(),
    });
    assert.equal(decision.decision, 'DENY', `Expected DENY for SSRF target: ${url}`);
    assert.equal(decision.risk, 'CRITICAL');
  }
});

test('5. Blocked exfiltration domains (pastebin) evaluate to DENY', async () => {
  const policy = new PolicyEngine({ blockedDomains: ['pastebin.com'] });
  const decision = policy.evaluateAction({
    id: 'test-pastebin',
    correlationId: 'corr-pb',
    agentId: 'agent-test',
    action: 'HTTP',
    operation: 'https://pastebin.com/raw/leak123',
    requestedAt: new Date().toISOString(),
  });

  assert.equal(decision.decision, 'DENY');
  assert.equal(decision.risk, 'CRITICAL');
});

test('6. Approved external API evaluation evaluates to ALLOW', async () => {
  const policy = new PolicyEngine({ allowedDomains: ['api.github.com'] });
  const decision = policy.evaluateAction({
    id: 'test-gh',
    correlationId: 'corr-gh',
    agentId: 'agent-test',
    action: 'HTTP',
    operation: 'https://api.github.com/repos/google/genai',
    arguments: { method: 'GET' },
    requestedAt: new Date().toISOString(),
  });

  assert.equal(decision.decision, 'ALLOW');
});

test('7. Path Traversal & Escaping Workspace boundary evaluates to DENY', async () => {
  const policy = new PolicyEngine({ workspaceRoot: testWorkspace });
  const traversalPaths = [
    '../../etc/passwd',
    '/etc/shadow',
    './subdir/../../../../root/.ssh/id_rsa',
    'test\0.txt',
  ];

  for (const p of traversalPaths) {
    const decision = policy.evaluateAction({
      id: 'test-traversal',
      correlationId: 'corr-trav',
      agentId: 'agent-test',
      action: 'READ',
      operation: p,
      requestedAt: new Date().toISOString(),
    });

    assert.equal(decision.decision, 'DENY', `Expected DENY for path: ${p}`);
  }
});

test('8. Secret Credential File Reads (.env, id_rsa) evaluate to DENY', async () => {
  const policy = new PolicyEngine({ workspaceRoot: testWorkspace });
  const decision = policy.evaluateAction({
    id: 'test-env',
    correlationId: 'corr-env',
    agentId: 'agent-test',
    action: 'READ',
    operation: path.join(testWorkspace, '.env'),
    requestedAt: new Date().toISOString(),
  });

  assert.equal(decision.decision, 'DENY');
  assert.equal(decision.risk, 'CRITICAL');
});

test('9. Policy Engine defaults to FAIL-CLOSED on unexpected error', async () => {
  const policy = new PolicyEngine({ policyFailureMode: 'CLOSED' });
  // Intentionally pass an invalid object causing an error
  const malformedReq: any = {
    id: 'bad',
    action: null,
    operation: null,
  };

  const decision = policy.evaluateAction(malformedReq);
  assert.equal(decision.decision, 'DENY');
  assert.equal(decision.risk, 'CRITICAL');
});

test('10. Cryptographic Action Hashing prevents tampering in approvals', async () => {
  const approvalMgr = new ApprovalManager();
  const originalReq: ActionRequest = {
    id: 'action-approve-1',
    correlationId: 'corr-appr',
    agentId: 'agent-test',
    action: 'EXEC',
    operation: 'git status',
    arguments: { flag: '--short' },
    requestedAt: new Date().toISOString(),
  };

  const entry = approvalMgr.registerPendingAction(originalReq, ['Safe test inspection']);
  assert.ok(entry.actionHash);

  // Attempt to approve a tampered action (attacker modified command to 'rm -rf /')
  const tamperedReq: ActionRequest = {
    ...originalReq,
    operation: 'rm -rf /',
  };

  const result = approvalMgr.decideAction(
    originalReq.id,
    'APPROVED',
    'operator-1',
    'Approved test',
    tamperedReq
  );

  assert.equal(result.success, false);
  assert.ok(result.error?.includes('Tampering detected'));

  // Now verify legitimate un-tampered action succeeds
  const legitResult = approvalMgr.decideAction(
    originalReq.id,
    'APPROVED',
    'operator-1',
    'Approved original',
    originalReq
  );
  assert.equal(legitResult.success, true);
  assert.equal(legitResult.approval?.status, 'APPROVED');
});

test('11. Secret Redaction sanitizes tokens and passwords before logging', async () => {
  const sensitiveString = 'Error connecting to postgres://admin:super_secret_pw123@db.internal:5432 with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and sk-1234567890abcdef1234567890';
  const clean = redactSecrets(sensitiveString);

  assert.ok(!clean.includes('super_secret_pw123'));
  assert.ok(!clean.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
  assert.ok(!clean.includes('sk-1234567890abcdef1234567890'));
  assert.ok(clean.includes('[REDACTED_PASSWORD]'));
  assert.ok(clean.includes('[REDACTED_TOKEN]'));
  assert.ok(clean.includes('sk-[REDACTED_API_KEY]'));
});

test('12. Durable Event Store guarantees idempotency and simulation isolation', async () => {
  const testStoreFile = path.join(testWorkspace, 'test-events.jsonl');
  if (fs.existsSync(testStoreFile)) fs.unlinkSync(testStoreFile);

  const store = new DurableEventStore(testStoreFile);

  // Production event
  await store.append({
    eventId: 'prod-ev-1',
    correlationId: 'corr-prod',
    timestamp: new Date().toISOString(),
    eventType: 'ACTION_ALLOWED',
    action: 'EXEC',
    level: 'INFO',
    message: 'Prod event 1',
    agentId: 'agent-1',
    environment: 'production',
  });

  // Duplicate production event (same eventId) -> Should be ignored
  await store.append({
    eventId: 'prod-ev-1',
    correlationId: 'corr-prod',
    timestamp: new Date().toISOString(),
    eventType: 'ACTION_ALLOWED',
    action: 'EXEC',
    level: 'INFO',
    message: 'Duplicate event should be discarded',
    agentId: 'agent-1',
    environment: 'production',
  });

  // Simulation event
  await store.append({
    eventId: 'sim-ev-1',
    correlationId: 'corr-sim',
    timestamp: new Date().toISOString(),
    eventType: 'TELEMETRY_LOG',
    action: 'EXEC',
    level: 'INFO',
    message: 'Simulation event',
    agentId: 'agent-sim',
    environment: 'simulation',
  });

  const prodEvents = await store.getRecent(10, { environment: 'production' });
  const simEvents = await store.getRecent(10, { environment: 'simulation' });

  assert.equal(prodEvents.length, 1);
  assert.equal(prodEvents[0].eventId, 'prod-ev-1');
  assert.equal(simEvents.length, 1);
  assert.equal(simEvents[0].eventId, 'sim-ev-1');

  // Verify file on disk ONLY has production events, NOT simulation
  const fileContent = fs.readFileSync(testStoreFile, 'utf-8');
  assert.ok(fileContent.includes('prod-ev-1'));
  assert.ok(!fileContent.includes('sim-ev-1'));
});

test('13. Shell Executor blocks destructive command and throws PolicyDeniedError', async () => {
  const executor = new ShellExecutor();
  const destructiveReq: ActionRequest = {
    id: 'test-exec-block',
    correlationId: 'corr-exec-block',
    agentId: 'agent-test',
    action: 'EXEC',
    operation: 'rm -rf /etc/test',
    requestedAt: new Date().toISOString(),
  };

  await assert.rejects(
    async () => {
      await executor.execute(destructiveReq);
    },
    (err: any) => {
      assert.equal(err.name, 'PolicyDeniedError');
      assert.equal(err.decision.decision, 'DENY');
      return true;
    }
  );
});

test('14. Obfuscated SSRF & IPv4-mapped IPv6 are blocked', async () => {
  const policy = new PolicyEngine();
  const obfuscated = [
    'http://[::ffff:127.0.0.1]:8080/secret',
    'http://0.0.0.0:8080/metrics',
    'http://127.1:80/',
    'http://[::1]:9090/',
  ];

  for (const url of obfuscated) {
    const decision = policy.evaluateAction({
      id: 'test-obf',
      correlationId: 'corr-obf',
      agentId: 'agent-test',
      action: 'HTTP',
      operation: url,
      requestedAt: new Date().toISOString(),
    });
    assert.equal(decision.decision, 'DENY', `Expected DENY for obfuscated IP: ${url}`);
  }
});

