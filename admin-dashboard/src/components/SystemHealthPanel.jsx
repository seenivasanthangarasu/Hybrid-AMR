import React from 'react';
import { Cpu, HardDrive, Wifi, Thermometer, Clock, Server } from 'lucide-react';

export default function SystemHealthPanel({ systemData }) {
  if (!systemData) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-3">
        <Server className="w-8 h-8 text-slate-600 mx-auto animate-pulse" />
        <p className="text-sm font-semibold text-slate-400">Connecting to Python Local Backend API (port 5001)...</p>
        <p className="text-xs text-slate-500">Ensure <code className="font-mono text-cyan-400">python3 server/server.py</code> is running on the Rubik Pi.</p>
      </div>
    );
  }

  const { cpu, memory, disk, uptime_seconds, hostname, network } = systemData;

  const formatUptime = (secs) => {
    if (!secs) return '0m';
    const d = Math.floor(secs / (3600 * 24));
    const h = Math.floor((secs % (3600 * 24)) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${d > 0 ? `${d}d ` : ''}${h}h ${m}m`;
  };

  const temp = cpu?.temp_c;
  const tempColor = temp
    ? temp > 75
      ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
      : temp > 60
      ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
      : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
    : 'text-slate-400 border-slate-700 bg-slate-800';

  return (
    <div className="space-y-6">
      {/* Top Overview Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* CPU Temp */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">CPU Temperature</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{temp ? `${temp}°C` : 'N/A'}</p>
          </div>
          <div className={`p-3 rounded-xl border ${tempColor}`}>
            <Thermometer className="w-6 h-6" />
          </div>
        </div>

        {/* Total RAM */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">RAM Usage</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{memory?.percent}%</p>
          </div>
          <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/30">
            <Cpu className="w-6 h-6" />
          </div>
        </div>

        {/* Disk Space */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Storage Usage</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{disk?.percent}%</p>
          </div>
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/30">
            <HardDrive className="w-6 h-6" />
          </div>
        </div>

        {/* Uptime */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">System Uptime</p>
            <p className="text-xl font-bold text-slate-100 mt-1">{formatUptime(uptime_seconds)}</p>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/30">
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* CPU Cores & Memory Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CPU Cores breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-cyan-400" />
              Processor Cores ({cpu?.cores_count || 4} Cores)
            </h2>
            <span className="font-mono text-xs text-cyan-400 font-bold">Total: {cpu?.total_percent}%</span>
          </div>

          {/* Overall CPU Bar */}
          <div>
            <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-300"
                style={{ width: `${cpu?.total_percent || 0}%` }}
              ></div>
            </div>
          </div>

          {/* Per Core Progress Bars */}
          <div className="space-y-3 pt-2">
            {(cpu?.per_core || []).map((val, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-400">Core #{idx}</span>
                  <span className="text-slate-200">{val}%</span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="bg-cyan-500/80 h-full transition-all duration-300"
                    style={{ width: `${val}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Memory & Storage Gauges */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-6">
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-purple-400" />
            Memory & Storage Breakdowns
          </h2>

          {/* RAM */}
          <div className="space-y-2 bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-300 font-bold">RAM Memory</span>
              <span className="text-purple-400 font-bold">{memory?.used_mb} MB / {memory?.total_mb} MB ({memory?.percent}%)</span>
            </div>
            <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-800">
              <div
                className="bg-purple-500 h-full transition-all duration-300"
                style={{ width: `${memory?.percent || 0}%` }}
              ></div>
            </div>
          </div>

          {/* Disk */}
          <div className="space-y-2 bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-300 font-bold">Root Filesystem Storage</span>
              <span className="text-blue-400 font-bold">{disk?.used_gb} GB / {disk?.total_gb} GB ({disk?.percent}%)</span>
            </div>
            <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-800">
              <div
                className="bg-blue-500 h-full transition-all duration-300"
                style={{ width: `${disk?.percent || 0}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Network Interfaces Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
          <Wifi className="w-5 h-5 text-emerald-400" />
          Network Interfaces & IP Configuration
        </h2>

        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Interface</th>
                <th className="px-4 py-3">IP Address</th>
                <th className="px-4 py-3">MAC Address</th>
                <th className="px-4 py-3">Link Status</th>
                <th className="px-4 py-3 text-right">Data Transferred</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {(network || []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500 italic">
                    No active network interfaces detected.
                  </td>
                </tr>
              ) : (
                network.map((iface, idx) => (
                  <tr key={idx} className="hover:bg-slate-850/50 transition">
                    <td className="px-4 py-3 font-bold text-cyan-400">{iface.name}</td>
                    <td className="px-4 py-3 text-slate-200 font-bold">{iface.ip}</td>
                    <td className="px-4 py-3 text-slate-400">{iface.mac}</td>
                    <td className="px-4 py-3">
                      {iface.is_up ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/30">
                          UP
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-500/10 text-rose-400 rounded border border-rose-500/30">
                          DOWN
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {(iface.bytes_sent / (1024 * 1024)).toFixed(1)} MB TX / {(iface.bytes_recv / (1024 * 1024)).toFixed(1)} MB RX
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
