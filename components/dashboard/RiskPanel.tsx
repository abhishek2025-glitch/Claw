'use client';

import { LogEntry } from '@/lib/use-logger';
import { PendingActionEntry } from '@/lib/approval/manager';
import {
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Lock,
  Clock,
  Check,
  X,
  Hash,
} from 'lucide-react';
import { useState } from 'react';

export function RiskPanel({
  logs,
  pendingApprovals = [],
  onApprove,
}: {
  logs: LogEntry[];
  pendingApprovals?: PendingActionEntry[];
  onApprove?: (actionId: string, decision: 'APPROVED' | 'REJECTED') => Promise<boolean>;
}) {
  const flaggedRisks = logs.filter((l) => l.isFlagged).reverse();
  const [filterSeverity, setFilterSeverity] = useState<'ALL' | 'CRITICAL' | 'WARN'>('ALL');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const filteredRisks = flaggedRisks.filter((risk) => {
    if (filterSeverity === 'CRITICAL') return risk.level === 'CRITICAL' || risk.level === 'ERROR';
    if (filterSeverity === 'WARN') return risk.level === 'WARN';
    return true;
  });

  const criticalCount = flaggedRisks.filter((r) => r.level === 'CRITICAL' || r.level === 'ERROR').length;
  const warnCount = flaggedRisks.filter((r) => r.level === 'WARN').length;

  const handleDecision = async (actionId: string, decision: 'APPROVED' | 'REJECTED') => {
    if (!onApprove) return;
    setProcessingId(actionId);
    try {
      await onApprove(actionId, decision);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[620px]">
      {/* Header with Status Indicator & Enforcement Mode */}
      <div className="px-5 py-4 border-b border-gray-100 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`p-2 rounded-lg ${
                flaggedRisks.length > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              {flaggedRisks.length > 0 ? (
                <ShieldAlert className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">Security & Enforcement</h3>
              <p className="text-[11px] text-gray-500 font-mono">FAIL-CLOSED • PRE-EXECUTION GATE</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                pendingApprovals.length > 0
                  ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                  : flaggedRisks.length > 0
                  ? 'bg-rose-100 text-rose-700 border border-rose-200'
                  : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              }`}
            >
              {pendingApprovals.length > 0
                ? `${pendingApprovals.length} Pending Approval`
                : flaggedRisks.length > 0
                ? `${flaggedRisks.length} Interceptions`
                : 'Enforcement Active'}
            </span>
          </div>
        </div>

        {/* Pending Approvals Warning Banner */}
        {pendingApprovals.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            <div className="flex items-center gap-2 font-bold mb-1">
              <Clock className="w-4 h-4 text-amber-600" />
              Action Suspended Awaiting Human Authorization
            </div>
            {pendingApprovals.map((pa) => (
              <div key={pa.actionId} className="mt-2 pt-2 border-t border-amber-200/60 flex flex-col gap-1.5">
                <div className="font-mono text-[11px] bg-white/80 p-1.5 rounded border border-amber-200 truncate">
                  {pa.request.action}: {pa.request.operation}
                </div>
                <div className="text-[10px] text-amber-700 flex items-center gap-1 font-mono">
                  <Hash className="w-3 h-3" />
                  Hash: {pa.actionHash.substring(0, 16)}...
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    disabled={processingId === pa.actionId}
                    onClick={() => handleDecision(pa.actionId, 'APPROVED')}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-1 px-2 rounded flex items-center justify-center gap-1 text-[11px] transition-colors shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Approve
                  </button>
                  <button
                    disabled={processingId === pa.actionId}
                    onClick={() => handleDecision(pa.actionId, 'REJECTED')}
                    className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold py-1 px-2 rounded flex items-center justify-center gap-1 text-[11px] transition-colors shadow-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Severity Tabs (if risks present) */}
        {flaggedRisks.length > 0 && (
          <div className="flex items-center gap-1.5 pt-1 text-xs">
            <button
              type="button"
              onClick={() => setFilterSeverity('ALL')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterSeverity === 'ALL'
                  ? 'bg-gray-100 text-gray-900 font-semibold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              All ({flaggedRisks.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterSeverity('CRITICAL')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterSeverity === 'CRITICAL'
                  ? 'bg-rose-100 text-rose-800 font-semibold'
                  : 'text-gray-500 hover:text-rose-700'
              }`}
            >
              Critical ({criticalCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterSeverity('WARN')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterSeverity === 'WARN'
                  ? 'bg-amber-100 text-amber-800 font-semibold'
                  : 'text-gray-500 hover:text-amber-700'
              }`}
            >
              Warnings ({warnCount})
            </button>
          </div>
        )}
      </div>

      {/* Body: Risk Stream or Reassuring Defense Status */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {filteredRisks.length === 0 ? (
          <div className="h-full flex flex-col justify-between p-2">
            <div className="flex flex-col items-center justify-center text-center my-auto space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 text-sm">Deterministic Policy Enforced</h4>
                <p className="text-xs text-gray-500 max-w-[240px] mt-1 leading-relaxed">
                  Every proposed tool execution, shell command, file mutation, and HTTP call is gated before execution.
                </p>
              </div>
            </div>

            {/* Active Policy Rules Checklist */}
            <div className="bg-gray-50/90 rounded-xl p-3.5 border border-gray-100 space-y-2 text-xs">
              <span className="font-semibold text-gray-700 block text-[11px] uppercase tracking-wider">
                Active Policy Invariants
              </span>
              <div className="space-y-1.5 text-gray-600">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Destructive Command Trap (rm -rf, dd, truncate)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Privilege Escalation Gate (chmod 777, sudo)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>SSRF & Private IP Egress Blocker</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Cryptographic Action Hash Verification</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          filteredRisks.map((log) => {
            const isCrit = log.level === 'CRITICAL' || log.level === 'ERROR' || log.decision === 'DENY';
            return (
              <div
                key={log.id}
                className={`p-3.5 rounded-xl border transition-all text-xs ${
                  isCrit
                    ? 'bg-rose-50/80 border-rose-200/90 hover:border-rose-300'
                    : 'bg-amber-50/70 border-amber-200/80 hover:border-amber-300'
                }`}
              >
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className={`w-4 h-4 ${isCrit ? 'text-rose-600' : 'text-amber-600'}`} />
                    <span className={`font-bold ${isCrit ? 'text-rose-800' : 'text-amber-800'}`}>
                      {log.decision ? `[${log.decision}] ${log.action}` : `${log.action} Intercepted`}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-gray-500">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>

                {/* Raw Message Snippet */}
                <div className="bg-white/90 p-2 rounded-lg border border-gray-200/60 font-mono text-[11px] text-gray-900 break-all mb-2">
                  {log.message}
                </div>

                {/* Policy Reason */}
                <div className="flex items-start gap-1.5 text-gray-700 bg-white/50 p-2 rounded-md border border-gray-200/40">
                  <Lock className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                  <span className="leading-snug">
                    <strong className="text-gray-900">Enforcement Reason:</strong> {log.flagReason || 'Policy gate evaluated action as risky.'}
                  </span>
                </div>

                {log.agentName && (
                  <div className="mt-2 text-[10px] text-gray-500 flex items-center justify-between">
                    <span>Agent: <strong className="text-gray-700">{log.agentName}</strong></span>
                    <span className="font-mono text-gray-400">ID: {log.id}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Pre-Execution Gate: Active
        </span>
        <span className="font-mono text-[11px]">Enforcement v3.0</span>
      </div>
    </div>
  );
}
