import { useEffect, useState } from 'react';
import rosService from '../services/RosConnectionService.js';

/**
 * useRosConnection
 * Connects to ROSBridge on mount and exposes live connection status.
 * Status values: 'disconnected' | 'connecting' | 'connected' | 'error' | 'closed'
 */
export default function useRosConnection() {
  const [status, setStatus] = useState('disconnected');

  useEffect(() => {
    rosService.connect();
    const unsubscribe = rosService.onStatusChange(setStatus);
    return unsubscribe;
  }, []);

  const reconnect = () => rosService.reconnect();

  return { status, isConnected: status === 'connected', reconnect };
}
