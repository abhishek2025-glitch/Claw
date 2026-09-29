import { LogEntry } from '@/lib/use-logger';
import { BellRing, Check, AlertTriangle, Bot } from 'lucide-react';
import { useState } from 'react';

export function AlertsView({ logs }: { logs: LogEntry[] }) {
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  
  const alerts = logs.filter(l => l.isFlagged).reverse();
  const activeAlerts = alerts.filter(l => !resolvedIds.has(l.id));

  const resolveAlert = (id: string) => {
    setResolvedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const resolveAll = () => {
    setResolvedIds(new Set(alerts.map(a => a.id)));
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-full ${activeAlerts.length > 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
            <BellRing className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Security Alerts</h2>
            <p className="text-sm text-gray-500">
              {activeAlerts.length} unresolved alerts out of {alerts.length} total.
            </p>
          </div>
        </div>
        {activeAlerts.length > 0 && (
          <button 
            onClick={resolveAll}
            className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm"
          >
            <Check className="w-4 h-4" /> Resolve All
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto space-y-4 pb-12">
        {activeAlerts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500 flex flex-col items-center">
            <Check className="w-12 h-12 text-emerald-400 mb-4" />
            <p className="text-lg font-medium text-gray-900">All Clear</p>
            <p>No active security alerts require your attention.</p>
          </div>
        ) : (
          activeAlerts.map(alert => (
            <div key={alert.id} className="bg-white rounded-xl border-l-4 border-l-red-500 border border-gray-200 p-6 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center shadow-sm">
              <div className="flex-1 w-full">
                <div className="flex items-center gap-3 mb-2">
                  <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider">{alert.level}</span>
                  <span className="text-gray-500 text-sm font-mono">{new Date(alert.timestamp).toLocaleString()}</span>
                  {alert.agentName && (
                    <span className="text-blue-700 bg-blue-100 text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1"><Bot className="w-3 h-3" /> {alert.agentName}</span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  {alert.action} Operation Blocked / Flagged
                </h3>
                <p className="text-gray-700 font-mono text-sm bg-gray-50 p-3 rounded mt-3 border border-gray-200 break-words">
                  {alert.message}
                </p>
                {alert.flagReason && (
                  <p className="text-red-700 text-sm mt-3 font-medium flex items-start gap-2 bg-red-50 p-2 rounded border border-red-100">
                    <span className="font-bold">Reason:</span> {alert.flagReason}
                  </p>
                )}
              </div>
              <div className="flex flex-row gap-3 pt-2 md:pt-0 shrink-0 self-end md:self-auto">
                <button 
                  onClick={() => resolveAlert(alert.id)}
                  className="px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium rounded-lg transition-colors flex items-center gap-2 border border-emerald-200"
                >
                  <Check className="w-4 h-4" /> Mark Resolved
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
