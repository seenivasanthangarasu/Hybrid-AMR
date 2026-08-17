import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal, RefreshCw, Search, ArrowDown } from 'lucide-react';

export default function LogsPanel({ fetchLogs }) {
  const [source, setSource] = useState('ros');
  const [linesCount, setLinesCount] = useState(100);
  const [filter, setFilter] = useState('');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const logEndRef = useRef(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const logLines = await fetchLogs(source, linesCount, filter);
      setLogs(logLines);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchLogs, source, linesCount, filter]);

  useEffect(() => {
    loadLogs();
    const interval = setInterval(loadLogs, 3000);
    return () => clearInterval(interval);
  }, [loadLogs]);

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Terminal className="w-5 h-5 text-amber-400" />
            ROS & System Logs Console
          </h2>
          <p className="text-xs text-slate-400">Tail live process stdout/stderr from ~/.ros/log/ or systemd journalctl</p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Log Source Selector */}
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500"
          >
            <option value="ros">ROS 2 Log Directory (~/.ros/log)</option>
            <option value="journalctl">Systemd Journalctl (journalctl)</option>
          </select>

          {/* Line Count Selector */}
          <select
            value={linesCount}
            onChange={(e) => setLinesCount(Number(e.target.value))}
            className="bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500"
          >
            <option value={50}>50 lines</option>
            <option value={100}>100 lines</option>
            <option value={200}>200 lines</option>
            <option value={500}>500 lines</option>
          </select>

          {/* Keyword filter input */}
          <div className="relative w-48">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Filter logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Auto Scroll Toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition ${
              autoScroll
                ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
            title="Auto-scroll"
          >
            <ArrowDown className="w-4 h-4" />
          </button>

          {/* Manual Refresh */}
          <button
            onClick={loadLogs}
            disabled={loading}
            className="p-1.5 bg-slate-800 text-slate-300 hover:text-cyan-400 rounded-lg border border-slate-700 transition"
            title="Refresh Logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Log Console Window */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 h-[500px] overflow-y-auto font-mono text-xs text-slate-300 space-y-1">
        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-600 italic">
            No log output available for source: {source}
          </div>
        ) : (
          logs.map((line, idx) => {
            const lineLower = line.toLowerCase();
            let textColor = 'text-slate-300';
            if (lineLower.includes('error') || lineLower.includes('fail') || lineLower.includes('fatal')) {
              textColor = 'text-rose-400 font-semibold';
            } else if (lineLower.includes('warn') || lineLower.includes('warning')) {
              textColor = 'text-amber-300';
            } else if (lineLower.includes('info')) {
              textColor = 'text-cyan-300';
            }

            return (
              <div key={idx} className={`${textColor} leading-relaxed hover:bg-slate-900/50 px-1 rounded`}>
                <span className="text-slate-600 select-none mr-2 text-[10px]">{(idx + 1).toString().padStart(3, ' ')} |</span>
                {line}
              </div>
            );
          })
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
