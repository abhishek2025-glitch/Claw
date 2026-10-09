'use client';

import { useState, useEffect, useCallback } from 'react';

export interface AgentHealth {
  status: 'healthy' | 'unhealthy' | 'degraded' | 'checking' | 'unknown';
  latencyMs?: number;
  lastPingAt?: string;
  lastPingMessage?: string;
  statusCode?: number;
}

export interface Agent {
  id: string;
  name: string;
  framework?: string;
  description?: string;
  status: 'active' | 'inactive';
  endpointUrl?: string;
  apiKey?: string;
  createdAt: string;
  health?: AgentHealth;
}

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRealAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.agents)) {
          setAgents(
            data.agents.map((a: any) => ({
              id: a.agentId || a.id,
              name: a.name || a.agentId,
              framework: a.framework || 'Custom',
              status: a.status || 'active',
              createdAt: a.lastSeenAt || new Date().toISOString(),
              health: {
                status: a.healthStatus || 'unknown',
                lastPingAt: a.lastSeenAt,
                lastPingMessage: a.lastSeenAt ? `Last active: ${new Date(a.lastSeenAt).toLocaleTimeString()}` : 'Awaiting telemetry',
              },
            }))
          );
        }
      }
    } catch {
      // Non-blocking
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const timer = setTimeout(() => {
      if (!isCancelled) {
        fetchRealAgents();
      }
    }, 0);

    const interval = setInterval(() => {
      if (!isCancelled) {
        fetchRealAgents();
      }
    }, 10000);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [fetchRealAgents]);

  const addAgent = async (agent: Pick<Agent, 'name'> & { framework?: string; endpointUrl?: string }) => {
    const agentId = `agent-${agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`;
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          name: agent.name,
          framework: agent.framework || 'Autonomous Agent',
        }),
      });
      if (res.ok) {
        await fetchRealAgents();
      }
    } catch (e) {
      console.error('Failed to create agent:', e);
    }
  };

  const updateAgentHealth = (id: string, health: AgentHealth) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, health: { ...a.health, ...health } } : a))
    );
  };

  const toggleAgentStatus = (id: string) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: a.status === 'active' ? 'inactive' : 'active' } : a))
    );
  };

  const removeAgent = (id: string) => {
    setAgents((prev) => prev.filter((a) => a.id !== id));
  };

  return { agents, isLoading, addAgent, updateAgentHealth, removeAgent, toggleAgentStatus, refreshAgents: fetchRealAgents };
}
