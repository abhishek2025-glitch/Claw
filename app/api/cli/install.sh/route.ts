import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin || 'https://agentshield.vercel.app';

  const script = `#!/usr/bin/env bash
# AgentShield Universal CLI Installer & Runner
# https://github.com/agentshield/agentshield

set -e

ENDPOINT="\${AGENTSHIELD_ENDPOINT:-${origin}}"
INSTALL_DIR="\${HOME}/.agentshield/bin"
CLI_TARGET="\${INSTALL_DIR}/agentshield.mjs"

echo -e "\\033[38;5;48m[AgentShield]\\033[0m Initializing Universal Agent Guardrail CLI..."

# Check Node.js runtime
if ! command -v node >/dev/null 2>&1; then
  echo -e "\\033[31m[AgentShield Error]\\033[0m Node.js runtime (v18+) is required to execute AgentShield."
  echo "Please install Node.js from https://nodejs.org or via your package manager."
  exit 1
fi

mkdir -p "\${INSTALL_DIR}"

# Fetch latest CLI bundle from live server
echo -e "\\033[38;5;48m[AgentShield]\\033[0m Downloading latest CLI from \${ENDPOINT}..."
curl -sSL "\${ENDPOINT}/api/cli/binary" -o "\${CLI_TARGET}" 2>/dev/null || curl -sSL "\${ENDPOINT}/agentshield.mjs" -o "\${CLI_TARGET}"

chmod +x "\${CLI_TARGET}"

# If arguments were provided to bash -s -- <args>, forward them immediately to the CLI
if [ "$#" -gt 0 ]; then
  exec node "\${CLI_TARGET}" "$@"
else
  echo -e "\\033[32m✔ Successfully installed AgentShield CLI to \${CLI_TARGET}\\033[0m"
  echo ""
  echo "To use 'agentshield' anywhere, add it to your PATH:"
  echo "  export PATH=\\"\\$PATH:\${INSTALL_DIR}\\""
  echo ""
  echo "Or run immediately:"
  echo "  node \${CLI_TARGET} wrap --endpoint \${ENDPOINT} -- <your-agent-command>"
  echo ""
fi
`;

  return new Response(script, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
