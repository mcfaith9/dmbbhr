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

export interface SyncProgressState {
  stage: 'connecting' | 'downloading' | 'validating' | 'saving' | 'complete' | 'error' | string
  message: string
  progress: number
  summary?: {
    success: boolean
    newRecords: number
    alreadySynced: number
    invalidSkipped: number
    totalValid: number
    strategyUsed?: string
    invalidSamples?: Array<{ rawUserId: string; rawDate: string; reason: string }>
    allRecords?: AttendanceLog[]
  }
}

type ScanCallback = (log: AttendanceLog) => void
type StatusCallback = (status: RealDeviceStatus) => void
type LogsCallback = () => void
type SyncCallback = (progress: SyncProgressState) => void

class LiveAttendanceService {
  private socket: WebSocket | null = null
  private scanListeners: Set<ScanCallback> = new Set()
  private statusListeners: Set<StatusCallback> = new Set()
  private logsListeners: Set<LogsCallback> = new Set()
  private syncListeners: Set<SyncCallback> = new Set()
  private reconnectTimer: any = null
  
  // Agent connection state
  public isAgentConnected = ref(false)
  public lastReceivedScan = ref<AttendanceLog | null>(null)

  // Controlled manual sync state
  public isSyncing = ref(false)
  public syncProgress = ref<SyncProgressState | null>(null)
  
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

  private getHttpBaseUrl(): string {
    if (import.meta.env.VITE_AGENT_WS_URL) {
      try {
        const u = new URL(import.meta.env.VITE_AGENT_WS_URL)
        return `http://${u.hostname}:${u.port || '5174'}`
      } catch {
        // fallback
      }
    }
    const host = window.location.hostname || 'localhost'
    return `http://${host}:5174`
  }

  public async fetchHttpSync() {
    try {
      const httpBase = this.getHttpBaseUrl()
      const statusRes = await fetch(`${httpBase}/api/device/status`, { signal: AbortSignal.timeout(2000) })
      if (statusRes.ok) {
        const data = await statusRes.json()
        if (data.device) {
          this.deviceStatus.value = data.device
          this.notifyStatusListeners()
        }
      }

      const logsRes = await fetch(`${httpBase}/api/logs`, { signal: AbortSignal.timeout(3000) })
      if (logsRes.ok) {
        const logData = await logsRes.json()
        if (Array.isArray(logData.logs) && logData.logs.length > 0) {
          attendanceService.setDeviceLogs(logData.logs)
          this.notifyLogsListeners()
        }
      }
    } catch {
      // Quiet fallback if agent is not running
    }
  }

  public connect() {
    this.fetchHttpSync()

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
          if (data.type === 'INITIAL_STATE') {
            if (data.payload?.device) {
              this.deviceStatus.value = data.payload.device
              this.notifyStatusListeners()
            }
            if (Array.isArray(data.payload?.logs) && data.payload.logs.length > 0) {
              attendanceService.setDeviceLogs(data.payload.logs)
              this.notifyLogsListeners()
            }
          }

          // 1.1 Device Logs Broadcast (from device log pull)
          if (data.type === 'DEVICE_LOGS' && Array.isArray(data.payload)) {
            attendanceService.setDeviceLogs(data.payload)
            this.notifyLogsListeners()
          }

          // 2. Hardware Status Update (Heartbeat / Connect / Disconnect)
          if (data.type === 'DEVICE_STATUS' && data.payload) {
            this.deviceStatus.value = data.payload
            this.notifyStatusListeners()
          }

          // 2.1 Sync Progress Update
          if (data.type === 'SYNC_PROGRESS' && data.payload) {
            const prog = data.payload as SyncProgressState
            this.syncProgress.value = prog
            if (prog.stage === 'complete') {
              this.isSyncing.value = false
              if (prog.summary?.allRecords && Array.isArray(prog.summary.allRecords)) {
                attendanceService.setDeviceLogs(prog.summary.allRecords)
                this.notifyLogsListeners()
              }
            } else if (prog.stage === 'error') {
              this.isSyncing.value = false
            } else {
              this.isSyncing.value = true
            }
            this.notifySyncListeners(prog)
          }

          // 3. Real Biometric Scan Received
          if (data.type === 'BIOMETRIC_SCAN' && data.payload) {
            const raw = data.payload

            const scanLog: AttendanceLog = {
              id: raw.id || `real-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              user_id: String(raw.user_id || raw.userId),
              employee_id: raw.employee_id,
              employee_name: raw.employee_name || 'Biometric User',
              attendance_time: raw.attendance_time || raw.timestamp || new Date().toISOString(),
              type: Number(raw.type ?? raw.verificationMethod ?? 1),
              state: Number(raw.state ?? raw.status ?? 1),
              serial_number: raw.serial_number ?? raw.sn ?? 0,
              device_id: 'dev-1',
              device_name: raw.device_name || raw.deviceName || 'BISMAC BISBIO B-29b',
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

  private notifyLogsListeners() {
    for (const listener of this.logsListeners) {
      try {
        listener()
      } catch {
        // ignore
      }
    }
  }

  private notifySyncListeners(prog: SyncProgressState) {
    for (const listener of this.syncListeners) {
      try {
        listener(prog)
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

  public onLogs(callback: LogsCallback) {
    this.logsListeners.add(callback)
    return () => this.logsListeners.delete(callback)
  }

  public onSyncProgress(callback: SyncCallback) {
    this.syncListeners.add(callback)
    if (this.syncProgress.value) {
      callback(this.syncProgress.value)
    }
    return () => this.syncListeners.delete(callback)
  }

  public clearSyncProgress() {
    this.syncProgress.value = null
  }

  /**
   * Initiates on-demand attendance synchronization from the BISMAC BISBIO B-29b device.
   * Disables repeated polling; runs only when explicitly triggered by the user.
   */
  public async triggerManualSync(): Promise<{ success: boolean; message: string; summary?: any }> {
    if (this.isSyncing.value) {
      return { success: false, message: 'Synchronization is already in progress' }
    }

    this.isSyncing.value = true
    this.syncProgress.value = {
      stage: 'connecting',
      message: 'Connecting to biometric device (192.168.1.201:4370)...',
      progress: 10
    }

    try {
      const httpBase = this.getHttpBaseUrl()
      const res = await fetch(`${httpBase}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(60000) // allow up to 60s for full device download
      })

      const data = await res.json()
      if (!res.ok || data.status === 'error') {
        const errorMsg = data.message || `Sync request failed with status ${res.status}`
        this.syncProgress.value = {
          stage: 'error',
          message: errorMsg,
          progress: 0
        }
        this.isSyncing.value = false
        return { success: false, message: errorMsg }
      }

      // Success payload received
      this.isSyncing.value = false
      if (data.allRecords && Array.isArray(data.allRecords)) {
        attendanceService.setDeviceLogs(data.allRecords)
        this.notifyLogsListeners()
      }

      this.syncProgress.value = {
        stage: 'complete',
        message: `Sync complete. ${data.newRecords ?? 0} new record(s) imported, ${data.alreadySynced ?? 0} already synced, ${data.invalidSkipped ?? 0} corrupt/invalid record(s) skipped.`,
        progress: 100,
        summary: data
      }

      return {
        success: true,
        message: 'Biometric attendance synchronization completed successfully',
        summary: data
      }
    } catch (err: any) {
      const isTimeout = err?.name === 'TimeoutError' || err?.message?.toLowerCase().includes('timeout')
      const errorMsg = isTimeout
        ? 'Sync timed out. Verify network connection to 192.168.1.201:4370.'
        : `Biometric agent is unreachable (${err?.message || 'Connection failed'}). Ensure the Node.js agent is running.`

      this.syncProgress.value = {
        stage: 'error',
        message: errorMsg,
        progress: 0
      }
      this.isSyncing.value = false
      return { success: false, message: errorMsg }
    }
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
