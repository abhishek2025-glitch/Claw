'use client';

import { useLogger } from '@/lib/use-logger';
import { useAgents } from '@/hooks/use-agents';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { StatCards } from '@/components/dashboard/StatCards';
import { LiveLogFeed } from '@/components/dashboard/LiveLogFeed';
import { RiskPanel } from '@/components/dashboard/RiskPanel';
import { SetupWizard } from '@/components/dashboard/SetupWizard';
import { DeployGuideModal } from '@/components/dashboard/DeployGuideModal';
import { ConnectAgentModal } from '@/components/dashboard/ConnectAgentModal';
import { UpgradeModal } from '@/components/dashboard/UpgradeModal';
import { FullLogsView } from '@/components/dashboard/FullLogsView';
import { AlertsView } from '@/components/dashboard/AlertsView';
import { AgentsView } from '@/components/dashboard/AgentsView';
import { OperationsTrendChart } from '@/components/dashboard/OperationsTrendChart';
import { Settings as SettingsIcon, ShieldCheck, Copy, Check, Radio, Terminal } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Dashboard() {
  const [isMounted, setIsMounted] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [showConnectCli, setShowConnectCli] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeployGuide, setShowDeployGuide] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('payment') === 'success';
    }
    return false;
  });
  const [activeView, setActiveView] = useState<'dashboard' | 'logs' | 'alerts' | 'agents'>('dashboard');

  const [setupComplete, setSetupComplete] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('agentshield_setup_complete') || localStorage.getItem('clawguard_setup_complete');
      return !!saved;
    }
    return false;
  });

  const [costPer1M, setCostPer1M] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const savedCost = localStorage.getItem('agentshield_cost_per_1m') || localStorage.getItem('clawguard_cost_per_1m');
      if (savedCost) {
        return parseFloat(savedCost);
      }
    }
    return 0.50;
  });

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  const { agents, addAgent, removeAgent, toggleAgentStatus, updateAgentHealth } = useAgents();
  const { logs, stats, clearLogs, pendingApprovals, approveAction, enforcementMode, refreshLogs } = useLogger(
    false,
    agents.filter((a) => a.status === 'active')
  );

  const finishSetup = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('agentshield_setup_complete', 'true');
    }
    setSetupComplete(true);
  };
  
  const saveSettings = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('agentshield_cost_per_1m', costPer1M.toString());
    }
    setShowSettings(false);
  }

  if (!isMounted) {
    return null;
  }

  if (!setupComplete) {
    return <SetupWizard onComplete={finishSetup} />;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar 
        activeView={activeView}
        setActiveView={setActiveView}
        onOpenDeployGuide={() => setShowDeployGuide(true)} 
        onOpenConnectCli={() => setShowConnectCli(true)}
        onOpenUpgrade={() => setShowUpgrade(true)}
        onOpenSettings={() => setShowSettings(true)}
        alertCount={stats.flaggedRisks}
        agentCount={agents.filter((a) => a.status === 'active').length}
      />
      
      <div className="pl-64 flex-1 flex flex-col min-h-screen">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200/90 px-8 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sticky top-0 z-10 w-full shadow-xs">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                {activeView === 'dashboard' && 'Agent Observer Dashboard'}
                {activeView === 'logs' && 'Full Activity Logs'}
                {activeView === 'alerts' && 'Security Alerts & Incidents'}
                {activeView === 'agents' && 'Manage Agents'}
              </h1>
              <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Telemetry
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Deterministic offline-first security runtime gating OpenClaw and autonomous AI agent operations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowConnectCli(true)}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors border shadow-xs bg-slate-900 hover:bg-slate-800 text-emerald-400 border-slate-700"
            >
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              Connect Agent (CLI)
            </button>
            <button
              onClick={() => refreshLogs()}
              className="px-3.5 py-2 text-xs font-medium text-gray-600 bg-white hover:bg-gray-50 rounded-lg transition-colors border border-gray-200 shadow-xs"
            >
              Refresh
            </button>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors shadow-xs"
              aria-label="Settings"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="p-8 flex-1 w-full max-w-[1600px] mx-auto">
          {activeView === 'dashboard' && (
            <>
              {agents.length === 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-sm font-bold flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-emerald-400" /> No Live Agents Connected Yet
                    </span>
                    <p className="text-xs text-slate-400">
                      Run <code className="bg-slate-950 px-2 py-0.5 rounded text-emerald-300 font-mono">agentshield run -- openclaw</code> on your computer to connect OpenClaw or an autonomous agent to this live dashboard.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowConnectCli(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors whitespace-nowrap"
                  >
                    View CLI Connection Guide
                  </button>
                </div>
              )}
              {/* Executive Fleet Pulse & Enforcement Status Bar */}
              <div className="bg-white rounded-xl border border-gray-200/90 shadow-xs p-4 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">Fleet Operations Nominal</span>
                      <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                        {agents.filter((a) => a.status === 'active').length} of {agents.length} Agents Online
                      </span>
                      <span className="text-[11px] font-bold bg-slate-900 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded-md font-mono">
                        ENFORCEMENT: ACTIVE
                      </span>
                      <span className="text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-300 px-2 py-0.5 rounded-md font-mono">
                        POLICY: {enforcementMode.policyMode}
                      </span>
                      <span className="text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-md font-mono">
                        TELEMETRY: CONNECTED
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Continuous deterministic policy evaluation gating all tool invocations, shell executions, and network egress
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200/80 px-3 py-1.5 rounded-lg text-xs font-mono text-gray-600">
                  <span className="text-gray-400">Gateway:</span>
                  <span className="font-semibold text-gray-900">POST /api/actions/propose</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        navigator.clipboard.writeText(`${window.location.origin}/api/actions/propose`);
                        setCopiedWebhook(true);
                        setTimeout(() => setCopiedWebhook(false), 2000);
                      }
                    }}
                    className="text-gray-500 hover:text-gray-900 ml-1 p-0.5 transition-colors"
                    title="Copy enforcement gateway URL"
                  >
                    {copiedWebhook ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <StatCards stats={stats} costPer1M={costPer1M} logs={logs} />

              <OperationsTrendChart logs={logs} />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-base font-bold text-gray-900 tracking-tight">Live Telemetry & Execution Stream</h2>
                      <p className="text-xs text-gray-500">Real-time trace stream with syntax filtering and payload inspector</p>
                    </div>
                  </div>
                  <LiveLogFeed logs={logs} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-base font-bold text-gray-900 tracking-tight">Guardrail Threat Posture</h2>
                      <p className="text-xs text-gray-500">Behavioral policy checks & intercepted actions</p>
                    </div>
                  </div>
                  <RiskPanel
                    logs={logs}
                    pendingApprovals={pendingApprovals}
                    onApprove={approveAction}
                  />
                </div>
              </div>
            </>
          )}

          {activeView === 'logs' && (
            <FullLogsView logs={logs} />
          )}

          {activeView === 'alerts' && (
            <AlertsView logs={logs} />
          )}

          {activeView === 'agents' && (
            <AgentsView 
              agents={agents}
              onAddAgent={addAgent}
              onRemoveAgent={removeAgent}
              onToggleStatus={toggleAgentStatus}
              onUpdateAgentHealth={updateAgentHealth}
            />
          )}
        </main>
      </div>

      {showSettings && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4 text-center">AgentShield Configuration</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">Cost Per 1M Tokens (USD)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={costPer1M}
                  onChange={(e) => setCostPer1M(parseFloat(e.target.value) || 0)}
                  placeholder="0.50" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-shadow" 
                />
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">Adjust this to match your OpenClaw, Hermes, or LLM model API pricing for more accurate cost estimation.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">Telegram Bot Token (Optional)</label>
                <input type="text" placeholder="123456789:ABCdefGHIjklmNOPqrstUVwxyZ" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-shadow" />
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">Get this from BotFather to receive alerts directly to your phone.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">Alert Threshold Config (YAML format)</label>
                <textarea 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none h-32 transition-shadow resize-none"
                  defaultValue={`rules:\n  - match: "rm -rf"\n    level: CRITICAL\n    notify: true\n  - match: "http:*"\n    level: WARN\n  max_actions_per_min: 50`}
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  onClick={saveSettings}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors shadow-sm"
                >
                  Save Settings
                </button>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-lg transition-colors border border-gray-200 shadow-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeployGuide && (
        <DeployGuideModal onClose={() => setShowDeployGuide(false)} />
      )}

      {showConnectCli && (
        <ConnectAgentModal onClose={() => setShowConnectCli(false)} />
      )}

      {showUpgrade && (
        <UpgradeModal onClose={() => setShowUpgrade(false)} />
      )}
    </div>
  );
}
