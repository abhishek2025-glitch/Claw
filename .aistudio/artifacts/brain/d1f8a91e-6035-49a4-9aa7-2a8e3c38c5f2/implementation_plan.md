# AgentShield (Claw) — Round 2 Implementation Plan

This plan addresses all remaining issues identified in commit `d9b3582` across build hygiene, CLI wrapper functionality, pre-execution gating, and verification, while preserving all Round 1 fixes (licensing, Dodo billing foundation, auth, exit-code passthrough, and existing 23 passing tests).

---

## Architecture & Scope Boundaries

1. **Monorepo Layout**:
   - `packages/cli/`: Lightweight standalone package published as `agentshield`. Zero npm dependencies; uses only Node.js 20+ built-ins. Contains its own `package.json`, `bin/agentshield.mjs`, `README.md`, `LICENSE`.
   - Root project: Marked `"private": true`, hosts the Next.js 15 dashboard, API routes, and SDKs.
2. **Execution Guarantee**:
   - Explicit guarantee documented in banner, help, and README: Monitors agent output and stops the agent on matching patterns; does not sandbox arbitrary file or network syscalls.
   - Pre-execution command gate: `agentshield gate -- <command> [args]` and ephemeral shim scripts on `PATH` for critical commands (`rm`, `sudo`, `chmod`, `chown`, `dd`, `mkfs`, `curl`, `wget`).
3. **Licensing**:
   - Standard MIT license file added as requested by default.

---

## Proposed Changes

### Phase A: Build & Repo Hygiene

#### [H1 & H6] Lockfile & Clean Installs
- Delete `bun.lock`.
- Remove unneeded `firebase-tools` from `package.json`.
- Set `"engines": { "node": ">=20" }` in `package.json` and create `.nvmrc` with `22`.
- Run `npm audit fix` (non-breaking) and regenerate `package-lock.json`.
- Document remaining Next.js / PostCSS advisory: Next.js 15 is explicitly pinned by prompt requirements; upgrading to Next 16 involves breaking changes.

#### [H2] Untrack Runtime Files & Whitelist Artifacts
- Remove from Git cache: `.agentshield`, `.test-workspace`, `tsconfig.tsbuildinfo`.
- Add `.agentshield/`, `.test-workspace/`, `*.tsbuildinfo` to `.gitignore`.
- Add `"files": ["bin/", "README.md", "LICENSE"]` in `package.json`.
- Update `test/enforcement.test.ts` to create isolated workspaces in `os.tmpdir()` and clean up on process exit.

#### [H3] Standalone CLI Package
- Create `packages/cli/package.json` (zero dependencies, `engines.node >= 20`, bin `bin/agentshield.mjs`).
- Copy `bin/agentshield.mjs`, `README.md`, and `LICENSE` to `packages/cli/`.
- Ensure `npm pack --dry-run` produces a package under 5 MB with sub-second install times.

#### [H4] Secret Scrubbing
- Replace all 7 instances of `sec_live_prod_948f2a` in `README.md` with `<generate-a-long-random-secret>` and add instructions to generate secrets with `openssl rand -hex 32`.
- Ensure test files only use obviously synthetic dummy secrets (`dummy_secret_test_xyz`).

#### [H5] LICENSE File
- Add root `LICENSE` file containing the standard MIT License (2026 AgentShield Contributors).

---

### Phase B: CLI & Wrapper Bug Fixes

#### [W3] CLI Flag Parsing Before `--`
- Update `bin/agentshield.mjs` to parse flags before `--`: `--mode <strict|permissive|audit>`, `--endpoint <url>`, `--secret <key>`, `--agent <name>`.
- Support env fallbacks: `AGENTSHIELD_MODE`, `AGENTSHIELD_ENDPOINT`, `AGENTSHIELD_SECRET`, `AGENTSHIELD_AGENT`.
- Unknown flags print an error and exit with code `2`.
- Enforce mode semantics:
  - `strict`: Kills agent on matching pattern and exits with code `77`.
  - `permissive`: Prints warning and allows agent to run; exits with agent's own code.
  - `audit`: Only logs without warning or blocking.

#### [W4] Implement `test-connection`
- In `bin/agentshield.mjs`, implement `test-connection`:
  - Validates configured endpoint and secret (exits 2 if unconfigured).
  - Performs authenticated HTTP GET to `${endpoint}/api/agents/ping` (or `/api/metrics`) with a 5-second timeout.
  - Prints HTTP status code, latency (ms), and `PASS` or `FAIL`. Exits 0 on success, 1 on failure.

#### [W5] Real Policy Validation
- In `bin/agentshield.mjs`, implement real validation for `policy validate <file>`:
  - Parses JSON; validates required fields (`version`, `policyFailureMode`, rules).
  - Compiles all regex patterns to verify syntax.
  - Checks for duplicate rule names.
  - Prints per-check results and details of any failing rules. Exits 1 if invalid, 0 if valid.

#### [W7] Narrow Device Write Pattern & Fix `/dev/null` False Positives
- Refine device write regex: Target block/raw devices (`/dev/sd[a-z0-9]*`, `/dev/nvme[0-9a-z]*`, `/dev/hd[a-z0-9]*`, `/dev/disk/.*`, `/dev/mmcblk[0-9a-z]*`).
- Explicitly exclude harmless streams: `/dev/null`, `/dev/zero`, `/dev/stdout`, `/dev/stderr`, `/dev/tty`.

#### [W2] Command Gating (`agentshield gate`) & Shim Directory
- Banner & README statement: "Monitors agent output and stops the agent on matching patterns; it does not sandbox file or network access."
- Add `agentshield gate -- <command> [args]`:
  - Evaluates command and arguments against the policy engine before execution.
  - Runs with `child_process.spawn(cmd, args, { stdio: 'inherit' })` (no shell). If denied by policy, prints denial reason and exits with `77` without executing.
- In `agentshield wrap`:
  - Generates an ephemeral shim directory containing wrappers for `rm`, `sudo`, `chmod`, `chown`, `dd`, `mkfs`, `curl`, `wget`.
  - Prepends this directory to `PATH` for the child process.
  - Cleans up the shim directory on exit.

---

### Phase C: Unverified Features, Hardening & CI

1. **W6 Telemetry Upload**: Ensure background queue uploads to `<endpoint>/api/webhook` with backoff; agent execution never blocks on network failures.
2. **W8 Action Approval (`agentshield approve`)**: Recompute SHA-256 action hash identically to server; prompt unless `--yes` is passed; execute with `spawn` (no shell).
3. **W9 Portability**: Use `where` on Windows and `command -v` on POSIX; respect `AGENTSHIELD_OPENCLAW_PATH`.
4. **L8 Persistence**: Verify Postgres and JSON storage adapters across operations.
5. **H7 CORS**: In `vercel.json`, restrict `/api/*` to trusted origins while leaving public endpoints (`/api/cli/install.sh`) open.
6. **CI**: Create `.github/workflows/ci.yml` with Node 22, `npm ci`, typecheck, lint, test, and build.

---

## Verification Plan

### Automated Test Suites
- Run `npm test` verifying both `test/enforcement.test.ts` and `test/license.test.ts`.
- Add integration tests for:
  - Permissive vs. strict mode exit codes (`0` vs. `77`).
  - `/dev/null` harmless output allowed; `/dev/sda` blocked.
  - `policy validate` passing on valid schema and failing on bad regex.
  - `agentshield gate` denying destructive commands.
- Run `npm run typecheck`, `npm run lint`, and `npm run build`.
- Verify `npm pack --dry-run` and clean installation of `packages/cli`.
