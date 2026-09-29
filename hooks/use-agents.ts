import { useState, useEffect } from 'react';

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
  description: string;
  status: 'active' | 'inactive';
  endpointUrl?: string;
  apiKey: string;
  createdAt: string;
  health?: AgentHealth;
}

const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'agent-hermes-1',
    name: 'Hermes 3 Reasoning Agent',
    framework: 'Hermes (Nous)',
    description: 'Autonomous research & multi-step tool execution model.',
    status: 'active',
    endpointUrl: 'https://hermes.agent.internal/health',
    apiKey: 'ag-hermes-89x201',
    createdAt: new Date().toISOString(),
    health: {
      status: 'healthy',
      latencyMs: 34,
      lastPingAt: new Date(Date.now() - 45000).toISOString(),
      lastPingMessage: '200 OK (dummy ping acknowledged)',
      statusCode: 200,
    }
  },
  {
    id: 'agent-claw-2',
    name: 'OpenClaw Code Assistant',
    framework: 'OpenClaw',
    description: 'Autonomous coding agent for full-stack codebase engineering.',
    status: 'active',
    endpointUrl: 'http://localhost:8000/v1/ping',
    apiKey: 'ag-claw-77a412',
    createdAt: new Date().toISOString(),
    health: {
      status: 'healthy',
      latencyMs: 22,
      lastPingAt: new Date(Date.now() - 45000).toISOString(),
      lastPingMessage: '200 OK (dummy ping acknowledged)',
      statusCode: 200,
    }
  },
  {
    id: 'agent-crew-3',
    name: 'AutoGPT Data Analyst',
    framework: 'AutoGPT / CrewAI',
    description: 'Telemetry and dataset analysis pipeline.',
    status: 'active',
    endpointUrl: 'http://localhost:5000/healthz',
    apiKey: 'ag-data-99v341',
    createdAt: new Date().toISOString(),
    health: {
      status: 'healthy',
      latencyMs: 41,
      lastPingAt: new Date(Date.now() - 45000).toISOString(),
      lastPingMessage: '200 OK (dummy ping acknowledged)',
      statusCode: 200,
    }
  }
];

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('agentshield_agents') || localStorage.getItem('clawguard_agents');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse agents', e);
        }
      }
    }
    return DEFAULT_AGENTS;
  });

  const addAgent = (agent: Pick<Agent, 'name' | 'description'> & { framework?: string; endpointUrl?: string }) => {
    const newAgent: Agent = {
      ...agent,
      id: 'agent-' + Math.random().toString(36).substring(2, 9),
      framework: agent.framework || 'Custom',
      endpointUrl: agent.endpointUrl || 'http://localhost:8000/health',
      status: 'active',
      apiKey: 'ag-' + Math.random().toString(36).substring(2, 10),
      createdAt: new Date().toISOString(),
      health: {
        status: 'healthy',
        latencyMs: 25,
        lastPingAt: new Date().toISOString(),
        lastPingMessage: '200 OK (dummy ping acknowledged)',
        statusCode: 200,
      }
    };
    const next = [...agents, newAgent];
    setAgents(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('agentshield_agents', JSON.stringify(next));
    }
  };

  const updateAgentHealth = (id: string, health: AgentHealth) => {
    setAgents((prev) => {
      const next = prev.map((a) => {
        if (a.id === id) {
          return { ...a, health: { ...a.health, ...health } };
        }
        return a;
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem('agentshield_agents', JSON.stringify(next));
      }
      return next;
    });
  };

  const updateAgent = (id: string, partial: Partial<Agent>) => {
    setAgents((prev) => {
      const next = prev.map((a) => (a.id === id ? { ...a, ...partial } : a));
      if (typeof window !== 'undefined') {
        localStorage.setItem('agentshield_agents', JSON.stringify(next));
      }
      return next;
    });
  };

  const removeAgent = (id: string) => {
    const next = agents.filter(a => a.id !== id);
    setAgents(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('agentshield_agents', JSON.stringify(next));
    }
  };

  const toggleAgentStatus = (id: string) => {
    const next: Agent[] = agents.map(a => {
      if (a.id === id) {
        return { ...a, status: a.status === 'active' ? 'inactive' : 'active' };
      }
      return a;
    });
    setAgents(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('agentshield_agents', JSON.stringify(next));
    }
  };

  return { agents, addAgent, updateAgent, updateAgentHealth, removeAgent, toggleAgentStatus };
}
