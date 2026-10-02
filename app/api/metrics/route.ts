import { NextResponse } from 'next/server';
import { metricsCollector } from '@/lib/metrics';
import { policyEngine } from '@/lib/policy/engine';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

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
