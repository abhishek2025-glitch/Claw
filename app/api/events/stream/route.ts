import { NextRequest } from 'next/server';
import { eventStore } from '@/lib/storage/event-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const environment = searchParams.get('env') === 'simulation' ? 'simulation' : 'production';

  const encoder = new TextEncoder();

  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection handshake
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ status: 'connected', environment })}\n\n`)
      );

      // Send recent events as initial burst
      const recent = await eventStore.getRecent(50, { environment });
      for (const ev of recent) {
        controller.enqueue(
          encoder.encode(`event: log\ndata: ${JSON.stringify(ev)}\n\n`)
        );
      }

      // Keep connection alive with periodic heartbeat
      const heartbeatInterval = setInterval(() => {
        if (isClosed) {
          clearInterval(heartbeatInterval);
          return;
        }
        try {
          controller.enqueue(encoder.encode(`event: ping\ndata: {"time": "${new Date().toISOString()}"}\n\n`));
        } catch {
          isClosed = true;
          clearInterval(heartbeatInterval);
        }
      }, 15000);

      req.signal.addEventListener('abort', () => {
        isClosed = true;
        clearInterval(heartbeatInterval);
      });
    },
    cancel() {
      isClosed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
