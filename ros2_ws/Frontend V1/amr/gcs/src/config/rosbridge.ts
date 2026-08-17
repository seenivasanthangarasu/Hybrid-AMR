/**
 * ROSBridge connection configuration.
 * All values are external-facing — never hardcode topic names, IPs, or ports here.
 */

export interface RosBridgeConfig {
  /** WebSocket URL for rosbridge_suite */
  url: string;
  /** Reconnection attempts before giving up */
  maxReconnectAttempts: number;
  /** Milliseconds between reconnection attempts */
  reconnectIntervalMs: number;
  /** Ping interval in seconds (keep-alive) */
  pingIntervalSeconds: number;
}

/** Default configuration — override via env vars or Settings module at runtime */
export const defaultRosBridgeConfig: RosBridgeConfig = {
  url: import.meta.env.VITE_ROSBridge_URL || 'ws://localhost:9090',
  maxReconnectAttempts: 10,
  reconnectIntervalMs: 3000,
  pingIntervalSeconds: 30,
}
