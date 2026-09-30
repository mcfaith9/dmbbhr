import type { AttendanceLog, AttendanceFilterParams, PaginationMeta } from '@/types'

/**
 * Centrally managed in-memory store for live attendance events and historical logs.
 * Zero dummy records. Initialized strictly empty.
 */
let inMemoryLogsStore: AttendanceLog[] = []

// Clean up any legacy localStorage dummy keys from previous runs
try {
  localStorage.removeItem('dmbbhr_attendance_logs')
} catch {
  // ignore
}

/**
 * Helper to get local date string YYYY-MM-DD in Asia/Manila (Philippine Standard Time)
 */
export function getManilaDateString(dateInput: string | Date | number = new Date()): string {
  try {
    const d = new Date(dateInput)
    if (isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d)
  } catch {
    return ''
  }
}

/**
 * Helper to format time in Asia/Manila (Philippine Standard Time)
 */
export function formatManilaTime(dateInput: string | Date | number): string {
  try {
    const d = new Date(dateInput)
    if (isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(d)
  } catch {
    return ''
  }
}

export interface DailyAttendanceRecord {
  id: string
  biometric_user_id: string
  employee_name: string
  date: string
  raw_date: string
  time_in: string
  break_out: string
  break_in: string
  time_out: string
  total_hours: string
  status: string
  late_minutes: number
  undertime_minutes: number
  total_punches: number
  punches: AttendanceLog[]
}

export const attendanceService = {
  /**
   * Fetch attendance logs with server-side/service-side pagination and filtering.
   * Capable of handling 24K+ records in memory without freezing the DOM.
   */
  async getLogs(params: AttendanceFilterParams = {}): Promise<{ logs: AttendanceLog[]; meta: PaginationMeta }> {
    let allLogs = [...inMemoryLogsStore]

    // 1. Search filter (by user ID or employee name)
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

    // 7. Date filtering with exact Philippine local date matching
    const todayStr = getManilaDateString(new Date())

    if (params.quickRange === 'today') {
      allLogs = allLogs.filter(log => getManilaDateString(log.attendance_time) === todayStr)
    } else if (params.quickRange === 'yesterday') {
      const y = new Date()
      y.setDate(y.getDate() - 1)
      const yesterdayStr = getManilaDateString(y)
      allLogs = allLogs.filter(log => getManilaDateString(log.attendance_time) === yesterdayStr)
    } else if (params.date) {
      allLogs = allLogs.filter(log => getManilaDateString(log.attendance_time) === params.date)
    } else if (params.startDate || params.endDate) {
      allLogs = allLogs.filter(log => {
        const logDate = getManilaDateString(log.attendance_time)
        if (params.startDate && logDate < params.startDate) return false
        if (params.endDate && logDate > params.endDate) return false
        return true
      })
    }

    // Sort descending by attendance_time (newest first)
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
   * Calculates Daily Attendance records from actual biometric attendance logs for a given date.
   * Defaulting to Today in Asia/Manila.
   * Eliminates all dummy data and dynamically constructs attendance summary per employee.
   */
  async getDailyAttendance(targetDate?: string): Promise<DailyAttendanceRecord[]> {
    const selectedDate = targetDate || getManilaDateString(new Date())
    
    // 1. Filter all real logs for the target date
    const dayLogs = inMemoryLogsStore.filter(log => getManilaDateString(log.attendance_time) === selectedDate)

    if (dayLogs.length === 0) {
      return []
    }

    // 2. Group by user_id
    const userGroups = new Map<string, AttendanceLog[]>()
    for (const log of dayLogs) {
      const uid = log.user_id
      if (!userGroups.has(uid)) {
        userGroups.set(uid, [])
      }
      userGroups.get(uid)!.push(log)
    }

    // 3. Process each employee's punches chronologically
    const dailyRecords: DailyAttendanceRecord[] = []

    for (const [userId, logs] of userGroups.entries()) {
      // Sort chronologically (earliest to latest)
      logs.sort((a, b) => new Date(a.attendance_time).getTime() - new Date(b.attendance_time).getTime())

      const employeeName = logs[0].employee_name || `User ${userId}`
      const firstPunch = logs[0]
      const lastPunch = logs[logs.length - 1]

      const timeInStr = formatManilaTime(firstPunch.attendance_time)
      let timeOutStr = '-'
      let breakOutStr = '-'
      let breakInStr = '-'
      let totalHoursStr = '-'
      let lateMinutes = 0
      let undertimeMinutes = 0
      let status = 'Regular Day'

      // Check for Late (assuming regular shift start at 08:15 AM grace period)
      const inDate = new Date(firstPunch.attendance_time)
      const shiftStart = new Date(firstPunch.attendance_time)
      shiftStart.setHours(8, 15, 0, 0)
      if (inDate > shiftStart) {
        lateMinutes = Math.round((inDate.getTime() - shiftStart.getTime()) / 60000)
        status = `Late (${lateMinutes} mins)`
      }

      if (logs.length >= 4) {
        breakOutStr = formatManilaTime(logs[1].attendance_time)
        breakInStr = formatManilaTime(logs[2].attendance_time)
        timeOutStr = formatManilaTime(lastPunch.attendance_time)

        const msWorked = new Date(lastPunch.attendance_time).getTime() - inDate.getTime()
        const breakMs = new Date(logs[2].attendance_time).getTime() - new Date(logs[1].attendance_time).getTime()
        const netHours = Math.max(0, (msWorked - breakMs) / 3600000)
        totalHoursStr = `${netHours.toFixed(1)} hrs`
      } else if (logs.length >= 2) {
        timeOutStr = formatManilaTime(lastPunch.attendance_time)
        const msWorked = new Date(lastPunch.attendance_time).getTime() - inDate.getTime()
        const grossHours = Math.max(0, msWorked / 3600000)
        totalHoursStr = `${grossHours.toFixed(1)} hrs`
      } else {
        status = lateMinutes > 0 ? `Late (${lateMinutes} mins) - Single Punch` : 'Single Punch (No OUT)'
      }

      const formattedDisplayDate = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }).format(inDate)

      dailyRecords.push({
        id: `daily-${userId}-${selectedDate}`,
        biometric_user_id: userId,
        employee_name: employeeName,
        date: formattedDisplayDate,
        raw_date: selectedDate,
        time_in: timeInStr,
        break_out: breakOutStr,
        break_in: breakInStr,
        time_out: timeOutStr,
        total_hours: totalHoursStr,
        status,
        late_minutes: lateMinutes,
        undertime_minutes: undertimeMinutes,
        total_punches: logs.length,
        punches: logs
      })
    }

    // Sort alphabetically by employee name or user ID
    dailyRecords.sort((a, b) => a.employee_name.localeCompare(b.employee_name))

    return dailyRecords
  },

  /**
   * Replaces or merges real logs retrieved directly from the biometric device.
   * Safely deduplicates by (device_ip + user_id + timestamp + type + state).
   * Does NOT reject records based on serial number. Retains all 24K+ valid records.
   */
  setDeviceLogs(deviceLogs: AttendanceLog[]) {
    if (!Array.isArray(deviceLogs)) return

    const recordMap = new Map<string, AttendanceLog>()

    // Retain existing records in map
    for (const log of inMemoryLogsStore) {
      const tSec = Math.floor(new Date(log.attendance_time).getTime() / 1000)
      const ip = log.device_ip || '192.168.1.201'
      const key = `${ip}:${log.user_id}:${tSec}:${log.type ?? 1}:${log.state ?? 1}`
      recordMap.set(key, log)
    }

    // Merge new device logs
    for (const log of deviceLogs) {
      const tSec = Math.floor(new Date(log.attendance_time).getTime() / 1000)
      const ip = log.device_ip || '192.168.1.201'
      const key = `${ip}:${log.user_id}:${tSec}:${log.type ?? 1}:${log.state ?? 1}`
      recordMap.set(key, log)
    }

    inMemoryLogsStore = Array.from(recordMap.values())
    // Sort descending by attendance_time (newest first)
    inMemoryLogsStore.sort((a, b) => new Date(b.attendance_time).getTime() - new Date(a.attendance_time).getTime())
  },

  /**
   * Adds a newly arrived live biometric scan into the store.
   * Strictly prevents duplicate records if the same event was retrieved previously.
   */
  addRealScan(newLog: AttendanceLog) {
    const tSec = Math.floor(new Date(newLog.attendance_time).getTime() / 1000)
    const ip = newLog.device_ip || '192.168.1.201'

    const isDuplicate = inMemoryLogsStore.some(l => {
      if (l.id === newLog.id) return true
      const lTSec = Math.floor(new Date(l.attendance_time).getTime() / 1000)
      const lIp = l.device_ip || '192.168.1.201'
      // Match within 2-second window for clock skew
      return lIp === ip && l.user_id === newLog.user_id && Math.abs(lTSec - tSec) <= 2
    })

    if (!isDuplicate) {
      inMemoryLogsStore.unshift(newLog)
    }
  },

  getRawStore(): AttendanceLog[] {
    return inMemoryLogsStore
  },

  getStoredCount(): number {
    return inMemoryLogsStore.length
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

        const log: AttendanceLog = {
          id: `log-imp-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
          user_id: String(rec.user_id),
          employee_id: rec.employee_id,
          employee_name: rec.employee_name || `User ${rec.user_id}`,
          attendance_time: rec.attendance_time,
          type: Number(rec.type ?? 1),
          state: Number(rec.state ?? 1),
          serial_number: rec.serial_number ?? 0,
          device_id: 'dev-1',
          device_name: 'BISMAC BISBIO B-29b',
          device_ip: rec.device_ip || '192.168.1.201',
          location_id: 'loc-cebu',
          location_name: 'DBB Cebu',
          is_duplicate: Boolean(rec.is_duplicate),
          created_at: new Date().toISOString()
        }

        normalizedChunk.push(log)
        importedTotal++
      }

      this.setDeviceLogs(normalizedChunk)
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
