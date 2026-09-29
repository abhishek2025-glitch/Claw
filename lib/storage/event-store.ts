import fs from 'node:fs';
import path from 'node:path';
import { SecurityEvent } from '../types/action';
import { redactObject } from '../policy/redact';

export interface EventFilter {
  environment?: 'production' | 'simulation';
  agentId?: string;
  action?: string;
  level?: string;
  eventType?: string;
  since?: string;
}

export interface IEventStore {
  append(event: SecurityEvent): Promise<void>;
  getRecent(limit?: number, filter?: EventFilter): Promise<SecurityEvent[]>;
  getById(id: string): Promise<SecurityEvent | null>;
  getByCorrelationId(correlationId: string): Promise<SecurityEvent[]>;
  getByAgent(agentId: string): Promise<SecurityEvent[]>;
  count(filter?: EventFilter): Promise<number>;
  clearSimulationOnly(): Promise<void>;
}

/**
 * File-backed Durable Event Store with Hot LRU Cache.
 * Provides append-only JSONL persistence with crash safety,
 * combined with an in-memory index for fast dashboard polling.
 */
export class DurableEventStore implements IEventStore {
  private filePath: string;
  private isInitialized = false;
  private productionCache: SecurityEvent[] = [];
  private simulationCache: SecurityEvent[] = [];
  private seenEventIds = new Set<string>();
  private readonly maxCacheSize = 1000;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(customPath?: string) {
    const defaultDir = process.env.EVENT_STORE_DIR || path.join(process.cwd(), '.agentshield');
    this.filePath = customPath || path.join(defaultDir, 'audit-events.jsonl');
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim().length > 0);

        for (const line of lines) {
          try {
            const parsed: SecurityEvent = JSON.parse(line);
            if (!this.seenEventIds.has(parsed.eventId)) {
              this.seenEventIds.add(parsed.eventId);
              if (parsed.environment === 'simulation') {
                this.simulationCache.push(parsed);
              } else {
                this.productionCache.push(parsed);
              }
            }
          } catch {
            // Corrupt line skipped safely
          }
        }

        // Keep caches bounded
        if (this.productionCache.length > this.maxCacheSize) {
          this.productionCache = this.productionCache.slice(-this.maxCacheSize);
        }
        if (this.simulationCache.length > this.maxCacheSize) {
          this.simulationCache = this.simulationCache.slice(-this.maxCacheSize);
        }
      } else {
        // Create initial empty file
        fs.writeFileSync(this.filePath, '', 'utf-8');
      }

      this.isInitialized = true;
    } catch (err) {
      console.error('[AgentShield EventStore] Initialization fallback to in-memory mode:', err);
      this.isInitialized = true;
    }
  }

  public async append(event: SecurityEvent): Promise<void> {
    await this.ensureInitialized();

    // Idempotent ingestion: ignore duplicate event IDs
    if (this.seenEventIds.has(event.eventId)) {
      return;
    }
    this.seenEventIds.add(event.eventId);

    // Apply strict server-side secret redaction before storage
    const sanitizedEvent = redactObject(event);

    // Route to appropriate cache
    if (sanitizedEvent.environment === 'simulation') {
      this.simulationCache.push(sanitizedEvent);
      if (this.simulationCache.length > this.maxCacheSize) {
        this.simulationCache.shift();
      }
      return; // Simulation events are NEVER written to the durable production audit log
    }

    // Production: update cache
    this.productionCache.push(sanitizedEvent);
    if (this.productionCache.length > this.maxCacheSize) {
      this.productionCache.shift();
    }

    // Sequential durable disk write (append-only JSONL)
    const line = JSON.stringify(sanitizedEvent) + '\n';
    this.writeQueue = this.writeQueue
      .then(async () => {
        try {
          await fs.promises.appendFile(this.filePath, line, 'utf-8');
        } catch (writeErr) {
          console.error('[AgentShield EventStore] Failed to write event to disk:', writeErr);
        }
      })
      .catch((err) => {
        console.error('[AgentShield EventStore] Write queue error:', err);
      });

    await this.writeQueue;
  }

  public async getRecent(limit = 100, filter?: EventFilter): Promise<SecurityEvent[]> {
    await this.ensureInitialized();

    const targetCache =
      filter?.environment === 'simulation' ? this.simulationCache : this.productionCache;

    let filtered = targetCache;

    if (filter) {
      filtered = filtered.filter((ev) => {
        if (filter.agentId && ev.agentId !== filter.agentId) return false;
        if (filter.action && ev.action !== filter.action) return false;
        if (filter.level && ev.level !== filter.level) return false;
        if (filter.eventType && ev.eventType !== filter.eventType) return false;
        if (filter.since && new Date(ev.timestamp).getTime() < new Date(filter.since).getTime()) return false;
        return true;
      });
    }

    return filtered.slice(-Math.min(limit, 500));
  }

  public async getById(id: string): Promise<SecurityEvent | null> {
    await this.ensureInitialized();
    const foundProd = this.productionCache.find((e) => e.eventId === id || e.actionId === id);
    if (foundProd) return foundProd;
    const foundSim = this.simulationCache.find((e) => e.eventId === id || e.actionId === id);
    return foundSim || null;
  }

  public async getByCorrelationId(correlationId: string): Promise<SecurityEvent[]> {
    await this.ensureInitialized();
    return this.productionCache.filter((e) => e.correlationId === correlationId);
  }

  public async getByAgent(agentId: string): Promise<SecurityEvent[]> {
    await this.ensureInitialized();
    return this.productionCache.filter((e) => e.agentId === agentId);
  }

  public async count(filter?: EventFilter): Promise<number> {
    await this.ensureInitialized();
    const items = await this.getRecent(10000, filter);
    return items.length;
  }

  public async clearSimulationOnly(): Promise<void> {
    this.simulationCache = [];
  }
}

// Global singleton instance
export const eventStore = new DurableEventStore();
