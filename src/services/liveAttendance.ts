/**
 * Client service in Vue to connect to the local Node.js biometric agent WebSocket bridge.
 * Tracks REAL hardware status, heartbeats, and live fingerprint scan events.
 */

import { ref } from 'vue'
import type { AttendanceLog } from '@/types'
import { attendanceService } from './attendance'

export interface RealDeviceStatus {
  model: string
  ip: string
  port: number
  serial: string
  status: 'online' | 'offline' | 'connecting'
  reason: string
  lastConnected: string | null
  lastDisconnected: string | null
  lastAttempt: string | null
  lastEvent: string | null
}

type ScanCallback = (log: AttendanceLog) => void
type StatusCallback = (status: RealDeviceStatus) => void

class LiveAttendanceService {
  private socket: WebSocket | null = null
  private scanListeners: Set<ScanCallback> = new Set()
  private statusListeners: Set<StatusCallback> = new Set()
  private reconnectTimer: any = null
  
  // Agent connection state
  public isAgentConnected = ref(false)
  public lastReceivedScan = ref<AttendanceLog | null>(null)
  
  // Real hardware device status (reported by Node.js agent)
  public deviceStatus = ref<RealDeviceStatus>({
    model: 'BISMAC BISBIO B-29b',
    ip: '192.168.1.201',
    port: 4370,
    serial: '0476141400046',
    status: 'offline', // Strictly offline by default
    reason: 'Connecting to local biometric agent...',
    lastConnected: null,
    lastDisconnected: null,
    lastAttempt: null,
    lastEvent: null
  })

  constructor() {
    this.connect()
  }

  private getWsUrl(): string {
    if (import.meta.env.VITE_AGENT_WS_URL) {
      return import.meta.env.VITE_AGENT_WS_URL
    }
    const host = window.location.hostname || 'localhost'
    return `ws://${host}:5174`
  }

  public connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return
    }

    const url = this.getWsUrl()

    try {
      this.socket = new WebSocket(url)

      this.socket.onopen = () => {
        this.isAgentConnected.value = true
      }

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          // 1. Initial State Sync
          if (data.type === 'INITIAL_STATE' && data.payload?.device) {
            this.deviceStatus.value = data.payload.device
            this.notifyStatusListeners()
          }

          // 2. Hardware Status Update (Heartbeat / Connect / Disconnect)
          if (data.type === 'DEVICE_STATUS' && data.payload) {
            this.deviceStatus.value = data.payload
            this.notifyStatusListeners()
          }

          // 3. Real Biometric Scan Received
          if (data.type === 'BIOMETRIC_SCAN' && data.payload) {
            const raw = data.payload

            const scanLog: AttendanceLog = {
              id: `real-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              user_id: String(raw.user_id),
              employee_id: raw.employee_id,
              employee_name: raw.employee_name || 'Biometric User',
              attendance_time: raw.attendance_time || new Date().toISOString(),
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
            attendanceService.addRealScan(scanLog)

            for (const listener of this.scanListeners) {
              try {
                listener(scanLog)
              } catch (e) {
                console.error('[LiveAttendance] Scan callback error:', e)
              }
            }
          }
        } catch {
          // ignore
        }
      }

      this.socket.onclose = () => {
        this.isAgentConnected.value = false
        // If the agent process was terminated or unreachable, device is definitely offline
        this.deviceStatus.value.status = 'offline'
        this.deviceStatus.value.reason = 'Biometric agent process is not running'
        this.notifyStatusListeners()
        this.scheduleReconnect()
      }

      this.socket.onerror = () => {
        this.isAgentConnected.value = false
        this.deviceStatus.value.status = 'offline'
        this.deviceStatus.value.reason = 'Unable to communicate with biometric agent bridge'
        this.notifyStatusListeners()
      }
    } catch {
      this.isAgentConnected.value = false
      this.deviceStatus.value.status = 'offline'
      this.scheduleReconnect()
    }
  }

  private notifyStatusListeners() {
    for (const listener of this.statusListeners) {
      try {
        listener(this.deviceStatus.value)
      } catch {
        // ignore
      }
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
    this.scanListeners.add(callback)
    return () => this.scanListeners.delete(callback)
  }

  public onStatusChange(callback: StatusCallback) {
    this.statusListeners.add(callback)
    callback(this.deviceStatus.value)
    return () => this.statusListeners.delete(callback)
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
    this.isAgentConnected.value = false
  }
}

export const liveAttendanceService = new LiveAttendanceService()
