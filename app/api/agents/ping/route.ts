import { NextRequest } from 'next/server';
import dns from 'node:dns';
import { authenticateRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function isProhibitedIP(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, '').trim().toLowerCase();
  if (clean === 'localhost' || clean === '127.0.0.1' || clean === '::1' || clean === '0.0.0.0') return true;
  if (clean.startsWith('::ffff:')) {
    return isProhibitedIP(clean.replace('::ffff:', ''));
  }
  const parts = clean.split('.').map(Number);
  if (parts.length === 4 && !parts.some(isNaN)) {
    if (parts[0] === 127) return true; // Loopback
    if (parts[0] === 10) return true; // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
    if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16 (IMDS)
    if (parts[0] === 0) return true;
  }
  if (clean.startsWith('fc') || clean.startsWith('fd') || clean.startsWith('fe80:')) return true;
  return false;
}

export async function POST(req: Request) {
  try {
    const nextReq = new NextRequest(req);
    // Authentication requirement
    const auth = await authenticateRequest(nextReq);
    if (!auth && process.env.NODE_ENV === 'production') {
      return Response.json({ error: 'Unauthorized health probe' }, { status: 401 });
    }

    const body = await req.json();
    const { agentId, endpointUrl, timeoutMs = 3500 } = body;

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

    // 1. Strict URL validation
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

    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return Response.json(
        {
          success: false,
          statusCode: 400,
          latencyMs: 0,
          message: 'Only HTTP and HTTPS protocols are permitted for health checks.',
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // 2. Authoritative DNS resolution & SSRF check (Sections 10 & 11)
    try {
      const lookup = await dns.promises.lookup(targetUrl.hostname);
      if (isProhibitedIP(lookup.address)) {
        return Response.json(
          {
            success: false,
            statusCode: 403,
            latencyMs: 0,
            message: `SSRF Violation: Host '${targetUrl.hostname}' resolved to prohibited address '${lookup.address}'`,
            timestamp: new Date().toISOString(),
          },
          { status: 403 }
        );
      }
    } catch (dnsErr: any) {
      return Response.json(
        {
          success: false,
          statusCode: 502,
          latencyMs: 0,
          message: `DNS resolution failed for '${targetUrl.hostname}': ${dnsErr.message}`,
          timestamp: new Date().toISOString(),
        },
        { status: 502 }
      );
    }

    const startTime = Date.now();

    // 3. Probing with AbortController, redirect safety, and timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 5000));

    try {
      const response = await fetch(targetUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'AgentShield-HealthProbe/2.1',
          'Accept': 'application/json, text/plain',
        },
        redirect: 'error', // Rejects unverified redirects to prevent SSRF bypass
        signal: controller.signal,
      });

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
        message: isTimeout ? `Probe timed out after ${timeoutMs}ms` : fetchErr.message || 'Connection refused',
        timestamp: new Date().toISOString(),
      });
    } finally {
      clearTimeout(timer);
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
    service: 'AgentShield Health Probe API',
    status: 'online',
    version: '2.1.0',
    timestamp: new Date().toISOString(),
  });
}
