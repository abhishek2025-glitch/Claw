import { NextResponse } from 'next/server';
import { metricsCollector } from '@/lib/metrics';
import { policyEngine } from '@/lib/policy/engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const metrics = metricsCollector.getSnapshot();
  const config = policyEngine.getConfig();

  return NextResponse.json({
    metrics,
    policyMode: config.policyFailureMode,
    telemetryMode: config.telemetryFailureMode,
    workspaceRoot: config.workspaceRoot,
    timestamp: new Date().toISOString(),
  });
}
