import React, { useState, useEffect, useRef } from 'react';
import {
  Power, Camera, Cpu, Navigation, Compass, Radio, CheckCircle2,
  XCircle, AlertTriangle, RefreshCw, Layers, Terminal, Activity,
  Clock, Zap, Sliders, Shield, ChevronDown, ChevronUp, Copy,
  Check, PowerOff, ExternalLink, ShieldAlert
} from 'lucide-react';

export default function RobotControlPanel({
  statusData,
  batteryVoltage,
  sessionData,
  startStack,
  stopStack,
  toggleCamera,
  toggleTeleop,
  toggleMotor,
  toggleRadio,
  fetchStackLogs,
  backendConnected,
  shutdownServices,
}) {
  const [cameraAlone, setCameraAlone] = useState(false);
  const [motorsIncluded, setMotorsIncluded] = useState(false);
  const [radioIncluded, setRadioIncluded] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null); // 'starting' | 'stopping' | 'cam_on' | 'cam_off' | 'teleop_on' | 'teleop_off' | 'motor_on' | 'motor_off' | 'radio_on' | 'radio_off' | null
  const [feedback, setFeedback] = useState(null);
  const [launchProgressStage, setLaunchProgressStage] = useState('');
  const [logs, setLogs] = useState([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isDiagnosticsExpanded, setIsDiagnosticsExpanded] = useState(true);
  const [isConsoleExpanded, setIsConsoleExpanded] = useState(false);
  const [isSessionExpanded, setIsSessionExpanded] = useState(false);
  const [copiedSession, setCopiedSession] = useState(false);
  const logTerminalRef = useRef(null);

  const currentVoltage = batteryVoltage ?? statusData?.battery?.voltage ?? statusData?.hardware?.sabertooth?.battery_voltage ?? null;

  const batColorClass = currentVoltage !== null
    ? currentVoltage >= 14.0
      ? 'text-emerald-400'
      : currentVoltage >= 12.0
      ? 'text-cyan-400'
      : currentVoltage >= 11.0
      ? 'text-amber-400 font-semibold'
      : 'text-rose-400 font-bold'
    : 'text-slate-400';

  const managedProcs = statusData?.managed_processes || {};
  const isCameraRunning = managedProcs.camera_proc?.running || false;
  const isSabertoothRunning = managedProcs.sabertooth_proc?.running || false;
  const isRadioRunning = managedProcs.radio_proc?.running || false;
  const isTeleopRunning = isSabertoothRunning && isRadioRunning;

  // Complete list of ROS 2 modules launched in the stack
  const autoStackNodes = [
    { key: 'session_proc', name: 'Authoritative Session Publisher', topic: '/amr/session', desc: 'Authoritative power-cycle session identity & heartbeat' },
    { key: 'urdf_proc', name: 'Robot State Publisher (URDF / TF)', topic: '/robot_description', desc: 'Publishes 3D robot transform tree' },
    { key: 'joint_state_proc', name: 'Joint State Publisher', topic: '/joint_states', desc: 'Publishes wheel joint states' },
    { key: 'odom_proc', name: 'ESP32 Odometry Node', topic: '/odom', desc: 'Serial wheel encoder odometry' },
    { key: 'imu_proc', name: 'Hiwonder 9-DOF IMU Node', topic: '/hiwonder/imu/data_raw', desc: 'Acceleration, gyro, angle, & magnetometer' },
    { key: 'lidar_proc', name: 'YDLIDAR Driver Node', topic: '/scan', desc: '2D 360° laser range scan' },
    { key: 'slam_proc', name: 'SLAM Toolbox (Localization)', topic: '/map', desc: 'Lifelong SLAM & pose localization' },
    { key: 'gps_proc', name: 'Hiwonder GPS (GNSS) Node', topic: '/hiwonder/gps/fix', desc: 'Global GPS coordinates & telemetry' },
    { key: 'sabertooth_proc', name: 'Sabertooth 2x32 Motor Driver', topic: '/battery_state', desc: 'DEScribe USB dual motor driver & battery voltage' },
    { key: 'radio_proc', name: 'HOT RC DS-600 Radio Receiver', topic: '/radio/channels', desc: 'GPIO hardware PWM pulse receiver & RC teleop' },
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
    const interval = setInterval(updateLogs, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [fetchStackLogs, autoScroll]);

  const handleCopySession = (text) => {
    if (!text) return;
    navigator.clipboard?.writeText?.(text);
    setCopiedSession(true);
    setTimeout(() => setCopiedSession(false), 2000);
  };

  const handleStartStack = async () => {
    setActionInProgress('starting');
    setLaunchProgressStage('Initializing environment & checking hardware ports...');
    setFeedback(null);

    const stageTimer1 = setTimeout(() => {
      setLaunchProgressStage('Sourcing ROS 2 Jazzy workspace & launching navigation.launch.py...');
    }, 1000);

    const stageTimer2 = setTimeout(() => {
      setLaunchProgressStage('Starting Motors, Radio, GPS, Odom, IMU, Lidar, URDF, and SLAM nodes...');
    }, 2200);

    try {
      const res = await startStack({
        includeCamera: cameraAlone,
        includeMotors: motorsIncluded,
        includeRadio: radioIncluded,
      });
      if (res.status === 'ok') {
        setFeedback({
          type: 'success',
          title: 'Stack Launch Succeeded',
          text: res.message || 'Robot stack launched successfully. Modules are initializing.',
          details: `Process PID: ${res.pid || 'Active'} · Camera: ${cameraAlone ? 'ON' : 'OFF'} · Motors: ${motorsIncluded ? 'ON' : 'OFF'} · Radio: ${radioIncluded ? 'ON' : 'OFF'}`
        });
      } else {
        setFeedback({
          type: 'error',
          title: 'Stack Launch Failed',
          text: res.message || 'Failed to trigger robot stack bringup.',
          details: 'Check if another launch process is already bound to the serial ports or check console output below.'
        });
        setIsConsoleExpanded(true);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        title: 'Backend Connection Error',
        text: err.message || 'Unable to communicate with Admin Backend (port 5001).',
        details: 'Verify that server.py is running and reachable over the network.'
      });
      setIsConsoleExpanded(true);
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
          details: targetState ? `Driver: v4l2_camera / camera_streamer · Stream: /camera/color/image_raw` : 'Camera node terminated.'
        });
      } else {
        setFeedback({
          type: 'error',
          title: 'Camera Command Failed',
          text: res.message || `Failed to turn ${targetState ? 'ON' : 'OFF'} camera module.`,
          details: 'Check if Logitech C270 HD webcam is connected via USB (/dev/amr_camera).'
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

  const handleToggleTeleop = async (targetState) => {
    setActionInProgress(targetState ? 'teleop_on' : 'teleop_off');
    setFeedback(null);
    try {
      if (toggleTeleop) {
        const res = await toggleTeleop(targetState);
        if (res.status === 'ok') {
          setFeedback({
            type: 'success',
            title: targetState ? 'Manual Radio Drive Activated' : 'Manual Radio Drive Stopped',
            text: res.message || `Manual radio teleop turned ${targetState ? 'ON' : 'OFF'}.`,
            details: targetState ? 'HOT RC DS-600 Radio Receiver + Sabertooth 2x32 Motor Driver running.' : 'Teleop processes terminated.'
          });
        } else {
          setFeedback({
            type: 'error',
            title: 'Teleop Command Failed',
            text: res.message || `Failed to turn ${targetState ? 'ON' : 'OFF'} manual radio drive.`,
            details: 'Check GPIO and /dev/sabertooth device access.'
          });
        }
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        title: 'Teleop Request Failed',
        text: err.message || 'Failed to send teleop command.',
        details: 'Verify backend connection.'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Hero Command Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400">
              <Power className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-slate-100 tracking-tight">
                  Robot Startup & Bringup Control
                </h2>
                <span className="px-2.5 py-0.5 text-xs font-mono font-bold bg-cyan-500/10 text-cyan-400 rounded-full border border-cyan-500/30">
                  {runningCount}/{autoStackNodes.length} Nodes Active
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Single-click operational control for Autonomous Navigation, Radio Teleop, and Vision Stream
              </p>
            </div>
          </div>
        </div>

        {/* Quick Hero Status Badges */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {currentVoltage !== null && (
            <div className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono flex items-center gap-2 shadow-inner">
              <Zap className={`w-4 h-4 ${batColorClass}`} />
              <span className="text-slate-400">
                Battery: <strong className={batColorClass}>{typeof currentVoltage === 'number' ? `${currentVoltage.toFixed(1)}V` : `${currentVoltage}V`}</strong>
              </span>
            </div>
          )}

          {anyStackRunning ? (
            <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              Stack Running ({runningCount} Nodes)
            </span>
          ) : (
            <span className="px-3 py-1.5 bg-slate-800/80 text-slate-400 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
              Stack Offline
            </span>
          )}
        </div>
      </div>

      {/* Interactive Launch Stage Progress Indicator */}
      {actionInProgress === 'starting' && (
        <div className="bg-cyan-950/50 border border-cyan-500/50 rounded-2xl p-4 flex items-center gap-3.5 shadow-xl animate-pulse">
          <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-cyan-300">Launching Robot Navigation Stack...</p>
            <p className="text-[11px] text-cyan-400/90 font-mono truncate">{launchProgressStage || 'Executing launch sequence...'}</p>
          </div>
          <span className="text-[10px] font-mono bg-cyan-500/20 text-cyan-300 px-2.5 py-1 rounded-lg border border-cyan-500/40 font-semibold">
            In Progress
          </span>
        </div>
      )}

      {/* Enhanced Feedback & Diagnostic Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border flex items-start justify-between gap-3 text-xs shadow-md transition ${
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
            <div className="space-y-0.5">
              <div className="font-bold text-slate-100 flex items-center gap-2">
                {feedback.title}
              </div>
              <p className="text-xs text-slate-200">{feedback.text}</p>
              {feedback.details && (
                <p className="text-[11px] font-mono opacity-80 pt-0.5">{feedback.details}</p>
              )}
            </div>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-200 text-lg font-bold px-1.5">
            &times;
          </button>
        </div>
      )}

      {/* Primary 3-Card Command Center Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Card 1: Core Autonomous Navigation & Sensor Stack */}
        <div className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 space-y-4 flex flex-col justify-between shadow-lg transition">
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Navigation className="w-4 h-4 text-cyan-400" />
                Core Robot & Navigation Stack
              </h3>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${anyStackRunning ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-bold' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                {anyStackRunning ? 'Active' : 'Offline'}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              Brings up <strong>ESP32 Odometry</strong>, <strong>Hiwonder 9-DOF IMU</strong>, <strong>YDLIDAR</strong>, <strong>URDF/TF</strong>, and <strong>SLAM Toolbox</strong>.
            </p>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between text-slate-400">
                <span>Core Nodes:</span>
                <span className="text-slate-200 truncate">Odom, IMU, Lidar, SLAM, TF</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Launch File:</span>
                <code className="text-cyan-400">navigation.launch.py</code>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Status:</span>
                <span className={anyStackRunning ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                  {anyStackRunning ? `Active (${runningCount} Nodes)` : 'Standby'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 pt-3 border-t border-slate-800">
            <button
              onClick={handleStartStack}
              disabled={actionInProgress !== null || !backendConnected}
              className="flex-1 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer disabled:cursor-not-allowed"
            >
              {actionInProgress === 'starting' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Launching...</span>
                </>
              ) : (
                <>
                  <Power className="w-4 h-4" />
                  <span>Launch Core Stack</span>
                </>
              )}
            </button>

            <button
              onClick={handleStopStack}
              disabled={actionInProgress !== null || !backendConnected || (!anyStackRunning && actionInProgress !== 'starting')}
              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 disabled:opacity-40 font-bold py-2.5 px-3.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:cursor-not-allowed"
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

        {/* Card 2: Radio Teleop & Motor Drive */}
        <div className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 space-y-4 flex flex-col justify-between shadow-lg transition">
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Radio className="w-4 h-4 text-purple-400" />
                Radio Teleop & Motor Drive
              </h3>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${isTeleopRunning || isSabertoothRunning || isRadioRunning ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-bold' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                {isTeleopRunning ? 'Teleop ACTIVE' : isSabertoothRunning || isRadioRunning ? 'Driver ACTIVE' : 'Teleop IDLE'}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              One-click control for <strong>HOT RC DS-600</strong> remote receiver and <strong>Sabertooth 2x32</strong> motor driver.
            </p>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between items-center text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-purple-400" /> HOT RC DS-600:
                </span>
                <span className={isRadioRunning ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                  {isRadioRunning ? 'Active (GPIO 8/24)' : 'Standby'}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" /> Sabertooth 2x32:
                </span>
                <span className={isSabertoothRunning ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                  {isSabertoothRunning ? 'Running (/dev/sabertooth)' : 'Standby'}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400 border-t border-slate-800/80 pt-1">
                <span>Protocol:</span>
                <span className="text-cyan-400 font-semibold">RC PWM $\rightarrow$ Twist /cmd_vel</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800">
            {isTeleopRunning || isSabertoothRunning || isRadioRunning ? (
              <button
                onClick={() => handleToggleTeleop(false)}
                disabled={actionInProgress !== null || !backendConnected}
                className="w-full bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition cursor-pointer disabled:cursor-not-allowed"
              >
                {actionInProgress === 'teleop_off' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Stopping Radio Teleop...</span>
                  </>
                ) : (
                  <>
                    <Power className="w-4 h-4 text-slate-950" />
                    <span>Turn OFF Radio Teleop Drive</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={() => handleToggleTeleop(true)}
                disabled={actionInProgress !== null || !backendConnected}
                className="w-full bg-purple-500 hover:bg-purple-400 disabled:opacity-50 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition cursor-pointer disabled:cursor-not-allowed"
              >
                {actionInProgress === 'teleop_on' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Launching Teleop...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-slate-950" />
                    <span>Turn ON Radio Teleop Drive</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Card 3: Camera Vision Stream */}
        <div className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 space-y-4 flex flex-col justify-between shadow-lg transition">
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Camera className="w-4 h-4 text-cyan-400" />
                Camera Module Control
              </h3>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${isCameraRunning ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-bold' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                {isCameraRunning ? 'Camera ON' : 'Camera OFF'}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              Independent video stream toggle for Logitech C270 HD (720p) camera without interrupting navigation.
            </p>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between text-slate-400">
                <span>Driver:</span>
                <span className="text-slate-200">v4l2_camera (C270 HD)</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Stream Topic:</span>
                <code className="text-cyan-400 truncate">/camera/color/image_raw</code>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Status:</span>
                <span className={isCameraRunning ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                  {isCameraRunning ? 'Active 720p Stream' : 'Standby'}
                </span>
              </div>
            </div>

            {/* Live Camera Stream Embedded Preview when ON */}
            {isCameraRunning && (
              <div className="mt-3 rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                <iframe
                  src={`${typeof window !== 'undefined' && window.location?.hostname ? `http://${window.location.hostname}:8080` : 'http://localhost:8080'}/stream_viewer?topic=/camera/color/image_raw`}
                  title="Live Camera Preview"
                  className="w-full h-36 border-0 bg-slate-950 block"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 pt-3 border-t border-slate-800">
            <button
              onClick={() => handleToggleCamera(true)}
              disabled={actionInProgress !== null || !backendConnected || isCameraRunning}
              className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 disabled:opacity-40 text-emerald-400 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:cursor-not-allowed"
            >
              {actionInProgress === 'cam_on' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
              Turn Camera ON
            </button>

            <button
              onClick={() => handleToggleCamera(false)}
              disabled={actionInProgress !== null || !backendConnected || !isCameraRunning}
              className="flex-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 disabled:opacity-40 text-rose-400 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:cursor-not-allowed"
            >
              {actionInProgress === 'cam_off' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
              Turn Camera OFF
            </button>
          </div>
        </div>
      </div>

      {/* Stacked Low-Priority Tray 1: Authoritative Session Info (Compact Bar) */}
      {sessionData && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400">
                <Shield className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-200">Authoritative Session:</span>
                <span className="font-mono text-xs font-semibold text-slate-300">{sessionData.robot_id || 'amr-1'}</span>
                <span className="text-slate-600">&bull;</span>
                <span className="font-mono text-xs text-cyan-400 truncate max-w-[200px] sm:max-w-xs" title={sessionData.session_id}>
                  {sessionData.session_id ? `${sessionData.session_id.slice(0, 16)}...` : 'N/A'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider ${
                    sessionData.state === 'active'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {sessionData.state}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopySession(sessionData.session_id)}
                className="p-1.5 text-slate-400 hover:text-cyan-400 bg-slate-950 rounded-lg border border-slate-800 transition"
                title="Copy Session ID"
              >
                {copiedSession ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setIsSessionExpanded(!isSessionExpanded)}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 font-mono py-1 px-2 rounded bg-slate-950 border border-slate-800"
              >
                {isSessionExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {isSessionExpanded && (
            <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Full Session UUID</span>
                <span className="text-cyan-300 font-semibold break-all text-[11px] select-all">{sessionData.session_id || 'N/A'}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Started At (UTC)</span>
                <span className="text-slate-200">{sessionData.started_at || 'N/A'}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">ROS 2 Topic</span>
                <code className="text-cyan-400">/amr/session</code>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stacked Low-Priority Tray 2: Subsystem Modules Breakdown (Collapsible Accordion) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-slate-200">
              Active Stack Modules & Real-Time Telemetry
            </h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">
              {runningCount} / {autoStackNodes.length} Online
            </span>
          </div>

          <button
            onClick={() => setIsDiagnosticsExpanded(!isDiagnosticsExpanded)}
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-cyan-400 font-semibold py-1.5 px-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500/40 transition"
          >
            <span>{isDiagnosticsExpanded ? 'Hide Diagnostics' : 'Show 10 Node Details'}</span>
            {isDiagnosticsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Quick Compact Ribbon when collapsed */}
        {!isDiagnosticsExpanded && (
          <div className="pt-2 flex flex-wrap gap-2">
            {autoStackNodes.map((node) => {
              const proc = managedProcs[node.key] || {};
              const isRunning = proc.running || false;
              return (
                <div
                  key={node.key}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono flex items-center gap-1.5 ${
                    isRunning
                      ? 'bg-slate-950 border-emerald-500/30 text-slate-300'
                      : 'bg-slate-950/60 border-slate-800/80 text-slate-500'
                  }`}
                  title={`${node.name} (${node.topic}) - ${isRunning ? `ONLINE (PID ${proc.pid})` : 'OFFLINE'}`}
                >
                  <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span className="truncate max-w-[130px]">{node.name.split(' ')[0]}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Expanded 10-node diagnostic cards */}
        {isDiagnosticsExpanded && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-3 animate-in fade-in duration-200">
            {autoStackNodes.map((node) => {
              const proc = managedProcs[node.key] || {};
              const isRunning = proc.running || false;
              return (
                <div
                  key={node.key}
                  className={`bg-slate-950 border rounded-xl p-3.5 flex flex-col justify-between space-y-2.5 transition ${
                    isRunning ? 'border-emerald-500/30 shadow-sm' : 'border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-200 truncate">{node.name}</span>
                      {isRunning ? (
                        <span className="px-2 py-0.5 text-[9px] font-bold bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> ONLINE
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[9px] font-semibold bg-slate-800 text-slate-400 rounded border border-slate-700">
                          OFFLINE
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-1">{node.desc}</p>
                  </div>

                  <div className="bg-slate-900/70 rounded-lg p-2 space-y-1 font-mono text-[10px]">
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
        )}
      </div>

      {/* Stacked Low-Priority Tray 3: Real-Time Bringup Launch Output Console (Collapsible) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-slate-200">
              Live Launch Console Output
            </h3>
            <span className="text-xs font-mono text-slate-500">
              ({logs.length} lines)
            </span>
          </div>

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
            <button
              onClick={() => setIsConsoleExpanded(!isConsoleExpanded)}
              className="flex items-center gap-1 text-xs text-slate-300 hover:text-cyan-400 font-semibold py-1 px-2.5 rounded-lg bg-slate-950 border border-slate-800 transition"
            >
              <span>{isConsoleExpanded ? 'Collapse' : 'Expand Terminal'}</span>
              {isConsoleExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Collapsible terminal body */}
        {isConsoleExpanded ? (
          <div
            ref={logTerminalRef}
            className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 h-64 overflow-y-auto space-y-1 select-text animate-in fade-in duration-150"
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
        ) : (
          <div
            onClick={() => setIsConsoleExpanded(true)}
            className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2.5 font-mono text-xs text-slate-400 cursor-pointer hover:border-slate-700 flex items-center justify-between"
          >
            <span className="truncate">
              {logs.length > 0 ? logs[logs.length - 1] : 'No output logged yet. Click to expand live console.'}
            </span>
            <span className="text-[10px] text-cyan-400 font-sans ml-2 flex-shrink-0">Click to expand</span>
          </div>
        )}
      </div>
    </div>
  );
}


