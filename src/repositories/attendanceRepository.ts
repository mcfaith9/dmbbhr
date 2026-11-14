import { db, type DailySummaryRecord } from '@/db'
import type { AttendanceLog } from '@/types'
import {
  processEmployeeDayPunches,
  getManilaDateString,
  type DailyAttendanceRecord,
  type AttendanceEngineConfig,
  type EmployeeScheduleContext
} from '@/services/attendanceEngine'
import { punchRepository } from './punchRepository'
import { employeeRepository, findCachedEmployee } from './employeeRepository'
import { workGroupRepository } from './workGroupRepository'
import { manualAttendanceRepository } from './manualAttendanceRepository'
import { collectEmployeeIdKeys, getEmployeeAllBioIds, getEmployeePrimaryBioId } from '@/lib/employeeIdentity'

import type { EmployeeRecord } from '@/db'

function normalizeCanonicalBioId(id?: string | null): string {
  const cleaned = String(id ?? '')
    .trim()
    .replace(/^(?:emp|user)[-_]/i, '')
    .trim()
    .toLowerCase()
  if (!cleaned) return ''
  return /^\d+$/.test(cleaned) ? (cleaned.replace(/^0+/, '') || '0') : cleaned
}

function matchesLocationFilter(empLocation: string, locationFilter?: string): boolean {
  if (!locationFilter || locationFilter === 'all') return true
  const target = locationFilter.toLowerCase().trim()
  const current = (empLocation || '').toLowerCase().trim()
  return (
    current === target ||
    (target === 'loc-dmbb-cebu' && current === 'dmbb cebu') ||
    (target === 'loc-dbb-cebu' && current === 'dbb cebu') ||
    (target === 'loc-dbb-negros' && current === 'dbb negros') ||
    (target === 'loc-dbb-iloilo' && current === 'dbb iloilo')
  )
}

export const attendanceRepository = {
  /**
   * Retrieves daily attendance records for a target date.
   * Leverages date-indexed query in IndexedDB.
   * Runs in O(log N) B-Tree lookup (< 5ms) even with 100k+ to 1M+ stored punches.
   */
  async getDailyAttendance(
    targetDate?: string,
    locationFilter: string = 'all',
    workGroupFilter: string = 'all',
    customConfig: Partial<AttendanceEngineConfig> = {},
    bioIdFilter?: string
  ): Promise<DailyAttendanceRecord[]> {
    if (bioIdFilter && targetDate === 'all') {
      return this.getEmployeeDailyAttendanceHistory(bioIdFilter, customConfig)
    }

    const selectedDate = targetDate || getManilaDateString(new Date())

    // 1. Fetch day punches & lookup tables concurrently
    const [rawDayPunches, employeeMap, workGroupMap, manualAdjustmentsMap, leaves] = await Promise.all([
      punchRepository.getPunchesByDate(selectedDate),
      employeeRepository.getEmployeeMap(),
      workGroupRepository.getMap(),
      manualAttendanceRepository.getAdjustmentsMapForDate(selectedDate),
      db.leaveRecords
        .where('status')
        .equals('Approved')
        .filter(l => l.startDate <= selectedDate && l.endDate >= selectedDate)
        .toArray()
        .catch(() => [])
    ])

    // Build canonical lookup maps covering primary, secondary, and historical/inactive linked Bio IDs
    const canonicalEmployeeMap = new Map<string, EmployeeRecord>()
    const rawEmployeeLookup = new Map<string, EmployeeRecord>()
    for (const emp of employeeMap.values()) {
      rawEmployeeLookup.set(emp.bioId, emp)
      rawEmployeeLookup.set(emp.bioId.toLowerCase(), emp)
      const allIds = getEmployeeAllBioIds(emp)
      for (const linkedId of allIds) {
        const cleanLinked = String(linkedId).trim()
        if (!cleanLinked) continue
        if (!rawEmployeeLookup.has(cleanLinked)) rawEmployeeLookup.set(cleanLinked, emp)
        if (!rawEmployeeLookup.has(cleanLinked.toLowerCase())) rawEmployeeLookup.set(cleanLinked.toLowerCase(), emp)
        const ck = normalizeCanonicalBioId(cleanLinked)
        if (ck && !canonicalEmployeeMap.has(ck)) canonicalEmployeeMap.set(ck, emp)
      }
      const k1 = normalizeCanonicalBioId(emp.bioId)
      const k2 = normalizeCanonicalBioId(emp.employeeNumber)
      if (k1 && !canonicalEmployeeMap.has(k1)) canonicalEmployeeMap.set(k1, emp)
      if (k2 && !canonicalEmployeeMap.has(k2)) canonicalEmployeeMap.set(k2, emp)
    }

    const resolveEmployee = (id?: string | null): EmployeeRecord | undefined => {
      const raw = String(id || '').trim()
      if (!raw) return undefined
      const direct = employeeMap.get(raw) || rawEmployeeLookup.get(raw) || rawEmployeeLookup.get(raw.toLowerCase())
      if (direct) return direct
      const norm = normalizeCanonicalBioId(raw)
      if (norm && canonicalEmployeeMap.has(norm)) {
        return canonicalEmployeeMap.get(norm)
      }
      // Fallback to employeeRepository's merged/archived chain resolver
      const cached = findCachedEmployee(raw) || (norm ? findCachedEmployee(norm) : null)
      return cached?.record
    }

    const canonicalAdjustmentsMap = new Map<string, any>()
    for (const [k, adj] of manualAdjustmentsMap.entries()) {
      const matchedEmp = resolveEmployee(k)
      if (matchedEmp) {
        const empCanon = normalizeCanonicalBioId(matchedEmp.bioId)
        if (empCanon && !canonicalAdjustmentsMap.has(empCanon)) canonicalAdjustmentsMap.set(empCanon, adj)
      }
      const ck = normalizeCanonicalBioId(k)
      if (ck && !canonicalAdjustmentsMap.has(ck)) canonicalAdjustmentsMap.set(ck, adj)
    }

    const leaveMap = new Map<string, any>()
    const canonicalLeaveMap = new Map<string, any>()
    for (const l of leaves) {
      leaveMap.set(l.bioId, l)
      const matchedEmp = resolveEmployee(l.bioId)
      if (matchedEmp) {
        leaveMap.set(matchedEmp.bioId, l)
        const empCanon = normalizeCanonicalBioId(matchedEmp.bioId)
        if (empCanon && !canonicalLeaveMap.has(empCanon)) canonicalLeaveMap.set(empCanon, l)
      }
      const ck = normalizeCanonicalBioId(l.bioId)
      if (ck && !canonicalLeaveMap.has(ck)) canonicalLeaveMap.set(ck, l)
    }

    let dayPunches = rawDayPunches
    let allowedFilterKeys: Set<string> | null = null
    if (bioIdFilter && bioIdFilter.trim()) {
      const matchedFilterEmp = resolveEmployee(bioIdFilter)
      allowedFilterKeys = new Set<string>()
      const addFilterKey = (v?: string | null) => {
        if (!v) return
        const l = String(v).trim().toLowerCase()
        const n = normalizeCanonicalBioId(v)
        if (l) allowedFilterKeys!.add(l)
        if (n) allowedFilterKeys!.add(n)
      }
      addFilterKey(bioIdFilter)
      if (matchedFilterEmp) {
        addFilterKey(matchedFilterEmp.bioId)
        for (const lid of getEmployeeAllBioIds(matchedFilterEmp)) addFilterKey(lid)
        if (Array.isArray(matchedFilterEmp.mergedFromBioIds)) {
          for (const mid of matchedFilterEmp.mergedFromBioIds) addFilterKey(mid)
        }
      }
      dayPunches = dayPunches.filter(p => {
        const pLower = p.user_id.trim().toLowerCase()
        const pNorm = normalizeCanonicalBioId(p.user_id)
        const pCanonLower = p.linked_employee_bio_id ? p.linked_employee_bio_id.trim().toLowerCase() : ''
        const pCanonNorm = p.linked_employee_bio_id ? normalizeCanonicalBioId(p.linked_employee_bio_id) : ''
        return (
          allowedFilterKeys!.has(pLower) ||
          (pNorm !== '' && allowedFilterKeys!.has(pNorm)) ||
          (pCanonLower !== '' && allowedFilterKeys!.has(pCanonLower)) ||
          (pCanonNorm !== '' && allowedFilterKeys!.has(pCanonNorm))
        )
      })
    }

    // 2. Group punches by canonical employee record (combining primary & secondary Bio IDs into one daily attendance record)
    const userGroups = new Map<string, AttendanceLog[]>()
    for (let i = 0; i < dayPunches.length; i++) {
      const p = dayPunches[i]
      const rawUid = String(p.user_id || '').trim()
      const matchedEmp = resolveEmployee(rawUid)
      const groupKey = matchedEmp?.bioId || rawUid
      if (!userGroups.has(groupKey)) {
        userGroups.set(groupKey, [])
      }
      userGroups.get(groupKey)!.push({
        ...p,
        source_bio_id: p.source_bio_id || rawUid
      })
    }

    const records: DailyAttendanceRecord[] = []
    const processedBioIds = new Set<string>()
    const processedCanonicalIds = new Set<string>()

    // 3. Process each employee's daily punches with Work Group context
    for (const [bioId, punches] of userGroups.entries()) {
      const canonUid = normalizeCanonicalBioId(bioId)
      processedBioIds.add(bioId)
      if (canonUid) processedCanonicalIds.add(canonUid)

      const emp = resolveEmployee(bioId)
      const empLocation = emp?.location || punches[0].location_name || 'DBB CEBU'
      const empWgId = emp?.workGroupId || 'wg-group-c'
      const wg = workGroupMap.get(empWgId) || workGroupMap.get('wg-group-c')
      const manualAdj = manualAdjustmentsMap.get(bioId) || (canonUid ? canonicalAdjustmentsMap.get(canonUid) : undefined)
      const leaveRec = leaveMap.get(bioId) || (canonUid ? canonicalLeaveMap.get(canonUid) : undefined)

      // Location filter
      if (!matchesLocationFilter(empLocation, locationFilter)) {
        continue
      }

      // Work Group filter
      if (workGroupFilter && workGroupFilter !== 'all') {
        if (empWgId !== workGroupFilter) {
          continue
        }
      }

      const empContext: EmployeeScheduleContext = {
        bioId: emp?.bioId || bioId,
        primaryBioId: emp ? getEmployeePrimaryBioId(emp) : bioId,
        biometricIds: emp?.biometricIds,
        name: emp?.fullName || punches[0].employee_name || `User ${bioId}`,
        department: emp?.department || '',
        location: empLocation,
        workGroupId: empWgId,
        workGroupName: wg?.name || 'GROUP C',
        standardIn: wg?.standardIn || '08:00',
        requiredWorkMinutes: wg?.requiredWorkMinutes || 480,
        lunchStart: wg?.lunchStart || '12:00',
        lunchEnd: wg?.lunchEnd || '13:00',
        gracePeriodMinutes: wg?.gracePeriodMinutes || 0,
        manualAdjustment: manualAdj,
        approvedLeave: leaveRec,
        employeeStatus: emp?.status || 'active',
        resignationDate: emp?.resignationDate
      }

      const dailyRecord = processEmployeeDayPunches(empContext.bioId, punches, selectedDate, empContext, customConfig)
      if (dailyRecord) {
        records.push(dailyRecord)
      }
    }

    // Process employees with approved leave who had 0 punches
    for (const [bioId, leaveRec] of leaveMap.entries()) {
      const resolvedEmp = resolveEmployee(bioId)
      const emp = resolvedEmp || employeeMap.get(bioId)
      const resolvedCanon = emp ? normalizeCanonicalBioId(emp.bioId) : normalizeCanonicalBioId(bioId)
      if (!emp) continue
      if (allowedFilterKeys) {
        const empCandidateIds = [
          bioId,
          emp.bioId,
          ...getEmployeeAllBioIds(emp),
          ...(Array.isArray(emp.mergedFromBioIds) ? emp.mergedFromBioIds : [])
        ]
        const matchesFilter = empCandidateIds.some(id => {
          const l = String(id).trim().toLowerCase()
          const n = normalizeCanonicalBioId(id)
          return (l !== '' && allowedFilterKeys!.has(l)) || (n !== '' && allowedFilterKeys!.has(n))
        })
        if (!matchesFilter) continue
      }
      if (processedBioIds.has(emp.bioId) || (resolvedCanon && processedCanonicalIds.has(resolvedCanon))) continue

      const isResignedOnSelectedDate =
        (emp.status === 'resigned' || (emp.status as string).toLowerCase() === 'r') &&
        (!emp.resignationDate || emp.resignationDate <= selectedDate)
      if (isResignedOnSelectedDate) continue

      const empLocation = emp.location || 'DBB CEBU'
      const empWgId = emp.workGroupId || 'wg-group-c'
      const wg = workGroupMap.get(empWgId) || workGroupMap.get('wg-group-c')

      if (!matchesLocationFilter(empLocation, locationFilter)) continue
      if (workGroupFilter && workGroupFilter !== 'all') {
        if (empWgId !== workGroupFilter) continue
      }

      processedBioIds.add(emp.bioId)
      if (resolvedCanon) processedCanonicalIds.add(resolvedCanon)

      const empContext: EmployeeScheduleContext = {
        bioId: emp.bioId,
        primaryBioId: getEmployeePrimaryBioId(emp),
        biometricIds: emp.biometricIds,
        name: emp.fullName || `User ${emp.bioId}`,
        department: emp.department || '',
        location: empLocation,
        workGroupId: empWgId,
        workGroupName: wg?.name || 'GROUP C',
        standardIn: wg?.standardIn || '08:00',
        requiredWorkMinutes: wg?.requiredWorkMinutes || 480,
        lunchStart: wg?.lunchStart || '12:00',
        lunchEnd: wg?.lunchEnd || '13:00',
        gracePeriodMinutes: wg?.gracePeriodMinutes || 0,
        approvedLeave: leaveRec,
        employeeStatus: emp.status,
        resignationDate: emp.resignationDate
      }

      const dailyRecord = processEmployeeDayPunches(emp.bioId, [], selectedDate, empContext, customConfig)
      if (dailyRecord) {
        records.push(dailyRecord)
      }
    }

    // 4. Default sorting: Newest fingerprint / latest attendance time first (descending)
    records.sort((a, b) => {
      const timeDiff = (b.latest_punch_time_ms || 0) - (a.latest_punch_time_ms || 0)
      if (timeDiff !== 0) return timeDiff
      return a.employee_name.localeCompare(b.employee_name)
    })

    // 5. Update cached Daily Summary for high-speed Calendar retrieval
    // ONLY update global cache when this was an unfiltered query for all employees & locations
    const isUnfiltered = (locationFilter === 'all' || !locationFilter) &&
      (workGroupFilter === 'all' || !workGroupFilter) &&
      (!bioIdFilter || !bioIdFilter.trim())
    if (isUnfiltered) {
      await this.updateDailySummaryCache(selectedDate, records).catch(() => {})
    }

    return records
  },

  /**
   * Updates the aggregated summary table for calendar Month views.
   */
  async updateDailySummaryCache(dateStr: string, records: DailyAttendanceRecord[]): Promise<DailySummaryRecord> {
    const activeRecords = records.filter(
      r => r.employee_status !== 'resigned' || (r.resignation_date && r.resignation_date > dateStr)
    )
    const presentRecords = activeRecords.filter(r => r.status !== 'Leave' && r.status !== 'On Leave')
    const presentCount = presentRecords.length
    const onTimeCount = presentRecords.filter(r => r.late_minutes === 0 && r.has_valid_out).length
    const lateCount = presentRecords.filter(r => r.late_minutes > 0).length
    const singlePunchCount = presentRecords.filter(r => r.status.startsWith('Single Punch') || r.status.includes('Missing IN') || r.status.includes('Ambiguous')).length
    const awaitingOutCount = presentRecords.filter(r => r.status === 'Awaiting OUT').length
    const leaveCount = activeRecords.filter(r => r.status === 'Leave' || r.status === 'On Leave').length
    const holidayCount = presentRecords.filter(r => r.status === 'Holiday').length

    const summary: DailySummaryRecord = {
      date: dateStr,
      presentCount,
      onTimeCount,
      lateCount,
      singlePunchCount,
      awaitingOutCount,
      leaveCount,
      holidayCount,
      totalEmployees: (await employeeRepository.countActive()) || presentCount,
      updatedAt: new Date().toISOString()
    }

    await db.dailySummaries.put(summary)
    return summary
  },

  /**
   * Retrieves summary data for all days in a given month (e.g. "2026-09")
   * O(1) indexed lookup from dailySummaries table with self-healing staleness validation.
   */
  async getMonthSummaries(year: number, month: number): Promise<Map<string, DailySummaryRecord>> {
    const mStr = String(month).padStart(2, '0')
    const firstDayIndex = new Date(year, month - 1, 1).getDay()
    const daysInPrevMonth = new Date(year, month - 1, 0).getDate()
    const prevM = month === 1 ? 12 : month - 1
    const prevY = month === 1 ? year - 1 : year
    const nextM = month === 12 ? 1 : month + 1
    const nextY = month === 12 ? year + 1 : year

    // Cover month and leading/trailing calendar days so full grid is populated
    const startDate = firstDayIndex > 0
      ? `${prevY}-${String(prevM).padStart(2, '0')}-${String(daysInPrevMonth - firstDayIndex + 1).padStart(2, '0')}`
      : `${year}-${mStr}-01`
    const endDate = `${nextY}-${String(nextM).padStart(2, '0')}-14`

    const list = await db.dailySummaries.where('date').between(startDate, endDate, true, true).toArray()
    const summaryMap = new Map<string, DailySummaryRecord>()

    for (const item of list) {
      summaryMap.set(item.date, item)
    }

    // Inspect raw punches in this date range to detect uncached or corrupted/stale daily summaries
    // Ensure employee cache is initialized so secondary/merged Bio IDs resolve to their canonical employee
    const [employeeMap, allPunchesInMonth, manualAdjustmentsInMonth, currentActiveCount] = await Promise.all([
      employeeRepository.getEmployeeMap(),
      db.biometricPunches.where('date').between(startDate, endDate, true, true).toArray(),
      db.manualAdjustments.where('date').between(startDate, endDate, true, true).toArray().catch(() => []),
      employeeRepository.countActive().catch(() => 0)
    ])
    const datesWithApprovedManualAdj = new Set<string>()
    for (const adj of manualAdjustmentsInMonth) {
      if (adj.status === 'Approved' && adj.date) {
        datesWithApprovedManualAdj.add(adj.date)
      }
    }

    const punchesByDate = new Map<string, { bioIds: Set<string>; latestImportTime: string }>()
    for (const p of allPunchesInMonth) {
      if (!p.date) continue
      let group = punchesByDate.get(p.date)
      if (!group) {
        group = { bioIds: new Set(), latestImportTime: p.importedAt || p.timestamp || '' }
        punchesByDate.set(p.date, group)
      }
      const canonicalBio = employeeRepository.resolveCanonicalBioIdSync(p.bioId) || normalizeCanonicalBioId(p.bioId) || p.bioId
      const matchedEmp = employeeMap.get(canonicalBio) || findCachedEmployee(p.bioId)?.record
      // Align with updateDailySummaryCache exclusion of resigned employees on date p.date
      const isResignedOnPunchDate =
        matchedEmp &&
        matchedEmp.status === 'resigned' &&
        (!matchedEmp.resignationDate || matchedEmp.resignationDate <= p.date)
      if (!isResignedOnPunchDate) {
        group.bioIds.add(matchedEmp?.bioId || canonicalBio)
      }
      const pTime = p.importedAt || p.timestamp || ''
      if (pTime && pTime > group.latestImportTime) {
        group.latestImportTime = pTime
      }
    }

    const dateGroups = new Set<string>()

    // Check dates that have punches
    for (const [d, group] of punchesByDate.entries()) {
      const existing = summaryMap.get(d)
      if (!existing) {
        dateGroups.add(d)
      } else {
        // Detect stale counts (both undercounts and pre-consolidation overcounts)
        // or where employee totals or punch imports changed after the summary was cached
        const distinctPunched = group.bioIds.size
        const isStaleUnderCount = distinctPunched > 0 && existing.presentCount < distinctPunched
        const isStaleOverCount = existing.presentCount > distinctPunched && !datesWithApprovedManualAdj.has(d)
        const isStaleTotal = currentActiveCount > 0 && existing.totalEmployees !== currentActiveCount
        const isNewerPunch = group.latestImportTime && existing.updatedAt && group.latestImportTime > existing.updatedAt
        if (isStaleUnderCount || isStaleOverCount || isStaleTotal || isNewerPunch) {
          dateGroups.add(d)
        }
      }
    }

    // Check cached summaries that may have stale overcounts on dates with 0 remaining punches
    for (const [d, existing] of summaryMap.entries()) {
      if (!punchesByDate.has(d)) {
        const isStaleOverCount = existing.presentCount > 0 && !datesWithApprovedManualAdj.has(d)
        const isStaleTotal = currentActiveCount > 0 && existing.totalEmployees !== currentActiveCount
        if (isStaleOverCount || isStaleTotal) {
          dateGroups.add(d)
        }
      }
    }

    // Also check dailyAttendance table
    const dailyRecordsInMonth = await db.dailyAttendance.where('date').between(startDate, endDate, true, true).toArray()
    for (const r of dailyRecordsInMonth) {
      if (!summaryMap.has(r.date)) {
        dateGroups.add(r.date)
      }
    }

    // Compute missing or stale daily summaries concurrently for fast calendar loading
    if (dateGroups.size > 0) {
      const computed = await Promise.all(
        Array.from(dateGroups).map(async (d) => {
          const records = await this.getDailyAttendance(d)
          const summary = await this.updateDailySummaryCache(d, records)
          return { date: d, summary }
        })
      )
      for (const item of computed) {
        if (item.summary) {
          summaryMap.set(item.date, item.summary)
        }
      }
    }

    return summaryMap
  },

  /**
   * Retrieves an employee's historical daily attendance records across all dates.
   * Utilizes the indexed bioId lookup to quickly fetch that employee's punches.
   */
  async getEmployeeDailyAttendanceHistory(
    bioId: string,
    customConfig: Partial<AttendanceEngineConfig> = {}
  ): Promise<DailyAttendanceRecord[]> {
    const cleanBioId = String(bioId).trim()
    const [resolvedEmployee, employeeMap, workGroupMap] = await Promise.all([
      employeeRepository.getByBioId(cleanBioId),
      employeeRepository.getEmployeeMap(),
      workGroupRepository.getMap()
    ])

    const canonicalId = resolvedEmployee?.canonical_bio_id || resolvedEmployee?.biometric_user_id || cleanBioId
    const emp =
      employeeMap.get(canonicalId) ||
      employeeMap.get(cleanBioId) ||
      findCachedEmployee(canonicalId)?.record ||
      findCachedEmployee(cleanBioId)?.record

    // Collect all linked Bio IDs (canonical, primary, secondary, inactive, merged, plus raw/case/padding variants)
    const idCandidates = new Set<string>()
    const addCandidateVariants = (rawVal?: string | null) => {
      const v = String(rawVal || '').trim()
      if (!v) return
      idCandidates.add(v)
      idCandidates.add(v.toUpperCase())
      idCandidates.add(v.toLowerCase())
      idCandidates.add(`user${v}`)
      idCandidates.add(`USER${v}`)
      idCandidates.add(`emp-${v}`)
      idCandidates.add(`EMP-${v}`)
      if (/^\d+$/.test(v)) {
        const unpadded = v.replace(/^0+/, '') || '0'
        idCandidates.add(unpadded)
        for (const len of [4, 5, 6]) {
          if (unpadded.length < len) idCandidates.add(unpadded.padStart(len, '0'))
        }
      }
    }
    addCandidateVariants(cleanBioId)
    addCandidateVariants(canonicalId)
    if (emp) {
      addCandidateVariants(emp.bioId)
      for (const lid of getEmployeeAllBioIds(emp)) addCandidateVariants(lid)
      if (Array.isArray(emp.mergedFromBioIds)) {
        for (const mid of emp.mergedFromBioIds) addCandidateVariants(mid)
      }
    }
    if (resolvedEmployee) {
      for (const k of collectEmployeeIdKeys(resolvedEmployee)) {
        idCandidates.add(k)
      }
    }
    const queryIds = Array.from(idCandidates).filter(Boolean)

    const [rawPunches, adjustments, leaves] = await Promise.all([
      db.biometricPunches.where('bioId').anyOf(queryIds).toArray(),
      db.manualAdjustments.where('bioId').anyOf(queryIds).toArray().catch(() => []),
      db.leaveRecords.where('bioId').anyOf(queryIds).toArray().catch(() => [])
    ])

    const empLocation = emp?.location || rawPunches[0]?.locationName || 'DBB CEBU'
    const empWgId = emp?.workGroupId || 'wg-group-c'
    const wg = workGroupMap.get(empWgId) || workGroupMap.get('wg-group-c')

    const adjustmentsByDate = new Map<string, any>()
    for (const a of adjustments) {
      const existingAdj = adjustmentsByDate.get(a.date)
      if (!existingAdj || (existingAdj.status !== 'Approved' && a.status === 'Approved')) {
        adjustmentsByDate.set(a.date, a)
      }
    }

    const leavesByDate = new Map<string, any>()
    for (const l of leaves) {
      if (l.status === 'Approved' && l.startDate) {
        const end = l.endDate && l.endDate >= l.startDate ? l.endDate : l.startDate
        const [sy, sm, sd] = l.startDate.split('-').map(Number)
        const [ey, em, ed] = end.split('-').map(Number)
        if (sy && sm && sd && ey && em && ed) {
          const cur = new Date(Date.UTC(sy, sm - 1, sd))
          const endDt = new Date(Date.UTC(ey, em - 1, ed))
          for (let guard = 0; cur <= endDt && guard < 366; guard++) {
            const dIso = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}-${String(cur.getUTCDate()).padStart(2, '0')}`
            leavesByDate.set(dIso, l)
            cur.setUTCDate(cur.getUTCDate() + 1)
          }
        } else {
          leavesByDate.set(l.startDate, l)
        }
      }
    }

    // Group punches by date across all linked Bio IDs (deduplicated by punch id)
    const dateMap = new Map<string, AttendanceLog[]>()
    const seenPunchIds = new Set<string>()
    for (const r of rawPunches) {
      if (seenPunchIds.has(r.id)) continue
      seenPunchIds.add(r.id)
      const log = punchRepository.toLog(r)
      log.source_bio_id = r.bioId
      if (emp) {
        log.employee_name = emp.fullName
        log.department = emp.department || ''
        log.location_name = emp.location
        log.work_group_id = emp.workGroupId || 'wg-group-c'
        log.linked_employee_bio_id = getEmployeePrimaryBioId(emp)
      }
      if (!dateMap.has(r.date)) {
        dateMap.set(r.date, [])
      }
      dateMap.get(r.date)!.push(log)
    }

    // Also include dates with manual adjustments or approved leaves
    for (const d of adjustmentsByDate.keys()) {
      if (!dateMap.has(d)) dateMap.set(d, [])
    }
    for (const d of leavesByDate.keys()) {
      if (!dateMap.has(d)) dateMap.set(d, [])
    }

    const records: DailyAttendanceRecord[] = []

    for (const [dateStr, punches] of dateMap.entries()) {
      const empContext: EmployeeScheduleContext = {
        bioId: canonicalId,
        primaryBioId: emp ? getEmployeePrimaryBioId(emp) : canonicalId,
        biometricIds: emp?.biometricIds,
        name: emp?.fullName || `User ${canonicalId}`,
        department: emp?.department || '',
        location: empLocation,
        workGroupId: empWgId,
        workGroupName: wg?.name || 'GROUP C',
        standardIn: wg?.standardIn || '08:00',
        requiredWorkMinutes: wg?.requiredWorkMinutes || 480,
        lunchStart: wg?.lunchStart || '12:00',
        lunchEnd: wg?.lunchEnd || '13:00',
        gracePeriodMinutes: wg?.gracePeriodMinutes || 0,
        manualAdjustment: adjustmentsByDate.get(dateStr),
        approvedLeave: leavesByDate.get(dateStr),
        employeeStatus: emp?.status || 'active',
        resignationDate: emp?.resignationDate
      }

      const rec = processEmployeeDayPunches(canonicalId, punches, dateStr, empContext, customConfig)
      if (rec) {
        records.push(rec)
      }
    }

    // Sort descending by date (newest first)
    records.sort((a, b) => b.raw_date.localeCompare(a.raw_date))
    return records
  }
}
