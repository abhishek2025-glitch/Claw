import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { computeActionHash } from '../lib/types/action';
import { DurableDatabase, FileStorageAdapter } from '../lib/db';

const cliPath = path.resolve('bin/agentshield.mjs');

test('W3-1. Permissive mode: agent printing dangerous output is NOT killed and exits 0', () => {
  const run = spawnSync(process.execPath, [
    cliPath,
    'wrap',
    '--mode',
    'permissive',
    '--',
    process.execPath,
    '-e',
    "console.log('rm -rf /')",
  ], { encoding: 'utf-8' });

  assert.equal(run.status, 0, `Expected exit 0, got ${run.status}. Output: ${run.stdout} ${run.stderr}`);
  assert.ok(run.stdout.includes('PERMISSIVE'));
  assert.ok(run.stderr.includes('AGENTSHIELD WARNING (PERMISSIVE)'));
});

test('W3-2. Strict mode: agent printing dangerous output is killed and exits 77', () => {
  const run = spawnSync(process.execPath, [
    cliPath,
    'wrap',
    '--mode',
    'strict',
    '--',
    process.execPath,
    '-e',
    "console.log('rm -rf /')",
  ], { encoding: 'utf-8' });

  assert.equal(run.status, 77, `Expected exit 77, got ${run.status}. Output: ${run.stdout} ${run.stderr}`);
  assert.ok(run.stdout.includes('STRICT'));
  assert.ok(run.stderr.includes('AGENTSHIELD GUARDRAIL TRIGGERED'));
});

test('W3-3. Unknown CLI flags print error and exit 2', () => {
  const run = spawnSync(process.execPath, [
    cliPath,
    'wrap',
    '--invalid-option',
    '--',
    process.execPath,
    '-e',
    "console.log('ok')",
  ], { encoding: 'utf-8' });

  assert.equal(run.status, 2, `Expected exit 2, got ${run.status}`);
  assert.ok(run.stderr.includes('Unknown flag'));
});

test('W7-1. Harmless output containing > /dev/null is ALLOWED and exits 0', () => {
  const run = spawnSync(process.execPath, [
    cliPath,
    'wrap',
    '--',
    process.execPath,
    '-e',
    "console.log('echo hi > /dev/null is harmless noise')",
  ], { encoding: 'utf-8' });

  assert.equal(run.status, 0, `Expected exit 0, got ${run.status}`);
  assert.ok(!run.stderr.includes('GUARDRAIL TRIGGERED'));
});

test('W7-2. Direct write to raw block device /dev/sda is BLOCKED with exit 77', () => {
  const run = spawnSync(process.execPath, [
    cliPath,
    'wrap',
    '--',
    process.execPath,
    '-e',
    "console.log('dd if=input of=/dev/sda')",
  ], { encoding: 'utf-8' });

  assert.equal(run.status, 77, `Expected exit 77, got ${run.status}`);
  assert.ok(run.stderr.includes('Direct raw block device write attempt'));
});

test('W2. agentshield gate denies destructive rm and allows safe commands', () => {
  const tmpProbe = path.join(os.tmpdir(), `agentshield-gate-test-${Date.now()}`);
  fs.mkdirSync(tmpProbe, { recursive: true });

  try {
    // 1. Gated destructive command
    const deniedRun = spawnSync(process.execPath, [
      cliPath,
      'gate',
      '--',
      'rm',
      '-rf',
      tmpProbe,
    ], { encoding: 'utf-8' });

    assert.equal(deniedRun.status, 77, `Expected exit 77, got ${deniedRun.status}`);
    assert.ok(fs.existsSync(tmpProbe), 'Folder must NOT have been deleted because gate stopped it');

    // 2. Gated safe command
    const allowedRun = spawnSync(process.execPath, [
      cliPath,
      'gate',
      '--',
      'node',
      '-e',
      "console.log('gate-ok')",
    ], { encoding: 'utf-8' });

    assert.equal(allowedRun.status, 0, `Expected exit 0, got ${allowedRun.status}`);
    assert.ok(allowedRun.stdout.includes('gate-ok'));
  } finally {
    fs.rmSync(tmpProbe, { recursive: true, force: true });
  }
});

test('W5. Policy validate passes valid policy and fails on invalid syntax or duplicate rules', () => {
  // Valid default policy
  const validRun = spawnSync(process.execPath, [cliPath, 'policy', 'validate'], { encoding: 'utf-8' });
  assert.equal(validRun.status, 0, `Expected valid policy to pass, got ${validRun.status}`);

  // Invalid policy file
  const tmpBadPolicy = path.join(os.tmpdir(), `bad-policy-${Date.now()}.json`);
  fs.writeFileSync(
    tmpBadPolicy,
    JSON.stringify({
      policyFailureMode: 'CORRUPT_MODE',
      rules: [
        { id: 'DUP', pattern: '[unclosed-bracket' },
        { id: 'DUP', pattern: 'valid-pattern' },
      ],
    }),
    'utf-8'
  );

  try {
    const invalidRun = spawnSync(process.execPath, [cliPath, 'policy', 'validate', tmpBadPolicy], { encoding: 'utf-8' });
    assert.equal(invalidRun.status, 1, `Expected invalid policy to fail with 1, got ${invalidRun.status}`);
    assert.ok(invalidRun.stderr.includes('Invalid policyFailureMode'));
    assert.ok(invalidRun.stderr.includes('Duplicate rule name'));
    assert.ok(invalidRun.stderr.includes('Invalid regex'));
  } finally {
    fs.unlinkSync(tmpBadPolicy);
  }
});

test('W8. Action approval verification ensures hash integrity and execution without shell', () => {
  const homeDir = os.homedir();
  const approvalsFile = path.join(homeDir, '.agentshield', 'pending-approvals.json');
  fs.mkdirSync(path.dirname(approvalsFile), { recursive: true });

  const testActionId = `act-test-${Date.now()}`;
  const validHash = computeActionHash({
    action: 'EXEC',
    agentId: 'test-agent',
    operation: 'node -e "console.log(\'approved-execution\')"',
    arguments: null,
  });

  const approvals = {
    [testActionId]: {
      id: testActionId,
      action: 'EXEC',
      agentId: 'test-agent',
      operation: 'node -e "console.log(\'approved-execution\')"',
      arguments: null,
      actionHash: validHash,
      reasons: ['Operator test'],
    },
  };

  fs.writeFileSync(approvalsFile, JSON.stringify(approvals), 'utf-8');

  try {
    // Approve with --yes
    const run = spawnSync(process.execPath, [cliPath, 'approve', testActionId, '--yes'], { encoding: 'utf-8' });
    assert.equal(run.status, 0, `Expected exit 0 on approval, got ${run.status}. Output: ${run.stdout}`);
    assert.ok(run.stdout.includes('Action Hash: ' + validHash));
    assert.ok(run.stdout.includes('Execution Succeeded'));

    // Approvals file should now have cleared the action
    const after = JSON.parse(fs.readFileSync(approvalsFile, 'utf-8'));
    assert.equal(after[testActionId], undefined);
  } finally {
    try {
      const current = JSON.parse(fs.readFileSync(approvalsFile, 'utf-8'));
      delete current[testActionId];
      fs.writeFileSync(approvalsFile, JSON.stringify(current), 'utf-8');
    } catch {}
  }
});

test('L8. Durable database persistence across adapter restarts', async () => {
  const tmpDbPath = path.join(os.tmpdir(), `durable-test-${Date.now()}.db.json`);
  const adapter1 = new FileStorageAdapter(tmpDbPath);
  const dbInstance1 = new DurableDatabase(adapter1);
  await dbInstance1.init();

  const testOrgId = `org-test-${Date.now()}`;
  await dbInstance1.createOrder({
    organizationId: testOrgId,
    customerId: 'buyer@test.com',
    provider: 'MANUAL',
    providerOrderId: 'ord-123',
    amountCents: 4900,
    currency: 'USD',
    status: 'SUCCEEDED',
    createdAt: new Date().toISOString(),
  });

  await dbInstance1.createEntitlement({
    organizationId: testOrgId,
    plan: 'PRO_LIFETIME',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  });

  // Second instance simulating server restart
  const adapter2 = new FileStorageAdapter(tmpDbPath);
  const dbInstance2 = new DurableDatabase(adapter2);
  await dbInstance2.init();

  const entitlements = await dbInstance2.getEntitlementsByOrg(testOrgId);
  assert.equal(entitlements.length, 1);
  assert.equal(entitlements[0].plan, 'PRO_LIFETIME');

  try {
    fs.unlinkSync(tmpDbPath);
  } catch {}
});
