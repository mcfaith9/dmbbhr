import type { AttendanceLog, AttendanceFilterParams, PaginationMeta } from '@/types'
import { SEED_LOGS, SEED_EMPLOYEES, SEED_DEVICES } from './seedData'

/**
 * Centrally managed in-memory store for live attendance events and historical logs.
 * Zero dummy records.
 */
let inMemoryLogsStore: AttendanceLog[] = [...SEED_LOGS]

// Clean up any legacy localStorage dummy keys from previous runs
try {
  localStorage.removeItem('dmbbhr_attendance_logs')
} catch {
  // ignore
}

export const attendanceService = {
  /**
   * Fetch attendance logs.
   */
  async getLogs(params: AttendanceFilterParams = {}): Promise<{ logs: AttendanceLog[]; meta: PaginationMeta }> {
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

    // Helper to get local date string YYYY-MM-DD in Asia/Manila (Philippine Standard Time)
    const getManilaDateString = (d: Date = new Date()) => {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(d)
    }

    const todayStr = getManilaDateString(new Date())

    if (params.quickRange === 'today') {
      allLogs = allLogs.filter(log => {
        const logDate = getManilaDateString(new Date(log.attendance_time))
        return logDate === todayStr
      })
    } else if (params.quickRange === 'yesterday') {
      const y = new Date()
      y.setDate(y.getDate() - 1)
      const yesterdayStr = getManilaDateString(y)
      allLogs = allLogs.filter(log => {
        const logDate = getManilaDateString(new Date(log.attendance_time))
        return logDate === yesterdayStr
      })
    } else if (params.date) {
      allLogs = allLogs.filter(log => {
        const logDate = getManilaDateString(new Date(log.attendance_time))
        return logDate === params.date
      })
    } else if (params.startDate || params.endDate) {
      allLogs = allLogs.filter(log => {
        const logDate = getManilaDateString(new Date(log.attendance_time))
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

  /**
   * Adds a newly arrived live biometric scan into the store.
   */
  addRealScan(newLog: AttendanceLog) {
    // Avoid exact duplicate IDs
    if (!inMemoryLogsStore.some(l => l.id === newLog.id)) {
      inMemoryLogsStore.unshift(newLog)
    }
  },

  getRawStore(): AttendanceLog[] {
    return inMemoryLogsStore
  },

  async getAllFilteredLogsForExport(params: AttendanceFilterParams = {}): Promise<AttendanceLog[]> {
    const res = await this.getLogs({ ...params, page: 1, pageSize: 999999 })
    return res.logs
  },

  async importLogsChunked(
    rawRecords: Partial<AttendanceLog>[],
    onProgress?: (processed: number, total: number) => void
  ): Promise<{ importedCount: number; duplicateCount: number; chunkCount: number }> {
    const total = rawRecords.length
    const CHUNK_SIZE = 500
    let importedTotal = 0
    let duplicateTotal = 0
    let chunksProcessed = 0

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = rawRecords.slice(i, i + CHUNK_SIZE)
      const normalizedChunk: AttendanceLog[] = []

      for (const rec of chunk) {
        if (!rec.user_id || !rec.attendance_time) continue

        const emp = SEED_EMPLOYEES.find(e => e.biometric_user_id === String(rec.user_id))
        const dev = SEED_DEVICES.find(d => d.id === rec.device_id) || SEED_DEVICES[0]

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
          is_duplicate: Boolean(rec.is_duplicate),
          created_at: new Date().toISOString()
        }

        normalizedChunk.push(log)
        importedTotal++
      }

      inMemoryLogsStore.unshift(...normalizedChunk)
      chunksProcessed++

      if (onProgress) {
        onProgress(Math.min(i + CHUNK_SIZE, total), total)
      }

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
