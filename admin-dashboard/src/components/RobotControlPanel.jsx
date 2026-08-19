import React, { useState, useEffect, useRef } from 'react';
import { Power, Camera, Cpu, Navigation, Compass, Radio, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Layers, Terminal, Activity, Clock } from 'lucide-react';

export default function RobotControlPanel({ statusData, startStack, stopStack, toggleCamera, fetchStackLogs, backendConnected }) {
  const [cameraAlone, setCameraAlone] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null); // 'starting' | 'stopping' | 'cam_on' | 'cam_off' | null
  const [feedback, setFeedback] = useState(null);
  const [launchProgressStage, setLaunchProgressStage] = useState('');
  const [logs, setLogs] = useState([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logTerminalRef = useRef(null);

  const managedProcs = statusData?.managed_processes || {};
  const isCameraRunning = managedProcs.camera_proc?.running || false;

  // Complete list of ROS 2 modules launched in the stack
  const autoStackNodes = [
    { key: 'urdf_proc', name: 'Robot State Publisher (URDF / TF)', topic: '/robot_description', desc: 'Publishes 3D robot transform tree' },
    { key: 'joint_state_proc', name: 'Joint State Publisher', topic: '/joint_states', desc: 'Publishes wheel joint states' },
    { key: 'odom_proc', name: 'ESP32 Odometry Node', topic: '/odom', desc: 'Serial wheel encoder odometry' },
    { key: 'imu_proc', name: 'GY-80 IMU Serial Node', topic: '/imu/data_raw', desc: '9-DOF gyro, accel, magnetometer' },
    { key: 'lidar_proc', name: 'YDLIDAR Driver Node', topic: '/scan', desc: '2D 360° laser range scan' },
    { key: 'slam_proc', name: 'SLAM Toolbox (Localization)', topic: '/map', desc: 'Lifelong SLAM & pose localization' },
  ];

  const runningCount = autoStackNodes.filter(n => managedProcs[n.key]?.running).length;
  const anyStackRunning = runningCount > 0 || managedProcs.hybrid_manager?.running;

  // Fetch bringup launch logs periodically
  useEffect(() => {
    let isMounted = true;
    const updateLogs = async () => {
      if (fetchStackLogs) {
        const lines = await fetchStackLogs(100);
        if (isMounted) {
          setLogs(lines);
          if (autoScroll && logTerminalRef.current) {
            logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
          }
        }
      }
    };

    updateLogs();
    const interval = setInterval(updateLogs, 1200);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [fetchStackLogs, autoScroll]);

  const handleStartStack = async () => {
    setActionInProgress('starting');
    setLaunchProgressStage('Initializing environment & checking hardware ports...');
    setFeedback(null);

    const stageTimer1 = setTimeout(() => {
      setLaunchProgressStage('Sourcing ROS 2 Jazzy workspace & launching navigation.launch.py...');
    }, 1000);

    const stageTimer2 = setTimeout(() => {
      setLaunchProgressStage('Starting Odom, GY-80 IMU, YDLIDAR, URDF, and SLAM nodes...');
    }, 2200);

    try {
      const res = await startStack(cameraAlone);
      if (res.status === 'ok') {
        setFeedback({
          type: 'success',
          title: 'Stack Launch Succeeded',
          text: res.message || 'Robot stack launched successfully. Modules are initializing.',
          details: `Process PID: ${res.pid || 'Active'} · Camera: ${cameraAlone ? 'Enabled' : 'Disabled'}`
        });
      } else {
        setFeedback({
          type: 'error',
          title: 'Stack Launch Failed',
          text: res.message || 'Failed to trigger robot stack bringup.',
          details: 'Check if another launch process is already bound to the serial ports or check console output below.'
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        title: 'Backend Connection Error',
        text: err.message || 'Unable to communicate with Admin Backend (port 5001).',
        details: 'Verify that server.py is running and reachable over the network.'
      });
    } finally {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      setTimeout(() => {
        setActionInProgress(null);
        setLaunchProgressStage('');
      }, 800);
    }
  };

  const handleStopStack = async () => {
    setActionInProgress('stopping');
    setFeedback(null);
    try {
      const res = await stopStack();
      if (res.status === 'ok') {
        setFeedback({
          type: 'info',
          title: 'Stack Terminated',
          text: res.message || 'Robot stack and associated nodes stopped.',
          details: res.killed_pids?.length ? `Killed PIDs: ${res.killed_pids.join(', ')}` : 'All processes cleanly shutdown.'
        });
      } else {
        setFeedback({
          type: 'error',
          title: 'Failed to Stop Stack',
          text: res.message || 'Unable to terminate all stack nodes.',
          details: 'Some processes may require manual cleanup via psutil.'
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        title: 'Backend Connection Error',
        text: err.message || 'Could not send stop signal to backend.',
        details: 'Check backend server reachability.'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleToggleCamera = async (targetState) => {
    setActionInProgress(targetState ? 'cam_on' : 'cam_off');
    setFeedback(null);
    try {
      const res = await toggleCamera(targetState);
      if (res.status === 'ok') {
        setFeedback({
          type: 'success',
          title: targetState ? 'Camera Activated' : 'Camera Deactivated',
          text: res.message || `Camera module turned ${targetState ? 'ON' : 'OFF'}.`,
          details: targetState ? `Driver: v4l2_camera_node · Stream: /camera/color/image_raw` : 'Camera node terminated.'
        });
      } else {
        setFeedback({
          type: 'error',
          title: 'Camera Command Failed',
          text: res.message || `Failed to turn ${targetState ? 'ON' : 'OFF'} camera module.`,
          details: 'Check if /dev/video0 is present and not locked by another process.'
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        title: 'Camera Request Failed',
        text: err.message || 'Failed to send camera toggle command.',
        details: 'Verify backend connection.'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner with Real-Time Stack Summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Power className="w-5 h-5 text-cyan-400" />
              Robot Startup & Bringup Control
            </h2>
            <span className="px-2.5 py-0.5 text-xs font-mono bg-cyan-500/10 text-cyan-400 rounded-full border border-cyan-500/30">
              {runningCount}/{autoStackNodes.length} Nodes Active
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Triggers <code className="font-mono text-cyan-400">ros2 launch rock_bringup navigation.launch.py</code> to launch Odom, IMU, YDLidar, URDF, and SLAM with selective camera streaming.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {anyStackRunning ? (
            <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              Stack Running ({runningCount} Nodes)
            </span>
          ) : (
            <span className="px-3 py-1.5 bg-slate-800 text-slate-400 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
              Stack Offline
            </span>
          )}
        </div>
      </div>

      {/* Interactive Launch Stage Progress Indicator */}
      {actionInProgress === 'starting' && (
        <div className="bg-cyan-950/40 border border-cyan-500/40 rounded-xl p-4 flex items-center gap-3.5 shadow-lg animate-pulse">
          <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-cyan-300">Launching Robot Stack...</p>
            <p className="text-[11px] text-cyan-400/80 font-mono truncate">{launchProgressStage || 'Executing launch sequence...'}</p>
          </div>
          <span className="text-[10px] font-mono bg-cyan-500/20 text-cyan-300 px-2 py-1 rounded border border-cyan-500/30 font-semibold">
            In Progress
          </span>
        </div>
      )}

      {/* Enhanced Feedback & Diagnostic Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between gap-3 text-xs shadow-md transition ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              : feedback.type === 'info'
              ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
              : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {feedback.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />}
            {feedback.type === 'info' && <RefreshCw className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />}
            {feedback.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />}
            <div className="space-y-1">
              <div className="font-bold text-slate-100 flex items-center gap-2">
                {feedback.title}
              </div>
              <p className="text-xs">{feedback.text}</p>
              {feedback.details && (
                <p className="text-[11px] font-mono opacity-80 pt-0.5">{feedback.details}</p>
              )}
            </div>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-200 text-base font-bold px-1">
            &times;
          </button>
        </div>
      )}

      {/* Main Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Card: Main Navigation Stack Launcher */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Navigation className="w-4 h-4 text-cyan-400" />
                Full Navigation & Robot Stack
              </h3>
              <span className="text-[10px] font-mono bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/30">
                Automatic Core Stack
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Launches the entire robot subsystem: <strong>Odom</strong>, <strong>GY-80 IMU</strong>, <strong>YDLIDAR</strong>, <strong>URDF Publisher</strong>, and <strong>SLAM Localization</strong>.
            </p>

            {/* Toggle checkbox for Camera included in Launch */}
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-cyan-400" />
                <label htmlFor="cameraAloneCheck" className="text-xs font-semibold text-slate-300 cursor-pointer">
                  Include Camera Module in Startup
                </label>
              </div>
              <input
                id="cameraAloneCheck"
                type="checkbox"
                checked={cameraAlone}
                onChange={(e) => setCameraAlone(e.target.checked)}
                className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
            <button
              onClick={handleStartStack}
              disabled={actionInProgress !== null || !backendConnected}
              className="flex-1 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow transition cursor-pointer disabled:cursor-not-allowed"
            >
              {actionInProgress === 'starting' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Launching Stack...</span>
                </>
              ) : (
                <>
                  <Power className="w-4 h-4" />
                  <span>Launch Robot Stack</span>
                </>
              )}
            </button>

            <button
              onClick={handleStopStack}
              disabled={actionInProgress !== null || !backendConnected || (!anyStackRunning && actionInProgress !== 'starting')}
              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 disabled:opacity-40 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:cursor-not-allowed"
            >
              {actionInProgress === 'stopping' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Power className="w-4 h-4" />
              )}
              Stop Stack
            </button>
          </div>
        </div>

        {/* Right Card: Independent Camera Module Toggle */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Camera className="w-4 h-4 text-cyan-400" />
                Camera Module Selective Control
              </h3>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${isCameraRunning ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                {isCameraRunning ? 'Camera ON' : 'Camera OFF'}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Turn the camera module ON or OFF independently at any time without restarting the core robot stack (odom, IMU, lidar).
            </p>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-1.5 font-mono text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Driver:</span>
                <span className="text-slate-200">v4l2_camera_node</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Device:</span>
                <span className="text-slate-200">/dev/video0</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Status:</span>
                <span className={isCameraRunning ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                  {isCameraRunning ? 'Active Stream' : 'Stopped / Standby'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
            <button
              onClick={() => handleToggleCamera(true)}
              disabled={actionInProgress !== null || !backendConnected || isCameraRunning}
              className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 disabled:opacity-40 text-emerald-400 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:cursor-not-allowed"
            >
              {actionInProgress === 'cam_on' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
              Turn Camera ON
            </button>

            <button
              onClick={() => handleToggleCamera(false)}
              disabled={actionInProgress !== null || !backendConnected || !isCameraRunning}
              className="flex-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 disabled:opacity-40 text-rose-400 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:cursor-not-allowed"
            >
              {actionInProgress === 'cam_off' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
              Turn Camera OFF
            </button>
          </div>
        </div>
      </div>

      {/* Subsystem Modules Breakdown Cards */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Active Stack Modules & Real-Time Telemetry
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            {runningCount} / {autoStackNodes.length} Online
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {autoStackNodes.map((node) => {
            const proc = managedProcs[node.key] || {};
            const isRunning = proc.running || false;
            return (
              <div
                key={node.key}
                className={`bg-slate-950 border rounded-xl p-4 flex flex-col justify-between space-y-3 transition ${
                  isRunning ? 'border-emerald-500/30 shadow-sm' : 'border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-200 truncate">{node.name}</span>
                    {isRunning ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> ONLINE
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-800 text-slate-400 rounded border border-slate-700">
                        OFFLINE
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-1">{node.desc}</p>
                </div>

                <div className="bg-slate-900/60 rounded-lg p-2.5 space-y-1 font-mono text-[11px]">
                  <div className="flex justify-between text-slate-400">
                    <span>Topic:</span>
                    <code className="text-cyan-400">{node.topic}</code>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>PID:</span>
                    <span className="text-slate-200">{proc.pid || '—'}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>CPU / RAM:</span>
                    <span className="text-slate-200">
                      {isRunning ? `${proc.cpu_percent}% · ${proc.memory_percent}%` : '—'}
                    </span>
                  </div>
                  {isRunning && proc.uptime_seconds !== undefined && (
                    <div className="flex justify-between text-slate-400">
                      <span>Uptime:</span>
                      <span className="text-slate-300">{proc.uptime_seconds}s</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Real-Time Bringup Launch Output Console */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            Live Launch Console Output
          </h3>
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="accent-cyan-500 rounded"
              />
              Auto-scroll
            </label>
            <button
              onClick={async () => {
                if (fetchStackLogs) {
                  const lines = await fetchStackLogs(100);
                  setLogs(lines);
                }
              }}
              className="p-1 text-slate-400 hover:text-cyan-400 transition"
              title="Refresh Logs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div
          ref={logTerminalRef}
          className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 h-64 overflow-y-auto space-y-1 select-text"
        >
          {logs.length === 0 ? (
            <p className="text-slate-500 italic">No output logged yet. Launch the stack to view live console output.</p>
          ) : (
            logs.map((line, idx) => (
              <div
                key={idx}
                className={`leading-relaxed whitespace-pre-wrap ${
                  line.includes('[error]') || line.includes('[ERROR]')
                    ? 'text-rose-400'
                    : line.includes('[warn]') || line.includes('[WARN]')
                    ? 'text-amber-400'
                    : line.includes('[INFO]')
                    ? 'text-slate-300'
                    : 'text-slate-400'
                }`}
              >
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

