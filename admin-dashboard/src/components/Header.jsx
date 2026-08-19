import React from 'react';
import { Activity, Server, Cpu, HardDrive, Wifi, Radio, ShieldAlert } from 'lucide-react';

export default function Header({ rosStatus, backendConnected, systemData, activeTab, setActiveTab }) {
  const rosColor =
    rosStatus === 'connected'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      : rosStatus === 'connecting'
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      : 'bg-rose-500/10 text-rose-400 border-rose-500/30';

  const backendColor = backendConnected
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    : 'bg-rose-500/10 text-rose-400 border-rose-500/30';

  const cpuTemp = systemData?.cpu?.temp_c;
  const tempColor = cpuTemp
    ? cpuTemp > 75
      ? 'text-rose-400 font-bold'
      : cpuTemp > 60
      ? 'text-amber-400 font-semibold'
      : 'text-emerald-400'
    : 'text-slate-400';

  return (
    <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left Title & Hardware Tag */}
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-100 tracking-tight">Rubik Pi ROS 2 Admin</h1>
              <span className="px-2 py-0.5 text-xs font-mono bg-slate-800 text-cyan-400 rounded-full border border-slate-700">
                ARM64 Diagnostic
              </span>
            </div>
            <p className="text-xs text-slate-400">Onboard Hardware & Graph Diagnostic Tools</p>
          </div>
        </div>

        {/* Center Quick Nav Tabs */}
        <nav className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
          <button
            onClick={() => setActiveTab('control')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'control'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Robot Control
          </button>
          <button
            onClick={() => setActiveTab('graph')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'graph'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ROS Graph
          </button>
          <button
            onClick={() => setActiveTab('process')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'process'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Processes & Hardware
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'system'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Pi System
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'logs'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Logs
          </button>
          <button
            onClick={() => setActiveTab('camera')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'camera'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Camera
          </button>
        </nav>

        {/* Right System Indicators */}
        <div className="flex items-center gap-3 text-xs">
          {/* ROSBridge WS Badge */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${rosColor}`}>
            <Radio className="w-3.5 h-3.5" />
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              ROS WS: {rosStatus}
            </span>
          </div>

          {/* Backend API Badge */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${backendColor}`}>
            <Server className="w-3.5 h-3.5" />
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              API: {backendConnected ? 'Connected' : 'Offline'}
            </span>
          </div>

          {/* CPU & Temp quick info */}
          {systemData?.cpu && (
            <div className="hidden lg:flex items-center gap-3 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800 font-mono text-[11px]">
              <span className="text-slate-400">CPU: <strong className="text-slate-200">{systemData.cpu.total_percent}%</strong></span>
              <span className="text-slate-400">Temp: <strong className={tempColor}>{cpuTemp ? `${cpuTemp}°C` : 'N/A'}</strong></span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
