# AgentShield: Universal Autonomous Agent Guardrail & Observability Platform

<div align="center">

<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# Production AI Agent Security Wrapper & Real-Time Observer

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Production%20Ready-black?style=flat&logo=vercel)](https://vercel.com)
[![Next.js 15](https://img.shields.io/badge/Next.js-15.4-black?style=flat&logo=next.js)](https://nextjs.org)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat&logo=typescript)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)

</div>

AgentShield provides universal runtime interception, deterministic policy gating, and real-time observability for autonomous AI agents (**OpenClaw**, **Nous Hermes 3**, **AutoGPT**, **CrewAI**, **LangChain**, and custom Python/Node agentic loops).

---

## 🚀 Live Commercial Deployment on Vercel

AgentShield is pre-configured for zero-friction commercial deployment on **Vercel**:

### Option 1: Instant Deployment via Vercel CLI
```bash
# 1. Install or update the Vercel CLI
npm i -g vercel

# 2. Deploy directly to production
vercel --prod
```

### Option 2: Continuous Deployment with Git
1. Push this repository to **GitHub**, **GitLab**, or **Bitbucket**.
2. Go to the [Vercel Dashboard](https://vercel.com/new) and click **"Add New Project"**.
3. Import this repository. Next.js App Router and serverless functions will be configured automatically.
4. Set the following environment variables in your Vercel Project Settings:

| Environment Variable | Description | Recommended Production Value |
|---|---|---|
| `WEBHOOK_SECRET` | Bearer token for agent telemetry and action authorization | `sec_live_prod_948f2a` |
| `AGENTSHIELD_SECRET` | Secret for SDK & CLI pre-execution evaluation | `sec_live_prod_948f2a` |
| `POLICY_FAILURE_MODE` | Guardrail default if policy engine fails | `CLOSED` |
| `TELEMETRY_FAILURE_MODE`| Non-blocking agent execution mode | `OPEN` |
| `NEXT_PUBLIC_COST_PER_MILLION`| FinOps cost rate per 1M tokens | `0.50` |

> **Serverless Persistence:** In Vercel environments, AgentShield writes audit records to `/tmp/.agentshield` with an in-memory hot cache, preventing read-only filesystem errors. Cross-origin CORS headers are active on all `/api/*` routes.

---

## 💻 Running the CLI on Local or Cloud Machines

Once deployed to Vercel (or hosted locally), customers and developers can run the `agentshield` CLI directly on their machines to intercept, monitor, and protect their agents.

### 1. Zero-Install Execution via NPX (Recommended)
Wrap any agent process without installing any packages globally:

```bash
# Wrap a local Python agent
npx agentshield wrap \
  --endpoint https://your-shield.vercel.app \
  --secret sec_live_prod_948f2a \
  --agent "Hermes-Production" \
  -- python agent.py

# Wrap an OpenClaw or AutoGPT agent in strict safety mode
npx agentshield wrap \
  --endpoint https://your-shield.vercel.app \
  --secret sec_live_prod_948f2a \
  --mode strict \
  -- npx openclaw run
```

### 2. Verify Live Connection
Test that your agent machine can reach and authenticate with your live Vercel web app:

```bash
npx agentshield test-connection \
  --endpoint https://your-shield.vercel.app \
  --secret sec_live_prod_948f2a
```

### 3. One-Line Curl Installer (Cloud VMs & CI/CD)
Run directly from AWS EC2, GCP Compute Engine, Kubernetes, or GitHub Actions:

```bash
curl -sSL https://your-shield.vercel.app/api/cli/install.sh | bash -s -- wrap \
  --endpoint https://your-shield.vercel.app \
  --secret sec_live_prod_948f2a \
  -- python3 agent.py
```

### 4. In-Process Python SDK
Decorate tool functions inside your Python codebase for pre-execution guardrails and cryptographic action hashing:

```python
from agentshield_client import AgentShieldClient

shield = AgentShieldClient(
    endpoint_url="https://your-shield.vercel.app",
    api_secret="sec_live_prod_948f2a",
    agent_name="Hermes-Worker",
    policy_failure_mode="CLOSED"
)

@shield.protect_tool(action="EXEC")
def run_bash_command(cmd: str):
    import subprocess
    return subprocess.check_output(cmd, shell=True).decode()
```

---

## 🛡️ Security Guardrails & Enforced Invariants

- **Destructive Command Blocking:** Intercepts and blocks commands like `rm -rf /`, `> /dev/sdX`, fork bombs `:(){ :|:& };:`, and raw disk overwrites.
- **Privilege Escalation Prevention:** Prohibits `sudo`, `chmod 777`, and `chown root` invocations.
- **SSRF & Cloud Metadata Protection:** Blocks attempts to reach AWS/GCP/Azure instance metadata endpoints (`169.254.169.254`, `metadata.google.internal`) and loopback addresses.
- **Path Traversal Containment:** Restricts file reads and writes within configured workspace boundaries, preventing exfiltration of `/etc/shadow`, `.env`, and private SSH keys.
- **Cryptographic Action Hashing:** Computes deterministic SHA-256 hashes of proposed tool actions (`action + operation + arguments + agentId`), preventing time-of-check to time-of-use (TOCTOU) tampering.
- **Human-in-the-Loop Approvals:** High-risk actions can be suspended in a pending queue until approved by an operator in the live dashboard.
- **FinOps Intelligence:** Real-time token tracking and cost projection based on model token rates.

---

## 🧪 Automated Test Suite

To run all automated security and enforcement tests:

```bash
npm test
```

Includes 18 verification suites covering path normalization, SSRF prevention, fail-closed policy defaults, cryptographic action hashing, secret redaction, and Vercel serverless persistence.

---

## 📄 License
MIT © AgentShield
