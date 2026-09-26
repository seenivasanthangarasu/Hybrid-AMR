import React, { useState } from 'react';
import { Activity, Server, Cpu, HardDrive, Wifi, Radio, ShieldAlert, Zap, Battery, Hash, PowerOff, RefreshCw, AlertOctagon } from 'lucide-react';

export default function Header({
  rosStatus,
  backendConnected,
  systemData,
  batteryVoltage,
  sessionData,
  activeTab,
  setActiveTab,
  shutdownServices,
  onShutdownTriggered,
}) {
  const [showShutdownModal, setShowShutdownModal] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [shutdownError, setShutdownError] = useState(null);

  const currentVoltage = batteryVoltage ?? systemData?.battery?.voltage ?? null;

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

  const batColor = currentVoltage !== null
    ? currentVoltage >= 14.0
      ? 'text-emerald-400'
      : currentVoltage >= 12.0
      ? 'text-cyan-400'
      : currentVoltage >= 11.0
      ? 'text-amber-400 font-semibold'
      : 'text-rose-400 font-bold'
    : 'text-slate-400';

  const handleConfirmShutdown = async () => {
    setIsShuttingDown(true);
    setShutdownError(null);
    try {
      if (shutdownServices) {
        const res = await shutdownServices();
        if (res.status === 'ok') {
          if (onShutdownTriggered) onShutdownTriggered();
          setShowShutdownModal(false);
        } else {
          setShutdownError(res.message || 'Failed to send shutdown command.');
        }
      }
    } catch (err) {
      setShutdownError(err.message || 'Network error sending shutdown request.');
    } finally {
      setIsShuttingDown(false);
    }
  };

  return (
    <>
      <header className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Left: Branding & Core Meta */}
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 rounded-xl text-cyan-400 shadow-sm">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-100 tracking-tight">Rubik Pi ROS 2 Admin</h1>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-slate-800 text-cyan-400 rounded-full border border-slate-700">
                  ARM64
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Onboard Diagnostic & Robot Control Deck</p>
            </div>
          </div>

          {/* Center: Quick Nav Tabs */}
          <nav className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium overflow-x-auto">
            <button
              onClick={() => setActiveTab('control')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                activeTab === 'control'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Robot Control
            </button>
            <button
              onClick={() => setActiveTab('camera')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                activeTab === 'camera'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Camera
            </button>
            <button
              onClick={() => setActiveTab('graph')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                activeTab === 'graph'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ROS Graph
            </button>
            <button
              onClick={() => setActiveTab('process')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                activeTab === 'process'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Processes & Hardware
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                activeTab === 'system'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Pi System
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                activeTab === 'logs'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Logs
            </button>
          </nav>

          {/* Right: Status Indicators & Shutdown Button */}
          <div className="flex items-center gap-2.5 text-xs flex-wrap">
            {/* Battery Voltage Badge */}
            {currentVoltage !== null && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-800 bg-slate-950 font-mono text-[11px] shadow-sm">
                <Zap className={`w-3.5 h-3.5 ${batColor}`} />
                <span className="text-slate-400">BAT: <strong className={batColor}>{typeof currentVoltage === 'number' ? `${currentVoltage.toFixed(1)}V` : `${currentVoltage}V`}</strong></span>
              </div>
            )}

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

            {/* CPU / Temp strip if available */}
            {systemData?.cpu && (
              <div className="hidden xl:flex items-center gap-2 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 font-mono text-[10px]">
                <span className="text-slate-400">CPU: <strong className="text-slate-200">{systemData.cpu.total_percent}%</strong></span>
                <span className="text-slate-400">Temp: <strong className={tempColor}>{cpuTemp ? `${cpuTemp}°C` : 'N/A'}</strong></span>
              </div>
            )}

            {/* Shutdown All Services Trigger Button */}
            <button
              onClick={() => setShowShutdownModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
              title="Stop all dashboard, bridge and robot backend services"
            >
              <PowerOff className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden sm:inline">Shutdown Services</span>
            </button>
          </div>
        </div>
      </header>

      {/* Shutdown Confirmation Modal */}
      {showShutdownModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl">
                <AlertOctagon className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Shutdown Dashboard & Backend Services?</h3>
                <p className="text-xs text-rose-400 font-medium">This will stop all running processes on the robot.</p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300 space-y-2 font-mono">
              <p className="text-slate-400">The following services will be gracefully terminated:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-300">
                <li><strong className="text-rose-300">Vite Frontend</strong> (Port 3000)</li>
                <li><strong className="text-rose-300">Flask Admin Backend API</strong> (Port 5001)</li>
                <li><strong className="text-rose-300">ROSBridge WebSocket</strong> (Port 9090)</li>
                <li><strong className="text-rose-300">Web Video Server & Camera</strong> (Port 8080)</li>
                <li><strong className="text-rose-300">All ROS 2 Robot Stack Nodes</strong> (Odom, IMU, Lidar, SLAM, Teleop)</li>
              </ul>
              <div className="pt-2 border-t border-slate-800/80 text-[11px] text-cyan-400">
                💡 To restart after shutdown, run <code className="font-bold bg-slate-900 px-1 py-0.5 rounded">./start_all.sh</code> in the robot terminal.
              </div>
            </div>

            {shutdownError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 font-semibold">
                {shutdownError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowShutdownModal(false)}
                disabled={isShuttingDown}
                className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmShutdown}
                disabled={isShuttingDown}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition flex items-center gap-2 shadow-lg shadow-rose-950/50"
              >
                {isShuttingDown ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Shutting Down Services...</span>
                  </>
                ) : (
                  <>
                    <PowerOff className="w-4 h-4" />
                    <span>Confirm Shutdown All Services</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
