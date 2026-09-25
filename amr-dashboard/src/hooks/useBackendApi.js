import { useState, useEffect, useCallback } from 'react';
import { getBackendApiUrl } from '../config/endpoints.js';

/**
 * useBackendApi
 * --------------
 * REST API client for robot-side FastAPI/Flask backend (port 5001).
 * Supports camera toggle in v4l2 mode, hardware inspection, and system metrics.
 */
export default function useBackendApi(pollIntervalMs = 3000) {
  const [systemData, setSystemData] = useState(null);
  const [statusData, setStatusData] = useState(null);
  const [cameraHardware, setCameraHardware] = useState(null);
  const [backendConnected, setBackendConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const backendUrl = getBackendApiUrl();

  const fetchMetrics = useCallback(async () => {
    try {
      const [sysRes, statusRes] = await Promise.allSettled([
        fetch(`${backendUrl}/api/system`, { signal: AbortSignal.timeout(2500) }),
        fetch(`${backendUrl}/api/status`, { signal: AbortSignal.timeout(2500) }),
      ]);

      let okCount = 0;
      if (sysRes.status === 'fulfilled' && sysRes.value.ok) {
        const sysJson = await sysRes.value.json();
        setSystemData(sysJson);
        okCount += 1;
      }
      if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
        const statusJson = await statusRes.value.json();
        setStatusData(statusJson);
        if (statusJson.hardware?.camera) {
          setCameraHardware(statusJson.hardware.camera);
        }
        okCount += 1;
      }

      setBackendConnected(okCount > 0);
      if (okCount > 0) setError(null);
    } catch (err) {
      setBackendConnected(false);
      setError(err.message);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchMetrics, pollIntervalMs]);

  /**
   * Toggles camera module via POST /api/camera/toggle with mode "v4l2" (default) or "auto"
   */
  const toggleCamera = async (enable, mode = 'v4l2') => {
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/camera/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable, mode }),
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      await fetchMetrics();
      setLoading(false);
      return data;
    } catch (err) {
      setLoading(false);
      return { status: 'error', message: err.message };
    }
  };

  /**
   * Fetches detailed camera hardware and process status
   */
  const fetchCameraStatus = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/camera/status`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.hardware?.camera) setCameraHardware(data.hardware.camera);
        return data;
      }
      return { status: 'error', running: false };
    } catch (err) {
      return { status: 'error', message: err.message };
    }
  };

  const restartProcess = async (processName) => {
    try {
      const res = await fetch(`${backendUrl}/api/process/restart`, {
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

  return {
    backendUrl,
    backendConnected,
    systemData,
    statusData,
    cameraHardware,
    loading,
    error,
    refresh: fetchMetrics,
    toggleCamera,
    fetchCameraStatus,
    restartProcess,
  };
}
