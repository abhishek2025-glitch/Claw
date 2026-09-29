import { NextResponse } from 'next/server';
import { approvalManager } from '@/lib/approval/manager';

export const dynamic = 'force-dynamic';

export async function GET() {
  const pending = approvalManager.listPendingActions();
  return NextResponse.json({
    pendingActions: pending,
    queueDepth: pending.length,
  });
}
