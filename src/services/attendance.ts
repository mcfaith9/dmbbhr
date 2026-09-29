import type { AttendanceLog, AttendanceFilterParams, PaginationMeta } from '@/types'
import { SEED_LOGS, SEED_EMPLOYEES, SEED_DEVICES } from './seedData'
import { apiClient } from './api'

/**
 * Centrally managed in-memory fallback cache (used when Laravel backend is booting or offline in dev).
 * NOTE: We strictly DO NOT persist 24,000+ attendance records to browser LocalStorage.
 * Browser LocalStorage has a strict 5MB limit which triggers QuotaExceededError.
 */
let inMemoryLogsStore: AttendanceLog[] = [...SEED_LOGS]

// One-time data preservation helper:
// If the user previously had a few records in localStorage from earlier turns, preserve them into memory
// and clean up the localStorage key to prevent quota crashes.
function preserveAndCleanupLegacyLocalStorage() {
  try {
    const legacy = localStorage.getItem('dmbbhr_attendance_logs')
    if (legacy) {
      const parsed = JSON.parse(legacy)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Merge into inMemoryLogsStore if not already present
        const existingIds = new Set(inMemoryLogsStore.map(l => l.id))
        for (const item of parsed) {
          if (!existingIds.has(item.id)) {
            inMemoryLogsStore.push(item)
          }
        }
      }
      // Remove legacy localStorage key to permanently prevent QuotaExceededError
      localStorage.removeItem('dmbbhr_attendance_logs')
      console.log('[DMBBHR] Migrated legacy attendance records from localStorage to application store and freed quota.')
    }
  } catch (err) {
    // If quota exceeded or parsing error, remove bad key
    try {
      localStorage.removeItem('dmbbhr_attendance_logs')
    } catch {
      // ignore
    }
  }
}

// Execute migration check once on load
preserveAndCleanupLegacyLocalStorage()

export const attendanceService = {
  /**
   * Fetch attendance logs.
   * Attempts to query the authenticated Laravel API endpoint (POST /api/attendance/logs or GET).
   * Falls back to in-memory store if the local Laravel backend is not running.
   */
  async getLogs(params: AttendanceFilterParams = {}): Promise<{ logs: AttendanceLog[]; meta: PaginationMeta }> {
    try {
      // Attempt backend API call if configured
      const response = await apiClient.get<{ logs: AttendanceLog[]; meta: PaginationMeta }>('/attendance/logs', params)
      if (response && Array.isArray(response.logs)) {
        return response
      }
    } catch {
      // Backend not running / offline dev mode -> Serve from in-memory store
    }

    // In-memory query engine
    let allLogs = [...inMemoryLogsStore]

    // 1. Search filter
    if (params.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase()
      allLogs = allLogs.filter(log =>
        log.user_id.toLowerCase().includes(q) ||
        (log.employee_name && log.employee_name.toLowerCase().includes(q))
      )
    }

    // 2. Specific User ID
    if (params.userId && params.userId.trim()) {
      const uid = params.userId.trim()
      allLogs = allLogs.filter(log => log.user_id === uid)
    }

    // 3. Location
    if (params.locationId && params.locationId !== 'all') {
      allLogs = allLogs.filter(log => log.location_id === params.locationId)
    }

    // 4. Device
    if (params.deviceId && params.deviceId !== 'all') {
      allLogs = allLogs.filter(log => log.device_id === params.deviceId)
    }

    // 5. State
    if (params.state !== undefined && params.state !== '' && params.state !== 'all') {
      const stateNum = Number(params.state)
      allLogs = allLogs.filter(log => log.state === stateNum)
    }

    // 6. Type
    if (params.type !== undefined && params.type !== '' && params.type !== 'all') {
      const typeNum = Number(params.type)
      allLogs = allLogs.filter(log => log.type === typeNum)
    }

    // 7. Dates (evaluated in Asia/Manila)
    const todayStr = '2026-09-29'
    if (params.quickRange === 'today') {
      allLogs = allLogs.filter(log => log.attendance_time.startsWith(todayStr))
    } else if (params.quickRange === 'yesterday') {
      allLogs = allLogs.filter(log => log.attendance_time.startsWith('2026-09-28'))
    } else if (params.quickRange === 'this_week') {
      allLogs = allLogs.filter(log => {
        const d = log.attendance_time.slice(0, 10)
        return d >= '2026-09-24' && d <= '2026-09-29'
      })
    } else if (params.quickRange === 'this_month') {
      allLogs = allLogs.filter(log => {
        const d = log.attendance_time.slice(0, 10)
        return d >= '2026-09-01' && d <= '2026-09-29'
      })
    } else if (params.date) {
      allLogs = allLogs.filter(log => log.attendance_time.startsWith(params.date!))
    } else if (params.startDate || params.endDate) {
      allLogs = allLogs.filter(log => {
        const logDate = log.attendance_time.slice(0, 10)
        if (params.startDate && logDate < params.startDate) return false
        if (params.endDate && logDate > params.endDate) return false
        return true
      })
    }

    // Sort descending by attendance_time
    allLogs.sort((a, b) => new Date(b.attendance_time).getTime() - new Date(a.attendance_time).getTime())

    // Pagination
    const page = params.page || 1
    const pageSize = params.pageSize || 10
    const totalItems = allLogs.length
    const totalPages = Math.ceil(totalItems / pageSize) || 1
    const startIndex = (page - 1) * pageSize
    const paginated = allLogs.slice(startIndex, startIndex + pageSize)

    return {
      logs: paginated,
      meta: {
        currentPage: page,
        pageSize,
        totalItems,
        totalPages
      }
    }
  },

  async getAllFilteredLogsForExport(params: AttendanceFilterParams = {}): Promise<AttendanceLog[]> {
    const res = await this.getLogs({ ...params, page: 1, pageSize: 999999 })
    return res.logs
  },

  /**
   * Adds a new attendance log.
   * Dispatches to Laravel API and synchronizes in-memory state.
   */
  async addLog(logData: Partial<AttendanceLog>): Promise<AttendanceLog> {
    const emp = SEED_EMPLOYEES.find(e => e.biometric_user_id === String(logData.user_id))
    const dev = SEED_DEVICES.find(d => d.id === logData.device_id) || SEED_DEVICES[0]

    const targetTime = new Date(logData.attendance_time || new Date()).getTime()
    const isDuplicate = inMemoryLogsStore.some(l => {
      if (l.user_id !== String(logData.user_id)) return false
      const t = new Date(l.attendance_time).getTime()
      return Math.abs(t - targetTime) < 30000
    })

    const newLog: AttendanceLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      user_id: String(logData.user_id || 'UNKNOWN'),
      employee_id: emp?.id,
      employee_name: emp?.full_name || logData.employee_name || 'Unassigned User',
      attendance_time: logData.attendance_time || new Date().toISOString(),
      type: Number(logData.type ?? 1),
      state: Number(logData.state ?? 1),
      serial_number: logData.serial_number ?? Math.floor(Math.random() * 1000),
      device_id: dev.id,
      device_name: dev.name,
      device_ip: dev.ip_address,
      location_id: dev.location_id,
      location_name: 'DBB Cebu',
      is_duplicate: isDuplicate,
      created_at: new Date().toISOString()
    }

    try {
      await apiClient.post('/attendance/device-event', newLog)
    } catch {
      // Local development fallback
    }

    inMemoryLogsStore.unshift(newLog)
    return newLog
  },

  /**
   * Safely imports attendance records using chunked transmission.
   * Handles large payloads (e.g. 24,000+ rows) in chunks of 500 records.
   * Communicates with Laravel backend (POST /api/attendance/import) and stores in-memory.
   * NEVER touches browser localStorage.
   */
  async importLogsChunked(
    rawRecords: Partial<AttendanceLog>[],
    onProgress?: (processed: number, total: number) => void
  ): Promise<{ importedCount: number; duplicateCount: number; chunkCount: number }> {
    const total = rawRecords.length
    const CHUNK_SIZE = 500
    let importedTotal = 0
    let duplicateTotal = 0
    let chunksProcessed = 0

    // Index existing records by user_id and approximate timestamp for fast duplicate audit flagging
    const existingIndex = new Map<string, number[]>()
    for (const log of inMemoryLogsStore) {
      const times = existingIndex.get(log.user_id) || []
      times.push(new Date(log.attendance_time).getTime())
      existingIndex.set(log.user_id, times)
    }

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = rawRecords.slice(i, i + CHUNK_SIZE)
      const normalizedChunk: AttendanceLog[] = []

      for (const rec of chunk) {
        if (!rec.user_id || !rec.attendance_time) continue

        const emp = SEED_EMPLOYEES.find(e => e.biometric_user_id === String(rec.user_id))
        const dev = SEED_DEVICES.find(d => d.id === rec.device_id) || SEED_DEVICES[0]

        const targetTime = new Date(rec.attendance_time).getTime()
        const userTimes = existingIndex.get(String(rec.user_id)) || []
        const isDup = userTimes.some(t => Math.abs(t - targetTime) < 5000)

        if (isDup) {
          duplicateTotal++
        } else {
          userTimes.push(targetTime)
          existingIndex.set(String(rec.user_id), userTimes)
        }

        const log: AttendanceLog = {
          id: `log-imp-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
          user_id: String(rec.user_id),
          employee_id: emp?.id,
          employee_name: emp?.full_name || rec.employee_name || 'Unassigned User',
          attendance_time: rec.attendance_time,
          type: Number(rec.type ?? 1),
          state: Number(rec.state ?? 1),
          serial_number: rec.serial_number ?? 0,
          device_id: dev.id,
          device_name: dev.name,
          device_ip: dev.ip_address,
          location_id: dev.location_id,
          location_name: 'DBB Cebu',
          is_duplicate: isDup,
          created_at: new Date().toISOString()
        }

        normalizedChunk.push(log)
        importedTotal++
      }

      // 1. Attempt to dispatch chunk to authenticated Laravel endpoint
      try {
        await apiClient.post('/attendance/import', {
          records: normalizedChunk,
          chunk_index: chunksProcessed + 1,
          total_chunks: Math.ceil(total / CHUNK_SIZE)
        })
      } catch {
        // Laravel API offline in dev environment -> in-memory store retains records seamlessly
      }

      // 2. Add to in-memory store
      inMemoryLogsStore.unshift(...normalizedChunk)
      chunksProcessed++

      if (onProgress) {
        onProgress(Math.min(i + CHUNK_SIZE, total), total)
      }

      // Small tick to allow Vue UI reactivity & browser render loop
      if (total > 500) {
        await new Promise(r => setTimeout(r, 10))
      }
    }

    return {
      importedCount: importedTotal,
      duplicateCount: duplicateTotal,
      chunkCount: chunksProcessed
    }
  }
}
