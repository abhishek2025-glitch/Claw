'use client';

import { X, CheckCircle2, Zap, ShieldAlert, BarChart3, Star, ArrowRight, Copy, Check, Terminal, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';

interface UpgradeModalProps {
  onClose: () => void;
}

export function UpgradeModal({ onClose }: UpgradeModalProps) {
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeLicense, setActiveLicense] = useState<string | null>(null);
  const [copiedLicense, setCopiedLicense] = useState(false);

  useEffect(() => {
    // Check if organization already has an active license
    fetch('/api/licenses')
      .then((r) => r.json())
      .then((d) => {
        if (d.licenses && d.licenses.length > 0) {
          const active = d.licenses.find((l: any) => l.status === 'ACTIVE');
          if (active) {
            setActiveLicense(active.licenseKey);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleDodoCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerEmail) {
      setErrorMsg('Please enter your email address for license issuance.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail,
          customerName: customerName || 'AgentShield Customer',
          organizationId: 'org-default',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data.error || 'Failed to initialize Dodo checkout');
      }

      // Redirect customer to authoritative Dodo Payments checkout
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMsg(err.message || 'Payment provider error. Please try again.');
    }
  };

  const copyLicense = () => {
    if (activeLicense) {
      navigator.clipboard.writeText(activeLicense);
      setCopiedLicense(true);
      setTimeout(() => setCopiedLicense(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col md:flex-row overflow-hidden border border-gray-200">
        
        {/* Left Side: Features & Value Proposition */}
        <div className="w-full md:w-1/2 p-8 lg:p-12 bg-slate-900 text-white flex flex-col justify-center border-r border-slate-800">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-6 w-max border border-emerald-500/30">
            <Star className="w-4 h-4 fill-emerald-400" /> AgentShield Pro Lifetime
          </div>
          
          <h2 className="text-2xl lg:text-3xl font-bold text-white mb-4 tracking-tight">
            Production AI Agent Security &amp; Guardrails
          </h2>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">
            Protect OpenClaw, Hermes 3, AutoGPT, and bespoke LLM agent loops from catastrophic tool failures, prompt injection exploits, destructive filesystem operations, and credential exfiltration.
          </p>

          <ul className="space-y-4 text-sm">
            {[
              { icon: Zap, text: 'Real OpenClaw & Process Interceptor' },
              { icon: ShieldAlert, text: 'Fail-Closed Deterministic Policy Gate' },
              { icon: BarChart3, text: 'Cryptographic Ed25519 Offline Licensing' },
              { icon: CheckCircle2, text: 'Up to 5 Registered Devices per Seat' },
              { icon: Terminal, text: 'Full CLI Toolkit & Offline Runtime' },
            ].map((feature, i) => (
              <li key={i} className="flex items-center gap-3">
                <div className="flex-shrink-0 bg-emerald-500/10 p-1.5 rounded-lg border border-emerald-500/20 text-emerald-400">
                  <feature.icon className="w-4 h-4" />
                </div>
                <span className="text-slate-200 font-medium">{feature.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right Side: Dodo Payments Checkout Form */}
        <div className="w-full md:w-1/2 p-8 lg:p-12 bg-white flex flex-col relative justify-center">
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>

          {activeLicense ? (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-200">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900">Active Pro License</h3>
                <p className="text-xs text-gray-500 mt-1">Verified via Authoritative Control Plane</p>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-gray-600">
                  <span>Cryptographic License Key</span>
                  <button
                    onClick={copyLicense}
                    className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 transition-colors"
                  >
                    {copiedLicense ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedLicense ? 'Copied' : 'Copy Key'}
                  </button>
                </div>
                <p className="font-mono text-xs text-gray-800 break-all bg-white p-3 rounded-lg border border-gray-200">
                  {activeLicense}
                </p>
              </div>

              <div className="bg-slate-900 text-slate-300 p-4 rounded-xl text-xs space-y-2">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" /> Local Activation Command
                </span>
                <pre className="font-mono text-emerald-300 overflow-x-auto">
                  <code>agentshield activate {activeLicense.slice(0, 20)}...</code>
                </pre>
              </div>

              <button
                onClick={onClose}
                className="w-full py-2.5 px-4 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleDodoCheckout} className="space-y-6">
              <div className="text-center">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Commercial License</div>
                <div className="text-4xl font-extrabold text-gray-900">$49<span className="text-lg text-gray-500 font-normal">.00</span></div>
                <p className="text-xs text-gray-500 mt-1">One-time purchase. Lifetime local offline access.</p>
              </div>

              {errorMsg && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">
                  {errorMsg}
                </div>
              )}

              <div className="space-y-4 text-left">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Account / Delivery Email</label>
                  <input
                    type="email"
                    required
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Company / Customer Name (Optional)</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Acme Corp or Engineer Name"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>{isProcessing ? 'Connecting to Dodo Payments...' : 'Pay $49 with Dodo Payments'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="text-center text-[11px] text-gray-400 space-y-1">
                <p className="flex items-center justify-center gap-1">
                  <span>Authoritative payment gateway by</span>
                  <strong className="text-gray-700">Dodo Payments</strong>
                </p>
                <p>Instant webhook fulfillment &amp; cryptographic Ed25519 license issuance.</p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
