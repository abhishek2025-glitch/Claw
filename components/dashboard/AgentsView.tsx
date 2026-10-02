'use client';

import { Agent } from '@/hooks/use-agents';
import { useAgentHealthChecker } from '@/hooks/use-agent-health-checker';
import {
  Bot,
  Plus,
  Trash2,
  Key,
  Activity,
  Power,
  PowerOff,
  Cpu,
  Globe,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Play,
  Pause,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from 'lucide-react';
import { useState } from 'react';

const FRAMEWORK_OPTIONS = [
  'Hermes (Nous)',
  'OpenClaw',
  'AutoGPT / CrewAI',
  'Claude Code / Anthropic',
  'LangGraph',
  'Custom Agent',
];

export function AgentsView({
  agents,
  onAddAgent,
  onRemoveAgent,
  onToggleStatus,
  onUpdateAgentHealth,
}: {
  agents: Agent[];
  onAddAgent: (a: { name: string; description: string; framework?: string; endpointUrl?: string }) => void;
  onRemoveAgent: (id: string) => void;
  onToggleStatus: (id: string) => void;
  onUpdateAgentHealth: (id: string, health: any) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newFramework, setNewFramework] = useState('Hermes (Nous)');
  const [newEndpoint, setNewEndpoint] = useState('http://localhost:8000/health');
  const [showPingLogs, setShowPingLogs] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Scheduled Health Checker hook
  const {
    isAutoPingEnabled,
    setIsAutoPingEnabled,
    intervalSeconds,
    setIntervalSeconds,
    isChecking,
    lastCheckTime,
    secondsUntilNext,
    recentPings,
    pingSingleAgent,
    pingAllAgents,
  } = useAgentHealthChecker(agents, onUpdateAgentHealth);

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAddAgent({
      name: newName.trim(),
      description: newDesc.trim() || 'Custom AI Agent runtime',
      framework: newFramework,
      endpointUrl: newEndpoint.trim() || 'http://localhost:8000/health',
    });
    setNewName('');
    setNewDesc('');
    setNewEndpoint('http://localhost:8000/health');
    setShowAdd(false);
  };

  const handleQuickPreset = (name: string, desc: string, framework: string, endpoint: string) => {
    setNewName(name);
    setNewDesc(desc);
    setNewFramework(framework);
    setNewEndpoint(endpoint);
    setShowAdd(true);
  };

  const handleCopyEndpoint = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Fleet health summary metrics
  const activeAgents = agents.filter((a) => a.status === 'active');
  const healthyCount = activeAgents.filter(
    (a) => a.health?.status === 'healthy' || a.health?.status === 'degraded'
  ).length;
  const unhealthyCount = activeAgents.filter((a) => a.health?.status === 'unhealthy').length;
  const latencies = activeAgents
    .map((a) => a.health?.latencyMs)
    .filter((l): l is number => typeof l === 'number' && l > 0);
  const avgLatency =
    latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

  return (
    <div className="flex flex-col space-y-6">
      {/* Top Banner with Fleet Health & Action Button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-full bg-emerald-100 text-emerald-700">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              Registered AI Agents
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {agents.length} Fleet Nodes
              </span>
            </h2>
            <p className="text-sm text-gray-500">
              Manage endpoint connectivity, automated health checks, and telemetry credentials.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            id="register-agent-open-btn"
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm text-sm"
          >
            <Plus className="w-4 h-4" /> Add Agent
          </button>
        </div>
      </div>

      {/* Scheduled Health Check Control Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-lg border ${
                isAutoPingEnabled
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                  : 'bg-gray-100 border-gray-200 text-gray-400'
              }`}
            >
              <Activity className={`w-5 h-5 ${isChecking ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900">Scheduled Health Check Engine</h3>
                {isAutoPingEnabled ? (
                  <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Running (Every {intervalSeconds}s)
                  </span>
                ) : (
                  <span className="text-xs bg-gray-100 text-gray-600 font-semibold px-2 py-0.5 rounded-full">
                    Paused
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Periodically sends dummy connectivity pings to registered agent runtime endpoints.
              </p>
            </div>
          </div>

          {/* Controls: Auto Toggle, Interval Picker, Ping All Button */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Countdown Badge */}
            {isAutoPingEnabled && (
              <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 border border-gray-200 px-2.5 py-1.5 rounded-lg">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                <span>Next ping: </span>
                <strong className="text-gray-900 font-mono font-bold w-6 text-center">{secondsUntilNext}s</strong>
              </div>
            )}

            {/* Interval Selector */}
            <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1 text-xs">
              <span className="text-gray-500 px-1 font-medium">Interval:</span>
              {[15, 30, 60, 120].map((sec) => (
                <button
                  key={sec}
                  onClick={() => setIntervalSeconds(sec)}
                  className={`px-2 py-0.5 rounded font-medium transition-colors ${
                    intervalSeconds === sec
                      ? 'bg-white text-emerald-700 shadow-xs font-bold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>

            {/* Toggle Pause / Resume Button */}
            <button
              id="toggle-auto-ping-btn"
              type="button"
              onClick={() => setIsAutoPingEnabled(!isAutoPingEnabled)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                isAutoPingEnabled
                  ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              {isAutoPingEnabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isAutoPingEnabled ? 'Pause Schedule' : 'Resume Schedule'}
            </button>

            {/* Manual Ping All Trigger */}
            <button
              id="ping-all-agents-btn"
              type="button"
              disabled={isChecking}
              onClick={pingAllAgents}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              {isChecking ? 'Pinging Fleet...' : 'Ping All Now'}
            </button>
          </div>
        </div>

        {/* Fleet Metrics Strip */}
        <div className="pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-gray-50/80 rounded-lg p-2.5 border border-gray-100 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <div>
              <span className="text-gray-500 block">Fleet Online</span>
              <span className="font-bold text-gray-900 font-mono">
                {healthyCount} / {activeAgents.length} Agents
              </span>
            </div>
          </div>

          <div className="bg-gray-50/80 rounded-lg p-2.5 border border-gray-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-500" />
            <div>
              <span className="text-gray-500 block">Avg Response Latency</span>
              <span className="font-bold text-gray-900 font-mono">
                {avgLatency > 0 ? `${avgLatency} ms` : '—'}
              </span>
            </div>
          </div>

          <div className="bg-gray-50/80 rounded-lg p-2.5 border border-gray-100 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-500" />
            <div>
              <span className="text-gray-500 block">Unreachable / Offline</span>
              <span className={`font-bold font-mono ${unhealthyCount > 0 ? 'text-rose-600' : 'text-gray-900'}`}>
                {unhealthyCount} Nodes
              </span>
            </div>
          </div>

          <div className="bg-gray-50/80 rounded-lg p-2.5 border border-gray-100 flex items-center justify-between">
            <div>
              <span className="text-gray-500 block">Last Check Batch</span>
              <span className="font-bold text-gray-900 font-mono">
                {lastCheckTime ? lastCheckTime.toLocaleTimeString() : 'Initial load'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowPingLogs(!showPingLogs)}
              className="text-emerald-700 hover:text-emerald-800 font-medium flex items-center gap-1 hover:underline ml-2"
            >
              Logs {showPingLogs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Collapsible Recent Ping History Log */}
        {showPingLogs && (
          <div className="mt-4 pt-4 border-t border-gray-100 animate-in fade-in">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Recent Scheduled Ping Records ({recentPings.length})
              </h4>
              <span className="text-[11px] text-gray-400">Dummy pings verify HTTP/TCP socket handshake</span>
            </div>
            {recentPings.length === 0 ? (
              <p className="text-xs text-gray-400 py-3 text-center">No ping records yet. Pings will appear as the scheduler cycles.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg bg-gray-50/50">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-100 text-gray-600 font-semibold border-b border-gray-200">
                    <tr>
                      <th className="p-2">Time</th>
                      <th className="p-2">Agent</th>
                      <th className="p-2">Endpoint</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Latency</th>
                      <th className="p-2">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-mono">
                    {recentPings.map((p) => (
                      <tr key={p.id} className="hover:bg-white transition-colors">
                        <td className="p-2 text-gray-500">{p.timestamp}</td>
                        <td className="p-2 font-semibold text-gray-900">{p.agentName}</td>
                        <td className="p-2 text-gray-600 truncate max-w-[160px]" title={p.endpointUrl}>
                          {p.endpointUrl}
                        </td>
                        <td className="p-2">
                          {p.success ? (
                            <span className="text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded text-[10px] font-bold">
                              {p.statusCode} OK
                            </span>
                          ) : (
                            <span className="text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded text-[10px] font-bold">
                              {p.statusCode || 'ERR'} Fail
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-gray-700">{p.latencyMs}ms</td>
                        <td className="p-2 text-gray-500 truncate max-w-[200px]" title={p.message}>
                          {p.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Agent Modal/Panel */}
      {showAdd && (
        <div className="bg-white p-6 rounded-xl border border-emerald-200 shadow-sm animate-in fade-in space-y-4 bg-emerald-50/20">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-gray-900">Register New Agent</h3>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-gray-500 self-center">Quick templates:</span>
              <button
                type="button"
                onClick={() =>
                  handleQuickPreset(
                    'Hermes 3 Tool Agent',
                    'Function-calling & reasoning agent',
                    'Hermes (Nous)',
                    'https://hermes.agent.internal/health'
                  )
                }
                className="text-xs bg-white border border-gray-200 px-2 py-1 rounded hover:bg-gray-50 text-gray-700 font-medium"
              >
                + Hermes
              </button>
              <button
                type="button"
                onClick={() =>
                  handleQuickPreset(
                    'OpenClaw Runner',
                    'Self-directed task & coding executor',
                    'OpenClaw',
                    'http://localhost:8000/v1/ping'
                  )
                }
                className="text-xs bg-white border border-gray-200 px-2 py-1 rounded hover:bg-gray-50 text-gray-700 font-medium"
              >
                + OpenClaw
              </button>
              <button
                type="button"
                onClick={() =>
                  handleQuickPreset(
                    'AutoGPT Worker',
                    'Autonomous workflow process',
                    'AutoGPT / CrewAI',
                    'http://localhost:5000/healthz'
                  )
                }
                className="text-xs bg-white border border-gray-200 px-2 py-1 rounded hover:bg-gray-50 text-gray-700 font-medium"
              >
                + AutoGPT
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Agent Name</label>
              <input
                type="text"
                placeholder="Agent Name (e.g. Hermes Data Researcher)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Agent Framework</label>
              <select
                value={newFramework}
                onChange={(e) => setNewFramework(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-gray-800"
              >
                {FRAMEWORK_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Health Check Endpoint URL (Target for Periodic Dummy Ping)
              </label>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder="e.g. http://localhost:8000/health or https://hermes.agent.internal/ping"
                  value={newEndpoint}
                  onChange={(e) => setNewEndpoint(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                The scheduled health check mechanism will periodically send a dummy probe to this URL.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-700 block mb-1">Role / Description</label>
              <input
                type="text"
                placeholder="Description / Autonomous Responsibilities"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 font-medium rounded-lg transition-colors shadow-sm text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors shadow-sm text-sm"
            >
              Register Agent
            </button>
          </div>
        </div>
      )}

      {/* Agents Grid */}
      {agents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center max-w-xl mx-auto space-y-4 shadow-xs">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
            <Bot className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-gray-900">No Live Agents Connected</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Run <code className="bg-slate-100 px-2 py-0.5 rounded font-mono text-gray-800">agentshield run -- openclaw</code> on your computer to connect OpenClaw or an autonomous agent to this dashboard, or click &quot;Add Custom Agent&quot; above.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {agents.map((agent) => {
          const healthStatus = agent.health?.status || 'unknown';
          const isHealthy = healthStatus === 'healthy';
          const isDegraded = healthStatus === 'degraded';
          const isUnhealthy = healthStatus === 'unhealthy';
          const isPinging = healthStatus === 'checking';

          return (
            <div
              key={agent.id}
              className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col shadow-sm relative overflow-hidden group"
            >
              <div
                className={`absolute top-0 left-0 w-1.5 h-full ${
                  agent.status === 'active'
                    ? isHealthy
                      ? 'bg-emerald-500'
                      : isDegraded
                      ? 'bg-amber-500'
                      : isUnhealthy
                      ? 'bg-rose-500'
                      : 'bg-blue-500'
                    : 'bg-gray-300'
                }`}
              />
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <h3 className="text-lg font-bold text-gray-900">{agent.name}</h3>
                    {agent.framework && (
                      <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-slate-500" />
                        {agent.framework}
                      </span>
                    )}
                    {agent.status === 'active' ? (
                      <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                        Active
                      </span>
                    ) : (
                      <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{agent.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onToggleStatus(agent.id)}
                    className="p-2 text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-200 rounded-lg transition-colors border border-gray-200"
                    title={agent.status === 'active' ? 'Deactivate Agent' : 'Activate Agent'}
                  >
                    {agent.status === 'active' ? (
                      <PowerOff className="w-4 h-4" />
                    ) : (
                      <Power className="w-4 h-4 text-emerald-600" />
                    )}
                  </button>
                  <button
                    onClick={() => onRemoveAgent(agent.id)}
                    className="p-2 text-red-400 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-200"
                    title="Remove Agent"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Endpoint & Live Health Status Section */}
              <div className="bg-gray-50/80 rounded-lg p-3 border border-gray-200/80 mb-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-600 flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-gray-400" />
                    Health Endpoint
                  </span>

                  {/* Connectivity Status Badge */}
                  <div className="flex items-center gap-1.5">
                    {isPinging ? (
                      <span className="bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" /> Pinging...
                      </span>
                    ) : isHealthy ? (
                      <span className="bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Online ({agent.health?.latencyMs ?? 0}ms)
                      </span>
                    ) : isDegraded ? (
                      <span className="bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        Degraded ({agent.health?.latencyMs ?? 0}ms)
                      </span>
                    ) : isUnhealthy ? (
                      <span className="bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-rose-600" />
                        Offline / Unreachable
                      </span>
                    ) : (
                      <span className="bg-gray-100 text-gray-600 font-semibold px-2 py-0.5 rounded-full">
                        Pending Ping
                      </span>
                    )}

                    {/* Single Ping Now Button */}
                    <button
                      type="button"
                      onClick={() => pingSingleAgent(agent)}
                      disabled={isPinging}
                      className="p-1 text-gray-500 hover:text-emerald-700 hover:bg-white rounded border border-gray-200 transition-colors"
                      title="Send instant dummy ping to this endpoint"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 font-mono text-xs bg-white px-2.5 py-1.5 rounded border border-gray-200 text-gray-700">
                  <span className="truncate" title={agent.endpointUrl || 'http://localhost:8000/health'}>
                    {agent.endpointUrl || 'http://localhost:8000/health'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyEndpoint(agent.endpointUrl || 'http://localhost:8000/health', agent.id)
                    }
                    className="text-gray-400 hover:text-gray-700 shrink-0"
                    title="Copy Endpoint URL"
                  >
                    {copiedId === agent.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Health Check Details Subline */}
                <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1">
                  <span>
                    Last probe: {agent.health?.lastPingAt ? new Date(agent.health.lastPingAt).toLocaleTimeString() : 'Never'}
                  </span>
                  <span className="font-mono text-gray-600 truncate max-w-[200px]" title={agent.health?.lastPingMessage}>
                    {agent.health?.lastPingMessage || 'Awaiting ping cycle'}
                  </span>
                </div>
              </div>

              <div className="mt-auto pt-3 border-t border-gray-100 space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <Key className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="text-gray-500">API Key:</span>
                  <span className="font-mono text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-200 flex-1 truncate">
                    {agent.apiKey}
                  </span>
                </div>
                <div className="flex items-center justify-between text-gray-400">
                  <span>ID: <code className="font-mono text-gray-600">{agent.id}</code></span>
                  <span>Created: {new Date(agent.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
