'use client';

import { LogEntry } from '@/lib/use-logger';
import {
  Terminal,
  Copy,
  Check,
  Pause,
  Play,
  Search,
  AlertTriangle,
  Info,
  ChevronRight,
  X,
  Code2,
  Filter,
} from 'lucide-react';
import { useEffect, useRef, useState, useMemo } from 'react';

export function LiveLogFeed({ logs }: { logs: LogEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActionFilter, setSelectedActionFilter] = useState<string>('ALL');
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

  // Auto-scroll when new logs arrive (if autoScroll enabled)
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const copyLogs = () => {
    const text = logs
      .map(
        (l) =>
          `[${new Date(l.timestamp).toISOString()}] [${l.level}] [${l.action}] ${
            l.agentName ? `[${l.agentName}] ` : ''
          }${l.message}${l.flagReason ? ` (FLAGGED: ${l.flagReason})` : ''}`
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Action filter
      if (selectedActionFilter === 'RISK' && !log.isFlagged) return false;
      if (
        selectedActionFilter !== 'ALL' &&
        selectedActionFilter !== 'RISK' &&
        log.action !== selectedActionFilter
      ) {
        return false;
      }

      // Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        log.message.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        (log.agentName && log.agentName.toLowerCase().includes(q)) ||
        (log.flagReason && log.flagReason.toLowerCase().includes(q))
      );
    });
  }, [logs, selectedActionFilter, searchQuery]);

  const getActionBadge = (action: string, isFlagged: boolean) => {
    if (isFlagged) {
      return 'bg-rose-500/15 text-rose-400 border border-rose-500/30';
    }
    switch (action) {
      case 'EXEC':
        return 'bg-sky-500/15 text-sky-400 border border-sky-500/30';
      case 'THINK':
        return 'bg-purple-500/15 text-purple-400 border border-purple-500/30';
      case 'HTTP':
        return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
      case 'WRITE':
      case 'READ':
        return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
      case 'DELETE':
        return 'bg-red-500/15 text-red-400 border border-red-500/30';
      default:
        return 'bg-slate-700/40 text-slate-300 border border-slate-600/30';
    }
  };

  return (
    <div className="bg-slate-950 rounded-xl border border-slate-800 shadow-xl overflow-hidden flex flex-col h-[620px]">
      {/* Console Top Bar */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="font-mono font-semibold text-slate-200">Live Telemetry Console</span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
            {filteredLogs.length} events
          </span>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {['ALL', 'THINK', 'EXEC', 'HTTP', 'RISK'].map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => setSelectedActionFilter(action)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                selectedActionFilter === action
                  ? action === 'RISK'
                    ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {action === 'RISK' ? '⚠️ Risks' : action}
            </button>
          ))}
        </div>

        {/* Controls: Search, Pause/Resume, Copy */}
        <div className="flex items-center gap-2">
          {/* Quick Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-2 py-1 bg-slate-800/80 border border-slate-700/60 rounded text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-500 w-32 focus:w-44 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded transition-colors ${
              autoScroll
                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            }`}
            title={autoScroll ? 'Pause autoscroll' : 'Resume autoscroll'}
          >
            {autoScroll ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={copyLogs}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Copy logs payload to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Console Output View */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed divide-y divide-slate-900/60"
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 py-12">
            <Code2 className="w-8 h-8 text-slate-600" />
            <p className="font-sans text-sm">
              {searchQuery || selectedActionFilter !== 'ALL'
                ? 'No operations match your current search/filter.'
                : 'Waiting for agent telemetry stream...'}
            </p>
            <span className="text-[11px] text-slate-600 font-sans">
              Click &quot;Simulate Traffic&quot; or send POST requests to /api/webhook
            </span>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isSelected = selectedLog?.id === log.id;
            return (
              <div
                key={log.id}
                onClick={() => setSelectedLog(isSelected ? null : log)}
                className={`py-1.5 px-2 rounded-md transition-colors cursor-pointer flex items-start gap-2.5 group ${
                  log.isFlagged
                    ? 'bg-rose-950/20 hover:bg-rose-950/40 border-l-2 border-rose-500'
                    : isSelected
                    ? 'bg-slate-800/80'
                    : 'hover:bg-slate-900/80'
                }`}
              >
                {/* Timestamp */}
                <span className="text-slate-500 shrink-0 select-none pt-0.5 text-[11px]">
                  {new Date(log.timestamp).toLocaleTimeString([], {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>

                {/* Agent Tag */}
                {log.agentName && (
                  <span
                    className="shrink-0 max-w-[100px] truncate text-[10px] font-semibold text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60"
                    title={log.agentName}
                  >
                    {log.agentName}
                  </span>
                )}

                {/* Action Badge */}
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide ${getActionBadge(
                    log.action,
                    log.isFlagged
                  )}`}
                >
                  {log.action}
                </span>

                {/* Log Message Content */}
                <div className="flex-1 min-w-0 break-words">
                  <span
                    className={
                      log.isFlagged
                        ? 'text-rose-300 font-medium'
                        : log.action === 'THINK'
                        ? 'text-purple-200'
                        : log.action === 'EXEC'
                        ? 'text-sky-200'
                        : 'text-slate-200'
                    }
                  >
                    {log.message}
                  </span>

                  {log.flagReason && (
                    <div className="mt-1 text-[11px] text-rose-400 font-sans flex items-center gap-1.5 bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800/40 w-fit">
                      <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                      <span>{log.flagReason}</span>
                    </div>
                  )}
                </div>

                {/* Tokens and Inspector Icon */}
                <div className="shrink-0 flex items-center gap-2 self-start pt-0.5 text-[11px]">
                  {log.tokens > 0 && (
                    <span className="text-slate-500 group-hover:text-slate-400">
                      {log.tokens} tk
                    </span>
                  )}
                  <ChevronRight
                    className={`w-3.5 h-3.5 text-slate-600 transition-transform ${
                      isSelected ? 'rotate-90 text-emerald-400' : 'group-hover:text-slate-400'
                    }`}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Selected Log Quick Inspector Modal / Drawer */}
      {selectedLog && (
        <div className="bg-slate-900 border-t border-slate-800 p-3 text-xs font-mono text-slate-300 flex flex-col gap-2">
          <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-1.5 font-sans">
            <span className="flex items-center gap-1.5 font-semibold text-slate-200">
              <Info className="w-3.5 h-3.5 text-emerald-400" />
              Event Telemetry Inspector: <span className="font-mono text-xs">{selectedLog.id}</span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedLog(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div>
              <span className="text-slate-500 block">Timestamp</span>
              <span className="text-slate-300">{new Date(selectedLog.timestamp).toISOString()}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Agent Name / ID</span>
              <span className="text-slate-300">{selectedLog.agentName || 'Default'} ({selectedLog.agentId || 'N/A'})</span>
            </div>
            <div>
              <span className="text-slate-500 block">Tokens Ingested</span>
              <span className="text-slate-300 font-bold text-emerald-400">{selectedLog.tokens} tokens</span>
            </div>
            <div>
              <span className="text-slate-500 block">Safety Classification</span>
              <span className={selectedLog.isFlagged ? 'text-rose-400 font-bold' : 'text-emerald-400 font-semibold'}>
                {selectedLog.isFlagged ? 'VIOLATION DETECTED' : 'CLEAN / ALLOWED'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
