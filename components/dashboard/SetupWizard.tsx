import { useState } from 'react';
import { ArrowRight, TerminalSquare, ShieldCheck, Zap, Cloud, Home, Server, Bot } from 'lucide-react';

interface SetupWizardProps {
  onComplete: () => void;
}

const AGENT_PRESETS = [
  { id: 'openclaw', name: 'OpenClaw', cmd: 'python openclaw.py --run --console' },
  { id: 'hermes', name: 'Hermes Agent', cmd: 'hermes run --agent research-agent' },
  { id: 'autogpt', name: 'AutoGPT / CrewAI', cmd: 'python -u main.py' },
  { id: 'custom', name: 'Custom Agent / CLI', cmd: 'python agent.py --stream' },
];

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedAgentType, setSelectedAgentType] = useState('openclaw');
  const [agentPath, setAgentPath] = useState('python openclaw.py --run --console');
  const [environment, setEnvironment] = useState<'local' | 'cloud' | 'web'>('local');
  
  const handleSelectPreset = (preset: typeof AGENT_PRESETS[0]) => {
    setSelectedAgentType(preset.id);
    setAgentPath(preset.cmd);
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center px-4">
      <div className="bg-white flex flex-col md:flex-row w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden min-h-[480px]">
        
        {/* Left Side: Progress & Info */}
        <div className="w-full md:w-1/3 bg-slate-900 text-white p-8 flex flex-col">
          <div className="flex items-center gap-2 mb-8">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <div>
              <span className="font-bold tracking-tight text-lg">AgentShield Logger</span>
              <p className="text-slate-400 text-xs font-mono">Universal Agent Monitor</p>
            </div>
          </div>

          <div className="space-y-6 flex-1">
            <div className={`flex gap-4 items-start transition-opacity ${step >= 1 ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${step === 1 ? 'bg-emerald-500 text-white' : 'bg-slate-700'}`}>1</div>
              <div>
                <h4 className="font-medium text-sm">Environment</h4>
                <p className="text-slate-400 text-xs mt-1">Select deployment target</p>
              </div>
            </div>
            
            <div className={`flex gap-4 items-start transition-opacity ${step >= 2 ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${step === 2 ? 'bg-emerald-500 text-white' : 'bg-slate-700'}`}>2</div>
              <div>
                <h4 className="font-medium text-sm">Agent Framework</h4>
                <p className="text-slate-400 text-xs mt-1">OpenClaw, Hermes & Custom</p>
              </div>
            </div>

            <div className={`flex gap-4 items-start transition-opacity ${step >= 3 ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${step === 3 ? 'bg-emerald-500 text-white' : 'bg-slate-700'}`}>3</div>
              <div>
                <h4 className="font-medium text-sm">Finalize Setup</h4>
                <p className="text-slate-400 text-xs mt-1">Test connection</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Content */}
        <div className="w-full md:w-2/3 p-8 flex flex-col bg-gray-50">
          
          {step === 1 && (
            <div className="flex-1 animate-in fade-in slide-in-from-right-4 duration-500">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Environment Setup</h2>
              <p className="text-gray-600 mb-6">Select where your agents run to optimize the AgentShield monitoring connection.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <button 
                  onClick={() => setEnvironment('local')}
                  className={`p-4 rounded-xl border text-left transition-all ${environment === 'local' ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50' : 'border-gray-200 bg-white hover:border-emerald-300'}`}
                >
                  <Home className={`w-6 h-6 mb-2 ${environment === 'local' ? 'text-emerald-600' : 'text-gray-500'}`} />
                  <h3 className="font-semibold text-sm text-gray-900">Local / CLI</h3>
                  <p className="text-xs text-gray-500 mt-1">Directly tail CLI agents</p>
                </button>
                <button 
                  onClick={() => setEnvironment('cloud')}
                  className={`p-4 rounded-xl border text-left transition-all ${environment === 'cloud' ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50' : 'border-gray-200 bg-white hover:border-emerald-300'}`}
                >
                  <Server className={`w-6 h-6 mb-2 ${environment === 'cloud' ? 'text-emerald-600' : 'text-gray-500'}`} />
                  <h3 className="font-semibold text-sm text-gray-900">Cloud VPS / Host</h3>
                  <p className="text-xs text-gray-500 mt-1">AWS, GCP, Remote servers</p>
                </button>
                <button 
                  onClick={() => setEnvironment('web')}
                  className={`p-4 rounded-xl border text-left transition-all ${environment === 'web' ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50' : 'border-gray-200 bg-white hover:border-emerald-300'}`}
                >
                  <Cloud className={`w-6 h-6 mb-2 ${environment === 'web' ? 'text-emerald-600' : 'text-gray-500'}`} />
                  <h3 className="font-semibold text-sm text-gray-900">Webhook / HTTP</h3>
                  <p className="text-xs text-gray-500 mt-1">Cloud agents, Vercel, APIs</p>
                </button>
              </div>

              <div className="bg-white border text-sm border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <TerminalSquare className="w-5 h-5 text-gray-400" />
                    <span className="font-medium text-gray-700">Environment Selected</span>
                  </div>
                  <CheckBadge />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Zap className="w-5 h-5 text-gray-400" />
                    <span className="font-medium text-gray-700">{environment === 'web' ? 'Universal Webhook Endpoint Ready' : 'Process Standard Stream Interception'}</span>
                  </div>
                  <CheckBadge />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex-1 animate-in fade-in slide-in-from-right-4 duration-500">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Configure Agent Wrapper</h2>
              <p className="text-gray-600 mb-4">
                {environment === 'web' 
                  ? 'Connect any web agent (OpenClaw, Hermes, or custom API) via the universal Webhook route.' 
                  : 'Select your agent framework or enter your customary start command:'}
              </p>

              {environment !== 'web' && (
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Quick Framework Preset</label>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {AGENT_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset)}
                        className={`px-3 py-2 text-xs font-medium rounded-lg border text-left flex items-center gap-2 transition-all ${
                          selectedAgentType === preset.id
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-800 font-bold'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <Bot className="w-3.5 h-3.5 text-emerald-600" />
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-gray-800">
                  {environment === 'web' ? 'Agent Webhook Stream URL' : 'Launch Command'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 font-mono text-sm">{environment === 'web' ? '🔗' : '$'}</span>
                  </div>
                  <input 
                    type="text" 
                    value={environment === 'web' ? '/api/webhook' : agentPath}
                    onChange={(e) => setAgentPath(e.target.value)}
                    className="pl-8 w-full px-4 py-3 bg-white border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-shadow text-gray-800 shadow-sm"
                  />
                </div>
                <div className="bg-blue-50 border border-blue-100 text-blue-800 text-sm p-4 rounded-lg leading-relaxed">
                  <strong>Tip:</strong> 
                  {environment === 'web' 
                    ? ' Configure your OpenClaw, Hermes, or custom cloud agent to send JSON events to /api/webhook.'
                    : ' AgentShield executes your command and monitors standard streams, analyzing token counts and security heuristics automatically.'}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex-1 animate-in fade-in slide-in-from-right-4 duration-500">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Ready to Monitor</h2>
              <p className="text-gray-600 mb-8">AgentShield is ready. When you start the connection, we will begin streaming and analyzing live agent actions.</p>
              
              <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 shadow-inner">
                <p className="text-gray-400 font-mono text-sm leading-relaxed">
                  <span className="text-emerald-400">➜</span> {environment === 'web' ? 'agentshield listen --port 3000' : `agentshield run -- ${agentPath}`}<br/>
                  <span className="text-gray-500">INFO: AgentShield Logger initialized in {environment} mode.</span><br/>
                  <span className="text-gray-500">INFO: Ready for OpenClaw, Hermes, and autonomous agent streams...</span>
                </p>
              </div>
            </div>
          )}

          <div className="mt-8 flex justify-end">
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors shadow-sm"
            >
              {step === 3 ? 'Start Dashboard' : 'Continue'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

function CheckBadge() {
  return (
    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
      <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
}
