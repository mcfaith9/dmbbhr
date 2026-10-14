/**
 * Client service in Vue to connect to the local Node.js biometric agent WebSocket bridge.
 * Tracks REAL hardware status, heartbeats, and live fingerprint scan events.
 */

import { ref } from 'vue'
import type { AttendanceLog } from '@/types'
import { attendanceService } from './attendance'
import { punchDisplayService, normalizeBioId } from './punchDisplay'
import { employeeService } from './employees'
import { workGroupRepository } from '@/repositories/workGroupRepository'
import { punchRepository } from '@/repositories/punchRepository'

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

export interface SyncSummaryCounts {
  deviceRecordsRetrieved: number
  recordsParsed: number
  recordsSavedByAgent: number
  recordsDeliveredToBrowser: number
  recordsInsertedOrUpdated: number
  duplicatesSkipped: number
  failures: number
}

export interface SyncProgressState {
  stage: 'connecting' | 'reading_users' | 'downloading' | 'validating' | 'saving' | 'ingesting' | 'complete' | 'error' | string
  message: string
  progress: number
  receivedBytes?: number
  totalBytes?: number
  summary?: {
    success: boolean
    deviceReturned?: number
    parsedCount?: number
    rejectedCount?: number
    duplicatesCount?: number
    newRecords?: number
    alreadySynced?: number
    invalidSkipped?: number
    totalValid?: number
    strategyUsed?: string
    invalidSamples?: Array<{ rawUserId: string; rawDate: string; reason: string }>
    allRecords?: AttendanceLog[]
  }
  counts?: SyncSummaryCounts
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

  private getWsUrl(): string | null {
    if (import.meta.env.VITE_AGENT_WS_URL) {
      return import.meta.env.VITE_AGENT_WS_URL
    }
    if (typeof window !== 'undefined') {
      const host = window.location.hostname || 'localhost'
      // If running over HTTPS or on a remote cloud preview domain without an explicit agent URL,
      // the local LAN agent is not directly reachable over insecure WS.
      if (window.location.protocol === 'https:' || (host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.local'))) {
        return null
      }
      return `ws://${host}:5174`
    }
    return 'ws://localhost:5174'
  }

  private getHttpBaseUrl(): string | null {
    if (import.meta.env.VITE_AGENT_WS_URL) {
      try {
        const u = new URL(import.meta.env.VITE_AGENT_WS_URL)
        return `http://${u.hostname}:${u.port || '5174'}`
      } catch {
        // fallback
      }
    }
    if (typeof window !== 'undefined') {
      const host = window.location.hostname || 'localhost'
      if (window.location.protocol === 'https:' || (host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.local'))) {
        return null
      }
      return `http://${host}:5174`
    }
    return 'http://localhost:5174'
  }

  private hasInitialSynced = false

  public async fetchHttpSync() {
    const httpBase = this.getHttpBaseUrl()
    if (!httpBase) return

    try {
      const statusRes = await fetch(`${httpBase}/api/device/status`, { signal: AbortSignal.timeout(2000) })
      if (statusRes.ok) {
        const data = await statusRes.json()
        if (data.device) {
          this.deviceStatus.value = data.device
          this.notifyStatusListeners()
        }
      }
    } catch {
      // Quiet fallback if agent is not running
    }
  }

  private cleanupSocket() {
    if (this.socket) {
      this.socket.onopen = null
      this.socket.onmessage = null
      this.socket.onerror = null
      this.socket.onclose = null
      try {
        if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
          this.socket.close()
        }
      } catch {
        // ignore
      }
      this.socket = null
    }
  }

  public connect(forceSync: boolean = false) {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (forceSync || !this.hasInitialSynced) {
      this.hasInitialSynced = true
      this.fetchHttpSync()
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return
    }

    this.cleanupSocket()
    const url = this.getWsUrl()
    if (!url) {
      this.isAgentConnected.value = false
      this.deviceStatus.value.status = 'offline'
      this.deviceStatus.value.reason = 'Biometric agent is accessible on local network or via VITE_AGENT_WS_URL'
      this.notifyStatusListeners()
      return
    }

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
            const agentTotal = Number(data.payload?.totalStoreCount || 0)
            if (agentTotal > 0) {
              this.syncStoreIfNeeded(agentTotal)
            }
          }

          // 1.1 Device Logs Broadcast (from device log pull or status)
          if (data.type === 'DEVICE_LOGS' && Array.isArray(data.payload)) {
            if (data.payload.length <= 100) {
              attendanceService.setDeviceLogs(data.payload)
              this.notifyLogsListeners()
            } else {
              this.syncStoreIfNeeded(data.payload.length)
            }
          }

          if (data.type === 'DEVICE_LOGS_STATUS' && data.payload) {
            const count = Number(data.payload.totalCount || 0)
            if (count > 0) {
              this.syncStoreIfNeeded(count)
            }
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
              // Note: triggerManualSync transitions seamlessly into browser batched ingestion
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
            const rawUserId = raw.user_id || raw.userId || ''
            const normalizedBioId = normalizeBioId(rawUserId)

            // Resolve employee asynchronously from directory
            employeeService.getEmployeeByBioId(normalizedBioId).then(async (emp) => {
              const resolvedName = emp?.full_name || (raw.employee_name && !/^user\d+$/i.test(String(raw.employee_name).trim()) ? String(raw.employee_name).trim() : 'Unknown Employee')

              // Resolve employee's assigned work group schedule
              let wg: any = undefined
              if (emp?.work_group_id) {
                try {
                  wg = await workGroupRepository.getById(emp.work_group_id)
                } catch {
                  // ignore
                }
              }
              const stdIn = wg?.standard_in || wg?.standardIn || '08:00'
              const grace = wg?.grace_period_minutes ?? wg?.gracePeriodMinutes ?? 0
              const expOut = wg?.expected_out || wg?.expectedOut || '17:00'
              const wgName = wg?.name || emp?.work_group_name || emp?.work_group_id || 'Group C'
              const wgCode = wg?.code || emp?.work_group_code || 'C'

              const scanLog: AttendanceLog = {
                id: raw.id || `real-${normalizedBioId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                user_id: normalizedBioId,
                employee_id: normalizedBioId,
                employee_name: resolvedName,
                department: emp?.department || raw.department,
                work_group_id: emp?.work_group_id || wg?.id || 'wg-group-c',
                work_group_name: wgName,
                attendance_time: raw.attendance_time || raw.timestamp || new Date().toISOString(),
                type: Number(raw.type ?? raw.verificationMethod ?? 1),
                state: Number(raw.state ?? raw.status ?? 1),
                serial_number: raw.serial_number ?? raw.sn ?? 0,
                device_id: 'dev-1',
                device_name: raw.device_name || raw.deviceName || 'BISMAC BISBIO B-29b',
                device_ip: raw.device_ip || '192.168.1.201',
                location_id: raw.location_id || emp?.location_id || 'loc-cebu',
                location_name: emp?.location || raw.location || 'DBB Cebu',
                is_duplicate: Boolean(raw.is_duplicate),
                created_at: new Date().toISOString()
              }

              this.lastReceivedScan.value = scanLog
              attendanceService.addRealScan(scanLog)
              punchDisplayService.broadcastPunchFromLog(scanLog, {
                workGroup: wgName,
                workGroupCode: wgCode,
                department: emp?.department,
                standardIn: stdIn,
                gracePeriod: grace,
                expectedOut: expOut
              })

              for (const listener of this.scanListeners) {
                try {
                  listener(scanLog)
                } catch (e) {
                  console.error('[LiveAttendance] Scan callback error:', e)
                }
              }
            }).catch(() => {
              // Fallback if employee lookup fails
              const scanLog: AttendanceLog = {
                id: raw.id || `real-${normalizedBioId}-${Date.now()}`,
                user_id: normalizedBioId,
                employee_id: normalizedBioId,
                employee_name: 'Unknown Employee',
                attendance_time: raw.attendance_time || raw.timestamp || new Date().toISOString(),
                type: Number(raw.type ?? 1),
                state: Number(raw.state ?? 1),
                serial_number: raw.serial_number ?? 0,
                device_id: 'dev-1',
                device_name: 'BISMAC BISBIO B-29b',
                device_ip: '192.168.1.201',
                location_id: 'loc-cebu',
                location_name: 'DBB Cebu',
                is_duplicate: false,
                created_at: new Date().toISOString()
              }
              this.lastReceivedScan.value = scanLog
              attendanceService.addRealScan(scanLog)
              punchDisplayService.broadcastPunchFromLog(scanLog)
            })
          }
        } catch {
          // ignore
        }
      }

      this.socket.onclose = () => {
        this.cleanupSocket()
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
      this.cleanupSocket()
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

  private isCheckingStoreSync = false

  /**
   * Automatically checks if the local IndexedDB database has fewer records than the agent store
   * (e.g. after clearing storage or browser reconnect) and safely synchronizes the store in batches.
   * Does NOT connect to the physical biometric hardware device.
   */
  public async syncStoreIfNeeded(agentTotalCount: number): Promise<void> {
    if (this.isCheckingStoreSync || this.isSyncing.value || !agentTotalCount || agentTotalCount <= 0) {
      return
    }
    this.isCheckingStoreSync = true
    try {
      const currentStoredCount = await punchRepository.count()
      if (currentStoredCount < agentTotalCount) {
        console.log(`[DMBBHR] Browser database has ${currentStoredCount} records, agent has ${agentTotalCount}. Syncing local store in batches...`)
        await this.ingestFromAgentStore({
          initialSummary: {
            deviceReturned: agentTotalCount,
            parsedCount: agentTotalCount,
            totalValid: agentTotalCount
          }
        })
      }
    } catch (err: any) {
      console.warn(`[DMBBHR] Background store sync notice: ${err?.message || err}`)
    } finally {
      this.isCheckingStoreSync = false
    }
  }

  /**
   * Reliable paginated/batched ingestion from the agent's local attendance store
   * into the browser's IndexedDB biometricPunches table in batches of 1,000.
   * Safe, idempotent, with retry handling and truthful progress reporting.
   */
  public async ingestFromAgentStore(options?: {
    initialSummary?: any
    batchSize?: number
  }): Promise<{ success: boolean; message: string; counts: SyncSummaryCounts }> {
    const httpBase = this.getHttpBaseUrl()
    const counts: SyncSummaryCounts = {
      deviceRecordsRetrieved: options?.initialSummary?.deviceReturned ?? 0,
      recordsParsed: options?.initialSummary?.parsedCount ?? 0,
      recordsSavedByAgent: options?.initialSummary?.totalValid ?? 0,
      recordsDeliveredToBrowser: 0,
      recordsInsertedOrUpdated: 0,
      duplicatesSkipped: 0,
      failures: options?.initialSummary?.rejectedCount ?? 0
    }

    if (!httpBase) {
      return { success: false, message: 'Agent base URL unavailable', counts }
    }

    const batchSize = Math.max(100, Math.min(1000, options?.batchSize || 1000))
    this.isSyncing.value = true

    try {
      const context = await punchRepository.createBatchImportContext()
      let offset = 0
      let totalRecords = counts.recordsSavedByAgent || 0
      let hasMore = true

      while (hasMore) {
        let logs: any[] = []
        let resData: any = null

        // Safe retry loop per batch (up to 3 retries with backoff)
        let retryAttempt = 0
        let batchSuccess = false
        let lastError: any = null

        while (retryAttempt < 3 && !batchSuccess) {
          try {
            const res = await fetch(`${httpBase}/api/logs?offset=${offset}&limit=${batchSize}`, {
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(30000)
            })

            if (!res.ok) {
              throw new Error(`HTTP ${res.status} retrieving batch at offset ${offset}`)
            }

            resData = await res.json()
            if (resData && Array.isArray(resData.logs)) {
              logs = resData.logs
              if (resData.totalCount !== undefined) {
                totalRecords = resData.totalCount
                counts.recordsSavedByAgent = totalRecords
              }
              batchSuccess = true
            } else {
              throw new Error('Invalid JSON format from /api/logs')
            }
          } catch (err: any) {
            retryAttempt++
            lastError = err
            if (retryAttempt < 3) {
              await new Promise(r => setTimeout(r, 400 * retryAttempt))
            }
          }
        }

        if (!batchSuccess) {
          throw new Error(`Failed to retrieve batch at offset ${offset} after 3 attempts: ${lastError?.message || 'Network error'}`)
        }

        if (logs.length === 0) {
          break
        }

        counts.recordsDeliveredToBrowser += logs.length

        // Import batch safely into IndexedDB
        const importRes = await punchRepository.bulkImportBatch(logs, context)
        counts.recordsInsertedOrUpdated += importRes.importedCount
        counts.duplicatesSkipped += importRes.duplicateCount
        counts.failures += importRes.invalidCount

        // Update progress state
        const targetTotal = totalRecords > 0 ? totalRecords : (offset + logs.length)
        const pct = Math.min(99, Math.round((counts.recordsDeliveredToBrowser / targetTotal) * 100))

        const progressState: SyncProgressState = {
          stage: 'ingesting',
          message: `Transferring attendance records: ${counts.recordsDeliveredToBrowser.toLocaleString()} / ${targetTotal.toLocaleString()} delivered (${counts.recordsInsertedOrUpdated.toLocaleString()} new, ${counts.duplicatesSkipped.toLocaleString()} already present)...`,
          progress: pct,
          counts: { ...counts }
        }
        this.syncProgress.value = progressState
        this.notifySyncListeners(progressState)

        offset += logs.length
        hasMore = resData?.hasMore === true && offset < totalRecords && logs.length === batchSize

        // Yield execution to keep browser UI responsive
        await new Promise(r => setTimeout(r, 0))
      }

      await punchRepository.finishBatchImport(context, {
        filename: 'biometric_agent_store',
        totalRecords: counts.recordsDeliveredToBrowser,
        importedCount: counts.recordsInsertedOrUpdated,
        duplicateCount: counts.duplicatesSkipped,
        invalidCount: counts.failures
      })

      const finalMsg = `Sync complete. ${counts.deviceRecordsRetrieved > 0 ? counts.deviceRecordsRetrieved.toLocaleString() + ' records retrieved from device, ' : ''}${counts.recordsDeliveredToBrowser.toLocaleString()} delivered to browser, ${counts.recordsInsertedOrUpdated.toLocaleString()} inserted into database (${counts.duplicatesSkipped.toLocaleString()} already present).`

      const completeState: SyncProgressState = {
        stage: 'complete',
        message: finalMsg,
        progress: 100,
        counts: { ...counts },
        summary: {
          success: true,
          deviceReturned: counts.deviceRecordsRetrieved,
          parsedCount: counts.recordsParsed,
          totalValid: counts.recordsSavedByAgent,
          newRecords: counts.recordsInsertedOrUpdated,
          alreadySynced: counts.duplicatesSkipped,
          invalidSkipped: counts.failures
        }
      }
      this.syncProgress.value = completeState
      this.notifySyncListeners(completeState)
      this.notifyLogsListeners()

      return { success: true, message: finalMsg, counts }
    } catch (err: any) {
      const errorMsg = `Batch ingestion error: ${err?.message || 'Failed to complete record transfer'}`
      const errorState: SyncProgressState = {
        stage: 'error',
        message: errorMsg,
        progress: 0,
        counts: { ...counts }
      }
      this.syncProgress.value = errorState
      this.notifySyncListeners(errorState)
      return { success: false, message: errorMsg, counts }
    } finally {
      this.isSyncing.value = false
    }
  }

  /**
   * Initiates on-demand attendance synchronization from the BISMAC BISBIO B-29b device.
   * Disables repeated polling; runs only when explicitly triggered by the user.
   * Uses 10-minute timeout so long-running device transfers are never prematurely aborted.
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
      if (!httpBase) {
        const errorMsg = 'Local biometric agent is unreachable from cloud preview. Please configure VITE_AGENT_WS_URL or run on your local network.'
        this.syncProgress.value = {
          stage: 'error',
          message: errorMsg,
          progress: 0
        }
        this.isSyncing.value = false
        return { success: false, message: errorMsg }
      }

      // Allow up to 10 minutes (600,000ms) for high-volume device download without aborting
      const res = await fetch(`${httpBase}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(600000)
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

      // Transition to browser persistence phase
      this.syncProgress.value = {
        stage: 'ingesting',
        message: `Biometric device sync complete (${(data.deviceReturned ?? 0).toLocaleString()} records). Transferring to browser database in batches...`,
        progress: 90
      }

      // Reliably ingest all records from the agent's store into IndexedDB in batches of 1,000
      const ingestRes = await this.ingestFromAgentStore({
        initialSummary: data,
        batchSize: 1000
      })

      return {
        success: ingestRes.success,
        message: ingestRes.message,
        summary: {
          ...data,
          ...ingestRes.counts
        }
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
    this.cleanupSocket()
    this.isAgentConnected.value = false
  }
}

export const liveAttendanceService = new LiveAttendanceService()
