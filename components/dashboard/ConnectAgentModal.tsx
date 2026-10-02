'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Terminal,
  Copy,
  Check,
  ShieldCheck,
  Server,
  Zap,
  Activity,
  ArrowRight,
  Code2,
  Cpu,
  RefreshCw,
} from 'lucide-react';

interface ConnectAgentModalProps {
  onClose: () => void;
}

export function ConnectAgentModal({ onClose }: ConnectAgentModalProps) {
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'npx' | 'curl' | 'python' | 'docker'>('npx');
  const [endpointUrl, setEndpointUrl] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      return window.location.origin;
    }
    return 'https://your-shield.vercel.app';
  });
  const [agentName, setAgentName] = useState('Hermes-Worker');
  const [secretKey, setSecretKey] = useState('sec_live_948f2a');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testResult, setTestResult] = useState<string>('');

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleTestHandshake = async () => {
    setTestStatus('testing');
    setTestResult('');
    const startT = Date.now();

    try {
      const res = await fetch('/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secretKey}`,
        },
        body: JSON.stringify({
          agentId: `test-cli-${Date.now()}`,
          agentName: agentName || 'CLI Agent Verifier',
          action: 'THINK',
          level: 'INFO',
          message: `AgentShield CLI connection handshake test from client terminal.`,
          tokens: 24,
          timestamp: new Date().toISOString(),
          environment: 'production',
        }),
      });

      const latency = Date.now() - startT;
      if (res.ok) {
        setTestStatus('success');
        setTestResult(`Handshake succeeded in ${latency}ms! Ingestion pipeline active.`);
      } else {
        setTestStatus('failed');
        setTestResult(`Server returned HTTP ${res.status}. Check authorization secret.`);
      }
    } catch (err: any) {
      setTestStatus('failed');
      setTestResult(`Connection error: ${err.message}`);
    }
  };

  const npxCommand = `npx agentshield wrap --endpoint ${endpointUrl} --secret ${secretKey} --agent "${agentName}" -- python agent.py`;
  const curlCommand = `curl -sSL ${endpointUrl}/api/cli/install.sh | bash -s -- wrap --endpoint ${endpointUrl} --secret ${secretKey} -- <your-agent-command>`;
  const pythonCode = `import os
from agentshield_client import AgentShieldClient

shield = AgentShieldClient(
    endpoint_url="${endpointUrl}",
    api_secret="${secretKey}",
    agent_name="${agentName}",
    policy_failure_mode="CLOSED"  # Enforces fail-closed safety guardrail
)

@shield.protect_tool(action="EXEC")
def execute_terminal(cmd: str):
    import subprocess
    return subprocess.check_output(cmd, shell=True).decode()`;

  const dockerCommand = `docker run -d \\
  -e AGENTSHIELD_ENDPOINT="${endpointUrl}" \\
  -e AGENTSHIELD_SECRET="${secretKey}" \\
  -e AGENT_NAME="${agentName}" \\
  my-autonomous-agent:latest`;

  return (
    <div className="fixed inset-0 bg-gray-900/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/20 text-emerald-400 p-2 rounded-xl border border-emerald-500/30">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Connect AI Agent via CLI
                <span className="text-[11px] font-mono bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Universal Wrapper v2.1
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Run on your local machine, MacBook, AWS EC2, GCP VM, or cloud container.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Configuration Bar */}
        <div className="bg-slate-950 px-6 py-3 border-b border-slate-800 flex flex-wrap items-center gap-4 text-xs font-mono text-gray-300">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Live Endpoint:</span>
            <span className="text-emerald-400 font-semibold">{endpointUrl}</span>
          </div>
          <div className="h-4 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Agent Name:</span>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-white text-xs w-36 focus:outline-hidden focus:border-emerald-500"
            />
          </div>
          <div className="h-4 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Secret:</span>
            <input
              type="text"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              className="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-white text-xs w-32 focus:outline-hidden focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50 px-6">
          <button
            onClick={() => setActiveTab('npx')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'npx'
                ? 'border-emerald-600 text-emerald-800 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-emerald-600" /> NPX / Zero-Install CLI (Recommended)
          </button>
          <button
            onClick={() => setActiveTab('curl')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'curl'
                ? 'border-emerald-600 text-emerald-800 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-blue-600" /> 1-Line Bash Script
          </button>
          <button
            onClick={() => setActiveTab('python')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'python'
                ? 'border-emerald-600 text-emerald-800 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Code2 className="w-3.5 h-3.5 text-amber-600" /> Python In-Process SDK
          </button>
          <button
            onClick={() => setActiveTab('docker')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'docker'
                ? 'border-emerald-600 text-emerald-800 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-purple-600" /> Docker Container
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'npx' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-1">
                  Run AgentShield Directly with NPX (No Setup Required)
                </h3>
                <p className="text-xs text-gray-600">
                  Wrap any local or cloud command (Python, Node, OpenClaw, AutoGPT, CrewAI, Bash). AgentShield transparently intercepts tool executions, evaluates security policies, strips secrets, and streams live telemetry to your deployment.
                </p>
              </div>

              <div className="relative group">
                <div className="flex items-center justify-between bg-slate-900 px-4 py-2 rounded-t-lg border border-b-0 border-slate-800 text-xs font-mono text-gray-400">
                  <span>Terminal (Mac / Linux / Windows)</span>
                  <button
                    onClick={() => copyToClipboard(npxCommand, 'npx')}
                    className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    {copiedIndex === 'npx' ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy Command
                      </>
                    )}
                  </button>
                </div>
                <pre className="bg-slate-950 text-emerald-300 p-4 rounded-b-lg font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner leading-relaxed">
                  <code>{npxCommand}</code>
                </pre>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-gray-200">
                <div className="space-y-1">
                  <span className="font-bold text-gray-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" /> Guardrail Modes
                  </span>
                  <p className="text-gray-600">
                    Use <code className="bg-white px-1.5 py-0.5 rounded border border-gray-300 font-mono text-gray-800">--mode strict</code> to halt any agent attempting destructive commands (<code className="text-red-600">rm -rf</code>, privilege escalation, or SSRF metadata access).
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="font-bold text-gray-900 flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-blue-600" /> Real-time Streaming
                  </span>
                  <p className="text-gray-600">
                    Stdout and stderr stream uninterrupted to your terminal while background telemetry reaches your Vercel dashboard within &lt;100ms.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'curl' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-1">
                  One-Line Curl Runner for Cloud VMs & CI/CD Pipelines
                </h3>
                <p className="text-xs text-gray-600">
                  Ideal for AWS EC2 instances, Google Cloud Compute, GitHub Actions, or ephemeral developer containers. Downloads and executes the latest AgentShield bundle instantly.
                </p>
              </div>

              <div className="relative group">
                <div className="flex items-center justify-between bg-slate-900 px-4 py-2 rounded-t-lg border border-b-0 border-slate-800 text-xs font-mono text-gray-400">
                  <span>Bash Pipeline</span>
                  <button
                    onClick={() => copyToClipboard(curlCommand, 'curl')}
                    className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    {copiedIndex === 'curl' ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy Command
                      </>
                    )}
                  </button>
                </div>
                <pre className="bg-slate-950 text-blue-300 p-4 rounded-b-lg font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner leading-relaxed">
                  <code>{curlCommand}</code>
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'python' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-1">
                  Python In-Process Guardrail SDK
                </h3>
                <p className="text-xs text-gray-600">
                  Decorate tool definitions with <code className="bg-gray-100 px-1 font-mono text-gray-800">@shield.protect_tool</code> for pre-execution policy gating, cryptographic action hashing, and human approval queues.
                </p>
              </div>

              <div className="relative group">
                <div className="flex items-center justify-between bg-slate-900 px-4 py-2 rounded-t-lg border border-b-0 border-slate-800 text-xs font-mono text-gray-400">
                  <span>Python 3.9+</span>
                  <button
                    onClick={() => copyToClipboard(pythonCode, 'python')}
                    className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    {copiedIndex === 'python' ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy Code
                      </>
                    )}
                  </button>
                </div>
                <pre className="bg-slate-950 text-amber-200 p-4 rounded-b-lg font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner leading-relaxed">
                  <code>{pythonCode}</code>
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'docker' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-1">
                  Docker & Kubernetes Environment Variables
                </h3>
                <p className="text-xs text-gray-600">
                  Inject environment variables into your agent container to automatically hook telemetry and guardrails to your Vercel production instance.
                </p>
              </div>

              <div className="relative group">
                <div className="flex items-center justify-between bg-slate-900 px-4 py-2 rounded-t-lg border border-b-0 border-slate-800 text-xs font-mono text-gray-400">
                  <span>Docker CLI</span>
                  <button
                    onClick={() => copyToClipboard(dockerCommand, 'docker')}
                    className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    {copiedIndex === 'docker' ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy Command
                      </>
                    )}
                  </button>
                </div>
                <pre className="bg-slate-950 text-purple-300 p-4 rounded-b-lg font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner leading-relaxed">
                  <code>{dockerCommand}</code>
                </pre>
              </div>
            </div>
          )}

          {/* Test Handshake Section */}
          <div className="border-t border-gray-200 pt-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gray-50/70 -mx-6 -mb-6 p-6">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                <Server className="w-4 h-4 text-emerald-600" /> Test Ingestion Handshake
              </span>
              <p className="text-xs text-gray-500">
                Verify that your Vercel serverless API route is accepting authenticated agent telemetry.
              </p>
              {testResult && (
                <p
                  className={`text-xs font-mono mt-1 ${
                    testStatus === 'success' ? 'text-emerald-600 font-semibold' : 'text-red-600'
                  }`}
                >
                  {testResult}
                </p>
              )}
            </div>

            <button
              onClick={handleTestHandshake}
              disabled={testStatus === 'testing'}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-all shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testStatus === 'testing' ? 'animate-spin' : ''}`} />
              {testStatus === 'testing' ? 'Testing Handshake...' : 'Send Test Ping to Server'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
