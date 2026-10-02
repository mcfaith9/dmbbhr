/**
 * Biometric Attendance Interpretation Engine
 *
 * Implements:
 * - Dynamic Work Group standard schedules (GROUP A: 6am-3pm, GROUP B: 7am-4pm, GROUP C: 8am-5pm)
 * - Automatic Expected OUT calculation excluding configured unpaid lunch break (default 12:00 PM - 1:00 PM)
 * - Exact Late Minutes calculation against employee's Work Group Standard IN (never negative)
 * - Exact Early Out Minutes calculation against employee's Work Group Expected OUT
 * - Clean separation between Raw Biometric Logs and Daily Attendance Interpretation
 * - Preservation of ALL raw punch records for auditability (no deletion of duplicates)
 * - First valid punch in a cluster treated as primary; subsequent close scans classified as duplicate/repeated scans
 * - Shift-start single punch (e.g. 8:07 AM on 8am-5pm) -> IN = 8:07 AM, OUT = missing, Status = Single Punch — No OUT
 * - Shift-end single punch (e.g. 5:20 PM on 8am-5pm) -> IN = Missing (Manual Request Required), OUT = 5:20 PM, Status = Likely OUT — Missing IN
 * - Zero automatic fabrication of fake biometric data
 * - Integration with Manual / Paper Request adjustments
 * - Strict Philippine Standard Time handling (Asia/Manila UTC+8)
 */

import type { AttendanceLog } from '@/types'
import type { ManualAttendanceRecord } from '@/db'
import { calculateExpectedOutMinutes, formatTime12h } from '@/repositories/workGroupRepository'

export interface AttendanceEngineConfig {
  duplicatePunchThresholdSeconds: number // e.g. 60s
  minSessionDurationMinutes: number // e.g. 30m
  attendanceOutCutoffHour: number // 19 (7:00 PM)
}

export const DEFAULT_ATTENDANCE_CONFIG: AttendanceEngineConfig = {
  duplicatePunchThresholdSeconds: 60,
  minSessionDurationMinutes: 30,
  attendanceOutCutoffHour: 19 // 7:00 PM
}

export interface EmployeeScheduleContext {
  bioId: string
  name: string
  department?: string
  location: string
  workGroupId?: string
  workGroupName?: string
  standardIn?: string // "06:00", "07:00", "08:00"
  requiredWorkMinutes?: number // 480
  lunchStart?: string // "12:00"
  lunchEnd?: string // "13:00"
  gracePeriodMinutes?: number
  manualAdjustment?: ManualAttendanceRecord
}

export interface ScanItem {
  id: string
  timeFormatted: string
  timestampMs: number
  isPrimary: boolean
  duplicateOf?: string
  diffSeconds?: number
  type: number
  state: number
  deviceName?: string
  deviceIp?: string
  windowRole?: 'IN' | 'OUT' | 'BREAK_OUT' | 'BREAK_IN' | 'EXTRA'
  windowRoleLabel?: string // e.g. "This is for IN", "This is for OUT"
}

export interface DailyAttendanceRecord {
  id: string
  biometric_user_id: string
  employee_name: string
  department?: string
  location: string
  work_group_id: string
  work_group_name: string
  date: string // Display date e.g. "Sep 30, 2026"
  raw_date: string // YYYY-MM-DD
  expected_in: string // e.g. "6:00 AM", "7:00 AM", "8:00 AM"
  actual_in: string // e.g. "6:10 AM" or "Missing (Manual Request Required)"
  expected_out: string // e.g. "3:00 PM", "4:00 PM", "5:00 PM"
  actual_out: string // e.g. "3:08 PM" or "-"
  break_out: string
  break_in: string
  total_hours: string // e.g. "8.1 hrs"
  total_hours_decimal: number
  worked_minutes: number
  late_minutes: number // Clean integer against Work Group Standard IN
  early_out_minutes: number // Clean integer against Work Group Expected OUT
  undertime_minutes: number
  status: string // "Regular Day" | "Awaiting OUT" | "Single Punch — No OUT" | "Likely OUT — Missing IN" | "Manual / Paper IN" | "Pending Approval" | "Ambiguous — Review Required"
  status_variant: 'success' | 'warning' | 'outline' | 'destructive' | 'secondary'
  raw_punches_count: number
  valid_punches_count: number
  duplicate_punches_count: number
  total_punches: number
  punches_summary: string
  has_valid_out: boolean
  is_awaiting_out: boolean
  is_likely_out?: boolean
  is_missing_in?: boolean
  is_manual_adjustment?: boolean
  is_pending_adjustment?: boolean
  manual_adjustment_reason?: string
  manual_adjustment_ref?: string
  manual_adjustment_status?: 'Approved' | 'Pending'
  first_punch_time_ms: number
  latest_punch_time_ms: number
  latest_punch_time: string
  raw_punches: AttendanceLog[]
  valid_punches: AttendanceLog[]
  scan_breakdown: ScanItem[]
  notes?: string
}

/**
 * Parses time string (e.g. "08:00", "8:07 AM", "5:20:42 PM") into minutes from midnight (0-1439)
 */
export function parseHHMMOr12hToMinutes(timeStr: string): number {
  if (!timeStr) return 480
  const clean = timeStr.trim().toUpperCase()
  const isPM = clean.includes('PM')
  const isAM = clean.includes('AM')
  const parts = clean.replace(/[A-Z]/g, '').trim().split(':')
  let h = parseInt(parts[0], 10) || 0
  const m = parseInt(parts[1], 10) || 0
  if (isPM && h < 12) h += 12
  if (isAM && h === 12) h = 0
  return h * 60 + m
}

/**
 * Gets the current hour and minute in Asia/Manila (0-23, 0-59)
 */
export function getManilaCurrentTime(): { hour: number; minute: number; dateStr: string } {
  try {
    const now = new Date()
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).formatToParts(now)

    let hour = 0
    let minute = 0
    let year = ''
    let month = ''
    let day = ''

    for (const p of parts) {
      if (p.type === 'hour') hour = parseInt(p.value, 10) || 0
      if (p.type === 'minute') minute = parseInt(p.value, 10) || 0
      if (p.type === 'year') year = p.value
      if (p.type === 'month') month = p.value
      if (p.type === 'day') day = p.value
    }
    if (hour === 24) hour = 0

    return {
      hour,
      minute,
      dateStr: `${year}-${month}-${day}`
    }
  } catch {
    const d = new Date()
    return {
      hour: d.getHours(),
      minute: d.getMinutes(),
      dateStr: d.toISOString().slice(0, 10)
    }
  }
}

/**
 * Gets local date string YYYY-MM-DD in Asia/Manila
 */
export function getManilaDateString(dateInput: string | Date | number = new Date()): string {
  try {
    const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput
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
 * Formats time in Asia/Manila (h:mm:ss A or h:mm A)
 */
export function formatManilaTime(dateInput: string | Date | number, includeSeconds = true): string {
  try {
    const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput
    if (isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {}),
      hour12: true
    }).format(d)
  } catch {
    return ''
  }
}

/**
 * Extracts minutes from midnight in Asia/Manila
 */
export function getManilaMinutesFromMidnight(dateInput: string | Date | number): number {
  try {
    const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    }).formatToParts(d)

    let h = 0
    let m = 0
    for (const p of parts) {
      if (p.type === 'hour') h = parseInt(p.value, 10) || 0
      if (p.type === 'minute') m = parseInt(p.value, 10) || 0
    }
    if (h === 24) h = 0
    return h * 60 + m
  } catch {
    const d = new Date(dateInput)
    return d.getHours() * 60 + d.getMinutes()
  }
}

/**
 * Processes raw biometric punches for an employee on a single day.
 *
 * Adheres strictly to the following rules:
 * 1. RAW DATA INTACT: Preserves all original biometric punch records for auditing.
 * 2. FIRST VALID PUNCH: When multiple punches occur close together, the FIRST punch is primary;
 *    subsequent punches within the threshold (e.g. 60s) are recorded as duplicate/repeated scans.
 * 3. WORK GROUP SCHEDULE AWARENESS: Evaluates morning IN, expected OUT, and lunch break dynamically.
 * 4. SINGLE PUNCH INTELLIGENCE:
 *    - Morning punch (e.g. 8:07 AM on 8am-5pm schedule): IN = 8:07 AM, OUT = missing, Status = "Single Punch — No OUT".
 *    - Shift-end punch (e.g. 5:20 PM on 8am-5pm schedule): Does NOT fabricate an IN. Identifies as OUT = 5:20 PM,
 *      IN = "Missing (Manual Request Required)", Status = "Likely OUT — Missing IN".
 * 5. MANUAL ADJUSTMENTS: Uses approved manual/paper records when provided without fabricating fake biometric data.
 */
export function processEmployeeDayPunches(
  bioId: string,
  rawLogs: AttendanceLog[],
  selectedDate: string,
  employeeContext?: EmployeeScheduleContext,
  customConfig: Partial<AttendanceEngineConfig> = {}
): DailyAttendanceRecord | null {
  if (!rawLogs || rawLogs.length === 0) return null

  const config: AttendanceEngineConfig = { ...DEFAULT_ATTENDANCE_CONFIG, ...customConfig }

  // 1. Resolve Work Group parameters
  const standardInHHMM = employeeContext?.standardIn || '08:00'
  const requiredWorkMins = employeeContext?.requiredWorkMinutes || 480 // 8 hours
  const lunchStartHHMM = employeeContext?.lunchStart || '12:00'
  const lunchEndHHMM = employeeContext?.lunchEnd || '13:00'
  const workGroupId = employeeContext?.workGroupId || 'wg-group-c'
  const workGroupName = employeeContext?.workGroupName || (workGroupId === 'wg-group-a' ? 'GROUP A' : (workGroupId === 'wg-group-b' ? 'GROUP B' : 'GROUP C'))

  // Calculate Expected OUT dynamically based on standard IN and lunch window
  const outCalc = calculateExpectedOutMinutes(standardInHHMM, requiredWorkMins, lunchStartHHMM, lunchEndHHMM)
  const expectedInFormatted = formatTime12h(standardInHHMM)
  const expectedOutFormatted = outCalc.outFormatted12h
  const [inH, inM] = standardInHHMM.split(':').map(Number)
  const expectedInMinutes = (inH || 8) * 60 + (inM || 0)
  const expectedOutMinutes = outCalc.outMinutesFromMidnight

  const [lStartH, lStartM] = lunchStartHHMM.split(':').map(Number)
  const [lEndH, lEndM] = lunchEndHHMM.split(':').map(Number)
  const lunchStartMins = (lStartH || 12) * 60 + (lStartM || 0)
  const lunchEndMins = (lEndH || 13) * 60 + (lEndM || 0)

  // Midpoint of shift window (e.g. 12:30 PM for 8am-5pm; 10:30 AM for 6am-3pm)
  const midpointMinutes = Math.floor((expectedInMinutes + expectedOutMinutes) / 2)

  // 2. Sort raw logs chronologically ascending (earliest first)
  const sortedLogs = [...rawLogs].sort(
    (a, b) => new Date(a.attendance_time).getTime() - new Date(b.attendance_time).getTime()
  )

  // 3. Duplicate scan clustering (consecutive scans within duplicatePunchThresholdSeconds e.g. 60s)
  // FIRST valid punch in each cluster is the primary attendance punch.
  // Subsequent close punches are recognized as duplicate/repeated scans.
  const thresholdMs = (config.duplicatePunchThresholdSeconds || 60) * 1000
  const validPunches: AttendanceLog[] = []
  const scanBreakdown: ScanItem[] = []

  let currentClusterPrimary: AttendanceLog | null = null
  let currentClusterPrimaryMs = -Infinity
  let lastPunchMs = -Infinity

  for (let i = 0; i < sortedLogs.length; i++) {
    const log = sortedLogs[i]
    const ms = new Date(log.attendance_time).getTime()
    const diffFromPrimary = ms - currentClusterPrimaryMs
    const diffFromLast = ms - lastPunchMs

    if (currentClusterPrimary && diffFromLast <= thresholdMs && diffFromLast >= 0) {
      // Duplicate / repeated scan of the ongoing cluster
      const diffSec = Math.max(1, Math.round(diffFromPrimary / 1000))
      scanBreakdown.push({
        id: log.id || `scan-${bioId}-${ms}-${i}`,
        timeFormatted: formatManilaTime(log.attendance_time),
        timestampMs: ms,
        isPrimary: false,
        duplicateOf: formatManilaTime(currentClusterPrimary.attendance_time),
        diffSeconds: diffSec,
        type: Number(log.type ?? 1),
        state: Number(log.state ?? 1),
        deviceName: log.device_name || 'BISBIO B-29b',
        deviceIp: log.device_ip || '192.168.1.201'
      })
    } else {
      // New primary punch (starts new cluster)
      currentClusterPrimary = log
      currentClusterPrimaryMs = ms
      validPunches.push(log)
      scanBreakdown.push({
        id: log.id || `scan-${bioId}-${ms}-${i}`,
        timeFormatted: formatManilaTime(log.attendance_time),
        timestampMs: ms,
        isPrimary: true,
        type: Number(log.type ?? 1),
        state: Number(log.state ?? 1),
        deviceName: log.device_name || 'BISBIO B-29b',
        deviceIp: log.device_ip || '192.168.1.201'
      })
    }
    lastPunchMs = ms
  }

  const rawCount = sortedLogs.length
  const validCount = validPunches.length
  const duplicateCount = rawCount - validCount
  const punchesSummary = validCount === rawCount ? `${validCount}` : `${validCount} primary (${duplicateCount} duplicate)`

  const employeeName = employeeContext?.name || sortedLogs[0].employee_name || `User ${bioId}`
  const employeeLocation = employeeContext?.location || sortedLogs[0].location_name || 'DBB CEBU'

  const firstPunch = validPunches[0]
  const firstPunchMs = new Date(firstPunch.attendance_time).getTime()

  let actualInStr = '-'
  let actualOutStr = '-'
  let breakOutStr = '-'
  let breakInStr = '-'
  let totalHoursStr = '-'
  let totalHoursDecimal = 0
  let workedMinutes = 0
  let lateMinutes = 0
  let earlyOutMinutes = 0
  let undertimeMinutes = 0
  let hasValidOut = false
  let isAwaitingOut = false
  let isLikelyOut = false
  let isMissingIn = false
  let notes = ''

  const manilaNow = getManilaCurrentTime()
  const isToday = selectedDate === manilaNow.dateStr
  const isPastCutoff = manilaNow.hour >= config.attendanceOutCutoffHour

  let status = 'Regular Day'
  let statusVariant: 'success' | 'warning' | 'outline' | 'destructive' | 'secondary' = 'success'

  // CASE 1: Single valid primary punch
  if (validCount === 1) {
    const punch = validPunches[0]
    const punchMins = getManilaMinutesFromMidnight(punch.attendance_time)
    const punchTimeFormatted = formatManilaTime(punch.attendance_time)

    // Check whether the single punch is morning/shift-start OR shift-end/afternoon
    // Paner, Regner at 8:07 AM on 8am-5pm schedule: punchMins (487) < midpointMinutes (750) -> Morning IN
    if (punchMins < midpointMinutes && punchMins <= lunchStartMins + 30) {
      actualInStr = punchTimeFormatted
      actualOutStr = '-'
      lateMinutes = Math.max(0, punchMins - expectedInMinutes)
      earlyOutMinutes = 0

      if (isToday && !isPastCutoff) {
        status = 'Awaiting OUT'
        statusVariant = 'secondary'
        isAwaitingOut = true
        hasValidOut = false
      } else {
        status = 'Single Punch — No OUT'
        statusVariant = 'outline'
        isAwaitingOut = false
        hasValidOut = false
      }
    }
    // Eredia, Alfredo at 5:20 PM on 8am-5pm schedule: punchMins (1040) near/after expected OUT (1020)
    // -> Shift-End / Likely OUT, Missing morning IN
    else if (punchMins >= expectedOutMinutes - 90 || punchMins >= lunchEndMins + 60) {
      actualInStr = 'Missing (Manual Request Required)'
      actualOutStr = punchTimeFormatted
      status = 'Likely OUT — Missing IN'
      statusVariant = 'warning'
      lateMinutes = 0
      earlyOutMinutes = Math.max(0, expectedOutMinutes - punchMins)
      workedMinutes = 0
      totalHoursStr = '-'
      hasValidOut = true
      isAwaitingOut = false
      isLikelyOut = true
      isMissingIn = true
      notes = `Single punch recorded at shift end (${punchTimeFormatted}). Morning biometric IN missing; time-in / paper request required.`
    }
    // Ambiguous midday punch
    else {
      actualInStr = punchTimeFormatted
      actualOutStr = '-'
      status = 'Ambiguous — Review Required'
      statusVariant = 'outline'
      isAwaitingOut = false
      hasValidOut = false
      notes = `Single punch occurred at ${punchTimeFormatted}. Unable to determine whether IN or OUT; HR review required.`
    }
  }
  // CASE 2: Exactly 2 valid primary punches
  else if (validCount === 2) {
    const punch1 = validPunches[0]
    const punch2 = validPunches[1]
    const p1Mins = getManilaMinutesFromMidnight(punch1.attendance_time)
    const p2Mins = getManilaMinutesFromMidnight(punch2.attendance_time)
    const sessionMins = p2Mins - p1Mins

    // Subcase 2.1: Both punches are morning/shift-start and very close together (< 30 minutes)
    if (p1Mins < midpointMinutes && p2Mins < midpointMinutes && sessionMins < config.minSessionDurationMinutes) {
      actualInStr = formatManilaTime(punch1.attendance_time)
      actualOutStr = '-'
      lateMinutes = Math.max(0, p1Mins - expectedInMinutes)

      if (isToday && !isPastCutoff) {
        status = 'Awaiting OUT'
        statusVariant = 'secondary'
        isAwaitingOut = true
        hasValidOut = false
      } else {
        status = 'Single Punch — No OUT'
        statusVariant = 'outline'
        isAwaitingOut = false
        hasValidOut = false
      }
    }
    // Subcase 2.2: Both punches are in afternoon near shift end (e.g. 5:05 PM and 5:20 PM with no morning IN)
    else if (p1Mins >= midpointMinutes && sessionMins < 60) {
      actualInStr = 'Missing (Manual Request Required)'
      actualOutStr = formatManilaTime(punch2.attendance_time)
      status = 'Likely OUT — Missing IN'
      statusVariant = 'warning'
      lateMinutes = 0
      earlyOutMinutes = Math.max(0, expectedOutMinutes - p2Mins)
      hasValidOut = true
      isLikelyOut = true
      isMissingIn = true
      notes = `Multiple scans at shift end (${formatManilaTime(punch1.attendance_time)} & ${formatManilaTime(punch2.attendance_time)}). Morning biometric IN missing.`
    }
    // Subcase 2.3: Standard valid IN and OUT (spanning work session)
    else {
      actualInStr = formatManilaTime(punch1.attendance_time)
      actualOutStr = formatManilaTime(punch2.attendance_time)
      hasValidOut = true
      isAwaitingOut = false

      lateMinutes = Math.max(0, p1Mins - expectedInMinutes)
      earlyOutMinutes = Math.max(0, expectedOutMinutes - p2Mins)
      undertimeMinutes = earlyOutMinutes

      let grossMins = Math.max(0, p2Mins - p1Mins)
      // Subtract unpaid lunch if shift spans across lunch window
      if (p1Mins < lunchStartMins && p2Mins > lunchEndMins) {
        grossMins = Math.max(0, grossMins - (lunchEndMins - lunchStartMins))
      }

      workedMinutes = grossMins
      const grossHours = grossMins / 60
      totalHoursDecimal = Number(grossHours.toFixed(2))
      totalHoursStr = `${grossHours.toFixed(1)} hrs`

      status = 'Regular Day'
      statusVariant = (lateMinutes > 0 || earlyOutMinutes > 0) ? 'warning' : 'success'
    }
  }
  // CASE 3: 3 valid primary punches (e.g. IN, Lunch scan, OUT)
  else if (validCount === 3) {
    const p1 = validPunches[0]
    const p2 = validPunches[1]
    const p3 = validPunches[2]
    const p1Mins = getManilaMinutesFromMidnight(p1.attendance_time)
    const p3Mins = getManilaMinutesFromMidnight(p3.attendance_time)

    actualInStr = formatManilaTime(p1.attendance_time)
    breakOutStr = formatManilaTime(p2.attendance_time)
    actualOutStr = formatManilaTime(p3.attendance_time)
    hasValidOut = true
    isAwaitingOut = false

    lateMinutes = Math.max(0, p1Mins - expectedInMinutes)
    earlyOutMinutes = Math.max(0, expectedOutMinutes - p3Mins)
    undertimeMinutes = earlyOutMinutes

    const grossMins = Math.max(0, p3Mins - p1Mins)
    workedMinutes = Math.max(0, grossMins - (lunchEndMins - lunchStartMins))
    const netHours = workedMinutes / 60
    totalHoursDecimal = Number(netHours.toFixed(2))
    totalHoursStr = `${netHours.toFixed(1)} hrs`

    status = 'Regular Day'
    statusVariant = (lateMinutes > 0 || earlyOutMinutes > 0) ? 'warning' : 'success'
  }
  // CASE 4: 4 or more valid primary punches (IN, Break OUT, Break IN, Shift OUT)
  else {
    const pFirst = validPunches[0]
    const pLast = validPunches[validCount - 1]
    const pFirstMins = getManilaMinutesFromMidnight(pFirst.attendance_time)
    const pLastMins = getManilaMinutesFromMidnight(pLast.attendance_time)

    actualInStr = formatManilaTime(pFirst.attendance_time)
    breakOutStr = formatManilaTime(validPunches[1].attendance_time)
    breakInStr = formatManilaTime(validPunches[2].attendance_time)
    actualOutStr = formatManilaTime(pLast.attendance_time)
    hasValidOut = true
    isAwaitingOut = false

    lateMinutes = Math.max(0, pFirstMins - expectedInMinutes)
    earlyOutMinutes = Math.max(0, expectedOutMinutes - pLastMins)
    undertimeMinutes = earlyOutMinutes

    const grossMins = Math.max(0, pLastMins - pFirstMins)
    const bOutMins = getManilaMinutesFromMidnight(validPunches[1].attendance_time)
    const bInMins = getManilaMinutesFromMidnight(validPunches[2].attendance_time)
    const actualBreakMins = Math.max(0, bInMins - bOutMins)

    workedMinutes = Math.max(0, grossMins - actualBreakMins)
    const netHours = workedMinutes / 60
    totalHoursDecimal = Number(netHours.toFixed(2))
    totalHoursStr = `${netHours.toFixed(1)} hrs`

    status = 'Regular Day'
    statusVariant = (lateMinutes > 0 || earlyOutMinutes > 0) ? 'warning' : 'success'
  }

  // Check for Approved Manual / Paper Request Adjustment
  let isManualAdjustment = false
  let manualAdjustmentReason = ''
  const manual = employeeContext?.manualAdjustment

  if (manual && manual.status === 'Approved') {
    manualAdjustmentReason = manual.reason || manual.notes || 'Approved Manual Adjustment'

    let effectiveInMins = -1
    let effectiveOutMins = -1

    if (manual.manualIn) {
      actualInStr = `${manual.manualIn} (Manual)`
      isManualAdjustment = true
      isMissingIn = false
      isLikelyOut = false
      effectiveInMins = parseHHMMOr12hToMinutes(manual.manualIn)
    }

    if (manual.manualOut) {
      actualOutStr = `${manual.manualOut} (Manual)`
      isManualAdjustment = true
      hasValidOut = true
      isAwaitingOut = false
      effectiveOutMins = parseHHMMOr12hToMinutes(manual.manualOut)
    }

    // Recalculate working session if either or both are manual
    if (manual.manualIn && !manual.manualOut && hasValidOut && actualOutStr !== '-' && !actualOutStr.includes('Missing')) {
      const lastPunch = validPunches[validCount - 1]
      effectiveOutMins = getManilaMinutesFromMidnight(lastPunch.attendance_time)
    } else if (manual.manualOut && !manual.manualIn && actualInStr !== '-' && !actualInStr.includes('Missing')) {
      const firstPunch = validPunches[0]
      effectiveInMins = getManilaMinutesFromMidnight(firstPunch.attendance_time)
    }

    if (effectiveInMins >= 0 && effectiveOutMins >= 0 && effectiveOutMins >= effectiveInMins) {
      lateMinutes = Math.max(0, effectiveInMins - expectedInMinutes)
      earlyOutMinutes = Math.max(0, expectedOutMinutes - effectiveOutMins)
      undertimeMinutes = earlyOutMinutes

      let grossMins = Math.max(0, effectiveOutMins - effectiveInMins)
      if (effectiveInMins < lunchStartMins && effectiveOutMins > lunchEndMins) {
        grossMins = Math.max(0, grossMins - (lunchEndMins - lunchStartMins))
      }

      workedMinutes = grossMins
      const netHours = workedMinutes / 60
      totalHoursDecimal = Number(netHours.toFixed(2))
      totalHoursStr = `${netHours.toFixed(1)} hrs`

      status = 'Regular Day'
      statusVariant = (lateMinutes > 0 || earlyOutMinutes > 0) ? 'warning' : 'success'
    } else if (manual.manualIn && (actualOutStr === '-' || actualOutStr.includes('Missing'))) {
      lateMinutes = Math.max(0, (effectiveInMins >= 0 ? effectiveInMins : expectedInMinutes) - expectedInMinutes)
      status = 'Single Punch — No OUT'
      statusVariant = 'outline'
    }
  }

  // 4. Assign window roles (IN, OUT, BREAK) to scan breakdown items for clear auditing
  for (const scan of scanBreakdown) {
    const scanMins = getManilaMinutesFromMidnight(scan.timestampMs)
    if (validCount === 1) {
      if (isLikelyOut) {
        scan.windowRole = 'OUT'
        scan.windowRoleLabel = 'This is for OUT'
      } else {
        scan.windowRole = 'IN'
        scan.windowRoleLabel = 'This is for IN'
      }
    } else if (validCount === 2) {
      if (isLikelyOut) {
        scan.windowRole = 'OUT'
        scan.windowRoleLabel = 'This is for OUT'
      } else if (scanMins < midpointMinutes) {
        scan.windowRole = 'IN'
        scan.windowRoleLabel = 'This is for IN'
      } else {
        scan.windowRole = 'OUT'
        scan.windowRoleLabel = 'This is for OUT'
      }
    } else {
      // 3+ punches
      if (scanMins < lunchStartMins - 30) {
        scan.windowRole = 'IN'
        scan.windowRoleLabel = 'This is for IN'
      } else if (scanMins >= expectedOutMinutes - 90 || scanMins >= midpointMinutes + 60) {
        scan.windowRole = 'OUT'
        scan.windowRoleLabel = 'This is for OUT'
      } else if (scanMins < lunchEndMins + 15) {
        scan.windowRole = 'BREAK_OUT'
        scan.windowRoleLabel = 'This is for Lunch/Break'
      } else {
        scan.windowRole = 'EXTRA'
        scan.windowRoleLabel = 'Midday Scan'
      }
    }
  }

  const lastValidPunch = validPunches[validCount - 1] || firstPunch
  const latestPunchMs = new Date(lastValidPunch.attendance_time).getTime()
  const latestPunchTimeStr = formatManilaTime(lastValidPunch.attendance_time)

  const formattedDisplayDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(firstPunch.attendance_time))

  return {
    id: `daily-${bioId}-${selectedDate}`,
    biometric_user_id: bioId,
    employee_name: employeeName,
    department: employeeContext?.department || '',
    location: employeeLocation,
    work_group_id: workGroupId,
    work_group_name: workGroupName,
    date: formattedDisplayDate,
    raw_date: selectedDate,
    expected_in: expectedInFormatted,
    actual_in: actualInStr,
    expected_out: expectedOutFormatted,
    actual_out: actualOutStr,
    break_out: breakOutStr,
    break_in: breakInStr,
    total_hours: totalHoursStr,
    total_hours_decimal: totalHoursDecimal,
    worked_minutes: workedMinutes,
    late_minutes: lateMinutes,
    early_out_minutes: earlyOutMinutes,
    undertime_minutes: undertimeMinutes,
    status,
    status_variant: statusVariant,
    raw_punches_count: rawCount,
    valid_punches_count: validCount,
    duplicate_punches_count: duplicateCount,
    total_punches: rawCount,
    punches_summary: punchesSummary,
    has_valid_out: hasValidOut,
    is_awaiting_out: isAwaitingOut,
    is_likely_out: isLikelyOut,
    is_missing_in: isMissingIn,
    is_manual_adjustment: isManualAdjustment,
    manual_adjustment_reason: manualAdjustmentReason,
    first_punch_time_ms: firstPunchMs,
    latest_punch_time_ms: latestPunchMs,
    latest_punch_time: latestPunchTimeStr,
    raw_punches: sortedLogs,
    valid_punches: validPunches,
    scan_breakdown: scanBreakdown,
    notes
  }
}
