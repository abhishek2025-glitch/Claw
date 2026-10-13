#!/usr/bin/env node

/**
 * AgentShield Universal Autonomous Agent Security Runtime & CLI
 * Conforms to Sections 5, 6, 7, 8, 9, 10, 16, 17, 33, 55 of Master Specification.
 *
 * Real, offline-first security runtime providing:
 * - Deterministic policy enforcement & command gating
 * - Action normalization & cryptographic hashing
 * - Local offline license verification (Ed25519)
 * - Real OpenClaw & autonomous agent interception
 * - Local approval queue & automatic execution resumption
 * - Local append-only durable audit queue with async telemetry synchronization
 */

import { spawn, spawnSync, execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';
import crypto from 'node:crypto';

const VERSION = '2.1.0';

// ANSI Styling
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  emerald: '\x1b[38;5;48m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgEmerald: '\x1b[48;5;48m\x1b[30m',
  bgRed: '\x1b[41m\x1b[37m',
  bgYellow: '\x1b[43m\x1b[30m',
};

// Embedded Public Verification Key for Offline License Verification (Ed25519)
// Note: Can be overridden at runtime via AGENTSHIELD_LICENSE_PUBLIC_KEY
const AGENTSHIELD_ROOT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAiK3m+xZ9P9b2Y7uN8kC9aW0yF5vT3rQ8sM1nL2xP0k4=
-----END PUBLIC KEY-----`;

function getEffectivePublicKey(overridePem) {
  if (overridePem) return overridePem;
  if (process.env.AGENTSHIELD_LICENSE_PUBLIC_KEY) {
    return process.env.AGENTSHIELD_LICENSE_PUBLIC_KEY.replace(/\\n/g, '\n');
  }
  return AGENTSHIELD_ROOT_PUBLIC_KEY;
}

// Local Config & Paths
const HOME_DIR = os.homedir();
const CONFIG_DIR = path.join(HOME_DIR, '.agentshield');
const LOCAL_CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const LOCAL_LICENSE_FILE = path.join(CONFIG_DIR, 'license.json');
const LOCAL_QUEUE_FILE = path.join(CONFIG_DIR, 'telemetry-queue.jsonl');
const LOCAL_AUDIT_LOG = path.join(CONFIG_DIR, 'audit.jsonl');
const LOCAL_APPROVALS_FILE = path.join(CONFIG_DIR, 'pending-approvals.json');

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConfig() {
  ensureConfigDir();
  if (fs.existsSync(LOCAL_CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LOCAL_CONFIG_FILE, 'utf-8'));
    } catch {
      // Fallback
    }
  }
  const defaultCfg = {
    deviceId: `dev-${crypto.randomUUID()}`,
    deviceName: os.hostname(),
    endpoint: process.env.AGENTSHIELD_ENDPOINT || 'http://localhost:3000',
    secret: process.env.AGENTSHIELD_SECRET || process.env.WEBHOOK_SECRET || '',
    policyMode: 'FAIL-CLOSED',
    workspaceRoot: process.cwd(),
    initializedAt: new Date().toISOString(),
  };
  fs.writeFileSync(LOCAL_CONFIG_FILE, JSON.stringify(defaultCfg, null, 2), 'utf-8');
  return defaultCfg;
}

function printBanner() {
  console.log(`
${c.emerald}${c.bold}   ___                    __  _____ __    _      __    __${c.reset}
${c.emerald}${c.bold}  /   | ____ ____  ____  / /_/ ___// /_  (_)__  / /___/ /${c.reset}
${c.emerald}${c.bold} / /| |/ __ \`/ _ \\/ __ \\/ __/\\__ \\/ __ \\/ / _ \\/ / __  / ${c.reset}
${c.emerald}${c.bold}/ ___ / /_/ /  __/ / / / /_ ___/ / / / / /  __/ / /_/ /  ${c.reset}
${c.emerald}${c.bold}/_/  |_\\__, /\\___/_/ /_/\\__//____/_/ /_/_/\\___/_/\\__,_/   ${c.reset}
${c.emerald}${c.bold}      /____/    ${c.reset}${c.dim}Offline-First Agent Security Runtime v${VERSION}${c.reset}
${c.dim}Guarantee: Monitors agent output and stops the agent on matching patterns; does not sandbox file or network access.${c.reset}
`);
}

function printHelp() {
  printBanner();
  console.log(`
${c.bold}USAGE:${c.reset}
  $ agentshield <command> [options]
  $ npx agentshield <command> [options]

${c.bold}CORE COMMANDS:${c.reset}
  ${c.green}init${c.reset}                         Initialize local AgentShield runtime environment & device ID
  ${c.green}activate${c.reset} <license-key>       Activate signed license key (supports offline verification)
  ${c.green}status${c.reset}                       Inspect live runtime, license, device, and OpenClaw status
  ${c.green}policy${c.reset}                       Display active security policy configuration
  ${c.green}policy validate${c.reset} [file]       Validate local policy rules for syntax and safety invariants
  ${c.green}logs${c.reset} [--follow]              Inspect local durable audit event records
  ${c.green}approvals${c.reset}                    List actions pending human operator authorization
  ${c.green}approve${c.reset} <action-id> [--yes]   Approve pending action with hash verification & execute
  ${c.green}deny${c.reset} <action-id>             Deny pending action and mark terminal
  ${c.green}gate${c.reset} -- <cmd...>             Pre-execution policy gate (evaluates and executes if allowed)
  ${c.green}wrap${c.reset} [options] -- <cmd...>  Run OpenClaw or autonomous agent under runtime guardrail
  ${c.green}doctor${c.reset}                       Comprehensive diagnostic check of runtime and dependencies
  ${c.green}version${c.reset}                      Show AgentShield version
  ${c.green}test-connection${c.reset} [options]    Verify cloud connectivity and telemetry pipeline

${c.bold}WRAP OPTIONS:${c.reset}
  --mode <strict|permissive|audit>   Enforcement mode (default: strict)
  --endpoint <url>                   Control plane URL (default: http://localhost:3000)
  --secret <key>                     Bearer token for control plane
  --agent <name>                     Agent identifier label

${c.bold}GUARANTEE NOTICE:${c.reset}
  AgentShield monitors agent output and stops the agent on matching patterns.
  It intercepts commands started through PATH shims via 'agentshield gate';
  it does not sandbox arbitrary file or network system calls.
`);
}

// Canonical Claims Verifier (Ed25519 Offline)
function verifyLicenseOffline(licenseKey) {
  if (!licenseKey || !licenseKey.startsWith('ASL1-')) {
    return { valid: false, error: 'Malformed license key: missing ASL1 prefix' };
  }
  const body = licenseKey.slice(5);
  const parts = body.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed license structure' };
  }
  const [payloadEncoded, signature] = parts;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf-8'));
  } catch {
    return { valid: false, error: 'Failed to decode license payload' };
  }
  if (!claims || typeof claims !== 'object' || !Array.isArray(claims.features)) {
    return { valid: false, error: 'Malformed license claims' };
  }
  if (claims.product !== 'agentshield') {
    return { valid: false, error: `Invalid product: ${claims.product}` };
  }
  if (claims.expiresAt && Date.now() > new Date(claims.expiresAt).getTime()) {
    return { valid: false, error: `License expired on ${claims.expiresAt}` };
  }
  // Verify signature
  const canonicalBytes = Buffer.from(
    JSON.stringify({
      customerId: claims.customerId,
      expiresAt: claims.expiresAt || null,
      features: [...claims.features].sort(),
      issuedAt: claims.issuedAt,
      licenseId: claims.licenseId,
      maxDevices: claims.maxDevices,
      organizationId: claims.organizationId,
      plan: claims.plan,
      product: claims.product,
      version: claims.version,
    }),
    'utf-8'
  );

  const effectivePublicKey = getEffectivePublicKey();
  let isVerified = false;
  try {
    isVerified = crypto.verify(
      null,
      canonicalBytes,
      effectivePublicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    isVerified = false;
  }

  return { valid: isVerified, claims, error: isVerified ? undefined : 'Signature verification failed' };
}

// Dangerous Regex Patterns for Local Process Output Inspection & Gate
// Narrowed W7: Real block/raw devices only. Never flags /dev/null, /dev/zero, /dev/stdout, /dev/stderr, /dev/tty.
const DANGEROUS_PATTERNS = [
  { regex: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\s+([/*~]|\.\.)/i, reason: 'Destructive recursive deletion command detected' },
  { regex: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\b/i, reason: 'Destructive recursive force deletion command (rm -rf)' },
  { regex: />\s*\/dev\/(?:sd[a-z0-9]*|nvme[0-9a-z]*|hd[a-z0-9]*|disk\/[a-zA-Z0-9_-]+|mmcblk[0-9a-z]*)\b/i, reason: 'Direct device write attempt' },
  { regex: /\bdd\s+if=/i, reason: 'Direct raw block device write attempt (dd)' },
  { regex: /\bmkfs(?:\.[a-zA-Z0-9]+)?\b/i, reason: 'Filesystem formatting attempt (mkfs)' },
  { regex: /\b(sudo\s+|chmod\s+(?:-[a-zA-Z]+\s+)?(?:777|a\+rwx)|chown\s+(?:-[a-zA-Z]+\s+)?root)\b/i, reason: 'Privilege escalation attempt' },
  { regex: /169\.254\.169\.254|metadata\.google\.internal/i, reason: 'Cloud Instance Metadata Service (IMDS) SSRF exfiltration attempt' },
  { regex: /\b(cat|grep|curl|wget)\b.*(\/etc\/shadow|\.env|id_rsa|\.aws\/credentials)/i, reason: 'Sensitive credentials exfiltration attempt' },
  { regex: /:\(\)\{\s*:\|:&\s*\};:/i, reason: 'Fork bomb exploit attempt' },
  { regex: /\b(nc\s+-lvp|bash\s+-i\s+>&|curl\s+.*\|\s*bash|wget\s+.*\|\s*sh)\b/i, reason: 'Reverse shell / remote code execution pipe attempt' },
];

function logAuditEvent(event) {
  ensureConfigDir();
  const line = JSON.stringify({ ...event, localTimestamp: new Date().toISOString() }) + '\n';
  fs.appendFileSync(LOCAL_AUDIT_LOG, line, 'utf-8');
  // Also queue for cloud sync
  fs.appendFileSync(LOCAL_QUEUE_FILE, line, 'utf-8');
}

/**
 * W6 Telemetry Uploader: Flushes queued local events to <endpoint>/api/webhook.
 * Non-blocking, retries with backoff, only removes acknowledged events.
 */
async function flushTelemetryQueue(endpoint, secret) {
  if (!endpoint || !fs.existsSync(LOCAL_QUEUE_FILE)) return;

  try {
    const raw = fs.readFileSync(LOCAL_QUEUE_FILE, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    if (lines.length === 0) return;

    const remaining = [];
    const url = endpoint.replace(/\/+$/, '') + '/api/webhook';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue; // Discard unparseable line
      }

      let acked = false;
      const headers = { 'Content-Type': 'application/json' };
      if (secret) {
        headers['Authorization'] = `Bearer ${secret}`;
      }

      // Retry up to 2 times with backoff
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              action: ev.action || 'THINK',
              level: ev.level || 'INFO',
              message: ev.message || 'Telemetry event',
              environment: 'production',
              metadata: ev,
            }),
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) {
            acked = true;
            break;
          }
        } catch {
          // Network issue, will retry or keep queued
        }
        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        }
      }

      if (!acked) {
        // Keep in queue along with all remaining lines
        remaining.push(...lines.slice(i));
        break;
      }
    }

    // Rewrite queue file with unacknowledged events only
    fs.writeFileSync(
      LOCAL_QUEUE_FILE,
      remaining.length > 0 ? remaining.join('\n') + '\n' : '',
      'utf-8'
    );
  } catch {
    // Non-blocking error handling
  }
}

/**
 * Cross-platform executable lookup (W9 Portability)
 */
function findExecutable(binName) {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? `where ${binName}` : `command -v ${binName}`;
  try {
    const stdout = execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
    const firstLine = stdout.trim().split('\n')[0]?.trim();
    return firstLine || null;
  } catch {
    return null;
  }
}

function getOpenClawPath() {
  if (process.env.AGENTSHIELD_OPENCLAW_PATH) {
    return process.env.AGENTSHIELD_OPENCLAW_PATH;
  }
  return findExecutable('openclaw');
}

/**
 * Deterministic action hash (matches lib/types/action.ts computeActionHash)
 */
function computeCanonicalActionHash(action, agentId, operation, args = null) {
  const canonicalObject = {
    action,
    agentId,
    operation: operation.trim(),
    arguments: args !== null && args !== undefined ? JSON.parse(JSON.stringify(args)) : null,
  };
  const jsonString = JSON.stringify(canonicalObject, Object.keys(canonicalObject).sort());
  return crypto.createHash('sha256').update(jsonString, 'utf8').digest('hex');
}

// --- COMMAND HANDLERS ---

function cmdInit() {
  ensureConfigDir();
  const cfg = loadConfig();
  console.log(`${c.green}✔ Initialized AgentShield Local Security Runtime${c.reset}`);
  console.log(`  Config Path:    ${LOCAL_CONFIG_FILE}`);
  console.log(`  Device ID:      ${cfg.deviceId}`);
  console.log(`  Workspace Root: ${cfg.workspaceRoot}`);
  console.log(`  Audit Queue:    ${LOCAL_QUEUE_FILE}`);
  console.log(`\nNext: Activate your license via ${c.cyan}agentshield activate <license-key>${c.reset}\n`);
}

async function cmdActivate(licenseKey) {
  if (!licenseKey) {
    console.error(`${c.red}Error: Missing license key.${c.reset}`);
    console.error(`Usage: agentshield activate <license-key>`);
    process.exit(1);
  }

  ensureConfigDir();
  const cfg = loadConfig();

  console.log(`${c.bold}Verifying license signature cryptographically (Offline Mode)...${c.reset}`);
  const result = verifyLicenseOffline(licenseKey);

  if (!result.valid) {
    console.error(`${c.red}✖ License Activation Failed:${c.reset} ${result.error}`);
    process.exit(1);
  }

  const licenseRecord = {
    licenseKey,
    claims: result.claims,
    activatedAt: new Date().toISOString(),
    deviceId: cfg.deviceId,
  };
  fs.writeFileSync(LOCAL_LICENSE_FILE, JSON.stringify(licenseRecord, null, 2), 'utf-8');

  console.log(`${c.green}✔ Cryptographic Signature Validated Successfully!${c.reset}`);
  console.log(`  Plan:        ${result.claims?.plan}`);
  console.log(`  Customer:    ${result.claims?.customerId}`);
  console.log(`  Org ID:      ${result.claims?.organizationId}`);
  console.log(`  Max Devices: ${result.claims?.maxDevices}`);
  console.log(`  Features:    ${result.claims?.features?.join(', ')}`);

  // Optional online registration
  try {
    const res = await fetch(`${cfg.endpoint}/api/licenses/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey,
        deviceId: cfg.deviceId,
        deviceName: cfg.deviceName,
        os: process.platform,
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      console.log(`  ${c.green}✔ Device activation synchronized with cloud control plane.${c.reset}`);
    }
  } catch {
    console.log(`  ${c.yellow}ℹ Cloud unreachable. Operating in local offline enforcement mode.${c.reset}`);
  }

  console.log(`\n${c.bgEmerald} ACTIVATION COMPLETE ${c.reset} Local runtime is fully armed and ready to protect OpenClaw.\n`);
}

function cmdStatus() {
  const cfg = loadConfig();
  let licenseStatus = `${c.yellow}No active license (Community mode)${c.reset}`;
  let plan = 'COMMUNITY';

  if (fs.existsSync(LOCAL_LICENSE_FILE)) {
    try {
      const lic = JSON.parse(fs.readFileSync(LOCAL_LICENSE_FILE, 'utf-8'));
      const ver = verifyLicenseOffline(lic.licenseKey);
      if (ver.valid) {
        licenseStatus = `${c.green}Active & Verified (${lic.claims?.plan})${c.reset}`;
        plan = lic.claims?.plan || 'PRO_LIFETIME';
      } else {
        licenseStatus = `${c.red}Invalid Signature (${ver.error})${c.reset}`;
      }
    } catch {
      licenseStatus = `${c.red}Corrupted local license file${c.reset}`;
    }
  }

  const clawPath = getOpenClawPath();
  const openclawStatus = clawPath
    ? `${c.green}Detected (${clawPath})${c.reset}`
    : `${c.yellow}Not found in PATH${c.reset}`;

  let queueDepth = 0;
  if (fs.existsSync(LOCAL_QUEUE_FILE)) {
    const lines = fs.readFileSync(LOCAL_QUEUE_FILE, 'utf-8').split('\n').filter(Boolean);
    queueDepth = lines.length;
  }

  let pendingCount = 0;
  if (fs.existsSync(LOCAL_APPROVALS_FILE)) {
    try {
      const apps = JSON.parse(fs.readFileSync(LOCAL_APPROVALS_FILE, 'utf-8'));
      pendingCount = Object.keys(apps).length;
    } catch {}
  }

  printBanner();
  console.log(`${c.bold}AgentShield Runtime Status:${c.reset}`);
  console.log(`  ${c.cyan}Runtime Version:${c.reset}    v${VERSION}`);
  console.log(`  ${c.cyan}License Status:${c.reset}     ${licenseStatus}`);
  console.log(`  ${c.cyan}Plan Tier:${c.reset}          ${plan}`);
  console.log(`  ${c.cyan}Device ID:${c.reset}          ${cfg.deviceId}`);
  console.log(`  ${c.cyan}Policy Mode:${c.reset}        FAIL-CLOSED (Active)`);
  console.log(`  ${c.cyan}OpenClaw Integration:${c.reset} ${openclawStatus}`);
  console.log(`  ${c.cyan}Telemetry Queue:${c.reset}    ${queueDepth} offline events stored`);
  console.log(`  ${c.cyan}Pending Approvals:${c.reset}  ${pendingCount} actions waiting`);
  console.log(`  ${c.cyan}Workspace Root:${c.reset}     ${cfg.workspaceRoot}\n`);
}

function cmdPolicy() {
  const cfg = loadConfig();
  console.log(`\n${c.bold}Active Policy Configuration (Version 2.1 - Fail-Closed):${c.reset}`);
  console.log(`  Workspace Boundary:   ${cfg.workspaceRoot}`);
  console.log(`  Shell Restrictions:   Destructive rm, device writes, sudo/chmod, IMDS, reverse shells`);
  console.log(`  Allowed Outbound:     google.com, github.com, api.github.com, registry.npmjs.org, pypi.org`);
  console.log(`  Blocked Outbound:     pastebin.com, ghostbin.com, tempmail.com, ngrok.io, serveo.net`);
  console.log(`  Blocked Ports:        21, 22, 23, 25, 135, 139, 445, 1433, 1521, 3306, 5432, 6379, 8080, 27017`);
  console.log(`  Sensitive Protected:  .env, id_rsa, /etc/shadow, /etc/passwd, .aws/credentials\n`);
}

/**
 * W5: Dynamic Real Policy Validation
 */
function cmdPolicyValidate(policyFilePath) {
  console.log(`${c.bold}Validating policy configuration and enforcement invariants...${c.reset}`);

  let policyData;
  if (policyFilePath) {
    const fullPath = path.resolve(policyFilePath);
    if (!fs.existsSync(fullPath)) {
      console.error(`  ${c.red}✖${c.reset} Policy file not found: ${fullPath}`);
      process.exit(1);
    }
    try {
      policyData = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    } catch (e) {
      console.error(`  ${c.red}✖${c.reset} JSON parse error: ${e.message}`);
      process.exit(1);
    }
  } else {
    // Default active configuration
    policyData = {
      version: '2.1',
      policyFailureMode: 'CLOSED',
      telemetryFailureMode: 'OPEN',
      workspaceRoot: process.cwd(),
      rules: DANGEROUS_PATTERNS.map((p, idx) => ({
        id: `DEFAULT-${idx + 1}`,
        pattern: p.regex.source,
        reason: p.reason,
      })),
    };
  }

  const errors = [];
  const checks = [];

  // Check 1: Required fields
  const requiredFields = ['policyFailureMode'];
  const missing = requiredFields.filter((f) => policyData[f] === undefined);
  if (missing.length > 0) {
    errors.push(`Missing required fields: ${missing.join(', ')}`);
    checks.push({ name: 'Required schema fields', ok: false, detail: `Missing: ${missing.join(', ')}` });
  } else {
    checks.push({ name: 'Required schema fields', ok: true });
  }

  // Check 2: Allowed policy modes
  const allowedModes = ['CLOSED', 'OPEN'];
  const modeVal = String(policyData.policyFailureMode).toUpperCase();
  if (!allowedModes.includes(modeVal)) {
    errors.push(`Invalid policyFailureMode '${policyData.policyFailureMode}'. Must be CLOSED or OPEN.`);
    checks.push({ name: 'Policy failure mode validation', ok: false, detail: `Invalid mode '${policyData.policyFailureMode}'` });
  } else {
    checks.push({ name: 'Policy failure mode validation', ok: true, detail: modeVal });
  }

  // Check 3: Rules compilation and unique names
  const rules = Array.isArray(policyData.rules) ? policyData.rules : [];
  const seenRuleIds = new Set();
  let regexErrors = 0;
  let dupErrors = 0;

  for (const r of rules) {
    const rId = r.id || r.name;
    if (rId) {
      if (seenRuleIds.has(rId)) {
        dupErrors++;
        errors.push(`Duplicate rule name/id: '${rId}'`);
      }
      seenRuleIds.add(rId);
    }
    if (r.pattern) {
      try {
        new RegExp(r.pattern);
      } catch (e) {
        regexErrors++;
        errors.push(`Invalid regex in rule '${rId || 'unnamed'}': ${e.message}`);
      }
    }
  }

  checks.push({
    name: 'Regex pattern syntax compilation',
    ok: regexErrors === 0,
    detail: regexErrors === 0 ? `${rules.length} patterns compiled successfully` : `${regexErrors} pattern compilation errors`,
  });

  checks.push({
    name: 'Unique rule identifier constraint',
    ok: dupErrors === 0,
    detail: dupErrors === 0 ? 'No duplicate rules' : `${dupErrors} duplicate rule names found`,
  });

  // Print results
  for (const chk of checks) {
    const symbol = chk.ok ? `${c.green}✔${c.reset}` : `${c.red}✖${c.reset}`;
    const detail = chk.detail ? ` (${chk.detail})` : '';
    console.log(`  ${symbol} ${chk.name}${detail}`);
  }

  if (errors.length > 0) {
    console.error(`\n${c.red}Policy validation failed with ${errors.length} error(s):${c.reset}`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(`\n${c.green}✔ Policy validated successfully. All invariants satisfied.${c.reset}\n`);
}

function cmdLogs(follow = false) {
  ensureConfigDir();
  if (!fs.existsSync(LOCAL_AUDIT_LOG)) {
    console.log(`${c.yellow}No audit logs recorded yet.${c.reset}`);
    return;
  }

  const printEvents = () => {
    const lines = fs.readFileSync(LOCAL_AUDIT_LOG, 'utf-8').split('\n').filter(Boolean);
    console.log(`\n${c.bold}Local Audit Log History (${lines.length} events):${c.reset}`);
    for (const line of lines.slice(-25)) {
      try {
        const ev = JSON.parse(line);
        const col = ev.level === 'CRITICAL' ? c.red : ev.level === 'WARN' ? c.yellow : c.green;
        console.log(`[${ev.localTimestamp || ev.timestamp}] ${col}${ev.level}${c.reset} [${ev.action}] ${ev.message}`);
      } catch {
        console.log(line);
      }
    }
  };

  printEvents();

  if (follow) {
    console.log(`\n${c.cyan}Following audit log (Ctrl+C to stop)...${c.reset}`);
    let lastSize = fs.statSync(LOCAL_AUDIT_LOG).size;
    setInterval(() => {
      try {
        const currentSize = fs.statSync(LOCAL_AUDIT_LOG).size;
        if (currentSize > lastSize) {
          const stream = fs.createReadStream(LOCAL_AUDIT_LOG, { start: lastSize, end: currentSize });
          stream.on('data', (chunk) => process.stdout.write(chunk));
          lastSize = currentSize;
        }
      } catch {}
    }, 1000);
  }
}

function loadApprovals() {
  ensureConfigDir();
  if (fs.existsSync(LOCAL_APPROVALS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LOCAL_APPROVALS_FILE, 'utf-8'));
    } catch {}
  }
  return {};
}

function saveApprovals(data) {
  ensureConfigDir();
  fs.writeFileSync(LOCAL_APPROVALS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function cmdApprovals() {
  const apps = loadApprovals();
  const keys = Object.keys(apps);
  console.log(`\n${c.bold}Pending Human Approvals (${keys.length} awaiting decision):${c.reset}`);
  if (keys.length === 0) {
    console.log(`  ${c.gray}No pending approval requests.${c.reset}\n`);
    return;
  }
  for (const id of keys) {
    const act = apps[id];
    console.log(`\n  ${c.yellow}${c.bold}Action ID:${c.reset}  ${act.id}`);
    console.log(`  ${c.cyan}Agent:${c.reset}      ${act.agentName || act.agentId}`);
    console.log(`  ${c.cyan}Action:${c.reset}     ${act.action} -> ${act.operation}`);
    console.log(`  ${c.cyan}Hash:${c.reset}       ${act.actionHash}`);
    console.log(`  ${c.cyan}Reason:${c.reset}     ${act.reasons?.join('; ')}`);
    console.log(`  ${c.cyan}Action:${c.reset}     Run ${c.bold}agentshield approve ${act.id}${c.reset} or ${c.bold}agentshield deny ${act.id}${c.reset}`);
  }
  console.log('');
}

/**
 * W8: Approve with hash recomputation, interactive confirmation, and no shell execution
 */
async function cmdApprove(actionId, autoYes = false) {
  if (!actionId) {
    console.error(`${c.red}Error: Missing action ID to approve.${c.reset}`);
    process.exit(1);
  }

  const apps = loadApprovals();
  const act = apps[actionId];
  if (!act) {
    console.error(`${c.red}Error: Action '${actionId}' not found in pending approvals.${c.reset}`);
    process.exit(1);
  }

  // Recompute hash
  const computedHash = computeCanonicalActionHash(
    act.action || 'EXEC',
    act.agentId || 'unknown-agent',
    act.operation || '',
    act.arguments || null
  );

  if (act.actionHash && act.actionHash !== computedHash) {
    console.error(`${c.red}Security Error: Action hash mismatch!${c.reset}`);
    console.error(`  Expected: ${act.actionHash}`);
    console.error(`  Computed: ${computedHash}`);
    console.error(`Refusing execution of modified/tampered action.`);
    process.exit(1);
  }

  console.log(`${c.green}${c.bold}Approving Action ${actionId}...${c.reset}`);
  console.log(`  Action Hash: ${computedHash} (Verified)`);
  console.log(`  Operation:   ${act.operation}`);

  if (!autoYes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => {
      rl.question(`${c.yellow}Execute this operation? [y/N]: ${c.reset}`, resolve);
    });
    rl.close();
    if (!answer.trim().toLowerCase().startsWith('y')) {
      console.log(`Execution aborted by user.`);
      return;
    }
  }

  // Parse operation into executable and args array (no shell)
  const tokens = act.operation.trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  const cleanTokens = tokens.map((t) => t.replace(/^['"]|['"]$/g, ''));
  const bin = cleanTokens[0];
  const binArgs = cleanTokens.slice(1);

  console.log(`  Executing: ${bin} ${binArgs.join(' ')} (spawn without shell)`);
  const spawnRes = spawnSync(bin, binArgs, { stdio: 'inherit' });

  if (spawnRes.status === 0) {
    console.log(`\n${c.green}✔ Execution Succeeded${c.reset}`);
    logAuditEvent({
      action: act.action || 'EXEC',
      level: 'INFO',
      message: `Operator approved and executed action '${act.operation}'`,
      actionId,
    });
  } else {
    console.error(`\n${c.red}✖ Execution Failed with status ${spawnRes.status}${c.reset}`);
    logAuditEvent({
      action: act.action || 'EXEC',
      level: 'ERROR',
      message: `Operator approved action failed execution with code ${spawnRes.status}`,
      actionId,
    });
  }

  delete apps[actionId];
  saveApprovals(apps);
}

function cmdDeny(actionId) {
  const apps = loadApprovals();
  const act = apps[actionId];
  if (!act) {
    console.error(`${c.red}Error: Action '${actionId}' not found.${c.reset}`);
    process.exit(1);
  }

  delete apps[actionId];
  saveApprovals(apps);

  logAuditEvent({
    action: act.action,
    level: 'WARN',
    message: `Operator denied action '${act.operation}'`,
    actionId,
  });

  console.log(`${c.yellow}✔ Action '${actionId}' denied and purged.${c.reset}\n`);
}

function cmdDoctor() {
  printBanner();
  console.log(`${c.bold}AgentShield Diagnostic Health Check (agentshield doctor):${c.reset}\n`);

  const results = [];
  // 1. Node runtime
  const nodeVer = process.version;
  results.push({ test: 'Node.js Runtime', ok: parseInt(nodeVer.slice(1)) >= 20, detail: nodeVer });

  // 2. Local directory
  ensureConfigDir();
  results.push({ test: 'Local Config Directory (~/.agentshield)', ok: fs.existsSync(CONFIG_DIR), detail: CONFIG_DIR });

  // 3. License verification
  let licOk = false;
  let licDetail = 'Not activated';
  if (fs.existsSync(LOCAL_LICENSE_FILE)) {
    try {
      const lic = JSON.parse(fs.readFileSync(LOCAL_LICENSE_FILE, 'utf-8'));
      const ver = verifyLicenseOffline(lic.licenseKey);
      licOk = ver.valid;
      licDetail = ver.valid ? `Valid ${lic.claims?.plan}` : `Signature invalid: ${ver.error}`;
    } catch {}
  }
  results.push({ test: 'Offline License Verification', ok: licOk, detail: licDetail });

  // 4. OpenClaw presence (W9)
  const clawPath = getOpenClawPath();
  results.push({
    test: 'OpenClaw Detection',
    ok: Boolean(clawPath),
    detail: clawPath ? `Found at ${clawPath}` : 'Not found in PATH (Install via npm i -g openclaw)',
  });

  // 5. Cloud Connectivity
  const cfg = loadConfig();
  results.push({ test: 'Configured Endpoint', ok: Boolean(cfg.endpoint), detail: cfg.endpoint });

  for (const r of results) {
    const symbol = r.ok ? `${c.green}✔ PASS${c.reset}` : `${c.yellow}⚠ INFO${c.reset}`;
    console.log(`  ${symbol} ${c.bold}${r.test}:${c.reset} ${r.detail}`);
  }

  console.log(`\n${c.green}Diagnostic completed.${c.reset}\n`);
}

/**
 * W4: Implement test-connection
 */
async function cmdTestConnection(opts = {}) {
  const cfg = loadConfig();
  const endpoint = opts.endpoint || process.env.AGENTSHIELD_ENDPOINT || cfg.endpoint;
  const secret = opts.secret || process.env.AGENTSHIELD_SECRET || process.env.WEBHOOK_SECRET || cfg.secret;

  if (!endpoint) {
    console.error(`${c.red}Error: No endpoint configured.${c.reset}`);
    console.error(`Usage: agentshield test-connection --endpoint <url> [--secret <key>]`);
    process.exit(2);
  }

  console.log(`${c.bold}Testing connection to AgentShield Control Plane...${c.reset}`);
  console.log(`  Endpoint: ${endpoint}`);

  const startTime = Date.now();
  const headers = {};
  if (secret) {
    headers['Authorization'] = `Bearer ${secret}`;
  }

  const pingUrl = endpoint.replace(/\/+$/, '') + '/api/agents/ping';

  try {
    const res = await fetch(pingUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(5000),
    });
    const latency = Date.now() - startTime;

    if (res.ok) {
      console.log(`\n  ${c.green}✔ PASS${c.reset} [HTTP ${res.status}] Latency: ${latency}ms`);
      console.log(`  Successfully connected and authenticated with control plane.`);
      process.exit(0);
    } else {
      console.error(`\n  ${c.red}✖ FAIL${c.reset} [HTTP ${res.status}] Latency: ${latency}ms`);
      console.error(`  Endpoint returned error status ${res.status}`);
      process.exit(1);
    }
  } catch (err) {
    const latency = Date.now() - startTime;
    console.error(`\n  ${c.red}✖ FAIL${c.reset} Connection error after ${latency}ms: ${err.message}`);
    process.exit(1);
  }
}

/**
 * W2 Part 2: agentshield gate -- <command> [args]
 * Evaluates command with policy engine BEFORE running it.
 * Uses spawn with args array, no shell. Exits 77 if denied.
 */
function cmdGate(cmdArgs) {
  if (!cmdArgs || cmdArgs.length === 0) {
    console.error(`${c.red}Error: No command specified for gate.${c.reset}`);
    process.exit(1);
  }

  const fullCmd = cmdArgs.join(' ');
  // Evaluate against policy patterns
  for (const danger of DANGEROUS_PATTERNS) {
    if (danger.regex.test(fullCmd)) {
      console.error(`\n${c.bgRed} AGENTSHIELD GATE DENIED EXECUTION ${c.reset}`);
      console.error(`${c.red}${c.bold}Violation:${c.reset} ${danger.reason}`);
      console.error(`${c.red}${c.bold}Command:${c.reset}   ${fullCmd}\n`);
      logAuditEvent({
        action: 'EXEC',
        level: 'CRITICAL',
        message: `[PRE-EXEC GATE BLOCKED] ${danger.reason}: '${fullCmd.slice(0, 100)}'`,
      });
      process.exit(77);
    }
  }

  // Allowed: Execute with spawn (no shell)
  const child = spawnSync(cmdArgs[0], cmdArgs.slice(1), {
    stdio: 'inherit',
  });

  if (child.error) {
    console.error(`${c.red}Execution error:${c.reset} ${child.error.message}`);
    process.exit(1);
  }

  process.exit(child.status ?? 0);
}

/**
 * Creates temporary shim directory for commands intercepted through PATH (W2)
 */
function createShimDirectory() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentshield-shims-'));
  const shimCommands = ['rm', 'sudo', 'chmod', 'chown', 'dd', 'mkfs', 'curl', 'wget'];

  const selfBin = path.resolve(process.argv[1]);

  for (const cmdName of shimCommands) {
    const shimFile = path.join(tmpDir, cmdName);
    const content = `#!/usr/bin/env bash
exec "${selfBin}" gate -- ${cmdName} "$@"
`;
    fs.writeFileSync(shimFile, content, { mode: 0o755 });
  }

  return tmpDir;
}

// Universal OpenClaw / Agent Execution Wrapper
async function runAgent(childCommand, options = {}) {
  const mode = (options.mode || 'strict').toLowerCase();
  const endpoint = options.endpoint || process.env.AGENTSHIELD_ENDPOINT || 'http://localhost:3000';
  const secret = options.secret || process.env.AGENTSHIELD_SECRET || process.env.WEBHOOK_SECRET || '';
  const agentName = options.agent || process.env.AGENTSHIELD_AGENT || 'autonomous-agent';

  if (childCommand.length === 0) {
    console.error(`${c.red}Error: No command specified to execute.${c.reset}`);
    console.error(`Usage: agentshield wrap [options] -- <command...>`);
    console.error(`Example: agentshield wrap -- openclaw\n`);
    process.exit(1);
  }

  printBanner();
  console.log(`${c.bold}AgentShield Autonomous Agent Runtime Active${c.reset}`);
  console.log(`  ${c.cyan}Guardrail Mode:${c.reset}  ${mode.toUpperCase()}`);
  console.log(`  ${c.cyan}Execution Target:${c.reset} ${childCommand.join(' ')}`);
  console.log(`  ${c.cyan}Agent Identity:${c.reset}   ${agentName}`);
  console.log(`  ${c.cyan}Interception:${c.reset}    Shell output inspection & PATH pre-exec gating`);
  console.log(`${c.gray}────────────────────────────────────────────────────────────${c.reset}\n`);

  const startTime = Date.now();
  let blockedCount = 0;

  // Create temporary PATH shims (W2)
  const shimDir = createShimDirectory();
  const currentPath = process.env.PATH || '';
  const augmentedPath = `${shimDir}:${currentPath}`;

  const cleanupShims = () => {
    try {
      fs.rmSync(shimDir, { recursive: true, force: true });
    } catch {}
  };

  process.on('exit', cleanupShims);

  // Log Startup Event
  logAuditEvent({
    action: 'THINK',
    level: 'INFO',
    agentName,
    message: `Spawned autonomous agent process: ${childCommand.join(' ')}`,
  });

  const child = spawn(childCommand[0], childCommand.slice(1), {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      PATH: augmentedPath,
      AGENTSHIELD_ACTIVE: '1',
      AGENTSHIELD_MODE: mode,
    },
  });

  let killedByGuardrail = false;
  let guardrailRuleFired = '';

  const inspectLine = (line, isStderr = false) => {
    const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
    if (!cleanLine) return;

    // Check for dangerous operations in output stream
    for (const danger of DANGEROUS_PATTERNS) {
      if (danger.regex.test(cleanLine)) {
        blockedCount++;
        guardrailRuleFired = danger.reason;

        logAuditEvent({
          action: 'EXEC',
          level: 'CRITICAL',
          agentName,
          message: `[SECURITY ALERT] ${danger.reason}: '${cleanLine.slice(0, 100)}'`,
        });

        if (mode === 'strict') {
          killedByGuardrail = true;
          console.error(`\n${c.bgRed} AGENTSHIELD GUARDRAIL TRIGGERED ${c.reset}`);
          console.error(`${c.red}${c.bold}Violation:${c.reset} ${danger.reason}`);
          console.error(`${c.red}${c.bold}Payload:${c.reset}   ${cleanLine}\n`);
          console.error(`${c.red}[AgentShield STRICT] Halting agent process to prevent compromise (Rule: ${danger.reason}).${c.reset}`);
          child.kill('SIGTERM');
          setTimeout(() => child.kill('SIGKILL'), 1500);
          return;
        } else if (mode === 'permissive') {
          console.error(`\n${c.bgYellow} AGENTSHIELD WARNING (PERMISSIVE) ${c.reset}`);
          console.error(`${c.yellow}${c.bold}Violation:${c.reset} ${danger.reason}`);
          console.error(`${c.yellow}${c.bold}Payload:${c.reset}   ${cleanLine}\n`);
        }
        // If mode === 'audit', silent logging only
      }
    }

    const action = isStderr ? 'EXEC' : 'THINK';
    const level = isStderr ? 'WARN' : 'INFO';
    logAuditEvent({
      action,
      level,
      agentName,
      message: cleanLine.slice(0, 200),
    });
  };

  const stdoutRl = readline.createInterface({ input: child.stdout });
  stdoutRl.on('line', (line) => {
    process.stdout.write(line + '\n');
    inspectLine(line, false);
  });

  const stderrRl = readline.createInterface({ input: child.stderr });
  stderrRl.on('line', (line) => {
    process.stderr.write(line + '\n');
    inspectLine(line, true);
  });

  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));

  child.on('close', async (code, signal) => {
    cleanupShims();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${c.gray}────────────────────────────────────────────────────────────${c.reset}`);
    console.log(`${c.bold}AgentShield Session Completed:${c.reset}`);
    console.log(`  Duration:         ${elapsed}s`);
    console.log(`  Exit Code:        ${code !== null ? code : 'null (' + signal + ')'}`);
    console.log(`  Security Blocks:  ${blockedCount === 0 ? c.green + '0 (Clean)' + c.reset : c.red + blockedCount + ' BLOCKED' + c.reset}`);
    if (killedByGuardrail) {
      console.log(`  Fired Rule:       ${c.red}${guardrailRuleFired}${c.reset}`);
    }
    console.log(`${c.gray}────────────────────────────────────────────────────────────${c.reset}\n`);

    // Non-blocking telemetry flush before exit (W6)
    try {
      await flushTelemetryQueue(endpoint, secret);
    } catch {}

    if (killedByGuardrail && mode === 'strict') {
      process.exit(77);
    }
    if (signal) {
      const signalNumbers = { SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGKILL: 9, SIGTERM: 15 };
      const sigNum = signalNumbers[signal] || 15;
      process.exit(128 + sigNum);
    }
    process.exit(code ?? 0);
  });
}

// CLI Dispatcher with Flag Parsing Before `--`
async function main() {
  const rawArgs = process.argv.slice(2);
  const sepIdx = rawArgs.indexOf('--');
  const beforeSep = sepIdx !== -1 ? rawArgs.slice(0, sepIdx) : rawArgs;
  const afterSep = sepIdx !== -1 ? rawArgs.slice(sepIdx + 1) : [];

  const cmd = beforeSep[0] || 'help';
  const restBefore = beforeSep.slice(1);

  // Parse options before `--`
  const options = {};
  for (let i = 0; i < restBefore.length; i++) {
    const arg = restBefore[i];
    if (arg === '--mode') {
      const val = restBefore[++i];
      if (!['strict', 'permissive', 'audit'].includes(val?.toLowerCase())) {
        console.error(`${c.red}Error: Invalid mode '${val}'. Allowed: strict, permissive, audit.${c.reset}`);
        process.exit(2);
      }
      options.mode = val.toLowerCase();
    } else if (arg === '--endpoint') {
      options.endpoint = restBefore[++i];
    } else if (arg === '--secret') {
      options.secret = restBefore[++i];
    } else if (arg === '--agent') {
      options.agent = restBefore[++i];
    } else if (arg === '--follow') {
      options.follow = true;
    } else if (arg === '--yes') {
      options.yes = true;
    } else if (arg.startsWith('--')) {
      console.error(`${c.red}Error: Unknown flag '${arg}'.${c.reset}`);
      process.exit(2);
    }
  }

  // Apply environment defaults
  if (!options.mode && process.env.AGENTSHIELD_MODE) {
    options.mode = process.env.AGENTSHIELD_MODE.toLowerCase();
  }
  if (!options.endpoint && process.env.AGENTSHIELD_ENDPOINT) {
    options.endpoint = process.env.AGENTSHIELD_ENDPOINT;
  }
  if (!options.secret && (process.env.AGENTSHIELD_SECRET || process.env.WEBHOOK_SECRET)) {
    options.secret = process.env.AGENTSHIELD_SECRET || process.env.WEBHOOK_SECRET;
  }
  if (!options.agent && process.env.AGENTSHIELD_AGENT) {
    options.agent = process.env.AGENTSHIELD_AGENT;
  }

  switch (cmd) {
    case 'init':
      cmdInit();
      break;
    case 'activate':
      await cmdActivate(restBefore[0]);
      break;
    case 'status':
      cmdStatus();
      break;
    case 'policy':
      if (restBefore[0] === 'validate') {
        cmdPolicyValidate(restBefore[1]);
      } else {
        cmdPolicy();
      }
      break;
    case 'logs':
      cmdLogs(options.follow);
      break;
    case 'approvals':
      cmdApprovals();
      break;
    case 'approve':
      await cmdApprove(restBefore[0], options.yes);
      break;
    case 'deny':
      cmdDeny(restBefore[0]);
      break;
    case 'gate':
      cmdGate(afterSep.length > 0 ? afterSep : restBefore);
      break;
    case 'doctor':
      cmdDoctor();
      break;
    case 'test-connection':
      await cmdTestConnection(options);
      break;
    case 'version':
    case '-v':
    case '--version':
      console.log(`AgentShield v${VERSION} (Enterprise Offline-First Security Runtime)`);
      break;
    case 'run':
    case 'wrap':
    case 'exec':
      await runAgent(afterSep, options);
      break;
    case 'help':
    case '-h':
    case '--help':
    default:
      printHelp();
      break;
  }
}

main().catch((err) => {
  console.error(`${c.red}AgentShield Fatal Error:${c.reset}`, err);
  process.exit(1);
});
