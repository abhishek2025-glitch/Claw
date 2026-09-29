import { LoggerStats, LogEntry } from '@/lib/use-logger';
import { Activity, AlertTriangle, Coins, Cpu, TrendingUp, ShieldCheck } from 'lucide-react';

export function StatCards({
  stats,
  costPer1M,
  logs = [],
}: {
  stats: LoggerStats;
  costPer1M: number;
  logs?: LogEntry[];
}) {
  const estimatedCost = (stats.totalTokens / 1_000_000) * costPer1M;
  const avgTokensPerAction = stats.totalActions > 0 ? Math.round(stats.totalTokens / stats.totalActions) : 0;
  const riskRate = stats.totalActions > 0 ? ((stats.flaggedRisks / stats.totalActions) * 100).toFixed(1) : '0.0';

  // Derive velocity purely based on recent logs in the stream buffer
  const latestLogTime = logs.length > 0 ? new Date(logs[logs.length - 1].timestamp).getTime() : 0;
  const recentActionsLastMinute = latestLogTime > 0
    ? logs.filter((l) => latestLogTime - new Date(l.timestamp).getTime() <= 60000).length
    : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* 1. Total Operations */}
      <div className="bg-white p-5 rounded-xl border border-gray-200/90 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              Total Operations
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <h3 className="text-3xl font-bold tracking-tight text-gray-900 font-mono">
                {stats.totalActions.toLocaleString()}
              </h3>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <Activity className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <span className="flex items-center gap-1 text-emerald-600 font-medium">
            <TrendingUp className="w-3.5 h-3.5" />
            {recentActionsLastMinute > 0 ? `${recentActionsLastMinute} ops / min` : 'Continuous stream'}
          </span>
          <span className="text-gray-400">100% Inspected</span>
        </div>
      </div>

      {/* 2. Security Anomalies */}
      <div className="bg-white p-5 rounded-xl border border-gray-200/90 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              Threats & Flags
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <h3
                className={`text-3xl font-bold tracking-tight font-mono ${
                  stats.flaggedRisks > 0 ? 'text-rose-600' : 'text-gray-900'
                }`}
              >
                {stats.flaggedRisks}
              </h3>
              {stats.flaggedRisks > 0 && (
                <span className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                  {riskRate}% Rate
                </span>
              )}
            </div>
          </div>
          <div
            className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${
              stats.flaggedRisks > 0
                ? 'bg-rose-50 border-rose-200 text-rose-600 animate-pulse'
                : 'bg-emerald-50 border-emerald-200 text-emerald-600'
            }`}
          >
            {stats.flaggedRisks > 0 ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <ShieldCheck className="w-5 h-5" />
            )}
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <span>{stats.flaggedRisks > 0 ? 'Intercepted by policy' : 'Safety Posture'}</span>
          <span className={stats.flaggedRisks > 0 ? 'text-rose-600 font-semibold' : 'text-emerald-600 font-semibold'}>
            {stats.flaggedRisks > 0 ? 'Action required' : 'Nominal (0 breaches)'}
          </span>
        </div>
      </div>

      {/* 3. Token Consumption */}
      <div className="bg-white p-5 rounded-xl border border-gray-200/90 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              Token Ingestion
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <h3 className="text-3xl font-bold tracking-tight text-gray-900 font-mono">
                {stats.totalTokens.toLocaleString()}
              </h3>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <span>Mean Execution</span>
          <span className="font-mono text-gray-700 font-medium">~{avgTokensPerAction} tk / op</span>
        </div>
      </div>

      {/* 4. Est. Cost */}
      <div className="bg-white p-5 rounded-xl border border-gray-200/90 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              Est. Compute Cost
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <h3 className="text-3xl font-bold tracking-tight text-emerald-600 font-mono">
                ${estimatedCost.toFixed(4)}
              </h3>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <Coins className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <span>Tier Valuation</span>
          <span className="font-mono text-gray-700 font-medium">${costPer1M.toFixed(2)} / 1M tk</span>
        </div>
      </div>
    </div>
  );
}
