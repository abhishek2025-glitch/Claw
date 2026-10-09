'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Agent } from '@/hooks/use-agents';
import { PendingActionEntry } from '@/lib/approval/manager';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
export type ActionType = 'READ' | 'WRITE' | 'DELETE' | 'HTTP' | 'EXEC' | 'THINK';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  action: ActionType;
  message: string;
  tokens: number;
  isFlagged: boolean;
  flagReason?: string;
  agentId?: string;
  agentName?: string;
  correlationId?: string;
  decision?: string;
  risk?: string;
}

export interface LoggerStats {
  totalActions: number;
  flaggedRisks: number;
  totalTokens: number;
  exactTokens?: number;
  estimatedTokens?: number;
}

export const INITIAL_STATS: LoggerStats = {
  totalActions: 0,
  flaggedRisks: 0,
  totalTokens: 0,
};

export function useLogger(isDemoMode = false, activeAgents: Agent[] = []) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LoggerStats>(INITIAL_STATS);
  const [pendingApprovals, setPendingApprovals] = useState<PendingActionEntry[]>([]);
  const [enforcementMode, setEnforcementMode] = useState<{
    policyMode: string;
    telemetryMode: string;
    isEnforcing: boolean;
  }>({
    policyMode: 'FAIL-CLOSED',
    telemetryMode: 'FAIL-OPEN',
    isEnforcing: true,
  });

  const seenIds = useRef<Set<string>>(new Set());

  // 1. Fetch real pending approvals from authoritative database
  const fetchPendingApprovals = useCallback(async () => {
    try {
      const res = await fetch('/api/actions/pending');
      if (res.ok) {
        const data = await res.json();
        setPendingApprovals(data.pendingActions || []);
      }
    } catch {
      // Non-blocking
    }
  }, []);

  // 2. Fetch live metrics & policy status
  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/metrics');
      if (res.ok) {
        const data = await res.json();
        setEnforcementMode({
          policyMode: data.policyMode === 'OPEN' ? 'FAIL-OPEN' : 'FAIL-CLOSED',
          telemetryMode: data.telemetryMode === 'CLOSED' ? 'FAIL-CLOSED' : 'FAIL-OPEN',
          isEnforcing: true,
        });
      }
    } catch {}
  }, []);

  // 3. Fetch real live telemetry events from database
  const fetchLiveTelemetry = useCallback(async () => {
    try {
      const res = await fetch('/api/webhook?env=production&limit=100');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.logs)) {
          const mappedLogs: LogEntry[] = data.logs.map((item: any) => ({
            id: item.id,
            timestamp: new Date(item.timestamp),
            level: item.level as LogLevel,
            action: item.action as ActionType,
            message: item.message,
            tokens: Number(item.tokens) || 0,
            isFlagged: Boolean(item.isFlagged),
            flagReason: item.flagReason,
            agentId: item.agentId,
            agentName: item.agentName,
            correlationId: item.correlationId,
            decision: item.decision,
            risk: item.risk,
          }));

          setLogs(mappedLogs);

          // Calculate real metrics from actual events
          const totalTokens = mappedLogs.reduce((acc, curr) => acc + curr.tokens, 0);
          const flaggedCount = mappedLogs.filter((l) => l.isFlagged || l.level === 'CRITICAL').length;

          setStats({
            totalActions: mappedLogs.length,
            flaggedRisks: flaggedCount,
            totalTokens,
          });
        }
      }
    } catch (err) {
      console.warn('[AgentShield Live Logger Fetch Warning]:', err);
    }
  }, []);

  const approveAction = async (actionId: string, decision: 'APPROVED' | 'REJECTED', operatorComment?: string) => {
    try {
      const res = await fetch('/api/actions/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionId,
          decision,
          operatorId: 'operator-dashboard',
          operatorComment,
        }),
      });
      if (res.ok) {
        await fetchPendingApprovals();
        await fetchLiveTelemetry();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const clearLogs = async () => {
    // In production, logs are immutable (Invariant 26).
    // In development or local view, resets local view state
    setLogs([]);
    setStats(INITIAL_STATS);
  };

  useEffect(() => {
    let isCancelled = false;

    const timer = setTimeout(() => {
      if (!isCancelled) {
        fetchLiveTelemetry();
        fetchPendingApprovals();
        fetchMetrics();
      }
    }, 0);

    const interval = setInterval(() => {
      if (!isCancelled) {
        fetchLiveTelemetry();
        fetchPendingApprovals();
      }
    }, 4000);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [fetchLiveTelemetry, fetchPendingApprovals, fetchMetrics]);

  return {
    logs,
    stats,
    clearLogs,
    pendingApprovals,
    approveAction,
    enforcementMode,
    refreshLogs: fetchLiveTelemetry,
  };
}
