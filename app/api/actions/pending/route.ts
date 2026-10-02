import { NextResponse } from 'next/server';
import { approvalManager } from '@/lib/approval/manager';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-AgentShield-Secret',
    },
  });
}

export async function GET() {
  const pending = approvalManager.listPendingActions();
  return NextResponse.json({
    pendingActions: pending,
    queueDepth: pending.length,
  });
}
