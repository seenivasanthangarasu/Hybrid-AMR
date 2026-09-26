import React, { useState, useEffect } from 'react';
import rosService from './services/RosService';
import useBackendApi from './hooks/useBackendApi';
import useRosTopic from './hooks/useRosTopic';
import Header from './components/Header';
import RosGraphPanel from './components/RosGraphPanel';
import ProcessHardwarePanel from './components/ProcessHardwarePanel';
import SystemHealthPanel from './components/SystemHealthPanel';
import LogsPanel from './components/LogsPanel';
import CameraPanel from './components/CameraPanel';
import RobotControlPanel from './components/RobotControlPanel';
import { PowerOff, Terminal, RefreshCw } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('control');
  const [rosStatus, setRosStatus] = useState('disconnected');
  const [isServicesShutdown, setIsServicesShutdown] = useState(false);

  const {
    systemData,
    statusData,
    backendConnected,
    restartProcess,
    fetchLogs,
    startStack,
    stopStack,
    toggleCamera,
    toggleTeleop,
    toggleMotor,
    toggleRadio,
    fetchStackLogs,
    shutdownServices,
  } = useBackendApi(2000);

  // Live ROS 2 Battery State Subscription
  const { data: batteryMsg, hasData: hasBatteryRos } = useRosTopic({
    name: '/battery_state',
    messageType: 'sensor_msgs/BatteryState',
    throttle_rate: 500,
  });

  // Live Authoritative AMR Session Subscription (/amr/session)
  const { data: sessionRosMsg, hasData: hasSessionRos } = useRosTopic({
    name: '/amr/session',
    messageType: 'std_msgs/String',
    throttle_rate: 0,
  });

  // Parse session JSON payload if available from ROS topic, fallback to backend /api/status session
  let liveSession = null;
  if (hasSessionRos && sessionRosMsg?.data) {
    try {
      liveSession = typeof sessionRosMsg.data === 'string' ? JSON.parse(sessionRosMsg.data) : sessionRosMsg.data;
    } catch (e) {
      console.warn('Failed to parse ROS session message:', e);
    }
  }
  const sessionData = liveSession || statusData?.session || null;

  const batteryVoltage =
    hasBatteryRos && batteryMsg?.voltage !== undefined && batteryMsg.voltage > 0
      ? batteryMsg.voltage
      : statusData?.battery?.voltage ?? systemData?.battery?.voltage ?? statusData?.hardware?.sabertooth?.battery_voltage ?? null;

  useEffect(() => {
    const unsubscribe = rosService.onStatusChange((status) => {
      setRosStatus(status);
    });

    rosService.connect();

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header
        rosStatus={rosStatus}
        backendConnected={backendConnected}
        systemData={systemData}
        batteryVoltage={batteryVoltage}
        sessionData={sessionData}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        shutdownServices={shutdownServices}
        onShutdownTriggered={() => setIsServicesShutdown(true)}
      />

      {isServicesShutdown ? (
        <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-16 flex items-center justify-center">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 mx-auto flex items-center justify-center">
              <PowerOff className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-100">All Services Successfully Shut Down</h2>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                All robot nodes, ROSBridge (port 9090), Flask API backend (port 5001), video streamer (port 8080), and Vite frontend (port 3000) have terminated cleanly.
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-left font-mono text-xs text-slate-300 space-y-2">
              <div className="flex items-center gap-2 text-cyan-400 font-bold">
                <Terminal className="w-4 h-4" />
                <span>To restart dashboard and backend suite:</span>
              </div>
              <p className="text-slate-400">Run the single bringup script inside your robot workspace:</p>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-cyan-300 font-bold select-all">
                cd ~/Desktop/Xtrmbly && ./start_all.sh
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition inline-flex items-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Page</span>
              </button>
            </div>
          </div>
        </main>
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
          {activeTab === 'control' && (
            <RobotControlPanel
              statusData={statusData}
              batteryVoltage={batteryVoltage}
              sessionData={sessionData}
              startStack={startStack}
              stopStack={stopStack}
              toggleCamera={toggleCamera}
              toggleTeleop={toggleTeleop}
              toggleMotor={toggleMotor}
              toggleRadio={toggleRadio}
              fetchStackLogs={fetchStackLogs}
              backendConnected={backendConnected}
              shutdownServices={shutdownServices}
            />
          )}
          {activeTab === 'graph' && <RosGraphPanel rosStatus={rosStatus} />}
          {activeTab === 'process' && (
            <ProcessHardwarePanel
              statusData={statusData}
              batteryVoltage={batteryVoltage}
              sessionData={sessionData}
              restartProcess={restartProcess}
              backendConnected={backendConnected}
            />
          )}
          {activeTab === 'system' && (
            <SystemHealthPanel
              systemData={systemData}
              batteryVoltage={batteryVoltage}
            />
          )}
          {activeTab === 'logs' && <LogsPanel fetchLogs={fetchLogs} />}
          {activeTab === 'camera' && (
            <CameraPanel
              backendConnected={backendConnected}
              statusData={statusData}
              toggleCamera={toggleCamera}
            />
          )}
        </main>
      )}

      <footer className="bg-slate-900 border-t border-slate-800 py-3 text-center text-xs text-slate-500 font-mono">
        Rubik Pi Onboard Admin & Diagnostics Dashboard &bull; ROS 2 Jazzy Jalisco &bull; Bound to 0.0.0.0
      </footer>
    </div>
  );
}
