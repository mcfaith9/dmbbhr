/**
 * Client service in Vue to connect to the local Node.js biometric agent WebSocket bridge.
 * Supports auto-reconnect and notifies listeners whenever a live fingerprint scan arrives.
 */

import { ref } from 'vue'
import type { AttendanceLog } from '@/types'

type ScanCallback = (log: AttendanceLog) => void

class LiveAttendanceService {
  private socket: WebSocket | null = null
  private listeners: Set<ScanCallback> = new Set()
  private reconnectTimer: any = null
  public isConnected = ref(false)
  public lastReceivedScan = ref<AttendanceLog | null>(null)
  public connectionUrl = ref('')

  constructor() {
    this.connectionUrl.value = this.getWsUrl()
  }

  private getWsUrl(): string {
    // If user provided custom VITE_AGENT_WS_URL, use that.
    // Otherwise connect to the host of current browser window on port 5174.
    // (This allows Laptop B to automatically connect to Laptop A if opened via http://<LaptopA-IP>:3000)
    if (import.meta.env.VITE_AGENT_WS_URL) {
      return import.meta.env.VITE_AGENT_WS_URL
    }

    const host = window.location.hostname || 'localhost'
    return `ws://${host}:5174`
  }

  public connect(customUrl?: string) {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return
    }

    const url = customUrl || this.connectionUrl.value
    this.connectionUrl.value = url

    try {
      this.socket = new WebSocket(url)

      this.socket.onopen = () => {
        this.isConnected.value = true
        console.log(`[DMBBHR Live] Connected to Biometric Node Agent WebSocket bridge at ${url}`)
      }

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'BIOMETRIC_SCAN' && data.payload) {
            const raw = data.payload
            
            // Map payload into UI AttendanceLog structure
            const scanLog: AttendanceLog = {
              id: `live-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              user_id: String(raw.user_id),
              employee_id: raw.employee_id,
              employee_name: raw.employee_name,
              attendance_time: raw.attendance_time,
              type: Number(raw.type ?? 1),
              state: Number(raw.state ?? 1),
              serial_number: raw.serial_number ?? 0,
              device_id: 'dev-1',
              device_name: raw.device_name || 'BISMAC BISBIO B-29b',
              device_ip: raw.device_ip || '192.168.1.201',
              location_id: raw.location_id || 'loc-cebu',
              location_name: raw.location || 'DBB Cebu',
              is_duplicate: Boolean(raw.is_duplicate),
              created_at: new Date().toISOString()
            }

            this.lastReceivedScan.value = scanLog

            // Trigger registered callbacks
            for (const listener of this.listeners) {
              try {
                listener(scanLog)
              } catch (e) {
                console.error('[DMBBHR Live] Error in scan callback:', e)
              }
            }
          }
        } catch (e) {
          // ignore non-json
        }
      }

      this.socket.onclose = () => {
        this.isConnected.value = false
        this.scheduleReconnect()
      }

      this.socket.onerror = () => {
        this.isConnected.value = false
        // Will close and trigger scheduleReconnect
      }
    } catch (e) {
      this.isConnected.value = false
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 4000)
  }

  public onScan(callback: ScanCallback) {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
    this.isConnected.value = false
  }
}

export const liveAttendanceService = new LiveAttendanceService()
