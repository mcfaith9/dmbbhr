/**
 * Biometric Attendance Interpretation Engine
 *
 * Implements:
 * - Dynamic Work Group standard schedules (GROUP A: 6am-3pm, GROUP B: 7am-4pm, GROUP C: 8am-5pm)
 * - Automatic Expected OUT calculation excluding configured unpaid lunch break (default 12:00 PM - 1:00 PM)
 * - Exact Late Minutes calculation against employee's Work Group Standard IN (never negative)
 * - Exact Early Out Minutes calculation against employee's Work Group Expected OUT
 * - Clean separation between Attendance Status and Attendance Metrics
 * - Strict Philippine Standard Time handling (Asia/Manila UTC+8)
 * - Workday status evaluation: "Awaiting OUT" (today before cutoff) vs "Single Punch (No OUT)" (historical / past cutoff)
 * - Near-duplicate punch collapsing (e.g. 7:52:37 AM & 7:52:39 AM)
 */

import type { AttendanceLog } from '@/types'
import { calculateExpectedOutMinutes, formatTime12h } from '@/repositories/workGroupRepository'

export interface AttendanceEngineConfig {
  duplicatePunchThresholdSeconds: number
  minSessionDurationMinutes: number
  attendanceOutCutoffHour: number // 19 (7:00 PM)
}

export const DEFAULT_ATTENDANCE_CONFIG: AttendanceEngineConfig = {
  duplicatePunchThresholdSeconds: 30,
  minSessionDurationMinutes: 20,
  attendanceOutCutoffHour: 19 // 7:00 PM
}

export interface EmployeeScheduleContext {
  bioId: string
  name: string
  location: string
  workGroupId?: string
  workGroupName?: string
  standardIn?: string // "06:00", "07:00", "08:00"
  requiredWorkMinutes?: number // 480
  lunchStart?: string // "12:00"
  lunchEnd?: string // "13:00"
  gracePeriodMinutes?: number
}

export interface ProcessedPunch {
  rawLog: AttendanceLog
  timestampMs: number
  timeFormatted: string
  isDuplicate: boolean
  duplicateReason?: string
}

export interface DailyAttendanceRecord {
  id: string
  biometric_user_id: string
  employee_name: string
  location: string
  work_group_id: string
  work_group_name: string
  date: string // Display date e.g. "Sep 30, 2026"
  raw_date: string // YYYY-MM-DD
  expected_in: string // e.g. "6:00 AM", "7:00 AM", "8:00 AM"
  actual_in: string // e.g. "6:10 AM"
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
  status: string // Clean status: "Regular Day" | "Awaiting OUT" | "Single Punch (No OUT)" | "On Leave" | "Holiday"
  status_variant: 'success' | 'warning' | 'outline' | 'destructive' | 'secondary'
  raw_punches_count: number
  valid_punches_count: number
  total_punches: number
  punches_summary: string
  has_valid_out: boolean
  is_awaiting_out: boolean
  raw_punches: AttendanceLog[]
  valid_punches: AttendanceLog[]
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

  // Calculate Expected OUT based on standard IN and lunch window
  const outCalc = calculateExpectedOutMinutes(standardInHHMM, requiredWorkMins, lunchStartHHMM, lunchEndHHMM)
  const expectedInFormatted = formatTime12h(standardInHHMM)
  const expectedOutFormatted = outCalc.outFormatted12h
  const expectedInMinutes = parseInt(standardInHHMM.split(':')[0], 10) * 60 + parseInt(standardInHHMM.split(':')[1], 10)
  const expectedOutMinutes = outCalc.outMinutesFromMidnight

  // 2. Sort raw logs chronologically ascending (earliest first)
  const sortedLogs = [...rawLogs].sort(
    (a, b) => new Date(a.attendance_time).getTime() - new Date(b.attendance_time).getTime()
  )

  // 3. Near-duplicate punch collapsing (threshold e.g. 30s)
  const thresholdMs = config.duplicatePunchThresholdSeconds * 1000
  const validPunches: AttendanceLog[] = []
  const processedPunches: ProcessedPunch[] = []
  let lastValidMs = -Infinity

  for (let i = 0; i < sortedLogs.length; i++) {
    const log = sortedLogs[i]
    const ms = new Date(log.attendance_time).getTime()
    const diffMs = ms - lastValidMs

    if (i > 0 && diffMs <= thresholdMs) {
      // Flag near-duplicate scan
      processedPunches.push({
        rawLog: log,
        timestampMs: ms,
        timeFormatted: formatManilaTime(log.attendance_time),
        isDuplicate: true,
        duplicateReason: `Near-duplicate scan within ${Math.round(diffMs / 1000)}s of previous scan`
      })
    } else {
      validPunches.push(log)
      lastValidMs = ms
      processedPunches.push({
        rawLog: log,
        timestampMs: ms,
        timeFormatted: formatManilaTime(log.attendance_time),
        isDuplicate: false
      })
    }
  }

  const rawCount = sortedLogs.length
  const validCount = validPunches.length
  const punchesSummary = validCount === rawCount ? `${validCount}` : `${validCount} valid (${rawCount} raw)`

  const employeeName = employeeContext?.name || sortedLogs[0].employee_name || `User ${bioId}`
  const employeeLocation = employeeContext?.location || sortedLogs[0].location_name || 'DBB CEBU'

  const firstPunch = validPunches[0]
  const firstPunchMs = new Date(firstPunch.attendance_time).getTime()
  const actualInMinutes = getManilaMinutesFromMidnight(firstPunch.attendance_time)
  const timeInStr = formatManilaTime(firstPunch.attendance_time)

  // Calculate Late Minutes against employee's Work Group Standard IN
  const lateMinutes = Math.max(0, actualInMinutes - expectedInMinutes)

  let breakOutStr = '-'
  let breakInStr = '-'
  let timeOutStr = '-'
  let totalHoursStr = '-'
  let totalHoursDecimal = 0
  let workedMinutes = 0
  let earlyOutMinutes = 0
  let undertimeMinutes = 0
  let hasValidOut = false
  let isAwaitingOut = false

  const manilaNow = getManilaCurrentTime()
  const isToday = selectedDate === manilaNow.dateStr
  const isPastCutoff = manilaNow.hour >= config.attendanceOutCutoffHour

  let status = 'Regular Day'
  let statusVariant: 'success' | 'warning' | 'outline' | 'destructive' | 'secondary' = 'success'

  // CASE 1: Single valid punch
  if (validCount === 1) {
    if (isToday && !isPastCutoff) {
      status = 'Awaiting OUT'
      statusVariant = 'secondary'
      isAwaitingOut = true
      hasValidOut = false
    } else {
      status = 'Single Punch (No OUT)'
      statusVariant = 'outline'
      isAwaitingOut = false
      hasValidOut = false
    }
  }
  // CASE 2: Exactly 2 valid punches
  else if (validCount === 2) {
    const secondPunch = validPunches[1]
    const secondPunchMs = new Date(secondPunch.attendance_time).getTime()
    const sessionDurationMs = secondPunchMs - firstPunchMs
    const sessionDurationMins = sessionDurationMs / 60000

    if (sessionDurationMins < config.minSessionDurationMinutes) {
      // Too close to be a full workday session
      if (isToday && !isPastCutoff) {
        status = 'Awaiting OUT'
        statusVariant = 'secondary'
        isAwaitingOut = true
        hasValidOut = false
      } else {
        status = 'Single Punch (No OUT)'
        statusVariant = 'outline'
        isAwaitingOut = false
        hasValidOut = false
      }
    } else {
      // Legitimate IN and OUT
      timeOutStr = formatManilaTime(secondPunch.attendance_time)
      const actualOutMinutes = getManilaMinutesFromMidnight(secondPunch.attendance_time)
      earlyOutMinutes = Math.max(0, expectedOutMinutes - actualOutMinutes)

      // Calculate net rendered hours excluding lunch if session spans across lunch
      const [lStartH, lStartM] = lunchStartHHMM.split(':').map(Number)
      const [lEndH, lEndM] = lunchEndHHMM.split(':').map(Number)
      const lunchStartMins = (lStartH || 12) * 60 + (lStartM || 0)
      const lunchEndMins = (lEndH || 13) * 60 + (lEndM || 0)

      let grossMins = Math.max(0, actualOutMinutes - actualInMinutes)
      if (actualInMinutes < lunchStartMins && actualOutMinutes > lunchEndMins) {
        // Subtract unpaid lunch
        grossMins = Math.max(0, grossMins - (lunchEndMins - lunchStartMins))
      }

      workedMinutes = grossMins
      const grossHours = grossMins / 60
      totalHoursDecimal = Number(grossHours.toFixed(2))
      totalHoursStr = `${grossHours.toFixed(1)} hrs`
      hasValidOut = true
      undertimeMinutes = earlyOutMinutes

      status = 'Regular Day'
      statusVariant = (lateMinutes > 0 || earlyOutMinutes > 0) ? 'warning' : 'success'
    }
  }
  // CASE 3: 4 or more valid punches (IN, Break OUT, Break IN, Final OUT)
  else if (validCount >= 4) {
    const lastPunch = validPunches[validCount - 1]
    breakOutStr = formatManilaTime(validPunches[1].attendance_time)
    breakInStr = formatManilaTime(validPunches[2].attendance_time)
    timeOutStr = formatManilaTime(lastPunch.attendance_time)

    const actualOutMinutes = getManilaMinutesFromMidnight(lastPunch.attendance_time)
    earlyOutMinutes = Math.max(0, expectedOutMinutes - actualOutMinutes)

    const grossMins = Math.max(0, actualOutMinutes - actualInMinutes)
    const breakOutMins = getManilaMinutesFromMidnight(validPunches[1].attendance_time)
    const breakInMins = getManilaMinutesFromMidnight(validPunches[2].attendance_time)
    const actualBreakMins = Math.max(0, breakInMins - breakOutMins)

    workedMinutes = Math.max(0, grossMins - actualBreakMins)
    const netHours = workedMinutes / 60
    totalHoursDecimal = Number(netHours.toFixed(2))
    totalHoursStr = `${netHours.toFixed(1)} hrs`
    hasValidOut = true
    undertimeMinutes = earlyOutMinutes

    status = 'Regular Day'
    statusVariant = (lateMinutes > 0 || earlyOutMinutes > 0) ? 'warning' : 'success'
  }
  // CASE 4: 3 valid punches
  else if (validCount === 3) {
    const lastPunch = validPunches[2]
    breakOutStr = formatManilaTime(validPunches[1].attendance_time)
    timeOutStr = formatManilaTime(lastPunch.attendance_time)

    const actualOutMinutes = getManilaMinutesFromMidnight(lastPunch.attendance_time)
    earlyOutMinutes = Math.max(0, expectedOutMinutes - actualOutMinutes)

    const grossMins = Math.max(0, actualOutMinutes - actualInMinutes)
    workedMinutes = Math.max(0, grossMins - 60) // Assume standard 1h lunch
    const netHours = workedMinutes / 60
    totalHoursDecimal = Number(netHours.toFixed(2))
    totalHoursStr = `${netHours.toFixed(1)} hrs`
    hasValidOut = true
    undertimeMinutes = earlyOutMinutes

    status = 'Regular Day'
    statusVariant = (lateMinutes > 0 || earlyOutMinutes > 0) ? 'warning' : 'success'
  }

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
    location: employeeLocation,
    work_group_id: workGroupId,
    work_group_name: workGroupName,
    date: formattedDisplayDate,
    raw_date: selectedDate,
    expected_in: expectedInFormatted,
    actual_in: timeInStr,
    expected_out: expectedOutFormatted,
    actual_out: timeOutStr,
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
    total_punches: validCount,
    punches_summary: punchesSummary,
    has_valid_out: hasValidOut,
    is_awaiting_out: isAwaitingOut,
    raw_punches: sortedLogs,
    valid_punches: validPunches
  }
}
