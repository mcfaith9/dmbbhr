import type { AttendanceLog, AttendanceFilterParams, PaginationMeta } from '@/types'
import { SEED_LOGS, SEED_EMPLOYEES, SEED_DEVICES } from './seedData'

const LOGS_STORAGE_KEY = 'dmbbhr_attendance_logs'

function getStoredLogs(): AttendanceLog[] {
  try {
    const raw = localStorage.getItem(LOGS_STORAGE_KEY)
    if (raw) {
      return JSON.parse(raw)
    }
  } catch {
    // fallback
  }
  return [...SEED_LOGS]
}

function saveLogs(logs: AttendanceLog[]) {
  localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs))
}

export const attendanceService = {
  getLogs(params: AttendanceFilterParams = {}): Promise<{ logs: AttendanceLog[]; meta: PaginationMeta }> {
    return new Promise((resolve) => {
      setTimeout(() => {
        let allLogs = getStoredLogs()

        // 1. Search text filter (employee name or user ID)
        if (params.search && params.search.trim()) {
          const q = params.search.trim().toLowerCase()
          allLogs = allLogs.filter(log =>
            log.user_id.toLowerCase().includes(q) ||
            (log.employee_name && log.employee_name.toLowerCase().includes(q))
          )
        }

        // 2. Specific User ID filter
        if (params.userId && params.userId.trim()) {
          const uid = params.userId.trim()
          allLogs = allLogs.filter(log => log.user_id === uid)
        }

        // 3. Location filter
        if (params.locationId && params.locationId !== 'all') {
          allLogs = allLogs.filter(log => log.location_id === params.locationId)
        }

        // 4. Device filter
        if (params.deviceId && params.deviceId !== 'all') {
          allLogs = allLogs.filter(log => log.device_id === params.deviceId)
        }

        // 5. State filter
        if (params.state !== undefined && params.state !== '' && params.state !== 'all') {
          const stateNum = Number(params.state)
          allLogs = allLogs.filter(log => log.state === stateNum)
        }

        // 6. Type filter
        if (params.type !== undefined && params.type !== '' && params.type !== 'all') {
          const typeNum = Number(params.type)
          allLogs = allLogs.filter(log => log.type === typeNum)
        }

        // 7. Date filters
        const todayStr = '2026-09-29' // Mock/dev baseline
        if (params.quickRange === 'today') {
          allLogs = allLogs.filter(log => log.attendance_time.startsWith(todayStr))
        } else if (params.quickRange === 'yesterday') {
          allLogs = allLogs.filter(log => log.attendance_time.startsWith('2026-09-28'))
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

        resolve({
          logs: paginated,
          meta: {
            currentPage: page,
            pageSize,
            totalItems,
            totalPages
          }
        })
      }, 150)
    })
  },

  getAllFilteredLogsForExport(params: AttendanceFilterParams = {}): Promise<AttendanceLog[]> {
    return new Promise((resolve) => {
      this.getLogs({ ...params, page: 1, pageSize: 999999 }).then(res => {
        resolve(res.logs)
      })
    })
  },

  addLog(logData: Partial<AttendanceLog>): Promise<AttendanceLog> {
    return new Promise((resolve) => {
      const logs = getStoredLogs()
      
      // Match employee if exists
      const emp = SEED_EMPLOYEES.find(e => e.biometric_user_id === String(logData.user_id))
      const dev = SEED_DEVICES.find(d => d.id === logData.device_id) || SEED_DEVICES[0]

      // Duplicate check: within 1 minute with same user_id and device
      const targetTime = new Date(logData.attendance_time || new Date()).getTime()
      const isDuplicate = logs.some(l => {
        if (l.user_id !== String(logData.user_id)) return false
        const t = new Date(l.attendance_time).getTime()
        return Math.abs(t - targetTime) < 30000 // 30 seconds threshold
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

      logs.unshift(newLog)
      saveLogs(logs)
      resolve(newLog)
    })
  },

  importLogs(rawRecords: Partial<AttendanceLog>[]): Promise<{ importedCount: number; duplicateCount: number }> {
    return new Promise((resolve) => {
      const currentLogs = getStoredLogs()
      let dupCount = 0
      let addedCount = 0

      for (const rec of rawRecords) {
        if (!rec.user_id || !rec.attendance_time) continue

        const emp = SEED_EMPLOYEES.find(e => e.biometric_user_id === String(rec.user_id))
        const dev = SEED_DEVICES.find(d => d.id === rec.device_id) || SEED_DEVICES[0]

        // Duplicate check
        const targetTime = new Date(rec.attendance_time).getTime()
        const isDup = currentLogs.some(
          l => l.user_id === String(rec.user_id) && Math.abs(new Date(l.attendance_time).getTime() - targetTime) < 5000
        )

        if (isDup) {
          dupCount++
        }

        const log: AttendanceLog = {
          id: `log-import-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
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

        currentLogs.unshift(log)
        addedCount++
      }

      saveLogs(currentLogs)
      resolve({ importedCount: addedCount, duplicateCount: dupCount })
    })
  }
}
