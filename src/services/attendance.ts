/**
 * Attendance Data Layer & Store
 * Optimized for 90,000+ to 100,000+ Raw Biometric Punches
 *
 * Implements:
 * - Clear separation between raw biometric punches and processed daily attendance
 * - Date-partitioned index Map<string, AttendanceLog[]> for O(1) single-day lookups
 * - User-partitioned index Map<string, AttendanceLog[]> for O(1) employee lookups
 * - Integration with Master Employee Directory (Bio ID permanent resolution)
 * - Integration with Attendance Interpretation Engine (duplicate collapsing & session detection)
 * - Server/data-layer pagination architecture
 */

import type { AttendanceLog, AttendanceFilterParams, PaginationMeta } from '@/types'
import {
  getManilaDateString,
  formatManilaTime,
  processEmployeeDayPunches,
  type DailyAttendanceRecord,
  type AttendanceEngineConfig
} from './attendanceEngine'
import { employeeService } from './employees'

export { getManilaDateString, formatManilaTime, type DailyAttendanceRecord, type AttendanceEngineConfig }

// Primary in-memory store for raw biometric punches
let rawPunchesStore: AttendanceLog[] = []

// High-speed indices for 90k+ records
const dateIndex = new Map<string, AttendanceLog[]>()
const userIndex = new Map<string, AttendanceLog[]>()

/**
 * Re-indexes records into date and user partition maps
 */
function indexRecord(log: AttendanceLog) {
  const dateKey = getManilaDateString(log.attendance_time)
  if (dateKey) {
    if (!dateIndex.has(dateKey)) {
      dateIndex.set(dateKey, [])
    }
    dateIndex.get(dateKey)!.push(log)
  }

  const uid = log.user_id
  if (uid) {
    if (!userIndex.has(uid)) {
      userIndex.set(uid, [])
    }
    userIndex.get(uid)!.push(log)
  }
}

function rebuildIndices(allLogs: AttendanceLog[]) {
  dateIndex.clear()
  userIndex.clear()
  for (let i = 0; i < allLogs.length; i++) {
    indexRecord(allLogs[i])
  }
}

export const attendanceService = {
  /**
   * Fetches paginated raw attendance logs.
   * Leverages partition index when filtering by date to avoid iterating all 90k+ items.
   */
  async getLogs(params: AttendanceFilterParams = {}): Promise<{ logs: AttendanceLog[]; meta: PaginationMeta }> {
    const todayStr = getManilaDateString(new Date())
    let candidateLogs: AttendanceLog[]

    // 1. O(1) Fast Date Partitioning
    if (params.quickRange === 'today') {
      candidateLogs = dateIndex.get(todayStr) ? [...dateIndex.get(todayStr)!] : []
    } else if (params.quickRange === 'yesterday') {
      const y = new Date()
      y.setDate(y.getDate() - 1)
      const yesterdayStr = getManilaDateString(y)
      candidateLogs = dateIndex.get(yesterdayStr) ? [...dateIndex.get(yesterdayStr)!] : []
    } else if (params.date) {
      candidateLogs = dateIndex.get(params.date) ? [...dateIndex.get(params.date)!] : []
    } else if (params.startDate && params.endDate && params.startDate === params.endDate) {
      candidateLogs = dateIndex.get(params.startDate) ? [...dateIndex.get(params.startDate)!] : []
    } else if (params.userId && userIndex.has(params.userId.trim())) {
      candidateLogs = [...userIndex.get(params.userId.trim())!]
    } else {
      candidateLogs = rawPunchesStore
    }

    const employeeMap = employeeService.getEmployeeMap()

    // 2. Filter candidate subset
    let filtered = candidateLogs

    // Search query (Bio ID or Employee Name)
    if (params.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase()
      filtered = filtered.filter(log => {
        const emp = employeeMap.get(log.user_id)
        const name = emp?.full_name || log.employee_name || ''
        return log.user_id.toLowerCase().includes(q) || name.toLowerCase().includes(q)
      })
    }

    // Specific User ID
    if (params.userId && params.userId.trim() && candidateLogs === rawPunchesStore) {
      const uid = params.userId.trim()
      filtered = filtered.filter(log => log.user_id === uid)
    }

    // Location filter
    if (params.locationId && params.locationId !== 'all') {
      const target = params.locationId.toLowerCase().trim()
      filtered = filtered.filter(log => {
        const emp = employeeMap.get(log.user_id)
        const loc = (emp?.location || log.location_name || '').toLowerCase()
        const locId = (log.location_id || '').toLowerCase()
        return (
          loc === target ||
          locId === target ||
          (target === 'loc-dmbb-cebu' && loc === 'dmbb cebu') ||
          (target === 'loc-dbb-cebu' && loc === 'dbb cebu') ||
          (target === 'loc-dbb-negros' && loc === 'dbb negros') ||
          (target === 'loc-dbb-iloilo' && loc === 'dbb iloilo')
        )
      })
    }

    // Type and State filter
    if (params.type !== undefined && params.type !== '' && params.type !== 'all') {
      const typeNum = Number(params.type)
      filtered = filtered.filter(log => log.type === typeNum)
    }
    if (params.state !== undefined && params.state !== '' && params.state !== 'all') {
      const stateNum = Number(params.state)
      filtered = filtered.filter(log => log.state === stateNum)
    }

    // Multi-day date range filter (if not already filtered by fast index)
    if ((params.startDate || params.endDate) && params.startDate !== params.endDate && candidateLogs === rawPunchesStore) {
      filtered = filtered.filter(log => {
        const logDate = getManilaDateString(log.attendance_time)
        if (params.startDate && logDate < params.startDate) return false
        if (params.endDate && logDate > params.endDate) return false
        return true
      })
    }

    // Resolve latest employee name & location from master directory
    const resolved = filtered.map(log => {
      const emp = employeeMap.get(log.user_id)
      if (emp) {
        return {
          ...log,
          employee_name: emp.full_name,
          location_name: emp.location
        }
      }
      return log
    })

    // Sort descending by attendance_time (newest first)
    resolved.sort((a, b) => new Date(b.attendance_time).getTime() - new Date(a.attendance_time).getTime())

    // 3. Paginate
    const page = params.page || 1
    const pageSize = params.pageSize || 10
    const totalItems = resolved.length
    const totalPages = Math.ceil(totalItems / pageSize) || 1
    const startIndex = (page - 1) * pageSize
    const paginated = resolved.slice(startIndex, startIndex + pageSize)

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
   * Generates Daily Attendance for a given date.
   * Accesses ONLY that date's partition index in O(1) time (< 0.5ms).
   * Applies the Attendance Engine to collapse near-duplicate punches and detect real OUT sessions.
   */
  async getDailyAttendance(
    targetDate?: string,
    locationFilter: string = 'all',
    customConfig: Partial<AttendanceEngineConfig> = {}
  ): Promise<DailyAttendanceRecord[]> {
    const selectedDate = targetDate || getManilaDateString(new Date())

    // O(1) lookup of punches for the single day (out of 90k+ historical records)
    const dayPunches = dateIndex.get(selectedDate) || []
    if (dayPunches.length === 0) {
      return []
    }

    // Group punches by Bio ID
    const userGroups = new Map<string, AttendanceLog[]>()
    for (let i = 0; i < dayPunches.length; i++) {
      const p = dayPunches[i]
      const uid = p.user_id
      if (!userGroups.has(uid)) {
        userGroups.set(uid, [])
      }
      userGroups.get(uid)!.push(p)
    }

    const employeeMap = employeeService.getEmployeeMap()
    const records: DailyAttendanceRecord[] = []

    for (const [bioId, punches] of userGroups.entries()) {
      const emp = employeeMap.get(bioId)
      const empLocation = emp?.location || punches[0].location_name || 'DBB CEBU'

      // Apply location filter if requested
      if (locationFilter && locationFilter !== 'all') {
        const target = locationFilter.toLowerCase().trim()
        const current = empLocation.toLowerCase().trim()
        const matches = current === target ||
          (target === 'loc-dmbb-cebu' && current === 'dmbb cebu') ||
          (target === 'loc-dbb-cebu' && current === 'dbb cebu') ||
          (target === 'loc-dbb-negros' && current === 'dbb negros') ||
          (target === 'loc-dbb-iloilo' && current === 'dbb iloilo')
        if (!matches) {
          continue
        }
      }

      const empInfo = {
        name: emp?.full_name || punches[0].employee_name || `User ${bioId}`,
        location: empLocation
      }

      const dailyRecord = processEmployeeDayPunches(bioId, punches, selectedDate, empInfo, customConfig)
      if (dailyRecord) {
        records.push(dailyRecord)
      }
    }

    // Sort alphabetically by employee name
    records.sort((a, b) => a.employee_name.localeCompare(b.employee_name))

    return records
  },

  /**
   * Replaces or merges real logs from biometric sync.
   * Updates partition indices so lookups remain O(1) with 90k+ records.
   */
  setDeviceLogs(deviceLogs: AttendanceLog[]) {
    if (!Array.isArray(deviceLogs)) return

    const recordMap = new Map<string, AttendanceLog>()

    // Retain existing raw punches
    for (let i = 0; i < rawPunchesStore.length; i++) {
      const log = rawPunchesStore[i]
      const tSec = Math.floor(new Date(log.attendance_time).getTime() / 1000)
      const ip = log.device_ip || '192.168.1.201'
      const key = `${ip}:${log.user_id}:${tSec}:${log.type ?? 1}:${log.state ?? 1}`
      recordMap.set(key, log)
    }

    // Merge new device logs
    for (let i = 0; i < deviceLogs.length; i++) {
      const log = deviceLogs[i]
      const tSec = Math.floor(new Date(log.attendance_time).getTime() / 1000)
      const ip = log.device_ip || '192.168.1.201'
      const key = `${ip}:${log.user_id}:${tSec}:${log.type ?? 1}:${log.state ?? 1}`
      recordMap.set(key, log)

      // Also ensure employee is registered in master directory
      employeeService.registerFromBiometric(log.user_id, log.employee_name)
    }

    rawPunchesStore = Array.from(recordMap.values())
    rawPunchesStore.sort((a, b) => new Date(b.attendance_time).getTime() - new Date(a.attendance_time).getTime())

    // Rebuild high-speed date & user partition indices
    rebuildIndices(rawPunchesStore)
  },

  /**
   * Adds a newly arrived live biometric scan
   */
  addRealScan(newLog: AttendanceLog) {
    const tSec = Math.floor(new Date(newLog.attendance_time).getTime() / 1000)
    const ip = newLog.device_ip || '192.168.1.201'

    const isDuplicate = rawPunchesStore.some(l => {
      if (l.id === newLog.id) return true
      const lTSec = Math.floor(new Date(l.attendance_time).getTime() / 1000)
      const lIp = l.device_ip || '192.168.1.201'
      return lIp === ip && l.user_id === newLog.user_id && Math.abs(lTSec - tSec) <= 2
    })

    if (!isDuplicate) {
      rawPunchesStore.unshift(newLog)
      indexRecord(newLog)
      employeeService.registerFromBiometric(newLog.user_id, newLog.employee_name)
    }
  },

  getRawStore(): AttendanceLog[] {
    return rawPunchesStore
  },

  getStoredCount(): number {
    return rawPunchesStore.length
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
          location_name: 'DBB CEBU',
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
