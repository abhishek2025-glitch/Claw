import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cliPath = path.join(process.cwd(), 'bin', 'agentshield.mjs');
    if (fs.existsSync(cliPath)) {
      const content = fs.readFileSync(cliPath, 'utf-8');
      return new Response(content, {
        status: 200,
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Content-Disposition': 'attachment; filename="agentshield.mjs"',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    return new Response('// CLI binary not found', { status: 404 });
  } catch (err: any) {
    return new Response(`// Error loading binary: ${err.message}`, { status: 500 });
  }
}
