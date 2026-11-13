/**
 * HR Attendance Reports Service
 *
 * Implements high-performance, non-duplicative aggregation of attendance data.
 * Reuses the authoritative Daily Attendance and Employee services.
 * Strictly adheres to date-based active, hire/contract, and resignation eligibility
 * as well as canonical Bio ID & duplicate-person deduplication.
 */

import { attendanceService, getManilaDateString, type DailyAttendanceRecord } from './attendance'
import { employeeService } from './employees'
import { parseDateValue } from '@/repositories/employeeRepository'
import { holidayService } from './holidays/holidayService'
import { formatDuration } from '@/lib/timeUtils'
import { db } from '@/db'
import type { Employee } from '@/types'

export type DateRangePreset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom'

export interface ReportFilterOptions {
  preset: DateRangePreset
  startDate?: string // YYYY-MM-DD
  endDate?: string // YYYY-MM-DD
  location?: string // 'all', 'DBB CEBU', etc.
  workGroupId?: string // 'all' or specific
  employeeBioId?: string // 'all' or specific bioId
  department?: string // 'all' or specific
}

export interface DayTrendPoint {
  date: string
  shortLabel: string
  dayName: string
  present: number
  late: number
  absent: number
  missingOut: number
  renderedHours: number
  expectedScheduled: number
}

export interface WeekTrendPoint {
  weekKey: string // e.g. "2026-W44"
  label: string // e.g. "Oct 26 - Nov 01"
  absentCount: number
  eligibleWorkdays: number
  absenceRate: number
}

export interface MonthTrendPoint {
  monthKey: string // e.g. "2026-10"
  label: string // e.g. "Oct 2026"
  absentCount: number
  eligibleWorkdays: number
  absenceRate: number
}

export interface DepartmentAbsencePoint {
  department: string
  absentCount: number
  uniqueEmployees: number
  absenceRate: number
}

export interface LateAttendanceRecord {
  date: string // YYYY-MM-DD
  lateMinutes: number
}

export interface TopLateEmployee {
  bioId: string
  name: string
  department: string
  workGroupName: string
  lateDays: number
  totalLateMinutes: number
  avgLateMinutes: number
  latestLateDate: string
  lateRecords: LateAttendanceRecord[]
  lateDates?: string[]
}

export interface AbsentEmployeeRecord {
  id: string // `${bioId}_${date}`
  bioId: string
  employeeName: string
  department: string
  position: string
  workGroupName: string
  date: string // YYYY-MM-DD
  dateDisplay: string
  dayOfWeek: string
  scheduledDuty: string // e.g. "08:00 AM - 05:00 PM (8h)"
  status: 'Absent'
  remarks: string // "No attendance recorded"
}

export interface TopAbsentEmployee {
  bioId: string
  name: string
  department: string
  position: string
  workGroupName: string
  absentCount: number
  dates: string[]
}

export interface MissingOutItem {
  bioId: string
  name: string
  date: string
  timeIn: string
  workGroupName: string
  status: string
}

export interface AttendanceStatusBreakdown {
  label: string
  count: number
  percentage: number
  color: string
}

export interface ReportDiagnostics {
  totalRegisteredRecords: number
  deduplicatedEmployees: number
  duplicateRecordsMerged: number
  activeEmployees: number
  resignedEmployees: number
  inactiveOrOtherStatusEmployees: number
  excludedNoBio: number
  excludedNotYetEmployed: number
  excludedRestDayOrHoliday: number
  excludedApprovedLeave: number
  employeesWithValidPunches: number
  dailyValidPunchRecords: number
  classifiedAbsentOccurrences: number
  classifiedAbsentUniqueEmployees: number
  unmatchedPunchBioIds: string[]
  mergedDuplicatePeople: Array<{ name: string; primaryBioId: string; aliasBioIds: string[] }>
}

export interface ReportSummaryResult {
  dateRangeLabel: string
  startDate: string
  endDate: string
  daysCount: number
  kpis: {
    presentCount: number
    lateCount: number
    absentCount: number
    missingOutCount: number
    totalRenderedHours: number
    avgDailyHours: number
    attendanceRate: number
    absenceRate: number
    totalLateMinutes: number
    uniqueEligibleEmployees: number
    uniquePresentEmployees: number
    uniqueLateEmployees: number
    uniqueMissingOutEmployees: number
    uniqueAbsentEmployees: number
    repeatedAbsenceEmployeesCount: number
    totalEligibleWorkdays: number
    scheduledWorkdaysCount: number
  }
  dailyTrend: DayTrendPoint[]
  weeklyTrend: WeekTrendPoint[]
  monthlyTrend: MonthTrendPoint[]
  departmentDistribution: DepartmentAbsencePoint[]
  topAbsentEmployees: TopAbsentEmployee[]
  absentRecords: AbsentEmployeeRecord[]
  statusBreakdown: AttendanceStatusBreakdown[]
  topLateEmployees: TopLateEmployee[]
  missingOutItems: MissingOutItem[]
  renderedHours: {
    total: number
    average: number
    peakDate: string
    peakHours: number
  }
  insights: string[]
  diagnostics: ReportDiagnostics
}

export interface CanonicalEmployee {
  canonicalKey: string
  primary: Employee
  aliasBioIds: Set<string>
  aliasCanonicalKeys: Set<string>
  mergedRecords: Employee[]
}

export interface EligibilityEvaluationResult {
  eligible: boolean
  reason: 'eligible' | 'future_date' | 'resigned' | 'inactive_status' | 'excluded_no_bio' | 'not_yet_employed' | 'approved_leave'
}

// In-memory cache for fast tab-switching without re-computing
const reportCache = new Map<string, { timestamp: number; data: ReportSummaryResult }>()
const CACHE_TTL_MS = 60_000 // 1 minute cache

/**
 * Generates an array of YYYY-MM-DD date strings for a given range (inclusive)
 */
export function getDatesInRange(startStr: string, endStr: string): string[] {
  const dates: string[] = []
  const [startY, startM, startD] = startStr.split('-').map(Number)
  const [endY, endM, endD] = endStr.split('-').map(Number)

  const cur = new Date(Date.UTC(startY, startM - 1, startD))
  const end = new Date(Date.UTC(endY, endM - 1, endD))

  let count = 0
  // Safe limit up to 180 days
  while (cur <= end && count < 180) {
    const y = cur.getUTCFullYear()
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0')
    const d = String(cur.getUTCDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${d}`)
    cur.setUTCDate(cur.getUTCDate() + 1)
    count++
  }

  return dates
}

/**
 * Resolves start and end dates for predefined range presets
 */
export function resolveDateRange(preset: DateRangePreset, customStart?: string, customEnd?: string): { start: string; end: string; label: string } {
  const todayStr = getManilaDateString(new Date())
  const [y, m, d] = todayStr.split('-').map(Number)
  const now = new Date(Date.UTC(y, m - 1, d))

  if (preset === 'today') {
    return { start: todayStr, end: todayStr, label: 'Today' }
  }

  if (preset === 'yesterday') {
    const yest = new Date(now)
    yest.setUTCDate(yest.getUTCDate() - 1)
    const yStr = getManilaDateString(yest)
    return { start: yStr, end: yStr, label: 'Yesterday' }
  }

  if (preset === 'this_week') {
    // Week starting Monday
    const dayOfWeek = now.getUTCDay() // 0 = Sun, 1 = Mon ...
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const mon = new Date(now)
    mon.setUTCDate(mon.getUTCDate() + diffToMon)
    const monStr = getManilaDateString(mon)
    return { start: monStr, end: todayStr, label: 'This Week' }
  }

  if (preset === 'last_week') {
    const dayOfWeek = now.getUTCDay()
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const lastMon = new Date(now)
    lastMon.setUTCDate(lastMon.getUTCDate() + diffToMon - 7)
    const lastSun = new Date(lastMon)
    lastSun.setUTCDate(lastSun.getUTCDate() + 6)
    return {
      start: getManilaDateString(lastMon),
      end: getManilaDateString(lastSun),
      label: 'Last Week'
    }
  }

  if (preset === 'this_month') {
    const firstDay = `${y}-${String(m).padStart(2, '0')}-01`
    return { start: firstDay, end: todayStr, label: 'This Month' }
  }

  if (preset === 'last_month') {
    const prevMonthDate = new Date(Date.UTC(y, m - 2, 1))
    const pY = prevMonthDate.getUTCFullYear()
    const pM = prevMonthDate.getUTCMonth() + 1
    const pMStr = String(pM).padStart(2, '0')
    const lastDayNum = new Date(Date.UTC(pY, pM, 0)).getUTCDate()
    return {
      start: `${pY}-${pMStr}-01`,
      end: `${pY}-${pMStr}-${String(lastDayNum).padStart(2, '0')}`,
      label: 'Last Month'
    }
  }

  // Custom range fallback (normalized so start <= end)
  const rawStart = customStart || todayStr
  const rawEnd = customEnd || rawStart
  const [start, end] = rawStart <= rawEnd ? [rawStart, rawEnd] : [rawEnd, rawStart]
  return { start, end, label: start === end ? start : `${start} to ${end}` }
}

/**
 * Helper to get ISO week number & key (e.g. "2026-W44")
 */
function getWeekKeyAndLabel(dObj: Date): { key: string; label: string } {
  const d = new Date(Date.UTC(dObj.getUTCFullYear(), dObj.getUTCMonth(), dObj.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  const weekKey = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`

  // Compute week start (Mon) and end (Sun)
  const cur = new Date(Date.UTC(dObj.getUTCFullYear(), dObj.getUTCMonth(), dObj.getUTCDate()))
  const day = cur.getUTCDay()
  const diffMon = day === 0 ? -6 : 1 - day
  const mon = new Date(cur)
  mon.setUTCDate(mon.getUTCDate() + diffMon)
  const sun = new Date(mon)
  sun.setUTCDate(sun.getUTCDate() + 6)

  const mStart = mon.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
  const mEnd = sun.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
  const label = `W${weekNo} (${mStart} - ${mEnd})`

  return { key: weekKey, label }
}

/**
 * Normalizes biometric IDs and employee numbers for bulletproof lookup.
 * Handles prefixes (EMP-, emp_, user_), whitespace, case, and leading zeros on numeric IDs (05007 -> 5007).
 */
export function normalizeBioIdKey(id?: string | null): string {
  const cleaned = String(id ?? '')
    .trim()
    .replace(/^(?:emp|user)[-_]/i, '')
    .trim()
    .toLowerCase()
  if (!cleaned) return ''
  return /^\d+$/.test(cleaned) ? (cleaned.replace(/^0+/, '') || '0') : cleaned
}

/**
 * Normalizes employment status string for resilient comparison
 */
export function normalizeEmploymentStatus(status?: string | null): string {
  return String(status || 'active').trim().toLowerCase()
}

export function isResignedStatus(status?: string | null): boolean {
  const s = normalizeEmploymentStatus(status)
  return s === 'resigned' || s === 'r'
}

export function isActiveStatus(status?: string | null): boolean {
  const s = normalizeEmploymentStatus(status)
  return s === 'active' || s === 'a'
}

/**
 * Normalizes date fields (ISO, English month strings, Excel serials) to YYYY-MM-DD.
 */
export function normalizeEmployeeDate(val?: string | null): string | undefined {
  if (!val) return undefined
  const parsed = parseDateValue(val, 1920, 2100)
  return parsed?.isValid && parsed.formatted ? parsed.formatted : undefined
}

/**
 * Determines the earliest valid employment start date from hire_date and contract_date.
 */
export function getEffectiveStartDate(emp: Pick<Employee, 'hire_date' | 'contract_date'>): string | undefined {
  const hire = normalizeEmployeeDate(emp.hire_date)
  const contract = normalizeEmployeeDate(emp.contract_date)
  if (hire && contract) return hire <= contract ? hire : contract
  return hire || contract
}

function normalizePersonName(name?: string | null): string {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function isPlaceholderName(name?: string | null): boolean {
  const n = normalizePersonName(name)
  return !n || /^user\s+\d+$/i.test(n) || n === 'unknown'
}

function normalizeIdentityToken(val?: string | null): string {
  return String(val ?? '').trim().toLowerCase().replace(/[\s\-_]+/g, '')
}

function scoreEmployeeRecordRichness(emp: Employee): number {
  let score = 0
  if (isActiveStatus(emp.status)) score += 100
  if (!isPlaceholderName(emp.full_name)) score += 20
  if (emp.department && emp.department !== 'Operations') score += 5
  if (emp.date_of_birth) score += 3
  if (emp.sss_number) score += 3
  if (emp.contract_date || emp.hire_date) score += 2
  if (emp.daily_rate || emp.basic_salary) score += 2
  return score
}

function areSamePhysicalEmployee(a: Employee, b: Employee): boolean {
  const nameA = normalizePersonName(a.full_name)
  const nameB = normalizePersonName(b.full_name)
  if (!nameA || nameA !== nameB || isPlaceholderName(nameA) || nameA.length < 5) {
    return false
  }

  // Conflicting identity tokens mean two distinct employees with the same name
  const dobA = normalizeEmployeeDate(a.date_of_birth)
  const dobB = normalizeEmployeeDate(b.date_of_birth)
  if (dobA && dobB && dobA !== dobB) return false

  const sssA = normalizeIdentityToken(a.sss_number)
  const sssB = normalizeIdentityToken(b.sss_number)
  if (sssA && sssB && sssA !== sssB) return false

  const tinA = normalizeIdentityToken(a.tin)
  const tinB = normalizeIdentityToken(b.tin)
  if (tinA && tinB && tinA !== tinB) return false

  // Require at least one positive corroborating attribute
  if (dobA && dobB && dobA === dobB) return true
  if (sssA && sssB && sssA === sssB) return true
  if (tinA && tinB && tinA === tinB) return true

  const startA = getEffectiveStartDate(a)
  const startB = getEffectiveStartDate(b)
  if (startA && startB && startA === startB) return true

  const deptA = normalizePersonName(a.department)
  const deptB = normalizePersonName(b.department)
  if (deptA && deptB && deptA === deptB) return true

  return false
}

/**
 * Deduplicates employee records by:
 * 1. Canonical Bio ID (handling 05007 / 5007 / EMP-5007)
 * 2. Same-person dual-Bio-ID duplicates (identical full name + corroborating department/contract/DOB/SSS without conflicts)
 */
export function deduplicateEmployees(
  employees: Employee[],
  options: { singleBioFilter?: string } = {}
): {
  canonicalEmployees: CanonicalEmployee[]
  lookupByAnyKey: Map<string, CanonicalEmployee>
  mergedCount: number
  mergedDuplicatePeople: Array<{ name: string; primaryBioId: string; aliasBioIds: string[] }>
} {
  const lookupByAnyKey = new Map<string, CanonicalEmployee>()
  const groups: CanonicalEmployee[] = []

  const registerKeys = (group: CanonicalEmployee, emp: Employee) => {
    const rawKeys = [emp.biometric_user_id, emp.employee_number, emp.id].filter(Boolean) as string[]
    for (const raw of rawKeys) {
      group.aliasBioIds.add(raw)
      lookupByAnyKey.set(raw, group)
      const norm = normalizeBioIdKey(raw)
      if (norm) {
        group.aliasCanonicalKeys.add(norm)
        lookupByAnyKey.set(norm, group)
      }
    }
  }

  for (const emp of employees) {
    const bioNorm = normalizeBioIdKey(emp.biometric_user_id)
    const numNorm = normalizeBioIdKey(emp.employee_number)

    // Tier 1: Match by canonical Bio ID
    let targetGroup =
      lookupByAnyKey.get(emp.biometric_user_id) ||
      (bioNorm ? lookupByAnyKey.get(bioNorm) : undefined) ||
      (numNorm ? lookupByAnyKey.get(numNorm) : undefined)

    // Tier 2: Match by physical person identity (dual Bio IDs for the exact same person)
    if (!targetGroup && !options.singleBioFilter) {
      targetGroup = groups.find(g => areSamePhysicalEmployee(g.primary, emp))
    }

    if (targetGroup) {
      targetGroup.mergedRecords.push(emp)
      if (scoreEmployeeRecordRichness(emp) > scoreEmployeeRecordRichness(targetGroup.primary)) {
        targetGroup.primary = emp
        targetGroup.canonicalKey = normalizeBioIdKey(emp.biometric_user_id) || emp.biometric_user_id
      }
      registerKeys(targetGroup, emp)
    } else {
      const canonicalKey = bioNorm || emp.biometric_user_id
      const group: CanonicalEmployee = {
        canonicalKey,
        primary: emp,
        aliasBioIds: new Set<string>(),
        aliasCanonicalKeys: new Set<string>(),
        mergedRecords: [emp]
      }
      registerKeys(group, emp)
      groups.push(group)
    }
  }

  // Ensure canonical lookup prioritizes primary keys after any primary promotion
  for (const g of groups) {
    registerKeys(g, g.primary)
  }

  const mergedDuplicatePeople = groups
    .filter(g => g.mergedRecords.length > 1)
    .map(g => ({
      name: g.primary.full_name,
      primaryBioId: g.primary.biometric_user_id,
      aliasBioIds: Array.from(new Set(g.mergedRecords.map(r => r.biometric_user_id)))
    }))

  const mergedCount = employees.length - groups.length
  return { canonicalEmployees: groups, lookupByAnyKey, mergedCount, mergedDuplicatePeople }
}

/**
 * Checks whether an employee is resigned as of a specific date dStr.
 * - On dStr >= todayStr: resigned status is always treated as resigned.
 * - On historical dStr < todayStr: only resigned if resignation_date is missing or resignation_date <= dStr.
 */
export function isEmployeeResignedOnDate(
  status?: string | null,
  resignationDate?: string | null,
  dStr?: string,
  todayStr?: string
): boolean {
  const resDate = normalizeEmployeeDate(resignationDate)
  const targetDate = dStr || todayStr || ''
  const refToday = todayStr || targetDate

  if (isResignedStatus(status)) {
    if (!targetDate || targetDate >= refToday) {
      return true
    }
    if (!resDate) {
      return true
    }
    return resDate <= targetDate
  }

  if (resDate && targetDate && resDate <= targetDate) {
    return true
  }

  return false
}

/**
 * Evaluates full employee absence eligibility for a specific scheduled workday dStr.
 */
export function evaluateEmployeeEligibilityOnDate(
  canonicalEmp: CanonicalEmployee,
  dStr: string,
  todayStr: string,
  employeeLeavesMap: Map<string, Array<{ startDate: string; endDate: string }>>
): EligibilityEvaluationResult {
  if (dStr > todayStr) {
    return { eligible: false, reason: 'future_date' }
  }

  const emp = canonicalEmp.primary

  if (isEmployeeResignedOnDate(emp.status, emp.resignation_date, dStr, todayStr)) {
    return { eligible: false, reason: 'resigned' }
  }

  // Must be Active on dStr (non-resigned non-active statuses like inactive, suspended, on_leave, csr are excluded)
  if (!isResignedStatus(emp.status) && !isActiveStatus(emp.status)) {
    return { eligible: false, reason: 'inactive_status' }
  }

  // Employees marked No Bio are excluded from biometric attendance monitoring and absence calculations
  if (emp.exclude_from_biometric) {
    return { eligible: false, reason: 'excluded_no_bio' }
  }

  // Must already be employed on dStr (check earliest hire / contract date if available)
  const startDate = getEffectiveStartDate(emp)
  if (startDate && startDate > dStr) {
    return { eligible: false, reason: 'not_yet_employed' }
  }

  // Check approved leaves across all canonical / alias Bio IDs for this employee
  for (const key of [...canonicalEmp.aliasBioIds, ...canonicalEmp.aliasCanonicalKeys]) {
    const empLeaves = employeeLeavesMap.get(key)
    if (empLeaves && empLeaves.some(l => l.startDate <= dStr && l.endDate >= dStr)) {
      return { eligible: false, reason: 'approved_leave' }
    }
  }

  return { eligible: true, reason: 'eligible' }
}

/**
 * Determines whether a DailyAttendanceRecord reflects actual work presence (and NOT leave/absent/empty).
 */
export function isValidAttendancePunchRecord(r: DailyAttendanceRecord): boolean {
  const lowerStatus = (r.status || '').trim().toLowerCase()
  if (lowerStatus === 'leave' || lowerStatus === 'on leave' || lowerStatus.includes('leave')) {
    return false
  }
  if (lowerStatus.includes('absent')) {
    return false
  }

  const hasExplicitIn = Boolean(
    r.actual_in &&
    !r.actual_in.startsWith('Missing') &&
    r.actual_in !== '—' &&
    r.actual_in !== '-'
  )

  return Boolean(
    hasExplicitIn ||
    (r.valid_punches_count || 0) > 0 ||
    r.status === 'Field Work' ||
    r.status === 'Awaiting OUT' ||
    r.status === 'Manual Time' ||
    r.status.includes('Present') ||
    r.status.includes('Late') ||
    r.status.includes('Regular Day')
  )
}

// Clear report cache whenever employee records change (e.g. status updated to Resigned/Active)
employeeService.onEmployeesChanged(() => {
  reportCache.clear()
})

export const reportsService = {
  /**
   * Generates aggregated HR attendance report summary for the requested filter
   */
  async getReportSummary(filters: ReportFilterOptions, forceRefresh = false): Promise<ReportSummaryResult> {
    const { preset, startDate, endDate, location = 'all', workGroupId = 'all', employeeBioId = 'all', department = 'all' } = filters
    const { start, end, label } = resolveDateRange(preset, startDate, endDate)

    const todayStr = getManilaDateString(new Date())
    const isSingleToday = start === todayStr && end === todayStr
    const isVolatilePreset = preset === 'today' || preset === 'yesterday' || preset === 'custom'
    const effectiveTtl = isSingleToday ? 10_000 : CACHE_TTL_MS

    const cacheKey = `${start}_${end}_${location}_${workGroupId}_${employeeBioId}_${department}`
    if (!forceRefresh && !isVolatilePreset && reportCache.has(cacheKey)) {
      const cached = reportCache.get(cacheKey)!
      if (Date.now() - cached.timestamp < effectiveTtl) {
        return cached.data
      }
    }

    const dateList = getDatesInRange(start, end)
    const bioFilter = employeeBioId && employeeBioId !== 'all' ? employeeBioId : undefined

    // Determine all calendar years spanned by dateList so holidayService covers multi-year ranges too
    const yearsInRange = Array.from(new Set(dateList.map(d => parseInt(d.slice(0, 4), 10)).filter(Boolean)))
    if (yearsInRange.length === 0) {
      yearsInRange.push(new Date().getFullYear())
    }

    // 1. Fetch daily records, employees, work groups, leaves, and holidays concurrently
    const [dailyRecordsArrays, allEmployees, workGroups, leaves, dbHolidays, holidayServiceResults] = await Promise.all([
      Promise.all(
        dateList.map(dateStr =>
          attendanceService.getDailyAttendance(dateStr, location, workGroupId, {}, bioFilter)
        )
      ),
      employeeService.getEmployees({
        location: location !== 'all' ? location : undefined,
        workGroupId: workGroupId !== 'all' ? workGroupId : undefined
      }),
      employeeService.getWorkGroups(),
      db.leaveRecords
        .where('status')
        .equals('Approved')
        .toArray()
        .catch(() => []),
      db.holidays
        .toArray()
        .catch(() => []),
      Promise.all(
        yearsInRange.map(yr =>
          holidayService.getHolidays(yr).catch(() => ({ holidays: [] as any[], activeSource: 'local' as const, isFallback: false }))
        )
      )
    ])

    // 2. Deduplicate employees by canonical Bio ID and same-person dual Bio IDs
    const { canonicalEmployees, lookupByAnyKey, mergedCount, mergedDuplicatePeople } = deduplicateEmployees(
      allEmployees,
      { singleBioFilter: bioFilter }
    )

    // Filter canonical employees by department and bioId if specified
    const scopedCanonicalEmployees = canonicalEmployees.filter(ce => {
      if (department !== 'all' && ce.primary.department !== department) return false
      if (bioFilter) {
        const filterNorm = normalizeBioIdKey(bioFilter)
        const matchesAlias = ce.aliasBioIds.has(bioFilter) || (filterNorm !== '' && ce.aliasCanonicalKeys.has(filterNorm))
        if (!matchesAlias) return false
      }
      return true
    })

    const workGroupMap = new Map(workGroups.map(wg => [wg.id, wg]))

    // Merge non-working holidays from both holidayService (Regular, Special Non-Working, Local, Custom) and db.holidays
    const holidayDateSet = new Set<string>()
    for (const h of dbHolidays) {
      if ((h as any).type !== 'Special Working') {
        holidayDateSet.add(h.date)
      }
    }
    for (const res of holidayServiceResults) {
      for (const h of res.holidays) {
        if (h.type !== 'Special Working') {
          holidayDateSet.add(h.date)
        }
      }
    }

    // Index approved leaves by both raw bioId and normalized canonical key
    const employeeLeavesMap = new Map<string, Array<{ startDate: string; endDate: string }>>()
    for (const l of leaves) {
      const keys = [l.bioId, normalizeBioIdKey(l.bioId)].filter(Boolean)
      for (const k of keys) {
        if (!employeeLeavesMap.has(k)) {
          employeeLeavesMap.set(k, [])
        }
        employeeLeavesMap.get(k)!.push({ startDate: l.startDate, endDate: l.endDate })
      }
    }

    // Audit population breakdown
    let diagActiveCount = 0
    let diagResignedCount = 0
    let diagInactiveOtherCount = 0
    for (const ce of scopedCanonicalEmployees) {
      const st = normalizeEmploymentStatus(ce.primary.status)
      if (isResignedStatus(st)) diagResignedCount++
      else if (isActiveStatus(st)) diagActiveCount++
      else diagInactiveOtherCount++
    }

    let diagExcludedNoBio = 0
    let diagExcludedNotYetEmployed = 0
    let diagExcludedRestDayOrHoliday = 0
    let diagExcludedApprovedLeave = 0
    const unmatchedPunchBioIdsSet = new Set<string>()

    // 3. Process daily aggregations & individual absence records
    let totalPresentDays = 0
    let totalLateDays = 0
    let totalMissingOutDays = 0
    let totalRenderedHours = 0
    let totalLateMinutes = 0
    let totalEligibleWorkdays = 0
    let scheduledWorkdaysCount = 0
    let inProgressCount = 0

    const uniqueEligibleKeys = new Set<string>()
    const uniquePresentKeys = new Set<string>()
    const uniqueLateKeys = new Set<string>()
    const uniqueMissingOutKeys = new Set<string>()

    const dayTrends: DayTrendPoint[] = []
    const lateByEmployee = new Map<string, { emp: DailyAttendanceRecord; lateCount: number; minutes: number; lastDate: string; lateRecords: LateAttendanceRecord[]; lateDates: string[] }>()
    const missingOutItems: MissingOutItem[] = []
    const allAbsentRecords: AbsentEmployeeRecord[] = []
    const absencesByEmployee = new Map<string, { emp: Employee; dates: string[] }>()

    let peakDayDate = start
    let peakDayHours = 0

    for (let i = 0; i < dateList.length; i++) {
      const dStr = dateList[i]
      const records = dailyRecordsArrays[i] || []

      const [dY, dM, dD] = dStr.split('-').map(Number)
      const dObj = new Date(Date.UTC(dY, dM - 1, dD))
      const dayName = dObj.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' })
      const shortLabel = dObj.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
      const dayOfWeek = dObj.getUTCDay()
      const isSunday = dayOfWeek === 0
      const isHoliday = holidayDateSet.has(dStr)
      const isFutureDate = dStr > todayStr
      const isToday = dStr === todayStr

      // Canonical keys & raw IDs of employees who attended on dStr
      const attendedKeysOnDay = new Set<string>()
      const countedPresentKeysOnDay = new Set<string>()

      let dayPresent = 0
      let dayLate = 0
      let dayMissingOut = 0
      let dayHours = 0

      for (const r of records) {
        const cleanKey = normalizeBioIdKey(r.biometric_user_id) || r.biometric_user_id
        const matchedCanonical = lookupByAnyKey.get(r.biometric_user_id) || lookupByAnyKey.get(cleanKey)
        if (!matchedCanonical && r.biometric_user_id) {
          unmatchedPunchBioIdsSet.add(r.biometric_user_id)
        }

        const empStatus = matchedCanonical?.primary.status ?? r.employee_status ?? 'active'
        const empResDate = matchedCanonical?.primary.resignation_date ?? r.resignation_date

        // Date-based resignation exclusion for Present
        if (isEmployeeResignedOnDate(empStatus, empResDate, dStr, todayStr)) {
          continue
        }

        const canonicalStatus = normalizeEmploymentStatus(empStatus)
        if (canonicalStatus === 'inactive' || canonicalStatus === 'suspended' || canonicalStatus === 'csr') {
          continue
        }
        if (isToday && !isActiveStatus(canonicalStatus)) {
          continue
        }

        // Apply department filter to record using canonical employee department
        const empDept = matchedCanonical?.primary.department || r.department || ''
        if (department !== 'all' && empDept !== department) {
          continue
        }

        if (isValidAttendancePunchRecord(r)) {
          const personKey = matchedCanonical?.canonicalKey || cleanKey
          attendedKeysOnDay.add(r.biometric_user_id)
          attendedKeysOnDay.add(cleanKey)
          attendedKeysOnDay.add(personKey)
          if (matchedCanonical) {
            for (const alias of matchedCanonical.aliasBioIds) attendedKeysOnDay.add(alias)
            for (const aliasNorm of matchedCanonical.aliasCanonicalKeys) attendedKeysOnDay.add(aliasNorm)
          }

          // Guard against double-counting same physical employee on same date (e.g. dual Bio IDs or 05007/5007)
          if (countedPresentKeysOnDay.has(personKey)) {
            continue
          }
          countedPresentKeysOnDay.add(personKey)
          uniquePresentKeys.add(personKey)

          dayPresent++
          dayHours += r.total_hours_decimal || 0

          if (r.late_minutes > 0) {
            dayLate++
            totalLateMinutes += r.late_minutes
            uniqueLateKeys.add(personKey)

            const empKey = matchedCanonical?.primary.biometric_user_id || r.biometric_user_id
            const dateKey = r.raw_date || dStr
            if (!lateByEmployee.has(empKey)) {
              lateByEmployee.set(empKey, { emp: r, lateCount: 0, minutes: 0, lastDate: dateKey, lateRecords: [], lateDates: [] })
            }
            const agg = lateByEmployee.get(empKey)!
            agg.lateCount++
            agg.minutes += r.late_minutes
            agg.lastDate = dateKey
            agg.lateRecords.push({
              date: dateKey,
              lateMinutes: r.late_minutes
            })
            if (!agg.lateDates.includes(dateKey)) {
              agg.lateDates.push(dateKey)
            }
          }

          const isMissingOut = !r.has_valid_out || r.status.includes('No OUT') || r.status === 'Awaiting OUT'
          if (isMissingOut) {
            dayMissingOut++
            uniqueMissingOutKeys.add(personKey)
            if (isSingleToday) {
              inProgressCount++
            }
            if (missingOutItems.length < 15) {
              const displayStatus = isToday ? 'Present / In Progress' : r.status
              missingOutItems.push({
                bioId: matchedCanonical?.primary.biometric_user_id || r.biometric_user_id,
                name: matchedCanonical?.primary.full_name || r.employee_name,
                date: r.date,
                timeIn: r.actual_in,
                workGroupName: r.work_group_name,
                status: displayStatus
              })
            }
          }
        }
      }

      totalPresentDays += dayPresent
      totalLateDays += dayLate
      totalMissingOutDays += dayMissingOut
      totalRenderedHours += dayHours

      if (dayHours > peakDayHours) {
        peakDayHours = dayHours
        peakDayDate = dStr
      }

      // Determine eligible expected employees & absent employees for this date:
      // Regular working days: Mon-Sat (not Sunday), not non-working holiday, and not a future date
      let dayAbsent = 0
      let dayExpected = 0

      if (!isSunday && !isHoliday && !isFutureDate) {
        scheduledWorkdaysCount++
        for (const ce of scopedCanonicalEmployees) {
          const eligibility = evaluateEmployeeEligibilityOnDate(ce, dStr, todayStr, employeeLeavesMap)
          if (!eligibility.eligible) {
            if (eligibility.reason === 'excluded_no_bio') diagExcludedNoBio++
            if (eligibility.reason === 'not_yet_employed') diagExcludedNotYetEmployed++
            if (eligibility.reason === 'approved_leave') diagExcludedApprovedLeave++
            continue
          }

          dayExpected++
          totalEligibleWorkdays++
          uniqueEligibleKeys.add(ce.canonicalKey)

          // Check if employee (or any of their alias Bio IDs) had attendance on dStr
          const emp = ce.primary
          const attended =
            attendedKeysOnDay.has(ce.canonicalKey) ||
            Array.from(ce.aliasBioIds).some(id => attendedKeysOnDay.has(id)) ||
            Array.from(ce.aliasCanonicalKeys).some(k => attendedKeysOnDay.has(k))

          if (!attended) {
            dayAbsent++

            const wg = workGroupMap.get(emp.work_group_id)
            const schedStr = wg ? `${wg.standard_in} - ${wg.expected_out} (${wg.name})` : '08:00 AM - 05:00 PM (Regular)'

            const absRec: AbsentEmployeeRecord = {
              id: `${emp.biometric_user_id}_${dStr}`,
              bioId: emp.biometric_user_id,
              employeeName: emp.full_name,
              department: emp.department || 'Operations',
              position: emp.position || 'Staff',
              workGroupName: wg?.name || 'GROUP C',
              date: dStr,
              dateDisplay: shortLabel,
              dayOfWeek: dayName,
              scheduledDuty: schedStr,
              status: 'Absent',
              remarks: 'No attendance recorded'
            }
            allAbsentRecords.push(absRec)

            if (!absencesByEmployee.has(ce.canonicalKey)) {
              absencesByEmployee.set(ce.canonicalKey, { emp, dates: [] })
            }
            absencesByEmployee.get(ce.canonicalKey)!.dates.push(dStr)
          }
        }
      } else {
        diagExcludedRestDayOrHoliday++
        // Sunday, Holiday, or Future Date: any rest/holiday duty already counted in dayPresent
        dayExpected = dayPresent
      }

      dayTrends.push({
        date: dStr,
        shortLabel,
        dayName,
        present: dayPresent,
        late: dayLate,
        absent: dayAbsent,
        missingOut: dayMissingOut,
        renderedHours: Number(dayHours.toFixed(1)),
        expectedScheduled: dayExpected
      })
    }

    const totalAbsentOccurrences = allAbsentRecords.length

    // Top absent employees
    const topAbsentEmployees: TopAbsentEmployee[] = Array.from(absencesByEmployee.values())
      .map(({ emp, dates }) => ({
        bioId: emp.biometric_user_id,
        name: emp.full_name,
        department: emp.department || 'Operations',
        position: emp.position || 'Staff',
        workGroupName: workGroupMap.get(emp.work_group_id)?.name || 'GROUP C',
        absentCount: dates.length,
        dates: [...dates].sort()
      }))
      .sort((a, b) => b.absentCount - a.absentCount || a.name.localeCompare(b.name))

    const uniqueAbsentEmployees = topAbsentEmployees.length
    const repeatedAbsenceEmployeesCount = topAbsentEmployees.filter(e => e.absentCount > 1).length

    // Top late employees
    const topLateEmployees: TopLateEmployee[] = Array.from(lateByEmployee.values())
      .map(({ emp, lateCount, minutes, lastDate, lateRecords, lateDates }) => ({
        bioId: emp.biometric_user_id,
        name: emp.employee_name,
        department: emp.department || 'Operations',
        workGroupName: emp.work_group_name,
        lateDays: lateCount,
        totalLateMinutes: minutes,
        avgLateMinutes: Math.round(minutes / (lateCount || 1)),
        latestLateDate: lastDate,
        lateRecords: [...lateRecords].sort((a, b) => a.date.localeCompare(b.date)),
        lateDates: [...lateDates].sort((a, b) => a.localeCompare(b))
      }))
      .sort((a, b) => b.lateDays - a.lateDays || b.totalLateMinutes - a.totalLateMinutes)
      .slice(0, 10)

    // Weekly & Monthly Trends
    const weekMap = new Map<string, { label: string; absentCount: number; eligible: number }>()
    const monthMap = new Map<string, { label: string; absentCount: number; eligible: number }>()

    for (const pt of dayTrends) {
      const [y, m, d] = pt.date.split('-').map(Number)
      const dObj = new Date(Date.UTC(y, m - 1, d))

      // Week
      const { key: wKey, label: wLabel } = getWeekKeyAndLabel(dObj)
      if (!weekMap.has(wKey)) {
        weekMap.set(wKey, { label: wLabel, absentCount: 0, eligible: 0 })
      }
      const wItem = weekMap.get(wKey)!
      wItem.absentCount += pt.absent
      wItem.eligible += pt.expectedScheduled

      // Month
      const mKey = `${y}-${String(m).padStart(2, '0')}`
      const mLabel = dObj.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' })
      if (!monthMap.has(mKey)) {
        monthMap.set(mKey, { label: mLabel, absentCount: 0, eligible: 0 })
      }
      const mItem = monthMap.get(mKey)!
      mItem.absentCount += pt.absent
      mItem.eligible += pt.expectedScheduled
    }

    const weeklyTrend: WeekTrendPoint[] = Array.from(weekMap.entries())
      .map(([weekKey, item]) => ({
        weekKey,
        label: item.label,
        absentCount: item.absentCount,
        eligibleWorkdays: item.eligible,
        absenceRate: item.eligible > 0 ? Number(((item.absentCount / item.eligible) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => a.weekKey.localeCompare(b.weekKey))

    const monthlyTrend: MonthTrendPoint[] = Array.from(monthMap.entries())
      .map(([monthKey, item]) => ({
        monthKey,
        label: item.label,
        absentCount: item.absentCount,
        eligibleWorkdays: item.eligible,
        absenceRate: item.eligible > 0 ? Number(((item.absentCount / item.eligible) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))

    // Department Distribution (using canonical deduplicated employees and unified date-based eligibility)
    const deptMap = new Map<string, { absentCount: number; bioIds: Set<string>; eligible: number }>()
    for (const rec of allAbsentRecords) {
      const dept = rec.department || 'Operations'
      if (!deptMap.has(dept)) {
        deptMap.set(dept, { absentCount: 0, bioIds: new Set(), eligible: 0 })
      }
      const dItem = deptMap.get(dept)!
      dItem.absentCount++
      dItem.bioIds.add(rec.bioId)
    }

    for (const ce of scopedCanonicalEmployees) {
      const dept = ce.primary.department || 'Operations'
      if (!deptMap.has(dept)) {
        deptMap.set(dept, { absentCount: 0, bioIds: new Set(), eligible: 0 })
      }
      let empEligible = 0
      for (const pt of dayTrends) {
        const [y, m, d] = pt.date.split('-').map(Number)
        const dObj = new Date(Date.UTC(y, m - 1, d))
        const isSun = dObj.getUTCDay() === 0
        const isHol = holidayDateSet.has(pt.date)
        if (isSun || isHol || pt.date > todayStr) continue

        if (!evaluateEmployeeEligibilityOnDate(ce, pt.date, todayStr, employeeLeavesMap).eligible) continue
        empEligible++
      }
      deptMap.get(dept)!.eligible += empEligible
    }

    const departmentDistribution: DepartmentAbsencePoint[] = Array.from(deptMap.entries())
      .map(([dept, data]) => ({
        department: dept,
        absentCount: data.absentCount,
        uniqueEmployees: data.bioIds.size,
        absenceRate: data.eligible > 0 ? Number(((data.absentCount / data.eligible) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => b.absentCount - a.absentCount || b.absenceRate - a.absenceRate)

    // Summary calculations
    const roundedTotalHours = Number(totalRenderedHours.toFixed(1))
    const avgDailyHours = totalPresentDays > 0 ? Number((totalRenderedHours / totalPresentDays).toFixed(1)) : 0
    const totalPotential = totalPresentDays + totalAbsentOccurrences
    const attendanceRate = totalPotential > 0 ? Math.round((totalPresentDays / totalPotential) * 100) : 100
    const absenceRate = totalEligibleWorkdays > 0
      ? Number(((totalAbsentOccurrences / totalEligibleWorkdays) * 100).toFixed(1))
      : (totalPotential > 0 ? Number(((totalAbsentOccurrences / totalPotential) * 100).toFixed(1)) : 0)

    const onTimeCount = Math.max(0, totalPresentDays - totalLateDays - inProgressCount)
    const breakdownTotal = (onTimeCount + inProgressCount + totalLateDays + totalAbsentOccurrences) || 1

    const statusBreakdown: AttendanceStatusBreakdown[] = isSingleToday && inProgressCount > 0
      ? [
          {
            label: 'Present (Completed)',
            count: onTimeCount,
            percentage: Math.round((onTimeCount / breakdownTotal) * 100),
            color: '#10b981' // emerald-500
          },
          {
            label: 'Present / In Progress',
            count: inProgressCount,
            percentage: Math.round((inProgressCount / breakdownTotal) * 100),
            color: '#3b82f6' // blue-500
          },
          {
            label: 'Late Arrival',
            count: totalLateDays,
            percentage: Math.round((totalLateDays / breakdownTotal) * 100),
            color: '#f59e0b' // amber-500
          },
          {
            label: 'Absent',
            count: totalAbsentOccurrences,
            percentage: Math.round((totalAbsentOccurrences / breakdownTotal) * 100),
            color: '#ef4444' // red-500
          }
        ]
      : [
          {
            label: 'Present (On-Time)',
            count: onTimeCount,
            percentage: Math.round((onTimeCount / breakdownTotal) * 100),
            color: '#10b981' // emerald-500
          },
          {
            label: 'Late Arrival',
            count: totalLateDays,
            percentage: Math.round((totalLateDays / breakdownTotal) * 100),
            color: '#f59e0b' // amber-500
          },
          ...(totalMissingOutDays > 0 ? [{
            label: 'Missing OUT',
            count: totalMissingOutDays,
            percentage: Math.round((totalMissingOutDays / breakdownTotal) * 100),
            color: '#6366f1' // indigo-500
          }] : []),
          {
            label: 'Absent',
            count: totalAbsentOccurrences,
            percentage: Math.round((totalAbsentOccurrences / breakdownTotal) * 100),
            color: '#ef4444' // red-500
          }
        ]

    // Diagnostics summary
    const diagnostics: ReportDiagnostics = {
      totalRegisteredRecords: allEmployees.length,
      deduplicatedEmployees: scopedCanonicalEmployees.length,
      duplicateRecordsMerged: mergedCount,
      activeEmployees: diagActiveCount,
      resignedEmployees: diagResignedCount,
      inactiveOrOtherStatusEmployees: diagInactiveOtherCount,
      excludedNoBio: diagExcludedNoBio,
      excludedNotYetEmployed: diagExcludedNotYetEmployed,
      excludedRestDayOrHoliday: diagExcludedRestDayOrHoliday,
      excludedApprovedLeave: diagExcludedApprovedLeave,
      employeesWithValidPunches: uniquePresentKeys.size,
      dailyValidPunchRecords: totalPresentDays,
      classifiedAbsentOccurrences: totalAbsentOccurrences,
      classifiedAbsentUniqueEmployees: uniqueAbsentEmployees,
      unmatchedPunchBioIds: Array.from(unmatchedPunchBioIdsSet),
      mergedDuplicatePeople
    }

    if (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV) {
      console.info('[ReportsService] Attendance & Eligibility Diagnostics:', {
        range: `${start}..${end} (${preset})`,
        ...diagnostics
      })
    }

    // Construct concise HR insights
    const insights: string[] = []
    if (isSingleToday && inProgressCount > 0) {
      insights.push(`${inProgressCount} employee shift${inProgressCount > 1 ? 's are' : ' is'} currently in progress (clocked IN, awaiting OUT). Classified as Present.`)
    }
    if (totalAbsentOccurrences > 0) {
      insights.push(`${totalAbsentOccurrences} total absence occurrence${totalAbsentOccurrences > 1 ? 's' : ''} across ${uniqueAbsentEmployees} unique employee${uniqueAbsentEmployees > 1 ? 's' : ''} (${absenceRate}% absence rate across ${uniqueEligibleKeys.size} eligible staff).`)
    } else {
      insights.push('100% active workforce presence recorded; zero unexcused absences detected across this reporting period.')
    }

    if (repeatedAbsenceEmployeesCount > 0) {
      insights.push(`${repeatedAbsenceEmployeesCount} employee${repeatedAbsenceEmployeesCount > 1 ? 's have' : ' has'} repeated absences (2+ missed shifts) requiring supervisory counseling.`)
    }

    if (totalLateDays > 0) {
      insights.push(`${totalLateDays} late attendance instance${totalLateDays > 1 ? 's' : ''} recorded (${uniqueLateKeys.size} unique employee${uniqueLateKeys.size > 1 ? 's' : ''}), totaling ${formatDuration(totalLateMinutes)} (${totalLateMinutes.toLocaleString()}m) lost time.`)
    } else {
      insights.push('Zero lateness instances recorded across this period.')
    }

    if (totalMissingOutDays > 0) {
      insights.push(`${totalMissingOutDays} punch record${totalMissingOutDays > 1 ? 's' : ''} have missing OUT scans requiring HR review or manual time adjustment.`)
    }

    insights.push(`Overall attendance rate is ${attendanceRate}% across ${dateList.length} date${dateList.length > 1 ? 's' : ''} (${uniquePresentKeys.size} unique present of ${uniqueEligibleKeys.size} eligible employees).`)

    if (topAbsentEmployees.length > 0) {
      const topAbs = topAbsentEmployees[0]
      insights.push(`Highest absence frequency: ${topAbs.name} (${topAbs.absentCount} missed shift${topAbs.absentCount > 1 ? 's' : ''}).`)
    }

    if (roundedTotalHours > 0) {
      insights.push(`Total rendered working time is ${roundedTotalHours.toLocaleString()} hrs (averaging ${avgDailyHours} hrs / employee-day).`)
    }

    const result: ReportSummaryResult = {
      dateRangeLabel: label,
      startDate: start,
      endDate: end,
      daysCount: dateList.length,
      kpis: {
        presentCount: totalPresentDays,
        lateCount: totalLateDays,
        absentCount: totalAbsentOccurrences,
        missingOutCount: totalMissingOutDays,
        totalRenderedHours: roundedTotalHours,
        avgDailyHours,
        attendanceRate,
        absenceRate,
        totalLateMinutes,
        uniqueEligibleEmployees: uniqueEligibleKeys.size,
        uniquePresentEmployees: uniquePresentKeys.size,
        uniqueLateEmployees: uniqueLateKeys.size,
        uniqueMissingOutEmployees: uniqueMissingOutKeys.size,
        uniqueAbsentEmployees,
        repeatedAbsenceEmployeesCount,
        totalEligibleWorkdays,
        scheduledWorkdaysCount
      },
      dailyTrend: dayTrends,
      weeklyTrend,
      monthlyTrend,
      departmentDistribution,
      topAbsentEmployees,
      absentRecords: allAbsentRecords,
      statusBreakdown,
      topLateEmployees,
      missingOutItems,
      renderedHours: {
        total: roundedTotalHours,
        average: avgDailyHours,
        peakDate: peakDayDate,
        peakHours: Number(peakDayHours.toFixed(1))
      },
      insights,
      diagnostics
    }

    reportCache.set(cacheKey, { timestamp: Date.now(), data: result })
    return result
  },

  /**
   * Clears memoized reports cache
   */
  clearCache() {
    reportCache.clear()
  }
}
