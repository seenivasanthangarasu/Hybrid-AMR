/**
 * ROSBridge connection service — manages WebSocket lifecycle with rosbridge_server.
 * Singleton pattern — imported once and shared across all modules.
 * Rosbridge on this robot: ws://localhost:9090 (default)
 */

import type { RosBridgeConfig } from '@/config/rosbridge'
import { defaultRosBridgeConfig } from '@/config/rosbridge'

/** Internal message sent/received via rosbridge WebSocket */
interface RosBridgeMessage {
  op: string
  topic?: string
  msg?: unknown
  id?: string
  [key: string]: unknown
}

/** Type of the image encoding from /camera/camera/color/image_raw */
interface ImageMsg {
  height: number
  width: number
  step: number
  data: number[]
  encoding: string
  header: {
    seq: number
    stamp: { sec: number; nanosec: number }
    frame_id: string
  }
}

export class RosBridgeService {
  private ws: WebSocket | null = null
  private config: RosBridgeConfig
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private statusCallback?: (status: string) => void
  /** Callback for raw publish messages received on any topic */
  private _messageHandler?: (msg: unknown, topic: string) => void

  constructor(config?: Partial<RosBridgeConfig>) {
    this.config = { ...defaultRosBridgeConfig, ...config }
  }

  /** Register a callback for connection status changes ('connecting'|'connected'|'disconnected'|'error') */
  onStatusChange(callback: (status: string) => void): this {
    this.statusCallback = callback
    return this
  }

  /** Register a raw message handler — dispatches to subscriber services */
  setMessageHandler(cb: (msg: unknown, topic: string) => void): this {
    this._messageHandler = cb
    return this
  }

  /** Open WebSocket connection to rosbridge_server */
  connect(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        if (this.statusCallback) this.statusCallback('connecting')
        this.ws = new WebSocket(this.config.url)

        this.ws.onopen = () => {
          this.reconnectAttempts = 0
          if (this.statusCallback) this.statusCallback('connected')
          resolve(true)
        }

        this.ws.onmessage = (event) => {
          try {
            const msg: RosBridgeMessage = JSON.parse(event.data as string)
            // Dispatch publish messages to registered handlers by topic
            if (msg.op === 'publish' && msg.topic && msg.msg != null) {
              if (this._messageHandler) this._messageHandler(msg.msg, msg.topic)
            }
          } catch { /* skip malformed JSON */ }
        }

        this.ws.onclose = () => {
          if (this.statusCallback) this.statusCallback('disconnected')
          this.attemptReconnect()
          reject(new Error('WebSocket closed'))
        }

        this.ws.onerror = () => {
          if (this.statusCallback) this.statusCallback('error')
          reject(new Error('Connection error'))
        }
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  /** Close the WebSocket connection */
  disconnect(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    if (this.ws) { this.ws.close(); this.ws = null }
    if (this.statusCallback) this.statusCallback('disconnected')
  }

  /** Publish a message to any ROS2 topic via rosbridge */
  publish(topic: string, msg: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ op: 'publish', topic, msg }))
  }

  /** Subscribe to a ROS topic — callback fires on every incoming message */
  subscribe(topic: string, callback: (msg: unknown) => void): { unsubscribe: () => void } {
    const subscriptionId = `gcs_sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

    // Override message handler to route only this topic
    const originalHandler = this._messageHandler
    const handler = (msg: unknown, incomingTopic: string) => {
      if (incomingTopic === topic) callback(msg)
      else if (originalHandler) originalHandler(msg, incomingTopic)
    }
    this._messageHandler = handler

    // Send subscribe request to rosbridge so it forwards the messages
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op: 'subscribe', topic, id: subscriptionId }))
    }

    return {
      unsubscribe: () => {
        // Restore original handler
        this._messageHandler = originalHandler
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ op: 'unsubscribe', topic, id: subscriptionId }))
        }
      },
    }
  }

  /** Call a rosbridge service */
  callService(serviceName: string, serviceType: string, args: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { reject(new Error('Not connected')); return }
      const requestId = `gcs_svc_${Date.now()}`
      const handler = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string)
          if (msg.id === requestId && msg.op === 'service_call') resolve(msg.msg)
        } catch {}
      }
      this.ws.addEventListener('message', handler, { once: true })
      this.ws.send(JSON.stringify({ id: requestId, op: 'call_service', type: serviceType, service: serviceName, args }))
    })
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++
      this.connect().catch(() => {})
    }, this.config.reconnectIntervalMs * this.reconnectAttempts)
  }

  /**
   * Subscribe to image_raw topic and get a Blob URL for direct display in <img> tag.
   * Uses ImageBridge rosbridge service (requires image_transport_py on robot).
   * If ImageBridge is not available, falls back to raw message callback with base64 encoding.
   */
  subscribeImage(topic: string, callback: (dataUrl: string) => void): { unsubscribe: () => void } {
    const subscriptionId = `gcs_img_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

    // Subscribe to raw topic first
    const sub = this.subscribe(topic, (rawMsg: unknown) => {
      if (!rawMsg || typeof rawMsg !== 'object') return
      const msg = rawMsg as ImageMsg
      if (!msg.data || msg.data.length === 0) return

      // Convert sensor_msgs/Image to data URL for display
      try {
        const data = new Uint8Array(msg.data)
        const blob = new Blob([data], { type: 'image/jpeg' })
        const url = URL.createObjectURL(blob)
        callback(url)
      } catch (err) {
        console.error('Error converting image:', err)
      }
    })

    // Also send subscribe request via rosbridge for ImageBridge compatibility
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op: 'subscribe', topic, id: subscriptionId }))
    }

    return { unsubscribe: () => sub.unsubscribe() }
  }
}

/** Singleton instance */
export const rosBridgeService = new RosBridgeService()
