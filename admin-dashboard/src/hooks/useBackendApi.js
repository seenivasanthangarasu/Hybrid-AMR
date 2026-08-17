import { useState, useEffect, useCallback } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';

export default function useBackendApi(pollIntervalMs = 2000) {
  const [systemData, setSystemData] = useState(null);
  const [statusData, setStatusData] = useState(null);
  const [backendConnected, setBackendConnected] = useState(false);
  const [error, setError] = useState(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const [sysRes, statusRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/system`),
        fetch(`${BACKEND_URL}/api/status`)
      ]);

      if (sysRes.ok && statusRes.ok) {
        const sysJson = await sysRes.json();
        const statusJson = await statusRes.json();
        setSystemData(sysJson);
        setStatusData(statusJson);
        setBackendConnected(true);
        setError(null);
      } else {
        setBackendConnected(false);
      }
    } catch (err) {
      setBackendConnected(false);
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchMetrics, pollIntervalMs]);

  const restartProcess = async (processName) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/process/restart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ process: processName }),
      });
      const data = await res.json();
      fetchMetrics();
      return data;
    } catch (err) {
      return { status: 'error', message: err.message };
    }
  };

  const fetchLogs = async (source = 'ros', lines = 100, filter = '') => {
    try {
      const params = new URLSearchParams({ source, lines: String(lines), filter });
      const res = await fetch(`${BACKEND_URL}/api/logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        return data.lines || [];
      }
      return [`[Failed to fetch logs: HTTP ${res.status}]`];
    } catch (err) {
      return [`[Error fetching logs: ${err.message}]`];
    }
  };

  return {
    systemData,
    statusData,
    backendConnected,
    error,
    refresh: fetchMetrics,
    restartProcess,
    fetchLogs,
    backendUrl: BACKEND_URL
  };
}
