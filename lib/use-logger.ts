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

interface SimulationLogTemplate {
  action: string;
  level: string;
  msg: string;
  minT: number;
  maxT: number;
  flagReason?: string;
}

const SIMULATION_NORMAL_LOGS: SimulationLogTemplate[] = [
  { action: 'THINK', level: 'INFO', msg: 'Hermes Reasoning: Formulating multi-step decomposition plan...', minT: 1500, maxT: 4500 },
  { action: 'READ', level: 'INFO', msg: 'Read workspace file: src/config.yaml (1.2kb)', minT: 20, maxT: 100 },
  { action: 'HTTP', level: 'INFO', msg: 'GET https://registry.npmjs.org/@google/genai', minT: 100, maxT: 300 },
  { action: 'WRITE', level: 'INFO', msg: 'Wrote 120 lines to src/components/Dashboard.tsx', minT: 200, maxT: 600 },
  { action: 'THINK', level: 'INFO', msg: 'Evaluating memory stream & tool schemas... selected search_codebase', minT: 1000, maxT: 3000 },
  { action: 'EXEC', level: 'INFO', msg: 'Executed tool: git diff --stat origin/main', minT: 300, maxT: 800 },
];

const SIMULATION_RISKY_LOGS: SimulationLogTemplate[] = [
  { action: 'EXEC', level: 'CRITICAL', msg: 'Blocked command: rm -rf /var/logs', flagReason: 'Destructive filesystem deletion attempt blocked by policy', minT: 500, maxT: 1000 },
  { action: 'HTTP', level: 'CRITICAL', msg: 'Blocked POST to unknown IP http://185.220.101.5/upload', flagReason: 'SSRF / Unverified outbound data upload blocked by policy', minT: 800, maxT: 1500 },
  { action: 'EXEC', level: 'WARN', msg: 'Suspended command: chmod 777 ./deploy.sh', flagReason: 'Privilege escalation requires operator authorization', minT: 100, maxT: 300 },
  { action: 'DELETE', level: 'WARN', msg: 'Suspended delete: rm src/main.py', flagReason: 'Project source file deletion requires operator approval', minT: 200, maxT: 400 },
  { action: 'HTTP', level: 'CRITICAL', msg: 'Blocked GET http://pastebin.com/raw/exfil', flagReason: 'Known exfiltration domain blocked by policy', minT: 100, maxT: 200 },
];

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export function useLogger(isSimulating: boolean = false, activeAgents: Agent[] = []) {
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
  const agentsRef = useRef<Agent[]>(activeAgents);

  useEffect(() => {
    agentsRef.current = activeAgents;
  }, [activeAgents]);

  // Fetch pending approvals periodically
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
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPendingApprovals();
    }, 0);
    const interval = setInterval(fetchPendingApprovals, 5000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [fetchPendingApprovals]);

  // Main Event Ingestion Engine
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (isSimulating) {
      // Simulation Isolation: Contained purely in simulation namespace
      const tick = () => {
        const isRisky = Math.random() < 0.15;
        const sourceList = isRisky ? SIMULATION_RISKY_LOGS : SIMULATION_NORMAL_LOGS;
        const template = sourceList[Math.floor(Math.random() * sourceList.length)];

        const tokens = Math.floor(Math.random() * (template.maxT - template.minT + 1)) + template.minT;
        const isFlagged = isRisky;

        let agentId, agentName;
        const currentAgents = agentsRef.current;
        if (currentAgents.length > 0) {
          const randomAgent = currentAgents[Math.floor(Math.random() * currentAgents.length)];
          agentId = randomAgent.id;
          agentName = randomAgent.name;
        }

        const newEntry: LogEntry = {
          id: generateId(),
          timestamp: new Date(),
          level: template.level as LogLevel,
          action: template.action as ActionType,
          message: template.msg,
          tokens,
          isFlagged,
          flagReason: template.flagReason,
          agentId,
          agentName,
          correlationId: `sim-${Date.now()}`,
          decision: isFlagged ? (template.level === 'CRITICAL' ? 'DENY' : 'REQUIRE_APPROVAL') : 'ALLOW',
          risk: isFlagged ? 'HIGH' : 'LOW',
        };

        setLogs((prev) => {
          const next = [...prev, newEntry];
          if (next.length > 300) return next.slice(next.length - 300);
          return next;
        });

        setStats((prev) => ({
          totalActions: prev.totalActions + 1,
          flaggedRisks: prev.flaggedRisks + (isFlagged ? 1 : 0),
          totalTokens: prev.totalTokens + tokens,
          estimatedTokens: (prev.estimatedTokens || 0) + tokens,
        }));

        timer = setTimeout(tick, Math.random() * 2200 + 800);
      };

      timer = setTimeout(tick, 1000);
      return () => clearTimeout(timer);
    } else {
      // Production Mode: Ingest from durable EventStore backend via SSE with polling fallback
      let eventSource: EventSource | null = null;
      let sseActive = false;

      const processIncomingLogs = (incoming: any[]) => {
        const newServerLogs: LogEntry[] = [];

        incoming.forEach((l: any) => {
          if (!seenIds.current.has(l.id)) {
            seenIds.current.add(l.id);
            newServerLogs.push({
              ...l,
              timestamp: new Date(l.timestamp),
            });
          }
        });

        if (newServerLogs.length > 0) {
          setLogs((prev) => {
            const next = [...prev, ...newServerLogs];
            if (next.length > 300) return next.slice(next.length - 300);
            return next;
          });

          setStats((prev) => {
            let totalTk = prev.totalTokens;
            let flagged = prev.flaggedRisks;

            newServerLogs.forEach((l) => {
              totalTk += l.tokens || 0;
              if (l.isFlagged) flagged++;
            });

            return {
              totalActions: prev.totalActions + newServerLogs.length,
              totalTokens: totalTk,
              flaggedRisks: flagged,
              estimatedTokens: totalTk,
            };
          });
        }
      };

      // Attempt Server-Sent Events (SSE) for real-time sub-second streaming
      try {
        eventSource = new EventSource('/api/events/stream');
        eventSource.addEventListener('log', (e) => {
          sseActive = true;
          try {
            const ev = JSON.parse(e.data);
            const mappedLog = {
              id: ev.eventId,
              timestamp: ev.timestamp,
              level: ev.level,
              action: ev.action,
              message: ev.message,
              tokens: ev.tokens?.totalTokens || 0,
              isFlagged: ev.risk === 'HIGH' || ev.risk === 'CRITICAL' || ev.decision === 'DENY',
              flagReason: ev.reasons?.[0],
              agentId: ev.agentId,
              agentName: ev.agentName,
              correlationId: ev.correlationId,
              decision: ev.decision,
              risk: ev.risk,
            };
            processIncomingLogs([mappedLog]);
          } catch {
            // Ignore parse errors
          }
        });

        eventSource.onerror = () => {
          sseActive = false;
        };
      } catch {
        sseActive = false;
      }

      // Robust Polling Loop (acts as initial fetch + multi-instance fallback)
      const poll = async () => {
        try {
          const res = await fetch('/api/webhook?limit=100');
          if (res.ok) {
            const data = await res.json();
            if (data.logs && Array.isArray(data.logs)) {
              processIncomingLogs(data.logs);
            }
          }
        } catch {
          // Non-blocking network fallback
        }

        // If SSE is active, poll less aggressively (every 10s for sync); otherwise poll every 2.5s
        timer = setTimeout(poll, sseActive ? 10000 : 2500);
      };

      poll();

      return () => {
        if (eventSource) eventSource.close();
        clearTimeout(timer);
      };
    }
  }, [isSimulating]);

  const clearLogs = async () => {
    setLogs([]);
    setStats(INITIAL_STATS);
    seenIds.current.clear();

    if (isSimulating) {
      try {
        await fetch('/api/webhook?env=simulation', { method: 'DELETE' });
      } catch {
        // Non-blocking
      }
    }
  };

  return {
    logs,
    stats,
    clearLogs,
    pendingApprovals,
    approveAction,
    enforcementMode,
    refreshPending: fetchPendingApprovals,
  };
}
