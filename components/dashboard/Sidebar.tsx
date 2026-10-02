import {
  ShieldAlert,
  TerminalSquare,
  Activity,
  Settings,
  BookOpen,
  Github,
  Bell,
  Cloud,
  Star,
  Bot,
  Radio,
} from 'lucide-react';
import Link from 'next/link';

export function Sidebar({
  onOpenDeployGuide,
  onOpenUpgrade,
  onOpenConnectCli,
  activeView,
  setActiveView,
  onOpenSettings,
  alertCount = 0,
  agentCount = 3,
}: {
  onOpenDeployGuide: () => void;
  onOpenUpgrade: () => void;
  onOpenConnectCli?: () => void;
  activeView: 'dashboard' | 'logs' | 'alerts' | 'agents';
  setActiveView: (view: 'dashboard' | 'logs' | 'alerts' | 'agents') => void;
  onOpenSettings: () => void;
  alertCount?: number;
  agentCount?: number;
}) {
  const navItems = [
    {
      id: 'dashboard' as const,
      label: 'Dashboard',
      icon: Activity,
    },
    {
      id: 'logs' as const,
      label: 'Telemetry Logs',
      icon: TerminalSquare,
    },
    {
      id: 'alerts' as const,
      label: 'Security Alerts',
      icon: Bell,
      badge: alertCount > 0 ? alertCount : undefined,
      badgeColor: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
    },
    {
      id: 'agents' as const,
      label: 'Agent Fleet',
      icon: Bot,
      badge: agentCount > 0 ? `${agentCount} active` : undefined,
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    },
  ];

  return (
    <div className="w-64 bg-slate-950 text-slate-300 flex flex-col h-screen fixed top-0 left-0 border-r border-slate-800/80 z-20">
      {/* Brand Header */}
      <div className="p-4 flex items-center gap-3 border-b border-slate-800/80">
        <div className="bg-emerald-500/15 p-2 rounded-lg border border-emerald-500/30 text-emerald-400">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-base tracking-tight text-white">AgentShield</span>
            <span className="font-mono text-[11px] bg-emerald-950/80 text-emerald-400 px-1.5 py-0.2 rounded border border-emerald-800/50">
              OBSERVER
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Runtime Telemetry
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Monitoring & Fleet
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-slate-800/90 text-white shadow-xs border border-slate-700/60'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    item.badgeColor || 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-lg text-sm font-medium transition-all"
        >
          <Settings className="w-4 h-4 text-slate-400" />
          <span>Settings</span>
        </button>

        {/* Upgrade Card */}
        <div className="mt-6 pt-4 border-t border-slate-800/80">
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                AgentShield Pro
              </span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/50 px-1.5 py-0.2 rounded">
                ENTERPRISE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Unlimited webhook retention, multi-tenant isolation & Slack alerts.
            </p>
            <button
              onClick={onOpenUpgrade}
              className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              Upgrade Fleet ($49/mo)
            </button>
          </div>
        </div>
      </nav>

      {/* Footer Resources */}
      <div className="p-3 border-t border-slate-800/80 text-xs">
        <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Integration
        </div>
        {onOpenConnectCli && (
          <button
            onClick={onOpenConnectCli}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-slate-900 rounded-md transition-colors font-medium"
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span>Connect Agent (CLI)</span>
          </button>
        )}
        <button
          onClick={onOpenDeployGuide}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-md transition-colors"
        >
          <Cloud className="w-3.5 h-3.5 text-slate-400" />
          <span>Deployment Guide</span>
        </button>
        <Link
          href="#"
          className="flex items-center gap-2.5 px-3 py-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-md transition-colors"
        >
          <BookOpen className="w-3.5 h-3.5 text-slate-400" />
          <span>API Reference</span>
        </Link>
        <Link
          href="#"
          className="flex items-center gap-2.5 px-3 py-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-md transition-colors"
        >
          <Github className="w-3.5 h-3.5 text-slate-400" />
          <span>GitHub SDK</span>
        </Link>
      </div>
    </div>
  );
}
