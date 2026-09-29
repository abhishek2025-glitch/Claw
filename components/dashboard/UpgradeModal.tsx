import { X, CheckCircle2, Zap, ShieldAlert, BarChart3, Star } from 'lucide-react';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { useState } from 'react';

interface UpgradeModalProps {
  onClose: () => void;
}

export function UpgradeModal({ onClose }: UpgradeModalProps) {
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Fallback to "test" in development if the variable isn't set
  const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || 'test';

  const initialOptions = {
    clientId: paypalClientId,
    currency: "USD",
    intent: "capture",
  };

  return (
    <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col md:flex-row overflow-hidden border border-gray-200">
        
        {/* Left Side: Features */}
        <div className="w-full md:w-1/2 p-8 lg:p-12 bg-gray-50 flex flex-col justify-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider mb-6 w-max">
            <Star className="w-4 h-4" /> AgentShield Pro
          </div>
          
          <h2 className="text-3xl font-bold text-gray-900 mb-4 tracking-tight">Level up your AI Security</h2>
          <p className="text-gray-600 mb-8 leading-relaxed">
            Move beyond local testing and empower your production fleets with enterprise-grade monitoring, alerts, and historical retention for OpenClaw, Hermes, and custom agents.
          </p>

          <ul className="space-y-4">
            {[
              { icon: Zap, text: 'Unlimited Webhook Ingestion' },
              { icon: ShieldAlert, text: 'Custom Heuristic Rule Engine' },
              { icon: BarChart3, text: '90-Day Log Retention & Export' },
              { icon: CheckCircle2, text: 'Priority Email Support' }
            ].map((feature, i) => (
              <li key={i} className="flex items-center gap-3">
                <div className="flex-shrink-0 bg-emerald-100 p-1.5 rounded-full">
                  <feature.icon className="w-4 h-4 text-emerald-600" />
                </div>
                <span className="text-gray-700 font-medium">{feature.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right Side: Payment Form */}
        <div className="w-full md:w-1/2 p-8 lg:p-12 bg-white flex flex-col relative">
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex-1 flex flex-col justify-center">
            {paymentStatus === 'success' ? (
              <div className="text-center animate-in zoom-in duration-300">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Pro!</h3>
                <p className="text-gray-600 mb-8">Your account has been upgraded successfully. Check your email for your premium license key.</p>
                <button 
                  onClick={onClose}
                  className="px-6 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors w-full"
                >
                  Return to Dashboard
                </button>
              </div>
            ) : (
              <div className="animate-in fade-in">
                <div className="mb-8 text-center">
                  <div className="text-gray-500 font-medium tracking-wide uppercase text-sm mb-2">One-time payment</div>
                  <div className="text-5xl font-extrabold text-gray-900">$49<span className="text-lg text-gray-500 font-normal">.00</span></div>
                  <p className="text-sm text-gray-500 mt-2">Lifetime access. No recurring fees.</p>
                </div>

                {paypalClientId === 'test' && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm mb-6 flex gap-2">
                    <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                    <p>Running in sandbox mode. Set NEXT_PUBLIC_PAYPAL_CLIENT_ID for live payments.</p>
                  </div>
                )}

                <div className="relative w-full z-0">
                  <PayPalScriptProvider options={initialOptions}>
                    <PayPalButtons
                      style={{ layout: "vertical", shape: "rect", color: "black", label: "pay" }}
                      createOrder={(data, actions) => {
                        return actions.order.create({
                          intent: 'CAPTURE',
                          purchase_units: [
                            {
                              description: "AgentShield Pro Lifetime License",
                              amount: {
                                currency_code: "USD",
                                value: "49.00",
                              },
                            },
                          ],
                        });
                      }}
                      onApprove={async (data, actions) => {
                        if (actions.order) {
                          const order = await actions.order.capture();
                          console.log("Payment successful:", order);
                          setPaymentStatus('success');
                        }
                      }}
                      onError={(err) => {
                        console.error("PayPal Checkout Error:", err);
                        setPaymentStatus('error');
                      }}
                    />
                  </PayPalScriptProvider>
                </div>

                {paymentStatus === 'error' && (
                  <p className="text-red-500 text-sm mt-4 text-center">There was an issue processing your payment. Please try again.</p>
                )}

                <div className="mt-8 text-center text-xs text-gray-400">
                  <p>Secure payments processed by PayPal.</p>
                  <p className="mt-1">By proceeding, you agree to our Terms of Service.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
