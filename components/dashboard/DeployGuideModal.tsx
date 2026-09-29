import { X, Server, Cloud, Globe, Copy, Check, Terminal, Shield, Box, LayoutTemplate } from 'lucide-react';
import { useState } from 'react';

interface DeployGuideModalProps {
  onClose: () => void;
}

function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group mt-2 mb-4">
      <div className="absolute flex items-center justify-between top-0 px-3 py-1.5 w-full bg-gray-800 rounded-t-lg border-b border-gray-700">
        <span className="text-xs text-gray-400 font-mono uppercase">{language}</span>
        <button
          onClick={handleCopy}
          className="text-gray-400 hover:text-white transition-colors"
          title="Copy code"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <pre className="bg-[#0f172a] text-gray-300 p-4 pt-10 rounded-lg text-sm font-mono overflow-x-auto border border-gray-800 shadow-inner">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function DeployGuideModal({ onClose }: DeployGuideModalProps) {
  const [activeTab, setActiveTab] = useState<'docker' | 'aws' | 'gcp' | 'azure' | 'vercel'>('docker');

  return (
    <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 p-2 rounded-lg">
              <Shield className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Production Deployment Guide</h2>
              <p className="text-xs text-gray-500 font-medium mt-0.5">Fully researched, enterprise-grade deployment strategies</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
          {/* Sidebar Tabs */}
          <div className="w-full md:w-64 bg-gray-50 border-r border-gray-200 p-4 space-y-1 flex-shrink-0 overflow-y-auto">
            
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-2 px-2">Foundation</div>
            <button
              onClick={() => setActiveTab('docker')}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === 'docker' ? 'bg-emerald-100 text-emerald-800 shadow-sm' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Box className="w-4 h-4" /> Docker (Base)
            </button>

            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-6 px-2">Cloud Providers</div>
            <button
              onClick={() => setActiveTab('aws')}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === 'aws' ? 'bg-emerald-100 text-emerald-800 shadow-sm' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Cloud className="w-4 h-4" /> AWS (EC2 / Nginx)
            </button>
            <button
              onClick={() => setActiveTab('gcp')}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === 'gcp' ? 'bg-emerald-100 text-emerald-800 shadow-sm' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Server className="w-4 h-4" /> Google Cloud Run
            </button>
            <button
              onClick={() => setActiveTab('azure')}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === 'azure' ? 'bg-emerald-100 text-emerald-800 shadow-sm' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <LayoutTemplate className="w-4 h-4" /> Azure Container Apps
            </button>

            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-6 px-2">Web Platforms</div>
            <button
              onClick={() => setActiveTab('vercel')}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === 'vercel' ? 'bg-emerald-100 text-emerald-800 shadow-sm' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Globe className="w-4 h-4" /> Vercel / Netlify
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-white">
            
            {activeTab === 'docker' && (
              <div className="space-y-6 animate-in fade-in">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Docker Configuration</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    AgentShield utilizes Next.js <code className="bg-gray-100 px-1 rounded text-gray-800">output: &apos;standalone&apos;</code> for highly optimized, minimal container footprints. This Dockerfile is the foundation for GCP, Azure, and custom VPS deployments.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-600" />
                    Production Dockerfile
                  </h4>
                  <p className="text-xs text-gray-500 mb-2">Save this as <code>Dockerfile</code> in the root of your project.</p>
                  <CodeBlock 
                    language="dockerfile"
                    code={`FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Dependencies Phase
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# Build Phase
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Set environment variables required for build if any
RUN npm run build

# Production Runner Phase
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy static assets and standalone server
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]`} />
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">Docker Compose (Optional)</h4>
                  <p className="text-xs text-gray-500 mb-2">For simple local or VM deployment running in detached mode.</p>
                  <CodeBlock 
                    language="yaml"
                    code={`version: '3.8'
services:
  agentshield:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_COST_PER_MILLION=0.50
      - AGENTSHIELD_MODE=cloud
    restart: unless-stopped`} />
                </div>
              </div>
            )}

            {activeTab === 'aws' && (
              <div className="space-y-6 animate-in fade-in">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">AWS EC2 Production Setup</h3>
                  <p className="text-gray-600 text-sm">Target architecture: Ubuntu 24.04 LTS bare-metal or EC2 instance running PM2 cluster mode behind an Nginx reverse proxy with automated SSL (Let&apos;s Encrypt).</p>
                </div>

                <div className="space-y-6">
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2 text-sm border-b pb-1">1. AWS Security Groups (Firewall)</h4>
                    <p className="text-sm text-gray-600">Ensure your EC2 instance explicitly allows Inbound traffic on:</p>
                    <ul className="list-disc ml-5 text-sm text-gray-600 mt-1 space-y-1">
                      <li><span className="font-mono bg-gray-100 px-1">22 (SSH)</span> - Restricted to your IP</li>
                      <li><span className="font-mono bg-gray-100 px-1">80 (HTTP)</span> - Open to 0.0.0.0/0</li>
                      <li><span className="font-mono bg-gray-100 px-1">443 (HTTPS)</span> - Open to 0.0.0.0/0</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2 text-sm border-b pb-1">2. Node.js & PM2 Ecosystem Configuration</h4>
                    <p className="text-sm text-gray-600">Clone the repository and build the standalone app. Create an <code className="bg-gray-100 px-1">ecosystem.config.js</code> file to manage continuous execution and automatic restarts.</p>
                    <CodeBlock 
                      language="javascript"
                      code={`module.exports = {
  apps: [
    {
      name: 'agentshield-logger',
      script: 'node',
      args: 'server.js', // Target the standalone server.js
      cwd: '/var/www/agentshield/.next/standalone',
      instances: 'max', // Utilizes all CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        AGENTSHIELD_MODE: 'cloud'
      }
    }
  ]
};`} />
                  <p className="text-sm text-gray-600 mt-2">Start the application: <code className="bg-gray-100 px-1 font-mono text-xs">pm2 start ecosystem.config.js && pm2 save && pm2 startup</code></p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2 text-sm border-b pb-1">3. Nginx Reverse Proxy Configuration</h4>
                    <p className="text-sm text-gray-600 mb-2">Route external traffic on port 80/443 to your PM2 cluster running on port 3000.</p>
                    <CodeBlock 
                      language="nginx"
                      code={`server {
    listen 80;
    server_name agentshield.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}`} />
                    <p className="text-sm text-gray-600 mt-2">Enable it: <code className="bg-gray-100 px-1 font-mono text-xs">sudo ln -s /etc/nginx/sites-available/agentshield /etc/nginx/sites-enabled/ && sudo systemctl restart nginx</code></p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'gcp' && (
              <div className="space-y-6 animate-in fade-in">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Google Cloud Run Setup</h3>
                  <p className="text-gray-600 text-sm">Cloud Run is Google&apos;s fully managed container platform. It&apos;s perfectly suited for AgentShield instances operating in Webhook mode, offering auto-scaling to 0 (saving costs).</p>
                </div>

                <div className="space-y-6">
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2 text-sm border-b pb-1">1. Enable Necessary APIs</h4>
                    <p className="text-sm text-gray-600 mb-2">Ensure your GCP project has Cloud Build and Cloud Run APIs enabled.</p>
                    <CodeBlock 
                      language="bash"
                      code={`gcloud services enable cloudbuild.googleapis.com run.googleapis.com`} />
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2 text-sm border-b pb-1">2. Build via Cloud Build</h4>
                    <p className="text-sm text-gray-600 mb-2">Submit your source code containing the <code className="bg-gray-100 px-1">Dockerfile</code> to Google Artifact Registry.</p>
                    <CodeBlock 
                      language="bash"
                      code={`gcloud builds submit --tag gcr.io/[PROJECT_ID]/agentshield-logger`} />
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2 text-sm border-b pb-1">3. Deploy to Cloud Run</h4>
                    <p className="text-sm text-gray-600 mb-2">Deploy the container as a public service. Set concurrency (Next.js can handle ~80 concurrent requests easily) and environment variables.</p>
                    <CodeBlock 
                      language="bash"
                      code={`gcloud run deploy agentshield-logger \\
  --image gcr.io/[PROJECT_ID]/agentshield-logger \\
  --platform managed \\
  --region us-central1 \\
  --allow-unauthenticated \\
  --port 3000 \\
  --max-instances 5 \\
  --concurrency 80 \\
  --set-env-vars="AGENTSHIELD_MODE=web,TELEGRAM_BOT_TOKEN=your_token_here"`} />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'azure' && (
              <div className="space-y-6 animate-in fade-in">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Azure Container Apps</h3>
                  <p className="text-gray-600 text-sm">Serverless container hosting on Microsoft Azure. Features built-in auto-scaling based on HTTP traffic.</p>
                </div>

                <div className="space-y-6">
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2 text-sm border-b pb-1">1. Login and Resource Group Preparation</h4>
                    <CodeBlock 
                      language="bash"
                      code={`az login
az group create --name agentshield-rg --location eastus`} />
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2 text-sm border-b pb-1">2. Azure Container Registry (ACR)</h4>
                    <p className="text-sm text-gray-600 mb-2">Create a registry, build your Docker image locally, and push it to Azure.</p>
                    <CodeBlock 
                      language="bash"
                      code={`# Create ACR
az acr create --resource-group agentshield-rg --name agentshieldregistry --sku Basic --admin-enabled true

# Login locally to ACR
az acr login --name agentshieldregistry

# Build and Push
docker build -t agentshieldregistry.azurecr.io/agentshield:v1 .
docker push agentshieldregistry.azurecr.io/agentshield:v1`} />
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2 text-sm border-b pb-1">3. Provision the Container App Environment & Service</h4>
                    <CodeBlock 
                      language="bash"
                      code={`# Create the Azure Container App Environment
az containerapp env create \\
  --name agentshield-env \\
  --resource-group agentshield-rg \\
  --location eastus

# Deploy the Application
az containerapp create \\
  --name agentshield-app \\
  --resource-group agentshield-rg \\
  --environment agentshield-env \\
  --image agentshieldregistry.azurecr.io/agentshield:v1 \\
  --target-port 3000 \\
  --ingress external \\
  --min-replicas 0 \\
  --max-replicas 3 \\
  --env-vars AGENTSHIELD_MODE=web`} />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'vercel' && (
              <div className="space-y-6 animate-in fade-in">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Vercel & Netlify</h3>
                  <p className="text-gray-600 text-sm">Vercel is the creator of Next.js and provides a zero-configuration deployment experience for serverless React applications. Because serverless environments lack persistent file systems, AgentShield MUST be set to <strong>Web / Webhook mode</strong> in the environment setup.</p>
                </div>

                <div className="space-y-6">
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2 text-sm border-b pb-1">1. Prepare Repository</h4>
                    <p className="text-sm text-gray-600">Commit your code and push it to a GitHub, GitLab, or Bitbucket repository. Open the Vercel Dashboard, click &quot;Add New...&quot;, select Project, and import your repository.</p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2 text-sm border-b pb-1">2. Environment Variables Configuration</h4>
                    <p className="text-sm text-gray-600 mb-2">In the deployment configuration screen on Vercel, expand the &quot;Environment Variables&quot; section and add the following:</p>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-2 font-semibold text-gray-700">Key Name</th>
                            <th className="px-4 py-2 font-semibold text-gray-700">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          <tr>
                            <td className="px-4 py-3 font-mono text-xs text-gray-800">AGENTSHIELD_MODE</td>
                            <td className="px-4 py-3 text-gray-600">Must be set to <code className="bg-gray-100 px-1">web</code> to enable webhook receivers instead of local file system tailing.</td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 font-mono text-xs text-gray-800">WEBHOOK_SECRET</td>
                            <td className="px-4 py-3 text-gray-600">A secure random string (e.g., UUID) used to authenticate incoming webhook payloads from your agent.</td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 font-mono text-xs text-gray-800">NEXT_PUBLIC_COST_PER_MILLION</td>
                            <td className="px-4 py-3 text-gray-600">Default fallback token price (e.g., <code className="bg-gray-100 px-1">0.50</code>).</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2 text-sm border-b pb-1">3. Agent Integration</h4>
                    <p className="text-sm text-gray-600 mb-2">Once deployed, take your project URL (e.g., <code className="bg-gray-100 px-1">https://agentshield-app.vercel.app</code>) and configure your OpenClaw, Hermes, or custom agent to send POST JSON requests to the webhook route:</p>
                    <CodeBlock 
                      language="bash"
                      code={`POST https://agentshield-app.vercel.app/api/webhook
Content-Type: application/json
Authorization: Bearer YOUR_WEBHOOK_SECRET

{
  "agentName": "Hermes 3",
  "action": "EXEC",
  "level": "WARN",
  "message": "Executed command: npm run build",
  "tokens": 150
}`} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
