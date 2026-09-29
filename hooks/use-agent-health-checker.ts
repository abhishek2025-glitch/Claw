'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Agent, AgentHealth } from './use-agents';

export interface PingRecord {
  id: string;
  agentId: string;
  agentName: string;
  endpointUrl: string;
  timestamp: string;
  success: boolean;
  statusCode: number;
  latencyMs: number;
  message: string;
}

export function useAgentHealthChecker(
  agents: Agent[],
  updateAgentHealth: (id: string, health: AgentHealth) => void
) {
  const [isAutoPingEnabled, setIsAutoPingEnabled] = useState(true);
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
  const [secondsUntilNext, setSecondsUntilNext] = useState(30);
  const [recentPings, setRecentPings] = useState<PingRecord[]>([]);

  const agentsRef = useRef(agents);
  const updateAgentHealthRef = useRef(updateAgentHealth);

  useEffect(() => {
    agentsRef.current = agents;
    updateAgentHealthRef.current = updateAgentHealth;
  }, [agents, updateAgentHealth]);

  // Single agent ping execution
  const pingSingleAgent = useCallback(async (agent: Agent): Promise<PingRecord> => {
    const endpoint = agent.endpointUrl || 'http://localhost:8000/health';

    // Mark agent status as checking
    updateAgentHealthRef.current(agent.id, {
      status: 'checking',
    });

    try {
      const res = await fetch('/api/agents/ping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentId: agent.id,
          endpointUrl: endpoint,
          timeoutMs: 4000,
        }),
      });

      const data = await res.json();
      const isSuccess = Boolean(data.success);
      const latency = data.latencyMs ?? 0;

      let status: AgentHealth['status'] = 'unhealthy';
      if (isSuccess) {
        status = latency > 500 ? 'degraded' : 'healthy';
      }

      const updatedHealth: AgentHealth = {
        status,
        latencyMs: latency,
        lastPingAt: new Date().toISOString(),
        lastPingMessage: data.message || (isSuccess ? '200 OK' : 'Probe Failed'),
        statusCode: data.statusCode || (isSuccess ? 200 : 502),
      };

      updateAgentHealthRef.current(agent.id, updatedHealth);

      const record: PingRecord = {
        id: Math.random().toString(36).substring(2, 9),
        agentId: agent.id,
        agentName: agent.name,
        endpointUrl: endpoint,
        timestamp: new Date().toLocaleTimeString(),
        success: isSuccess,
        statusCode: data.statusCode || 0,
        latencyMs: latency,
        message: data.message || (isSuccess ? 'Healthy' : 'Unreachable'),
      };

      return record;
    } catch (err: any) {
      const failedHealth: AgentHealth = {
        status: 'unhealthy',
        latencyMs: 0,
        lastPingAt: new Date().toISOString(),
        lastPingMessage: err?.message || 'Network error during ping',
        statusCode: 0,
      };

      updateAgentHealthRef.current(agent.id, failedHealth);

      return {
        id: Math.random().toString(36).substring(2, 9),
        agentId: agent.id,
        agentName: agent.name,
        endpointUrl: endpoint,
        timestamp: new Date().toLocaleTimeString(),
        success: false,
        statusCode: 0,
        latencyMs: 0,
        message: err?.message || 'Network unreachable',
      };
    }
  }, []);

  // Ping all active registered agents
  const pingAllAgents = useCallback(async () => {
    const currentAgents = agentsRef.current;
    if (currentAgents.length === 0) return;

    setIsChecking(true);

    try {
      const pingPromises = currentAgents.map((a) => pingSingleAgent(a));
      const results = await Promise.all(pingPromises);

      setLastCheckTime(new Date());
      setSecondsUntilNext(intervalSeconds);
      setRecentPings((prev) => [...results, ...prev].slice(0, 30));
    } finally {
      setIsChecking(false);
    }
  }, [intervalSeconds, pingSingleAgent]);

  // Periodic interval scheduler & countdown timer
  useEffect(() => {
    if (!isAutoPingEnabled) return;

    const timer = setInterval(() => {
      setSecondsUntilNext((prev) => {
        if (prev <= 1) {
          // Trigger scheduled ping batch
          pingAllAgents();
          return intervalSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAutoPingEnabled, intervalSeconds, pingAllAgents]);

  return {
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
  };
}
