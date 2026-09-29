import { InternalMetrics } from '../types/action';
import { approvalManager } from '../approval/manager';

class MetricsCollector {
  private metrics: InternalMetrics = {
    policyEvaluations: 0,
    policyFailures: 0,
    blockedActions: 0,
    allowedActions: 0,
    approvalQueueDepth: 0,
    telemetryQueueDepth: 0,
    eventPersistenceFailures: 0,
    executionFailures: 0,
    averagePolicyLatencyMs: 0,
    p95PolicyLatencyMs: 0,
    p99PolicyLatencyMs: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };

  private latencies: number[] = [];
  private readonly maxLatencySamples = 500;

  public recordPolicyEvaluation(latencyMs: number, decision: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL' | 'AUDIT_ONLY', failed = false) {
    this.metrics.policyEvaluations++;
    if (failed) this.metrics.policyFailures++;
    if (decision === 'DENY') this.metrics.blockedActions++;
    if (decision === 'ALLOW' || decision === 'AUDIT_ONLY') this.metrics.allowedActions++;

    this.latencies.push(latencyMs);
    if (this.latencies.length > this.maxLatencySamples) {
      this.latencies.shift();
    }
    this.recalculateLatencyStats();
  }

  public recordExecutionFailure() {
    this.metrics.executionFailures++;
  }

  public recordPersistenceFailure() {
    this.metrics.eventPersistenceFailures++;
  }

  public recordTokens(tokens: number, costRatePer1M = 0.50) {
    this.metrics.totalTokens += tokens;
    this.metrics.estimatedCostUsd += (tokens / 1_000_000) * costRatePer1M;
  }

  private recalculateLatencyStats() {
    if (this.latencies.length === 0) return;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, curr) => acc + curr, 0);
    this.metrics.averagePolicyLatencyMs = Math.round((sum / sorted.length) * 100) / 100;

    const p95Idx = Math.floor(sorted.length * 0.95);
    const p99Idx = Math.floor(sorted.length * 0.99);
    this.metrics.p95PolicyLatencyMs = sorted[Math.min(p95Idx, sorted.length - 1)];
    this.metrics.p99PolicyLatencyMs = sorted[Math.min(p99Idx, sorted.length - 1)];
  }

  public getSnapshot(): InternalMetrics {
    return {
      ...this.metrics,
      approvalQueueDepth: approvalManager.getQueueDepth(),
    };
  }
}

export const metricsCollector = new MetricsCollector();
