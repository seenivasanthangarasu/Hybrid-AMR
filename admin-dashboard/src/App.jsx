import React, { useState, useEffect } from 'react';
import rosService from './services/RosService';
import useBackendApi from './hooks/useBackendApi';
import Header from './components/Header';
import RosGraphPanel from './components/RosGraphPanel';
import ProcessHardwarePanel from './components/ProcessHardwarePanel';
import SystemHealthPanel from './components/SystemHealthPanel';
import LogsPanel from './components/LogsPanel';
import CameraPanel from './components/CameraPanel';

import RobotControlPanel from './components/RobotControlPanel';

export default function App() {
  const [activeTab, setActiveTab] = useState('control');
  const [rosStatus, setRosStatus] = useState('disconnected');

  const {
    systemData,
    statusData,
    backendConnected,
    restartProcess,
    fetchLogs,
    startStack,
    stopStack,
    toggleCamera,
    fetchStackLogs,
  } = useBackendApi(2000);

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
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {activeTab === 'control' && (
          <RobotControlPanel
            statusData={statusData}
            startStack={startStack}
            stopStack={stopStack}
            toggleCamera={toggleCamera}
            fetchStackLogs={fetchStackLogs}
            backendConnected={backendConnected}
          />
        )}
        {activeTab === 'graph' && <RosGraphPanel rosStatus={rosStatus} />}
        {activeTab === 'process' && (
          <ProcessHardwarePanel
            statusData={statusData}
            restartProcess={restartProcess}
            backendConnected={backendConnected}
          />
        )}
        {activeTab === 'system' && <SystemHealthPanel systemData={systemData} />}
        {activeTab === 'logs' && <LogsPanel fetchLogs={fetchLogs} />}
        {activeTab === 'camera' && <CameraPanel backendConnected={backendConnected} />}
      </main>

      <footer className="bg-slate-900 border-t border-slate-800 py-3 text-center text-xs text-slate-500 font-mono">
        Rubik Pi Onboard Admin & Diagnostics Dashboard &bull; ROS 2 Jazzy Jalisco &bull; Bound to 0.0.0.0
      </footer>
    </div>
  );
}
