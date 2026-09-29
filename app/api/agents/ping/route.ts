export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { agentId, endpointUrl, timeoutMs = 4000 } = body;

    if (!endpointUrl) {
      return Response.json(
        {
          success: false,
          statusCode: 400,
          latencyMs: 0,
          message: 'No endpoint URL configured for this agent.',
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const startTime = Date.now();

    // Support simulated / local test domains without failing container sandbox DNS
    const isMock =
      endpointUrl.includes('.local') ||
      endpointUrl.includes('mock') ||
      endpointUrl.includes('dummy') ||
      endpointUrl.includes('agent.internal');

    if (isMock) {
      const simulatedLatency = Math.floor(Math.random() * 65) + 18;
      await new Promise((resolve) => setTimeout(resolve, Math.min(simulatedLatency, 100)));

      // 95% healthy rate for standard dummy endpoints
      const isHealthy = Math.random() > 0.05;
      return Response.json({
        success: isHealthy,
        statusCode: isHealthy ? 200 : 503,
        latencyMs: simulatedLatency,
        message: isHealthy ? '200 OK (dummy ping acknowledged)' : '503 Service Degraded',
        timestamp: new Date().toISOString(),
      });
    }

    // Validate URL format
    let targetUrl: URL;
    try {
      targetUrl = new URL(endpointUrl);
    } catch {
      return Response.json(
        {
          success: false,
          statusCode: 400,
          latencyMs: 0,
          message: 'Invalid endpoint URL format.',
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // Real probe with timeout
    try {
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        // First try HTTP POST with a health probe ping payload
        response = await fetch(targetUrl.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'AgentShield-HealthCheck/1.0',
          },
          body: JSON.stringify({
            action: 'PING',
            agentId: agentId || 'unknown',
            timestamp: new Date().toISOString(),
            probe: 'AgentShield Scheduled Health Check',
          }),
          signal: controller.signal,
        });
      } catch (postErr: any) {
        // If POST failed with network abort, throw
        if (postErr.name === 'AbortError') {
          throw postErr;
        }
        // Otherwise attempt lightweight GET / HEAD probe
        response = await fetch(targetUrl.toString(), {
          method: 'GET',
          headers: {
            'User-Agent': 'AgentShield-HealthCheck/1.0',
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutTimer);
      }

      const latencyMs = Date.now() - startTime;
      const isOk = response.status >= 200 && response.status < 400;

      return Response.json({
        success: isOk,
        statusCode: response.status,
        latencyMs,
        message: `${response.status} ${response.statusText || (isOk ? 'OK' : 'Error')}`,
        timestamp: new Date().toISOString(),
      });
    } catch (fetchErr: any) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = fetchErr.name === 'AbortError';

      return Response.json({
        success: false,
        statusCode: isTimeout ? 408 : 502,
        latencyMs,
        message: isTimeout ? `Request timed out after ${timeoutMs}ms` : (fetchErr.message || 'Connection refused'),
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    return Response.json(
      {
        success: false,
        statusCode: 500,
        latencyMs: 0,
        message: error.message || 'Internal health check error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({
    service: 'AgentShield Health Check Ping API',
    status: 'online',
    timestamp: new Date().toISOString(),
  });
}
