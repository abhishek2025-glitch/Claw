import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { issueSignedLicense, verifyLicenseOffline } from '../lib/license';

// Generate an ephemeral Ed25519 keypair for tests
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const testPublicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const testPrivatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

test('L2-1. issueSignedLicense and verifyLicenseOffline with matching Ed25519 keypair returns valid: true', () => {
  const license = issueSignedLicense(
    {
      licenseId: 'lic-test-1',
      plan: 'PRO_LIFETIME',
      customerId: 'buyer@example.com',
      organizationId: 'org-test',
      issuedAt: new Date().toISOString(),
      maxDevices: 5,
      features: ['UNLIMITED_AUDIT', 'ZERO_LATENCY_INTERCEPT'],
    },
    testPrivatePem
  );

  assert.ok(license.licenseKey.startsWith('ASL1-'));
  const verification = verifyLicenseOffline(license.licenseKey, testPublicPem);
  assert.equal(verification.valid, true);
  assert.equal(verification.claims?.plan, 'PRO_LIFETIME');
  assert.equal(verification.claims?.customerId, 'buyer@example.com');
});

test('L2-2. Changing any claim (e.g. plan) while keeping signature returns valid: false', () => {
  const license = issueSignedLicense(
    {
      licenseId: 'lic-test-2',
      plan: 'COMMUNITY',
      customerId: 'free@example.com',
      organizationId: 'org-test',
      issuedAt: new Date().toISOString(),
      maxDevices: 1,
      features: ['COMMUNITY_FEATURE'],
    },
    testPrivatePem
  );

  const parts = license.licenseKey.slice(5).split('.');
  const claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
  // Tamper with plan
  claims.plan = 'ENTERPRISE';
  const tamperedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const tamperedKey = `ASL1-${tamperedPayload}.${parts[1]}`;

  const verification = verifyLicenseOffline(tamperedKey, testPublicPem);
  assert.equal(verification.valid, false);
  assert.match(verification.error || '', /tampered with|invalid/i);
});

test('L2-3. issueSignedLicense with no env key throws LICENSE_SIGNING_PRIVATE_KEY error', () => {
  const originalEnv = process.env.LICENSE_SIGNING_PRIVATE_KEY;
  delete process.env.LICENSE_SIGNING_PRIVATE_KEY;

  try {
    assert.throws(
      () => {
        issueSignedLicense({
          licenseId: 'lic-no-key',
          plan: 'PRO_LIFETIME',
          customerId: 'buyer@example.com',
          organizationId: 'org-test',
          issuedAt: new Date().toISOString(),
          maxDevices: 5,
          features: ['FEAT'],
        });
      },
      {
        message: 'LICENSE_SIGNING_PRIVATE_KEY is not configured; refusing to issue licenses.',
      }
    );
  } finally {
    if (originalEnv) {
      process.env.LICENSE_SIGNING_PRIVATE_KEY = originalEnv;
    }
  }
});

test('L1 & L2-4. CLI with matching public key accepts server-issued license (exit 0) and rejects tampered one (exit non-zero)', () => {
  const license = issueSignedLicense(
    {
      licenseId: 'lic-cli-test',
      plan: 'PRO_LIFETIME',
      customerId: 'clibuyer@example.com',
      organizationId: 'org-cli',
      issuedAt: new Date().toISOString(),
      maxDevices: 5,
      features: ['UNLIMITED_AUDIT'],
    },
    testPrivatePem
  );

  const cliPath = path.resolve('bin/agentshield.mjs');

  // Valid license with matching public key env
  const validRun = spawnSync(process.execPath, [cliPath, 'activate', license.licenseKey], {
    env: {
      ...process.env,
      AGENTSHIELD_LICENSE_PUBLIC_KEY: testPublicPem,
    },
    encoding: 'utf-8',
  });
  assert.equal(validRun.status, 0, `Expected CLI activate to succeed, got: ${validRun.stderr || validRun.stdout}`);

  // Tampered license
  const tamperedParts = license.licenseKey.slice(5).split('.');
  const claims = JSON.parse(Buffer.from(tamperedParts[0], 'base64url').toString('utf-8'));
  claims.plan = 'ENTERPRISE';
  const tamperedKey = `ASL1-${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${tamperedParts[1]}`;

  const tamperedRun = spawnSync(process.execPath, [cliPath, 'activate', tamperedKey], {
    env: {
      ...process.env,
      AGENTSHIELD_LICENSE_PUBLIC_KEY: testPublicPem,
    },
    encoding: 'utf-8',
  });
  assert.notEqual(tamperedRun.status, 0, 'Expected CLI activate to fail for tampered license');
});

test('L1. CLI rejects garbage-live and garbage-test bypass attempts (exits non-zero)', () => {
  const cliPath = path.resolve('bin/agentshield.mjs');

  const validPayload = Buffer.from(
    JSON.stringify({
      product: 'agentshield',
      customerId: 'attacker@evil.com',
      features: ['PRO'],
      plan: 'PRO_LIFETIME',
      licenseId: 'lic-attack',
      organizationId: 'org-1',
      maxDevices: 10,
      issuedAt: new Date().toISOString(),
      version: '2.1',
    })
  ).toString('base64url');

  const liveGarbageKey = `ASL1-${validPayload}.garbage-live`;
  const testGarbageKey = `ASL1-${validPayload}.garbage-test`;

  const runLive = spawnSync(process.execPath, [cliPath, 'activate', liveGarbageKey], {
    encoding: 'utf-8',
  });
  assert.notEqual(runLive.status, 0, 'CLI must exit non-zero for garbage-live');

  const runTest = spawnSync(process.execPath, [cliPath, 'activate', testGarbageKey], {
    encoding: 'utf-8',
  });
  assert.notEqual(runTest.status, 0, 'CLI must exit non-zero for garbage-test');
});
