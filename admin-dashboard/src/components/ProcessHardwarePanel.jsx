import React, { useState } from 'react';
import useRosTopic from '../hooks/useRosTopic';
import { Cpu, HardDrive, MapPin, Radio, AlertTriangle, CheckCircle2, XCircle, RotateCcw, ShieldAlert, Server } from 'lucide-react';

export default function ProcessHardwarePanel({ statusData, restartProcess, backendConnected }) {
  const [confirmModal, setConfirmModal] = useState(null); // process key to confirm
  const [restarting, setRestarting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Subscribe to /hiwonder/gps/fix for live GPS status
  const { data: gpsData, hasData: hasGps, stale: gpsStale } = useRosTopic({
    name: '/hiwonder/gps/fix',
    messageType: 'sensor_msgs/NavSatFix',
    throttle_rate: 500,
  });

  const handleRestart = async (procKey) => {
    setRestarting(true);
    setFeedback(null);
    try {
      const res = await restartProcess(procKey);
      if (res.status === 'ok') {
        setFeedback({ type: 'success', text: res.message || `Restart signal sent to ${procKey}` });
      } else {
        setFeedback({ type: 'error', text: res.message || `Failed to restart ${procKey}` });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setRestarting(false);
      setConfirmModal(null);
    }
  };

  const hardware = statusData?.hardware || {};
  const services = statusData?.services || {};
  const processes = statusData?.managed_processes || {};

  // Map GPS status int to readable string
  let gpsStatusText = 'No Fix / Unknown';
  if (hasGps && gpsData?.status?.status !== undefined) {
    const s = gpsData.status.status;
    if (s === -1) gpsStatusText = 'No Fix';
    else if (s === 0) gpsStatusText = 'GPS Standard Fix (2D/3D)';
    else if (s === 1) gpsStatusText = 'SBAS / DGPS Fix';
    else if (s === 2) gpsStatusText = 'RTK Precision Fix';
  }

  return (
    <div className="space-y-6">
      {/* Feedback notification banner */}
      {feedback && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-200">
            &times;
          </button>
        </div>
      )}

      {/* Serial Hardware & Ports Reachability */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* /dev/hiwonder_gps */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400">/dev/hiwonder_gps</span>
            {hardware.hiwonder_gps?.exists ? (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/30">
                Connected
              </span>
            ) : (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-500/10 text-rose-400 rounded border border-rose-500/30">
                Missing
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-200">Hiwonder GPS Module</p>
          <p className="text-xs text-slate-400 mt-1">
            Access: <span className="font-mono text-slate-300">{hardware.hiwonder_gps?.accessible ? 'Read/Write' : 'Permission Denied / Missing'}</span>
          </p>
        </div>

        {/* /dev/hiwonder_imu */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400">/dev/hiwonder_imu</span>
            {hardware.hiwonder_imu?.exists ? (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/30">
                Connected
              </span>
            ) : (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-500/10 text-rose-400 rounded border border-rose-500/30">
                Missing
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-200">Hiwonder 9-DOF IMU</p>
          <p className="text-xs text-slate-400 mt-1">
            Access: <span className="font-mono text-slate-300">{hardware.hiwonder_imu?.accessible ? 'Read/Write' : 'Permission Denied / Missing'}</span>
          </p>
        </div>

        {/* /dev/esp */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400">/dev/amr_encoder</span>
            {hardware.esp32?.exists ? (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/30">
                Connected
              </span>
            ) : (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-500/10 text-rose-400 rounded border border-rose-500/30">
                Missing
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-200">ESP32 Motor Bridge</p>
          <p className="text-xs text-slate-400 mt-1">
            Access: <span className="font-mono text-slate-300">{hardware.esp32?.accessible ? 'Read/Write' : 'Permission Denied / Missing'}</span>
          </p>
        </div>

        {/* /dev/ttyUSB0 */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400">/dev/ttyUSB0</span>
            {hardware.ydlidar?.exists ? (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/30">
                Connected
              </span>
            ) : (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-500/10 text-rose-400 rounded border border-rose-500/30">
                Missing
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-200">YDLidar Serial Sensor</p>
          <p className="text-xs text-slate-400 mt-1">
            Access: <span className="font-mono text-slate-300">{hardware.ydlidar?.accessible ? 'Read/Write' : 'Permission Denied / Missing'}</span>
          </p>
        </div>

        {/* Rosbridge (9090) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400">Port 9090</span>
            {services.rosbridge_9090 ? (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/30">
                Reachable
              </span>
            ) : (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-500/10 text-rose-400 rounded border border-rose-500/30">
                Unreachable
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-200">rosbridge WebSocket</p>
          <p className="text-xs text-slate-400 mt-1">ROS 2 JSON Communication</p>
        </div>

        {/* Web Video Server (8080) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400">Port 8080</span>
            {services.web_video_server_8080 ? (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/30">
                Reachable
              </span>
            ) : (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/10 text-amber-400 rounded border border-amber-500/30">
                Offline
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-200">Web Video Server</p>
          <p className="text-xs text-slate-400 mt-1">MJPEG Camera Streamer</p>
        </div>
      </div>

      {/* GPS Telemetry Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-cyan-400" />
            Live Hiwonder GPS Satellite Telemetry (/hiwonder/gps/fix)
          </h2>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-bold ${
              hasGps && !gpsStale
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
            }`}
          >
            {hasGps && !gpsStale ? 'GPS Stream Active' : 'No Data / Stale'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs">
          <div>
            <span className="text-slate-500 text-[11px] block">Fix Type</span>
            <span className="text-slate-200 font-bold text-sm mt-0.5 block">{gpsStatusText}</span>
          </div>

          <div>
            <span className="text-slate-500 text-[11px] block">Latitude</span>
            <span className="text-cyan-400 font-bold text-sm mt-0.5 block">
              {hasGps ? gpsData.latitude?.toFixed(7) : '0.0000000'}
            </span>
          </div>

          <div>
            <span className="text-slate-500 text-[11px] block">Longitude</span>
            <span className="text-cyan-400 font-bold text-sm mt-0.5 block">
              {hasGps ? gpsData.longitude?.toFixed(7) : '0.0000000'}
            </span>
          </div>

          <div>
            <span className="text-slate-500 text-[11px] block">Altitude</span>
            <span className="text-slate-200 font-bold text-sm mt-0.5 block">
              {hasGps ? `${gpsData.altitude?.toFixed(2)} m` : '0.00 m'}
            </span>
          </div>
        </div>
      </div>

      {/* Managed Processes Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-purple-400" />
            Managed Robot Processes{' '}
            <code className="text-xs font-mono text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
              hybrid_manager
            </code>
          </h2>
          <p className="text-xs text-slate-400">Introspect process running state, PIDs, and resource utilization</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(processes).map(([key, proc]) => {
            const isRunning = proc.running;
            return (
              <div
                key={key}
                className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 font-mono">{proc.name}</h3>
                    <p className="text-[11px] text-slate-500 truncate max-w-[180px]">
                      {proc.patterns?.[0]}
                    </p>
                  </div>
                  {isRunning ? (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/30">
                      RUNNING
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-500/10 text-rose-400 rounded border border-rose-500/30">
                      STOPPED
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-900 p-2 rounded-lg text-center font-mono text-[11px]">
                  <div>
                    <span className="text-slate-500 text-[10px] block">PID</span>
                    <span className="text-slate-200">{proc.pid || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">CPU</span>
                    <span className="text-slate-200">{isRunning ? `${proc.cpu_percent}%` : '0%'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">RAM</span>
                    <span className="text-slate-200">{isRunning ? `${proc.memory_percent}%` : '0%'}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-400">
                    Uptime: {proc.uptime_seconds ? `${Math.round(proc.uptime_seconds / 60)}m` : 'Offline'}
                  </span>

                  <button
                    onClick={() => setConfirmModal(key)}
                    disabled={!backendConnected}
                    className="flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 rounded text-xs font-semibold transition"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restart
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Process Restart Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <ShieldAlert className="w-7 h-7" />
              <h3 className="text-base font-bold text-slate-100">Confirm Process Restart</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to restart process <strong className="text-cyan-400 font-mono">{confirmModal}</strong>? This will terminate the running instance and allow the system supervisor to relaunch it.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRestart(confirmModal)}
                disabled={restarting}
                className="px-4 py-2 bg-rose-500 text-slate-950 hover:bg-rose-400 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                {restarting && <RotateCcw className="w-3.5 h-3.5 animate-spin" />}
                Confirm Kill & Restart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
