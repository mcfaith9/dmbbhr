import { db, type BiometricPunchRecord } from '@/db'
import type { AttendanceLog, AttendanceFilterParams, PaginationMeta } from '@/types'
import { getManilaDateString } from '@/services/attendanceEngine'
import { employeeRepository } from './employeeRepository'
import { workGroupRepository } from './workGroupRepository'

export interface ImportResult {
  totalInFile: number
  importedCount: number
  duplicateCount: number
  invalidCount: number
  batchCount: number
}

export const punchRepository = {
  /**
   * Generates a stable composite key for punch deduplication.
   * Bio ID + timestamp second + type + state.
   */
  generateDeduplicationKey(bioId: string, timestamp: string | Date | number, type: number = 1, state: number = 1): string {
    const tMs = new Date(timestamp).getTime()
    const tSec = Math.floor(tMs / 1000)
    return `punch_${String(bioId).trim()}_${tSec}_${type}_${state}`
  },

  /**
   * Transforms an in-memory or raw log to a database entity
   */
  toRecord(log: Partial<AttendanceLog>): BiometricPunchRecord | null {
    if (!log.user_id || !log.attendance_time) return null

    const bioId = String(log.user_id).trim()
    const tDate = new Date(log.attendance_time)
    if (isNaN(tDate.getTime())) return null

    const dateKey = getManilaDateString(tDate)
    const type = Number(log.type ?? 1)
    const state = Number(log.state ?? 1)
    const id = log.id || this.generateDeduplicationKey(bioId, tDate, type, state)

    return {
      id,
      bioId,
      date: dateKey,
      timestamp: log.attendance_time,
      timestampMs: tDate.getTime(),
      type,
      state,
      serialNumber: log.serial_number ?? 0,
      deviceId: log.device_id || 'dev-1',
      deviceIp: log.device_ip || '192.168.1.201',
      deviceName: log.device_name || 'BISBIO B-29b',
      locationId: log.location_id || 'loc-cebu',
      locationName: log.location_name || 'DBB CEBU',
      employeeName: log.employee_name || `User ${bioId}`,
      workGroupId: log.work_group_id || 'wg-group-c',
      isDuplicate: Boolean(log.is_duplicate),
      importedAt: log.created_at || new Date().toISOString()
    }
  },

  /**
   * Transforms database record to AttendanceLog
   */
  toLog(rec: BiometricPunchRecord): AttendanceLog {
    return {
      id: rec.id,
      user_id: rec.bioId,
      employee_name: rec.employeeName || `User ${rec.bioId}`,
      work_group_id: rec.workGroupId || 'wg-group-c',
      attendance_time: rec.timestamp,
      type: rec.type,
      state: rec.state,
      serial_number: rec.serialNumber,
      device_id: rec.deviceId,
      device_name: rec.deviceName || 'BISMAC BISBIO B-29b',
      device_ip: rec.deviceIp,
      location_id: rec.locationId,
      location_name: rec.locationName || 'DBB CEBU',
      is_duplicate: rec.isDuplicate,
      created_at: rec.importedAt
    }
  },

  /**
   * Fetches paginated logs from IndexedDB using efficient index queries.
   * Does NOT load all 100k+ records into Vue state.
   */
  async getLogs(params: AttendanceFilterParams = {}): Promise<{ logs: AttendanceLog[]; meta: PaginationMeta }> {
    const page = Math.max(1, params.page || 1)
    const pageSize = Math.max(1, params.pageSize || 10)

    // Build Dexie query
    let collection = db.biometricPunches.toCollection()

    // 1. Date range indexed filtering
    if (params.quickRange === 'today') {
      const today = getManilaDateString(new Date())
      collection = db.biometricPunches.where('date').equals(today)
    } else if (params.quickRange === 'yesterday') {
      const y = new Date()
      y.setDate(y.getDate() - 1)
      const yesterday = getManilaDateString(y)
      collection = db.biometricPunches.where('date').equals(yesterday)
    } else if (params.date) {
      collection = db.biometricPunches.where('date').equals(params.date)
    } else if (params.startDate && params.endDate && params.startDate === params.endDate) {
      collection = db.biometricPunches.where('date').equals(params.startDate)
    } else if (params.startDate || params.endDate) {
      const start = params.startDate || '1970-01-01'
      const end = params.endDate || '2099-12-31'
      collection = db.biometricPunches.where('date').between(start, end, true, true)
    } else if (params.userId && params.userId.trim()) {
      collection = db.biometricPunches.where('bioId').equals(params.userId.trim())
    }

    // Apply secondary filters
    let filteredRecords: BiometricPunchRecord[]
    const [employeeMap, workGroupMap] = await Promise.all([
      employeeRepository.getEmployeeMap(),
      workGroupRepository.getMap()
    ])

    const hasSecondaryFilters = Boolean(
      (params.type !== undefined && params.type !== '' && params.type !== 'all') ||
      (params.state !== undefined && params.state !== '' && params.state !== 'all') ||
      (params.locationId && params.locationId !== 'all') ||
      (params.workGroupId && params.workGroupId !== 'all') ||
      (params.search && params.search.trim()) ||
      (params.userId && params.userId.trim())
    )

    if (hasSecondaryFilters) {
      const records = await collection.toArray()
      const searchQ = (params.search || '').trim().toLowerCase()
      const userQ = (params.userId || '').trim().toLowerCase()
      const locTarget = (params.locationId || '').trim().toLowerCase()
      const wgTarget = (params.workGroupId || '').trim()
      const typeNum = params.type !== undefined && params.type !== '' && params.type !== 'all' ? Number(params.type) : null
      const stateNum = params.state !== undefined && params.state !== '' && params.state !== 'all' ? Number(params.state) : null

      filteredRecords = records.filter(r => {
        if (typeNum !== null && r.type !== typeNum) return false
        if (stateNum !== null && r.state !== stateNum) return false

        const emp = employeeMap.get(r.bioId)
        const empLoc = (emp?.location || r.locationName || '').toLowerCase()
        const empName = emp?.fullName || r.employeeName || ''
        const empWg = emp?.workGroupId || r.workGroupId || 'wg-group-c'

        if (userQ && r.bioId.toLowerCase() !== userQ) return false

        if (locTarget && locTarget !== 'all') {
          const matchLoc =
            empLoc === locTarget ||
            (locTarget === 'loc-dmbb-cebu' && empLoc === 'dmbb cebu') ||
            (locTarget === 'loc-dbb-cebu' && empLoc === 'dbb cebu') ||
            (locTarget === 'loc-dbb-negros' && empLoc === 'dbb negros') ||
            (locTarget === 'loc-dbb-iloilo' && empLoc === 'dbb iloilo')
          if (!matchLoc) return false
        }

        if (wgTarget && wgTarget !== 'all') {
          if (empWg !== wgTarget) return false
        }

        if (searchQ) {
          const matchSearch = r.bioId.toLowerCase().includes(searchQ) || empName.toLowerCase().includes(searchQ)
          if (!matchSearch) return false
        }

        return true
      })
    } else {
      filteredRecords = await collection.toArray()
    }

    // Sort descending by timestamp (newest first)
    filteredRecords.sort((a, b) => b.timestampMs - a.timestampMs)

    const totalItems = filteredRecords.length
    const totalPages = Math.ceil(totalItems / pageSize) || 1
    const offset = (page - 1) * pageSize
    const pageRecords = filteredRecords.slice(offset, offset + pageSize)

    // Convert to AttendanceLog with latest employee & work group metadata
    const logs = pageRecords.map(r => {
      const emp = employeeMap.get(r.bioId)
      const log = this.toLog(r)
      if (emp) {
        log.employee_name = emp.fullName
        log.department = emp.department || ''
        log.location_name = emp.location
        log.work_group_id = emp.workGroupId || 'wg-group-c'
        const wg = workGroupMap.get(log.work_group_id)
        log.work_group_name = wg?.name || 'GROUP C'
      }
      return log
    })

    return {
      logs,
      meta: {
        currentPage: page,
        pageSize,
        totalItems,
        totalPages
      }
    }
  },

  /**
   * Retrieves all raw punches for a single date in O(log N) IndexedDB lookup.
   */
  async getPunchesByDate(dateStr: string): Promise<AttendanceLog[]> {
    const records = await db.biometricPunches.where('date').equals(dateStr).toArray()
    const employeeMap = await employeeRepository.getEmployeeMap()

    return records.map(r => {
      const emp = employeeMap.get(r.bioId)
      const log = this.toLog(r)
      if (emp) {
        log.employee_name = emp.fullName
        log.department = emp.department || ''
        log.location_name = emp.location
        log.work_group_id = emp.workGroupId || 'wg-group-c'
      }
      return log
    })
  },

  /**
   * Bulk imports raw records with streaming transactions, deduplication, and progress reporting.
   */
  async bulkImport(
    rawRecords: any[],
    filename: string = 'import.xlsx',
    onProgress?: (processed: number, total: number) => void
  ): Promise<ImportResult> {
    const total = rawRecords.length
    if (total === 0) {
      return { totalInFile: 0, importedCount: 0, duplicateCount: 0, invalidCount: 0, batchCount: 0 }
    }

    const BATCH_SIZE = 2500
    let importedCount = 0
    let duplicateCount = 0
    let invalidCount = 0
    let batchCount = 0

    const existingIds = new Set(await db.biometricPunches.toCollection().primaryKeys())
    const employeeBatchMap = new Map<string, { bioId: string; name: string; location: any; workGroupId?: string }>()

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const chunk = rawRecords.slice(i, i + BATCH_SIZE)
      const recordsToInsert: BiometricPunchRecord[] = []

      for (const raw of chunk) {
        const userId = String(raw['User ID'] || raw['userId'] || raw['User_ID'] || raw['ID'] || raw.user_id || '').trim()
        const rawTime = raw['Date/Time'] || raw['DateTime'] || raw['Date'] || raw['attTime'] || raw['Time'] || raw.attendance_time
        const rawName = String(raw['Name'] || raw['Employee'] || raw['Employee Name'] || raw.employee_name || '').trim()
        const rawWg = raw['Work Group'] || raw['WorkGroup'] || raw['Group'] || raw.work_group_id || 'wg-group-c'

        if (!userId || !rawTime) {
          invalidCount++
          continue
        }

        const tDate = new Date(rawTime)
        if (isNaN(tDate.getTime())) {
          invalidCount++
          continue
        }

        const type = Number(raw['Type'] ?? raw.type ?? 1)
        const state = Number(raw['State'] ?? raw.state ?? 1)
        const id = this.generateDeduplicationKey(userId, tDate, type, state)

        if (existingIds.has(id)) {
          duplicateCount++
          continue
        }

        existingIds.add(id)
        const dateKey = getManilaDateString(tDate)

        recordsToInsert.push({
          id,
          bioId: userId,
          date: dateKey,
          timestamp: tDate.toISOString(),
          timestampMs: tDate.getTime(),
          type,
          state,
          serialNumber: raw['Serial'] || raw['Serial Number'] || raw.serial_number || 0,
          deviceId: raw.device_id || 'dev-1',
          deviceIp: raw['IP'] || raw.device_ip || '192.168.1.201',
          deviceName: raw.device_name || 'BISBIO B-29b',
          locationId: 'loc-cebu',
          locationName: 'DBB CEBU',
          employeeName: rawName || `User ${userId}`,
          workGroupId: rawWg,
          isDuplicate: false,
          importedAt: new Date().toISOString()
        })

        if (rawName && !employeeBatchMap.has(userId)) {
          employeeBatchMap.set(userId, { bioId: userId, name: rawName, location: 'DBB CEBU', workGroupId: rawWg })
        }
      }

      if (recordsToInsert.length > 0) {
        await db.biometricPunches.bulkPut(recordsToInsert)
        importedCount += recordsToInsert.length
      }

      batchCount++

      if (onProgress) {
        onProgress(Math.min(i + BATCH_SIZE, total), total)
      }

      await new Promise(r => setTimeout(r, 0))
    }

    if (employeeBatchMap.size > 0) {
      await employeeRepository.bulkRegisterEmployees(Array.from(employeeBatchMap.values()))
    }

    await db.importJobs.put({
      id: `job-${Date.now()}`,
      filename,
      totalRecords: total,
      importedCount,
      duplicateCount,
      invalidCount,
      importedAt: new Date().toISOString(),
      status: 'completed'
    })

    return {
      totalInFile: total,
      importedCount,
      duplicateCount,
      invalidCount,
      batchCount
    }
  },

  async addPunch(log: AttendanceLog): Promise<boolean> {
    const record = this.toRecord(log)
    if (!record) return false

    const existing = await db.biometricPunches.get(record.id)
    if (existing) {
      return false
    }

    await db.biometricPunches.put(record)
    await employeeRepository.registerFromPunch(record.bioId, record.employeeName)
    return true
  },

  async count(): Promise<number> {
    return db.biometricPunches.count()
  },

  async clearAll(): Promise<void> {
    await db.biometricPunches.clear()
    await db.dailyAttendance.clear()
    await db.dailySummaries.clear()
  }
}
