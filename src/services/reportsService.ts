/**
 * HR Attendance Reports Service
 *
 * Implements high-performance, non-duplicative aggregation of attendance data.
 * Reuses the authoritative Daily Attendance and Employee services.
 * Strictly adheres to date-based active, hire/contract, and resignation eligibility
 * as well as canonical Bio ID & duplicate-person deduplication.
 */

import { attendanceService, getManilaDateString, getManilaCurrentTime, type DailyAttendanceRecord } from './attendance'
import { employeeService } from './employees'
import { parseDateValue } from '@/repositories/employeeRepository'
import { holidayService } from './holidays/holidayService'
import { formatDuration } from '@/lib/timeUtils'
import { formatOnRestPeriodLabel, getActiveOnRestPeriodForDate, isEmployeeOnRestOnDate } from '@/lib/onRest'
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
  asOf?: Date // Optional reference timestamp (defaults to current time)
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

export interface WeeklyDailyAbsencePoint {
  date: string // YYYY-MM-DD
  shortDate: string // e.g. "Nov 15"
  dayName: string // e.g. "Sun"
  fullDateLabel: string // e.g. "Sun, Nov 15, 2026"
  absentCount: number
  eligibleWorkdays: number
  absenceRate: number
  isSunday: boolean
  isHoliday: boolean
  isFuture: boolean
}

export interface WeeklyAbsenceWindowGroup {
  weekStart: string // YYYY-MM-DD (Sunday)
  weekEnd: string // YYYY-MM-DD (Saturday)
  label: string // e.g. "Nov 15 – 21, 2026"
  shortRangeLabel: string // e.g. "Nov 15–21"
  days: WeeklyDailyAbsencePoint[]
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
  excludedOnRest: number
  employeesWithValidPunches: number
  dailyValidPunchRecords: number
  classifiedAbsentOccurrences: number
  classifiedAbsentUniqueEmployees: number
  unmatchedPunchBioIds: string[]
  mergedDuplicatePeople: Array<{ name: string; primaryBioId: string; aliasBioIds: string[] }>
}

export interface OnRestPunchReviewItem {
  bioId: string
  name: string
  department: string
  date: string
  punchesCount: number
  actualIn: string
  actualOut: string
  periodLabel: string
  remarks?: string
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
    onRestCount: number
    uniqueOnRestEmployees: number
    onRestPunchReviewCount: number
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
  weeklyDailyWindows: WeeklyAbsenceWindowGroup[]
  selectedWeekStart: string
  monthlyTrend: MonthTrendPoint[]
  departmentDistribution: DepartmentAbsencePoint[]
  topAbsentEmployees: TopAbsentEmployee[]
  absentRecords: AbsentEmployeeRecord[]
  statusBreakdown: AttendanceStatusBreakdown[]
  topLateEmployees: TopLateEmployee[]
  missingOutItems: MissingOutItem[]
  onRestPunchReviewItems: OnRestPunchReviewItem[]
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
  reason: 'eligible' | 'future_date' | 'resigned' | 'inactive_status' | 'excluded_no_bio' | 'not_yet_employed' | 'approved_leave' | 'on_rest'
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

export const ABSENCE_CUTOFF_HOUR = 9 // 9:00 AM Asia/Manila

/**
 * Determines whether the 9:00 AM absent reporting cutoff has been reached for date dStr.
 * - Past dates (< todayStr): true (cutoff already passed)
 * - Future dates (> todayStr): false
 * - Today (=== todayStr): true only from 9:00 AM onwards (hour >= 9 in Asia/Manila)
 */
export function isAbsenceCutoffReached(
  dStr: string,
  manilaNow: { hour: number; minute: number; dateStr: string } = getManilaCurrentTime()
): boolean {
  if (dStr > manilaNow.dateStr) return false
  if (dStr < manilaNow.dateStr) return true
  return manilaNow.hour >= ABSENCE_CUTOFF_HOUR
}

/**
 * Resolves start and end dates for predefined range presets
 */
export function resolveDateRange(
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string,
  referenceDate: Date = new Date()
): { start: string; end: string; label: string } {
  const todayStr = getManilaDateString(referenceDate)
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
 * Computes Sunday–Saturday calendar week bounds containing a YYYY-MM-DD date string (e.g. Nov 15–21, 2026)
 */
function getSundayWeekBounds(dateStr: string): {
  weekStart: string
  weekEnd: string
  label: string
  shortRangeLabel: string
} {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dObj = new Date(Date.UTC(y, m - 1, d))
  const sun = new Date(dObj)
  sun.setUTCDate(sun.getUTCDate() - dObj.getUTCDay())
  const sat = new Date(sun)
  sat.setUTCDate(sat.getUTCDate() + 6)

  const weekStart = getManilaDateString(sun)
  const weekEnd = getManilaDateString(sat)

  const sunMonth = sun.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short' })
  const satMonth = sat.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short' })
  const sunDay = sun.getUTCDate()
  const satDay = sat.getUTCDate()
  const sunYear = sun.getUTCFullYear()
  const satYear = sat.getUTCFullYear()

  let label = ''
  let shortRangeLabel = ''
  if (sunYear === satYear && sunMonth === satMonth) {
    label = `${sunMonth} ${sunDay} – ${satDay}, ${sunYear}`
    shortRangeLabel = `${sunMonth} ${sunDay}–${satDay}`
  } else if (sunYear === satYear) {
    label = `${sunMonth} ${sunDay} – ${satMonth} ${satDay}, ${sunYear}`
    shortRangeLabel = `${sunMonth} ${sunDay}–${satMonth} ${satDay}`
  } else {
    label = `${sunMonth} ${sunDay}, ${sunYear} – ${satMonth} ${satDay}, ${satYear}`
    shortRangeLabel = `${sunMonth} ${sunDay}–${satMonth} ${satDay}`
  }

  return { weekStart, weekEnd, label, shortRangeLabel }
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

function scoreEmployeeRecordRichness(emp: Employee): number {
  if (emp.is_merged || emp.merged_into_bio_id) return -1000
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

/**
 * Deduplicates employee records strictly by explicit canonical ID and administrator-confirmed
 * linked Biometric IDs (`biometric_ids` / `linked_bio_ids` / `primary_bio_id`).
 * Never automatically merges two distinct employee records solely because they have similar names.
 */
export function deduplicateEmployees(
  employees: Employee[],
  _options: { singleBioFilter?: string } = {}
): {
  canonicalEmployees: CanonicalEmployee[]
  lookupByAnyKey: Map<string, CanonicalEmployee>
  mergedCount: number
  mergedDuplicatePeople: Array<{ name: string; primaryBioId: string; aliasBioIds: string[] }>
} {
  const lookupByAnyKey = new Map<string, CanonicalEmployee>()
  const groups: CanonicalEmployee[] = []

  // Exclude archived/merged records; sort deterministically by canonical Bio ID then raw Bio ID
  const nonMergedEmployees = employees.filter(e => !e.is_merged && !e.merged_into_bio_id)
  const sortedEmployees = [...nonMergedEmployees].sort((a, b) => {
    const ka = normalizeBioIdKey(a.biometric_user_id) || String(a.biometric_user_id || '')
    const kb = normalizeBioIdKey(b.biometric_user_id) || String(b.biometric_user_id || '')
    const cmp = ka.localeCompare(kb)
    if (cmp !== 0) return cmp
    return String(a.biometric_user_id || '').localeCompare(String(b.biometric_user_id || ''))
  })

  const collectExplicitBioKeys = (emp: Employee): string[] => {
    const rawKeys = [
      emp.biometric_user_id,
      emp.canonical_bio_id,
      emp.primary_bio_id,
      emp.employee_number,
      emp.id,
      ...(Array.isArray(emp.linked_bio_ids) ? emp.linked_bio_ids : []),
      ...(Array.isArray(emp.merged_from_bio_ids) ? emp.merged_from_bio_ids : []),
      ...(Array.isArray(emp.biometric_ids) ? emp.biometric_ids.map(b => b.bioId) : [])
    ].filter(Boolean) as string[]
    return Array.from(new Set(rawKeys))
  }

  const registerKeys = (group: CanonicalEmployee, emp: Employee) => {
    const rawKeys = collectExplicitBioKeys(emp)
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

  for (const emp of sortedEmployees) {
    const bioNorm = normalizeBioIdKey(emp.biometric_user_id)
    const numNorm = normalizeBioIdKey(emp.employee_number)

    // Match strictly by canonical ID or explicit linked Biometric IDs (never auto-merge by name)
    let targetGroup =
      lookupByAnyKey.get(emp.biometric_user_id) ||
      (bioNorm ? lookupByAnyKey.get(bioNorm) : undefined) ||
      (numNorm ? lookupByAnyKey.get(numNorm) : undefined)

    if (!targetGroup) {
      for (const k of collectExplicitBioKeys(emp)) {
        const nk = normalizeBioIdKey(k)
        targetGroup = lookupByAnyKey.get(k) || (nk ? lookupByAnyKey.get(nk) : undefined)
        if (targetGroup) break
      }
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

  const mergedCount = nonMergedEmployees.length - groups.length
  return { canonicalEmployees: groups, lookupByAnyKey, mergedCount, mergedDuplicatePeople }
}

/**
 * Checks whether an employee is resigned as of a specific date dStr.
 * - Any employee whose current status is Resigned is always treated as resigned across all dates
 *   so historical reports never re-classify resigned employees as Absent/Present based on PC clock or import date.
 * - Non-resigned records with an explicit resignation_date <= dStr are also treated as resigned from that date onward.
 */
export function isEmployeeResignedOnDate(
  status?: string | null,
  resignationDate?: string | null,
  dStr?: string,
  todayStr?: string
): boolean {
  if (isResignedStatus(status)) {
    return true
  }

  const resDate = normalizeEmployeeDate(resignationDate)
  const targetDate = dStr || todayStr || ''
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

  // Must be Active on dStr (non-active statuses like resigned, inactive, suspended, on_leave, csr are excluded)
  if (!isActiveStatus(emp.status)) {
    return { eligible: false, reason: 'inactive_status' }
  }

  // Employees marked No Bio are excluded from biometric attendance monitoring and absence calculations
  const isExcludedNoBio =
    Boolean(emp.exclude_from_biometric) ||
    canonicalEmp.mergedRecords.some(r => isActiveStatus(r.status) && Boolean(r.exclude_from_biometric))
  if (isExcludedNoBio) {
    return { eligible: false, reason: 'excluded_no_bio' }
  }

  // Must already be employed on dStr (check earliest hire / contract date if available)
  const startDate = getEffectiveStartDate(emp)
  if (startDate && startDate > dStr) {
    return { eligible: false, reason: 'not_yet_employed' }
  }

  // Exclude employees currently assigned "On Rest" for dStr (without changing Active employment status)
  if (
    isEmployeeOnRestOnDate(emp, dStr) ||
    canonicalEmp.mergedRecords.some(r => isEmployeeOnRestOnDate(r, dStr))
  ) {
    return { eligible: false, reason: 'on_rest' }
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
 * Determines whether a DailyAttendanceRecord reflects actual work presence (and NOT leave/absent/on-rest/empty).
 */
export function isValidAttendancePunchRecord(r: DailyAttendanceRecord): boolean {
  const lowerStatus = (r.status || '').trim().toLowerCase()
  if (r.is_on_rest || lowerStatus === 'on rest') {
    return false
  }
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

// Clear report cache synchronously whenever employee records change (e.g. consolidation or status change)
employeeService.onEmployeesChangedImmediate(() => {
  reportCache.clear()
})
employeeService.onEmployeesChanged(() => {
  reportCache.clear()
})

export const reportsService = {
  /**
   * Generates aggregated HR attendance report summary for the requested filter
   */
  async getReportSummary(filters: ReportFilterOptions, forceRefresh = false): Promise<ReportSummaryResult> {
    const { preset, startDate, endDate, location = 'all', workGroupId = 'all', employeeBioId = 'all', department = 'all', asOf } = filters
    const referenceDate = asOf ?? new Date()
    const manilaNow = getManilaCurrentTime(referenceDate)
    const todayStr = manilaNow.dateStr
    const { start, end, label } = resolveDateRange(preset, startDate, endDate, referenceDate)

    const isSingleToday = start === todayStr && end === todayStr
    const isVolatilePreset = preset === 'today' || preset === 'yesterday' || preset === 'custom'
    const effectiveTtl = isSingleToday ? 10_000 : CACHE_TTL_MS
    const cutoffPhase = manilaNow.hour >= ABSENCE_CUTOFF_HOUR ? 'after9' : 'before9'

    const cacheKey = `${start}_${end}_${location}_${workGroupId}_${employeeBioId}_${department}_${todayStr}_${cutoffPhase}`
    if (!asOf && !forceRefresh && !isVolatilePreset && reportCache.has(cacheKey)) {
      const cached = reportCache.get(cacheKey)!
      if (Date.now() - cached.timestamp < effectiveTtl) {
        return cached.data
      }
    }

    const dateList = getDatesInRange(start, end)
    const bioFilter = employeeBioId && employeeBioId !== 'all' ? employeeBioId : undefined

    // Determine Weekly (previous month through current week) and Monthly (last 3 months including current month) windows
    const [ty, tm, td] = todayStr.split('-').map(Number)
    const todayUtc = new Date(Date.UTC(ty, tm - 1, td))
    const monthlyStartDate = new Date(Date.UTC(ty, tm - 3, 1))
    const monthlyStartStr = getManilaDateString(monthlyStartDate)

    const prevMonthFirstDate = new Date(Date.UTC(ty, tm - 2, 1))
    const prevMonthDay = prevMonthFirstDate.getUTCDay()
    const diffToMon = prevMonthDay === 0 ? -6 : 1 - prevMonthDay
    const weeklyStartDate = new Date(prevMonthFirstDate)
    weeklyStartDate.setUTCDate(weeklyStartDate.getUTCDate() + diffToMon)
    const weeklyStartStr = getManilaDateString(weeklyStartDate)

    const trendStartStr = monthlyStartStr <= weeklyStartStr ? monthlyStartStr : weeklyStartStr
    const trendEndStr = todayStr

    // Selected 7-day Sunday–Saturday week anchored to the active Period filter
    const selectedWeekAnchorStr = preset === 'last_week' ? start : end
    const selectedWeekBounds = getSundayWeekBounds(selectedWeekAnchorStr)
    const needsExtraWeekFetch = selectedWeekBounds.weekStart < trendStartStr

    // Determine all calendar years spanned by dateList, trend window, and selected week so holidayService covers multi-year ranges too
    const yearsInRangeSet = new Set(dateList.map(d => parseInt(d.slice(0, 4), 10)).filter(Boolean))
    for (const ds of [trendStartStr, trendEndStr, selectedWeekBounds.weekStart, selectedWeekBounds.weekEnd]) {
      const yr = parseInt(ds.slice(0, 4), 10)
      if (yr) yearsInRangeSet.add(yr)
    }
    if (yearsInRangeSet.size === 0) {
      yearsInRangeSet.add(new Date().getFullYear())
    }
    const yearsInRange = Array.from(yearsInRangeSet)

    // 1. Fetch daily records, employees, work groups, leaves, holidays, and 3-month raw activity concurrently
    const [
      dailyRecordsArrays,
      allEmployees,
      workGroups,
      leaves,
      dbHolidays,
      holidayServiceResults,
      trendPunches,
      trendManualAdjustments,
      extraWeekPunches,
      extraWeekAdjustments
    ] = await Promise.all([
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
      ),
      db.biometricPunches
        .where('date')
        .between(trendStartStr, trendEndStr, true, true)
        .toArray()
        .catch(() => []),
      db.manualAdjustments
        .where('date')
        .between(trendStartStr, trendEndStr, true, true)
        .toArray()
        .catch(() => []),
      needsExtraWeekFetch
        ? db.biometricPunches
            .where('date')
            .between(selectedWeekBounds.weekStart, selectedWeekBounds.weekEnd, true, true)
            .toArray()
            .catch(() => [])
        : Promise.resolve([]),
      needsExtraWeekFetch
        ? db.manualAdjustments
            .where('date')
            .between(selectedWeekBounds.weekStart, selectedWeekBounds.weekEnd, true, true)
            .toArray()
            .catch(() => [])
        : Promise.resolve([])
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
    let diagExcludedOnRest = 0
    const unmatchedPunchBioIdsSet = new Set<string>()

    // 3. Process daily aggregations & individual absence records
    let totalPresentDays = 0
    let totalLateDays = 0
    let totalMissingOutDays = 0
    let totalOnRestDays = 0
    let totalRenderedHours = 0
    let totalLateMinutes = 0
    let totalEligibleWorkdays = 0
    let scheduledWorkdaysCount = 0
    let inProgressCount = 0

    const uniqueEligibleKeys = new Set<string>()
    const uniquePresentKeys = new Set<string>()
    const uniqueLateKeys = new Set<string>()
    const uniqueMissingOutKeys = new Set<string>()
    const uniqueOnRestKeys = new Set<string>()

    const dayTrends: DayTrendPoint[] = []
    const lateByEmployee = new Map<string, { emp: DailyAttendanceRecord; lateCount: number; minutes: number; lastDate: string; lateRecords: LateAttendanceRecord[]; lateDates: string[] }>()
    const missingOutItems: MissingOutItem[] = []
    const onRestPunchReviewItems: OnRestPunchReviewItem[] = []
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
      const countedOnRestKeysOnDay = new Set<string>()

      let dayPresent = 0
      let dayLate = 0
      let dayMissingOut = 0
      let dayHours = 0

      for (const r of records) {
        const cleanKey = normalizeBioIdKey(r.biometric_user_id) || r.biometric_user_id
        let matchedCanonical = lookupByAnyKey.get(r.biometric_user_id) || lookupByAnyKey.get(cleanKey)
        if (!matchedCanonical && r.primary_bio_id) {
          const pNorm = normalizeBioIdKey(r.primary_bio_id)
          matchedCanonical = lookupByAnyKey.get(r.primary_bio_id) || (pNorm ? lookupByAnyKey.get(pNorm) : undefined)
        }
        if (!matchedCanonical && Array.isArray(r.source_bio_ids)) {
          for (const sid of r.source_bio_ids) {
            const sNorm = normalizeBioIdKey(sid)
            matchedCanonical = lookupByAnyKey.get(sid) || (sNorm ? lookupByAnyKey.get(sNorm) : undefined)
            if (matchedCanonical) break
          }
        }
        if (!matchedCanonical) {
          if (r.biometric_user_id) {
            unmatchedPunchBioIdsSet.add(r.biometric_user_id)
          }
          continue
        }

        const empStatus = matchedCanonical.primary.status ?? r.employee_status ?? 'active'
        const empResDate = matchedCanonical.primary.resignation_date ?? r.resignation_date

        // Exclude Active - NB (No Bio) employees from biometric attendance counts
        const isExcludedNoBio =
          Boolean(matchedCanonical.primary.exclude_from_biometric) ||
          matchedCanonical.mergedRecords.some(m => isActiveStatus(m.status) && Boolean(m.exclude_from_biometric))
        if (isExcludedNoBio) {
          continue
        }

        // Date-based resignation exclusion for Present
        if (isEmployeeResignedOnDate(empStatus, empResDate, dStr, todayStr)) {
          continue
        }

        const canonicalStatus = normalizeEmploymentStatus(empStatus)
        if (!isActiveStatus(canonicalStatus)) {
          continue
        }

        // Apply department filter to record using canonical employee department
        const empDept = matchedCanonical?.primary.department || r.department || ''
        if (department !== 'all' && empDept !== department) {
          continue
        }

        // Handle On Rest status separately — excluded from Present, Late, Missing OUT, Undertime, and Absent
        const isRecordOnRest =
          Boolean(r.is_on_rest) ||
          (r.status || '').trim().toLowerCase() === 'on rest' ||
          isEmployeeOnRestOnDate(matchedCanonical.primary, dStr)

        if (isRecordOnRest) {
          const personKey = matchedCanonical.canonicalKey || cleanKey
          if (!countedOnRestKeysOnDay.has(personKey)) {
            countedOnRestKeysOnDay.add(personKey)
            uniqueOnRestKeys.add(personKey)
            totalOnRestDays++

            const hasPunchesDuringRest =
              Boolean(r.has_punches_during_on_rest) ||
              (r.raw_punches_count || 0) > 0 ||
              (r.valid_punches_count || 0) > 0 ||
              (r.actual_in !== undefined && r.actual_in !== '-' && r.actual_in !== '—' && !r.actual_in.startsWith('Missing'))

            if (hasPunchesDuringRest) {
              const restPeriod = r.on_rest_period || getActiveOnRestPeriodForDate(matchedCanonical.primary, dStr)
              onRestPunchReviewItems.push({
                bioId: matchedCanonical.primary.biometric_user_id || r.biometric_user_id,
                name: matchedCanonical.primary.full_name || r.employee_name,
                department: empDept || 'Operations',
                date: dStr,
                punchesCount: r.raw_punches_count || r.valid_punches_count || 1,
                actualIn: r.actual_in || '-',
                actualOut: r.actual_out || '-',
                periodLabel: restPeriod ? formatOnRestPeriodLabel(restPeriod) : 'Assigned On Rest',
                remarks: restPeriod?.remarks
              })
            }
          }
          continue
        }

        if (isValidAttendancePunchRecord(r)) {
          const personKey = matchedCanonical?.canonicalKey || cleanKey
          attendedKeysOnDay.add(r.biometric_user_id)
          attendedKeysOnDay.add(cleanKey)
          attendedKeysOnDay.add(personKey)
          if (r.primary_bio_id) {
            attendedKeysOnDay.add(r.primary_bio_id)
            const pn = normalizeBioIdKey(r.primary_bio_id)
            if (pn) attendedKeysOnDay.add(pn)
          }
          if (Array.isArray(r.source_bio_ids)) {
            for (const sid of r.source_bio_ids) {
              attendedKeysOnDay.add(sid)
              const sn = normalizeBioIdKey(sid)
              if (sn) attendedKeysOnDay.add(sn)
            }
          }
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
        const absenceCutoffReached = isAbsenceCutoffReached(dStr, manilaNow)
        for (const ce of scopedCanonicalEmployees) {
          const eligibility = evaluateEmployeeEligibilityOnDate(ce, dStr, todayStr, employeeLeavesMap)
          if (!eligibility.eligible) {
            if (eligibility.reason === 'excluded_no_bio') diagExcludedNoBio++
            if (eligibility.reason === 'not_yet_employed') diagExcludedNotYetEmployed++
            if (eligibility.reason === 'approved_leave') diagExcludedApprovedLeave++
            if (eligibility.reason === 'on_rest') {
              diagExcludedOnRest++
              if (!countedOnRestKeysOnDay.has(ce.canonicalKey)) {
                countedOnRestKeysOnDay.add(ce.canonicalKey)
                uniqueOnRestKeys.add(ce.canonicalKey)
                totalOnRestDays++
              }
            }
            continue
          }

          dayExpected++
          totalEligibleWorkdays++
          uniqueEligibleKeys.add(ce.canonicalKey)

          // Check if employee (or any of their alias Bio IDs) had a valid attendance punch on dStr
          const emp = ce.primary
          const attended =
            attendedKeysOnDay.has(ce.canonicalKey) ||
            Array.from(ce.aliasBioIds).some(id => attendedKeysOnDay.has(id)) ||
            Array.from(ce.aliasCanonicalKeys).some(k => attendedKeysOnDay.has(k))

          // 9:00 AM cutoff: before 9:00 AM on Today, do not classify un-punched employees as Absent.
          // From 9:00 AM onwards (and on all past dates), count as Absent only if no valid IN punch exists.
          if (!attended && absenceCutoffReached) {
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
    // - Weekly view: all weeks from the previous month through the current month, including the current week
    // - Monthly view: last 3 months, including the current month
    const weekMap = new Map<string, { label: string; absentCount: number; eligible: number }>()
    const monthMap = new Map<string, { label: string; absentCount: number; eligible: number }>()

    // Pre-seed all weeks from previous month's first week through the current week
    const curWeekCursor = new Date(weeklyStartDate)
    while (curWeekCursor <= todayUtc) {
      const { key: wKey, label: wLabel } = getWeekKeyAndLabel(curWeekCursor)
      if (!weekMap.has(wKey)) {
        weekMap.set(wKey, { label: wLabel, absentCount: 0, eligible: 0 })
      }
      curWeekCursor.setUTCDate(curWeekCursor.getUTCDate() + 7)
    }
    const { key: currentWeekKey, label: currentWeekLabel } = getWeekKeyAndLabel(todayUtc)
    if (!weekMap.has(currentWeekKey)) {
      weekMap.set(currentWeekKey, { label: currentWeekLabel, absentCount: 0, eligible: 0 })
    }

    // Pre-seed last 3 months including the current month
    for (const offset of [-2, -1, 0]) {
      const mDate = new Date(Date.UTC(ty, tm - 1 + offset, 1))
      const mY = mDate.getUTCFullYear()
      const mM = mDate.getUTCMonth() + 1
      const mKey = `${mY}-${String(mM).padStart(2, '0')}`
      const mLabel = mDate.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' })
      monthMap.set(mKey, { label: mLabel, absentCount: 0, eligible: 0 })
    }

    // Reuse exact dayTrends stats for dates within the active report filter range
    const periodDayStatsByDate = new Map<string, { absent: number; expectedScheduled: number }>()
    for (const pt of dayTrends) {
      periodDayStatsByDate.set(pt.date, {
        absent: pt.absent,
        expectedScheduled: pt.expectedScheduled
      })
    }

    // Index raw biometric punches and approved manual adjustments across the 3-month trend window
    const punchedCanonicalKeysByDate = new Map<string, Set<string>>()
    const addCanonicalPresenceOnDate = (dateStr?: string | null, rawBioId?: string | null) => {
      if (!dateStr || !rawBioId) return
      const cleanKey = normalizeBioIdKey(rawBioId) || rawBioId
      const matched = lookupByAnyKey.get(rawBioId) || lookupByAnyKey.get(cleanKey)
      if (!matched) return
      if (!punchedCanonicalKeysByDate.has(dateStr)) {
        punchedCanonicalKeysByDate.set(dateStr, new Set<string>())
      }
      punchedCanonicalKeysByDate.get(dateStr)!.add(matched.canonicalKey)
    }

    for (const p of trendPunches) {
      addCanonicalPresenceOnDate(p.date, p.bioId)
    }
    for (const p of extraWeekPunches) {
      addCanonicalPresenceOnDate(p.date, p.bioId)
    }
    for (const adj of trendManualAdjustments) {
      if (adj.status === 'Approved') {
        addCanonicalPresenceOnDate(adj.date, adj.bioId)
      }
    }
    for (const adj of extraWeekAdjustments) {
      if (adj.status === 'Approved') {
        addCanonicalPresenceOnDate(adj.date, adj.bioId)
      }
    }

    const computeDayAbsenceStats = (dStr: string): { absent: number; eligible: number } => {
      const existingStats = periodDayStatsByDate.get(dStr)
      if (existingStats) {
        return {
          absent: existingStats.absent,
          eligible: existingStats.expectedScheduled
        }
      }

      const [y, m, d] = dStr.split('-').map(Number)
      const dObj = new Date(Date.UTC(y, m - 1, d))
      const isSun = dObj.getUTCDay() === 0
      const isHol = holidayDateSet.has(dStr)
      const punchedOnDay = punchedCanonicalKeysByDate.get(dStr)

      let dayAbs = 0
      let dayElig = 0

      if (!isSun && !isHol && dStr <= todayStr) {
        const absenceCutoffReached = isAbsenceCutoffReached(dStr, manilaNow)
        for (const ce of scopedCanonicalEmployees) {
          const elig = evaluateEmployeeEligibilityOnDate(ce, dStr, todayStr, employeeLeavesMap)
          if (!elig.eligible) continue
          dayElig++
          if (absenceCutoffReached && (!punchedOnDay || !punchedOnDay.has(ce.canonicalKey))) {
            dayAbs++
          }
        }
      } else if (punchedOnDay && punchedOnDay.size > 0 && dStr <= todayStr) {
        for (const ce of scopedCanonicalEmployees) {
          if (!punchedOnDay.has(ce.canonicalKey)) continue
          const emp = ce.primary
          if (emp.exclude_from_biometric || ce.mergedRecords.some(r => isActiveStatus(r.status) && Boolean(r.exclude_from_biometric))) {
            continue
          }
          if (isEmployeeResignedOnDate(emp.status, emp.resignation_date, dStr, todayStr)) continue
          if (!isActiveStatus(emp.status)) continue
          if (isEmployeeOnRestOnDate(emp, dStr)) continue
          dayElig++
        }
      }

      return { absent: dayAbs, eligible: dayElig }
    }

    const dailyStatsByDate = new Map<string, { absent: number; eligible: number }>()
    const trendDates = getDatesInRange(trendStartStr, trendEndStr)
    for (const dStr of trendDates) {
      const [y, m, d] = dStr.split('-').map(Number)
      const dObj = new Date(Date.UTC(y, m - 1, d))

      const stats = computeDayAbsenceStats(dStr)
      dailyStatsByDate.set(dStr, stats)

      // Accumulate into Weekly view if week falls within previous month .. current week
      const { key: wKey } = getWeekKeyAndLabel(dObj)
      const wItem = weekMap.get(wKey)
      if (wItem) {
        wItem.absentCount += stats.absent
        wItem.eligible += stats.eligible
      }

      // Accumulate into Monthly view if date falls within last 3 months
      if (dStr >= monthlyStartStr) {
        const mKey = `${y}-${String(m).padStart(2, '0')}`
        const mItem = monthMap.get(mKey)
        if (mItem) {
          mItem.absentCount += stats.absent
          mItem.eligible += stats.eligible
        }
      }
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

    // Build 7-day Sunday–Saturday windows (previous month through current week + active selected week)
    const firstSundayWeekStart = getSundayWeekBounds(getManilaDateString(prevMonthFirstDate)).weekStart
    const currentSundayWeekStart = getSundayWeekBounds(todayStr).weekStart
    const weekWindowStarts = new Set<string>()
    const [swY, swM, swD] = firstSundayWeekStart.split('-').map(Number)
    const sunCursor = new Date(Date.UTC(swY, swM - 1, swD))
    const [cwY, cwM, cwD] = currentSundayWeekStart.split('-').map(Number)
    const currentSunUtc = new Date(Date.UTC(cwY, cwM - 1, cwD))
    while (sunCursor <= currentSunUtc) {
      weekWindowStarts.add(getManilaDateString(sunCursor))
      sunCursor.setUTCDate(sunCursor.getUTCDate() + 7)
    }
    weekWindowStarts.add(selectedWeekBounds.weekStart)

    const weeklyDailyWindows: WeeklyAbsenceWindowGroup[] = Array.from(weekWindowStarts)
      .sort((a, b) => a.localeCompare(b))
      .map((wStart) => {
        const bounds = getSundayWeekBounds(wStart)
        const daysList = getDatesInRange(bounds.weekStart, bounds.weekEnd)
        const days: WeeklyDailyAbsencePoint[] = daysList.map((dStr) => {
          const [y, m, d] = dStr.split('-').map(Number)
          const dObj = new Date(Date.UTC(y, m - 1, d))
          const isSun = dObj.getUTCDay() === 0
          const isHol = holidayDateSet.has(dStr)
          const isFuture = dStr > todayStr
          let stats = dailyStatsByDate.get(dStr)
          if (!stats) {
            stats = dStr <= todayStr ? computeDayAbsenceStats(dStr) : { absent: 0, eligible: 0 }
            dailyStatsByDate.set(dStr, stats)
          }
          return {
            date: dStr,
            shortDate: dObj.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }),
            dayName: dObj.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' }),
            fullDateLabel: dObj.toLocaleDateString('en-US', {
              timeZone: 'UTC',
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            }),
            absentCount: stats.absent,
            eligibleWorkdays: stats.eligible,
            absenceRate: stats.eligible > 0 ? Number(((stats.absent / stats.eligible) * 100).toFixed(1)) : 0,
            isSunday: isSun,
            isHoliday: isHol,
            isFuture
          }
        })
        return {
          weekStart: bounds.weekStart,
          weekEnd: bounds.weekEnd,
          label: bounds.label,
          shortRangeLabel: bounds.shortRangeLabel,
          days
        }
      })

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
    const breakdownTotal = (onTimeCount + inProgressCount + totalLateDays + totalAbsentOccurrences + (totalOnRestDays > 0 ? totalOnRestDays : 0)) || 1

    const onRestBreakdownSlice: AttendanceStatusBreakdown[] = totalOnRestDays > 0
      ? [{
          label: 'On Rest',
          count: totalOnRestDays,
          percentage: Math.round((totalOnRestDays / breakdownTotal) * 100),
          color: '#0ea5e9' // sky-500
        }]
      : []

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
          },
          ...onRestBreakdownSlice
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
          },
          ...onRestBreakdownSlice
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
      excludedOnRest: diagExcludedOnRest,
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
    const todayCutoffReached = isAbsenceCutoffReached(todayStr, manilaNow)
    if (isSingleToday && !todayCutoffReached) {
      insights.push('Before 9:00 AM cutoff: employees without a biometric IN punch yet are not classified as Absent.')
    }
    if (isSingleToday && inProgressCount > 0) {
      insights.push(`${inProgressCount} employee shift${inProgressCount > 1 ? 's are' : ' is'} currently in progress (clocked IN, awaiting OUT). Classified as Present.`)
    }
    if (totalAbsentOccurrences > 0) {
      insights.push(`${totalAbsentOccurrences} total absence occurrence${totalAbsentOccurrences > 1 ? 's' : ''} across ${uniqueAbsentEmployees} unique employee${uniqueAbsentEmployees > 1 ? 's' : ''} (${absenceRate}% absence rate across ${uniqueEligibleKeys.size} eligible staff).`)
    } else if (isSingleToday && !todayCutoffReached) {
      insights.push(`0 absences classified before the 9:00 AM cutoff (${uniquePresentKeys.size} of ${uniqueEligibleKeys.size} eligible staff clocked IN so far).`)
    } else {
      insights.push('100% active workforce presence recorded; zero unexcused absences detected across this reporting period.')
    }

    if (totalOnRestDays > 0) {
      insights.push(`${totalOnRestDays} On Rest employee-day${totalOnRestDays > 1 ? 's' : ''} (${uniqueOnRestKeys.size} unique employee${uniqueOnRestKeys.size > 1 ? 's' : ''}) excluded from Absent, Present, Late, Undertime, and absence-rate calculations.`)
    }
    if (onRestPunchReviewItems.length > 0) {
      insights.push(`${onRestPunchReviewItems.length} biometric punch record${onRestPunchReviewItems.length > 1 ? 's' : ''} occurred during assigned On Rest periods and ${onRestPunchReviewItems.length > 1 ? 'are' : 'is'} flagged for HR review.`)
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
        onRestCount: totalOnRestDays,
        uniqueOnRestEmployees: uniqueOnRestKeys.size,
        onRestPunchReviewCount: onRestPunchReviewItems.length,
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
      weeklyDailyWindows,
      selectedWeekStart: selectedWeekBounds.weekStart,
      monthlyTrend,
      departmentDistribution,
      topAbsentEmployees,
      absentRecords: allAbsentRecords,
      statusBreakdown,
      topLateEmployees,
      missingOutItems,
      onRestPunchReviewItems,
      renderedHours: {
        total: roundedTotalHours,
        average: avgDailyHours,
        peakDate: peakDayDate,
        peakHours: Number(peakDayHours.toFixed(1))
      },
      insights,
      diagnostics
    }

    if (!asOf) {
      reportCache.set(cacheKey, { timestamp: Date.now(), data: result })
    }
    return result
  },

  /**
   * Clears memoized reports cache
   */
  clearCache() {
    reportCache.clear()
  }
}
