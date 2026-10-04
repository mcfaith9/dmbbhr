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

/**
 * Normalizes device ID to a clean consistent string
 */
export function normalizeDeviceId(deviceId?: string): string {
  if (!deviceId) return 'dev-1'
  const str = String(deviceId).trim().toLowerCase()
  return str.replace(/[^a-z0-9_-]/g, '') || 'dev-1'
}

/**
 * Generates an event punch signature based on physical punch attributes:
 * deviceId + bioId + timestamp second + type + state.
 *
 * This represents the punch event attributes before occurrence ordering.
 */
export function getPunchSignature(
  bioId: string | number,
  timestampMs: number,
  type: number = 1,
  state: number = 1,
  deviceId?: string
): string {
  const cleanBioId = String(bioId).trim()
  const tSec = Math.floor(timestampMs / 1000)
  const cleanDev = normalizeDeviceId(deviceId)
  return `${cleanDev}_${cleanBioId}_${tSec}_${type}_${state}`
}

/**
 * Generates canonical ID for an occurrence of a punch signature (Priority 3).
 * Example: punch_dev-1_500394_1791014482_1_1_occ1
 */
export function getOccurrencePunchId(signature: string, occIndex: number): string {
  return `punch_${signature}_occ${occIndex}`
}

export interface ResolvedIdentity {
  id: string
  signature: string
  occurrenceIndex: number
  priority: 1 | 2 | 3
}

/**
 * Evaluates record identity using the 3-tier hierarchy:
 * Priority 1: Device-provided unique transaction/log ID (if present and valid)
 * Priority 2: Stable existing record ID (if already canonical with occurrence/tx)
 * Priority 3: Occurrence-aware deterministic composite ID (fallback for identical legitimate punches)
 */
export function resolvePunchIdentity(
  raw: any,
  bioId: string,
  timestampMs: number,
  type: number,
  state: number,
  deviceId: string,
  incomingOccIndex: number,
  batchUniqueTxIds?: Set<string>
): ResolvedIdentity {
  const signature = getPunchSignature(bioId, timestampMs, type, state, deviceId)
  const cleanDev = normalizeDeviceId(deviceId)

  // Priority 1: Check for device-provided unique transaction / log identifier
  const candidateTx = raw.transactionId ?? raw.transaction_id ?? raw.logId ?? raw.log_id ?? raw.recordId ?? raw.record_id
  if (candidateTx !== undefined && candidateTx !== null) {
    const txStr = String(candidateTx).trim()
    if (txStr && txStr !== '0' && txStr !== 'undefined' && txStr !== 'null') {
      return {
        id: `dev_${cleanDev}_tx_${txStr}`,
        signature,
        occurrenceIndex: incomingOccIndex,
        priority: 1
      }
    }
  }

  // Also check if raw.sn / serial is unique across the batch and non-zero
  const candidateSn = raw.serialNumber ?? raw.serial_number ?? raw.Serial ?? raw.sn
  if (candidateSn !== undefined && candidateSn !== null) {
    const snNum = Number(candidateSn)
    const snStr = String(candidateSn).trim()
    if (snNum > 0 && batchUniqueTxIds && batchUniqueTxIds.has(snStr)) {
      return {
        id: `dev_${cleanDev}_tx_${snStr}`,
        signature,
        occurrenceIndex: incomingOccIndex,
        priority: 1
      }
    }
  }

  // Priority 2: Check if record already has a stable deterministic ID
  const existingId = raw.id
  if (typeof existingId === 'string' && existingId.trim()) {
    const idTrim = existingId.trim()
    if (idTrim.startsWith('punch_') || idTrim.startsWith('dev_')) {
      if (idTrim.includes('_occ') || idTrim.includes('_tx_')) {
        return {
          id: idTrim,
          signature,
          occurrenceIndex: incomingOccIndex,
          priority: 2
        }
      }
    }
  }

  // Priority 3: Occurrence-aware deterministic composite ID (Default Fallback)
  return {
    id: getOccurrencePunchId(signature, incomingOccIndex),
    signature,
    occurrenceIndex: incomingOccIndex,
    priority: 3
  }
}

export const punchRepository = {
  /**
   * Generates a stable composite key for punch deduplication.
   * Occurrence-aware: defaults to occurrence 1.
   */
  generateDeduplicationKey(bioId: string, timestamp: string | Date | number, type: number = 1, state: number = 1, deviceId?: string, occIndex: number = 1): string {
    const tMs = new Date(timestamp).getTime()
    const sig = getPunchSignature(bioId, tMs, type, state, deviceId)
    return getOccurrencePunchId(sig, occIndex)
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
    const devId = log.device_id || 'dev-1'
    const sig = getPunchSignature(bioId, tDate.getTime(), type, state, devId)

    const id = log.id || getOccurrencePunchId(sig, 1)

    return {
      id,
      bioId,
      date: dateKey,
      timestamp: log.attendance_time,
      timestampMs: tDate.getTime(),
      type,
      state,
      serialNumber: log.serial_number ?? 0,
      deviceId: devId,
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
   * Bulk imports raw records with streaming transactions, occurrence-aware deduplication, and progress reporting.
   *
   * Solves the duplicate sync bug by implementing the 3-tier identity hierarchy:
   * Priority 1: Device-provided unique transaction / log ID
   * Priority 2: Stable existing record ID
   * Priority 3: Occurrence-aware multiset deduplication
   *
   * Idempotent: Multiple syncs of the same biometric data will NEVER create duplicate records.
   * Preserves legitimate identical punches (e.g. 2 punches at same second remain exactly 2 records).
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

    // 1. Inspect existing database records to establish multiset counts per signature
    const existingDbRecords = await db.biometricPunches.toArray()
    const existingIds = new Set<string>()
    const existingSignatureCounts = new Map<string, number>()

    for (const rec of existingDbRecords) {
      existingIds.add(rec.id)
      const sig = getPunchSignature(rec.bioId, rec.timestampMs, rec.type, rec.state, rec.deviceId)
      existingSignatureCounts.set(sig, (existingSignatureCounts.get(sig) || 0) + 1)
    }

    // 2. Pre-scan incoming records to detect if 'sn' / 'Serial' is unique across the batch
    const snCounts = new Map<string, number>()
    for (const raw of rawRecords) {
      const sn = raw.serialNumber ?? raw.serial_number ?? raw.Serial ?? raw.sn
      if (sn !== undefined && sn !== null && Number(sn) > 0) {
        const str = String(sn).trim()
        snCounts.set(str, (snCounts.get(str) || 0) + 1)
      }
    }
    // Only sn values that occur exactly once across the entire batch qualify as unique transaction IDs
    const batchUniqueTxIds = new Set<string>()
    for (const [snStr, count] of snCounts.entries()) {
      if (count === 1) {
        batchUniqueTxIds.add(snStr)
      }
    }

    // 3. Process batches with occurrence-aware multiset deduplication
    const BATCH_SIZE = 2500
    let importedCount = 0
    let duplicateCount = 0
    let invalidCount = 0
    let batchCount = 0

    // Tracks occurrence index of each punch signature within the incoming stream
    const batchOccurrenceMap = new Map<string, number>()
    const employeeBatchMap = new Map<string, { bioId: string; name: string; location: any; workGroupId?: string }>()

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const chunk = rawRecords.slice(i, i + BATCH_SIZE)
      const recordsToInsert: BiometricPunchRecord[] = []

      for (const raw of chunk) {
        const userId = String(raw['User ID'] || raw['userId'] || raw['User_ID'] || raw['ID'] || raw.user_id || '').trim()
        const rawTime = raw['Date/Time'] || raw['DateTime'] || raw['Date'] || raw['attTime'] || raw['Time'] || raw.attendance_time
        const rawName = String(raw['Name'] || raw['Employee'] || raw['Employee Name'] || raw.employee_name || '').trim()
        const rawWg = raw['Work Group'] || raw['WorkGroup'] || raw['Group'] || raw.work_group_id || 'wg-group-c'
        const devId = raw.device_id || raw.deviceId || 'dev-1'

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
        const tMs = tDate.getTime()
        const sig = getPunchSignature(userId, tMs, type, state, devId)

        // Increment occurrence index for this signature in the incoming stream
        const occIndex = (batchOccurrenceMap.get(sig) || 0) + 1
        batchOccurrenceMap.set(sig, occIndex)

        // Resolve identity according to priority hierarchy
        const identity = resolvePunchIdentity(raw, userId, tMs, type, state, devId, occIndex, batchUniqueTxIds)
        const resolvedId = identity.id

        // Deduplication Check:
        // Priority 1: Check if the transaction ID already exists in DB
        // Priority 2/3: Check if this specific occurrence already exists in DB
        const existingCountForSig = existingSignatureCounts.get(sig) || 0
        const isAlreadyInDb = existingIds.has(resolvedId) || (identity.priority === 3 && occIndex <= existingCountForSig)

        if (isAlreadyInDb) {
          duplicateCount++
          continue
        }

        // New legitimate record to insert
        existingIds.add(resolvedId)
        existingSignatureCounts.set(sig, Math.max(existingCountForSig, occIndex))

        const dateKey = getManilaDateString(tDate)

        recordsToInsert.push({
          id: resolvedId,
          bioId: userId,
          date: dateKey,
          timestamp: tDate.toISOString(),
          timestampMs: tMs,
          type,
          state,
          serialNumber: Number(raw['Serial'] || raw['Serial Number'] || raw.serial_number || raw.sn || 0),
          deviceId: devId,
          deviceIp: raw['IP'] || raw.device_ip || '192.168.1.201',
          deviceName: raw.device_name || raw.deviceName || 'BISBIO B-29b',
          locationId: raw.location_id || 'loc-cebu',
          locationName: raw.location_name || raw.location || 'DBB CEBU',
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

  /**
   * Adds a newly arrived live biometric scan into persistent IndexedDB.
   * Occurrence-aware: preserves repeated legitimate live scans with distinct occurrence IDs.
   */
  async addPunch(log: AttendanceLog): Promise<boolean> {
    if (!log.user_id || !log.attendance_time) return false

    const bioId = String(log.user_id).trim()
    const tDate = new Date(log.attendance_time)
    if (isNaN(tDate.getTime())) return false

    const tMs = tDate.getTime()
    const type = Number(log.type ?? 1)
    const state = Number(log.state ?? 1)
    const devId = log.device_id || 'dev-1'
    const sig = getPunchSignature(bioId, tMs, type, state, devId)

    // Check existing count in DB for this exact punch signature
    const existingForSig = await db.biometricPunches
      .where('bioId')
      .equals(bioId)
      .filter(r => Math.floor(r.timestampMs / 1000) === Math.floor(tMs / 1000) && r.type === type && r.state === state)
      .toArray()

    // Priority 1: Check for device-provided unique transaction ID
    const candidateTx = (log as any).transactionId ?? (log as any).logId ?? (log as any).recordId
    let finalId: string
    if (candidateTx !== undefined && candidateTx !== null && String(candidateTx).trim() && String(candidateTx).trim() !== '0') {
      finalId = `dev_${normalizeDeviceId(devId)}_tx_${String(candidateTx).trim()}`
      if (await db.biometricPunches.get(finalId)) {
        return false // duplicate
      }
    } else {
      const nextOccIndex = existingForSig.length + 1
      finalId = getOccurrencePunchId(sig, nextOccIndex)
    }

    const dateKey = getManilaDateString(tDate)
    const record: BiometricPunchRecord = {
      id: finalId,
      bioId,
      date: dateKey,
      timestamp: tDate.toISOString(),
      timestampMs: tMs,
      type,
      state,
      serialNumber: log.serial_number ?? 0,
      deviceId: devId,
      deviceIp: log.device_ip || '192.168.1.201',
      deviceName: log.device_name || 'BISBIO B-29b',
      locationId: log.location_id || 'loc-cebu',
      locationName: log.location_name || 'DBB CEBU',
      employeeName: log.employee_name || `User ${bioId}`,
      workGroupId: log.work_group_id || 'wg-group-c',
      isDuplicate: Boolean(log.is_duplicate),
      importedAt: log.created_at || new Date().toISOString()
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
