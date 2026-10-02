import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId') || 'org-default';

  const agents = await db.getAgentsByOrg(orgId);
  return NextResponse.json({ agents, total: agents.length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, name, framework, organizationId = 'org-default' } = body;

    if (!agentId || !name) {
      return NextResponse.json({ error: 'Missing agentId or name' }, { status: 400 });
    }

    const agent = await db.upsertAgent(organizationId, {
      agentId,
      name,
      framework: framework || 'Custom Autonomous Agent',
    });

    return NextResponse.json({ success: true, agent });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
