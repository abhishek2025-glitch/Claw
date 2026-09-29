import { LogEntry } from '@/lib/use-logger';
import { Search, Download } from 'lucide-react';
import { useState } from 'react';

export function FullLogsView({ logs }: { logs: LogEntry[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState<string>('ALL');

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase()) || log.action.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterLevel === 'ALL' || log.level === filterLevel;
    return matchesSearch && matchesFilter;
  });

  const downloadCSV = () => {
    const header = "Timestamp,Level,Action,Message,Tokens,Flagged,FlagReason\n";
    const csv = filteredLogs.map(l => 
      `${new Date(l.timestamp).toISOString()},${l.level},${l.action},"${(l.message || '').replace(/"/g, '""')}",${l.tokens || 0},${Boolean(l.isFlagged)},"${(l.flagReason || '').replace(/"/g, '""')}"`
    ).join("\n");
    const blob = new Blob([header + csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentshield_logs_${new Date().toISOString()}.csv`;
    a.click();
  };

  return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-140px)]">
        <div className="p-4 border-b border-gray-200 flex flex-wrap gap-4 items-center justify-between bg-gray-50">
          <div className="flex gap-4 items-center">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search logs..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none w-64"
              />
            </div>
            <select 
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="ALL">All Levels</option>
              <option value="INFO">INFO</option>
              <option value="WARN">WARN</option>
              <option value="ERROR">ERROR</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
          <button onClick={downloadCSV} className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors font-medium">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 shadow-sm">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-500">Timestamp</th>
                <th className="px-6 py-3 font-medium text-gray-500">Level</th>
                <th className="px-6 py-3 font-medium text-gray-500">Action</th>
                <th className="px-6 py-3 font-medium text-gray-500 w-full whitespace-normal">Message</th>
                <th className="px-6 py-3 font-medium text-gray-500">Tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredLogs.slice().reverse().map(log => (
                <tr key={log.id} className={`hover:bg-gray-50 ${log.isFlagged ? 'bg-red-50/50' : ''}`}>
                  <td className="px-6 py-3 text-gray-500 font-mono text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold
                      ${log.level === 'INFO' ? 'bg-blue-100 text-blue-700' : ''}
                      ${log.level === 'WARN' ? 'bg-yellow-100 text-yellow-800' : ''}
                      ${log.level === 'ERROR' ? 'bg-orange-100 text-orange-800' : ''}
                      ${log.level === 'CRITICAL' ? 'bg-red-100 text-red-800' : ''}
                    `}>{log.level}</span>
                  </td>
                  <td className="px-6 py-3 font-semibold text-gray-700">
                    <div className="flex flex-col gap-1">
                      <span>{log.action}</span>
                      {log.agentName && <span className="text-xs font-normal text-blue-600 bg-blue-50 px-1 py-0.5 rounded w-max">{log.agentName}</span>}
                    </div>
                  </td>
                  <td className="px-6 py-3 font-mono text-xs text-gray-600 whitespace-normal break-words min-w-[300px]">{log.message}</td>
                  <td className="px-6 py-3 text-gray-500">{log.tokens}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No logs match your filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
  )
}
