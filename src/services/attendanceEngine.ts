/**
 * Biometric Attendance Interpretation Engine
 *
 * Implements:
 * - Clean separation between Attendance Status and Attendance Metrics (Late, Undertime, Hours)
 * - Strict Asia/Manila timezone handling (Philippine Standard Time)
 * - Workday status evaluation: "Awaiting OUT" (today before cutoff) vs "Single Punch (No OUT)" (historical / past cutoff)
 * - Robust duplicate / near-duplicate punch collapsing (e.g. 7:52:37 AM & 7:52:39 AM)
 * - Accurate Lateness calculation against shift start (never negative, unaffected by date offsets)
 * - Multi-punch recognition (IN, Break OUT, Break IN, Final OUT)
 */

import type { AttendanceLog } from '@/types'

export interface AttendanceEngineConfig {
  /**
   * If two punches occur within this many seconds, the subsequent punch is treated
   * as a duplicate scan and ignored for session state transitions.
   */
  duplicatePunchThresholdSeconds: number

  /**
   * Minimum duration in minutes required between IN and legitimate OUT.
   * Prevents accidental double scans 2 minutes apart from being treated as a completed workday.
   */
  minSessionDurationMinutes: number

  /**
   * Hour of the day (24-hour format 0-23 in Asia/Manila) after which an unclosed
   * single punch on today's date transitions from "Awaiting OUT" to "Single Punch (No OUT)".
   * Default: 19 (7:00 PM).
   */
  attendanceOutCutoffHour: number

  /**
   * Expected shift start hour in Asia/Manila (0-23). Default: 8 (08:00 AM).
   */
  shiftStartHour: number

  /**
   * Expected shift start minute (0-59). Default: 0.
   */
  shiftStartMinute: number

  /**
   * Grace period in minutes. Default: 15 minutes.
   * If actual arrival is within grace period, employee is still on time, or late minutes can be computed from schedule.
   */
  gracePeriodMinutes: number

  /**
   * Standard shift end hour in Asia/Manila. Default: 17 (05:00 PM).
   */
  shiftEndHour: number
  shiftEndMinute: number
}

export const DEFAULT_ATTENDANCE_CONFIG: AttendanceEngineConfig = {
  duplicatePunchThresholdSeconds: 30,
  minSessionDurationMinutes: 20,
  attendanceOutCutoffHour: 19, // 7:00 PM
  shiftStartHour: 8,
  shiftStartMinute: 0,
  gracePeriodMinutes: 15,
  shiftEndHour: 17,
  shiftEndMinute: 0
}

export interface ProcessedPunch {
  rawLog: AttendanceLog
  timestampMs: number
  timeFormatted: string
  isDuplicate: boolean
  duplicateReason?: string
}

export type AttendanceStatusType =
  | 'Regular Day'
  | 'Awaiting OUT'
  | 'Single Punch (No OUT)'
  | 'Late'
  | 'On Leave'
  | 'Holiday'
  | 'Absent'

export interface DailyAttendanceRecord {
  id: string
  biometric_user_id: string
  employee_name: string
  location: string
  date: string // Display date e.g. "Sep 30, 2026"
  raw_date: string // YYYY-MM-DD in Asia/Manila
  time_in: string
  break_out: string
  break_in: string
  time_out: string
  total_hours: string
  total_hours_decimal: number
  status: string // Clean status: "Regular Day" | "Awaiting OUT" | "Single Punch (No OUT)" | "On Leave" | "Holiday"
  status_variant: 'success' | 'warning' | 'outline' | 'destructive' | 'info'
  late_minutes: number // Dedicated integer metric
  undertime_minutes: number // Dedicated integer metric
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

    // Handle 24h edge cases
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
 * Gets the current hour in Asia/Manila (0-23)
 */
export function getManilaCurrentHour(): number {
  return getManilaCurrentTime().hour
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
 * Formats time in Asia/Manila (h:mm:ss A)
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
 * Parses time components (hour, minute, second) from an ISO / timestamp in Asia/Manila
 */
export function getManilaTimeComponents(dateInput: string | Date | number): {
  hour: number
  minute: number
  second: number
  totalMinutes: number
} {
  try {
    const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).formatToParts(d)

    let hour = 0
    let minute = 0
    let second = 0

    for (const p of parts) {
      if (p.type === 'hour') hour = parseInt(p.value, 10) || 0
      if (p.type === 'minute') minute = parseInt(p.value, 10) || 0
      if (p.type === 'second') second = parseInt(p.value, 10) || 0
    }
    if (hour === 24) hour = 0

    return {
      hour,
      minute,
      second,
      totalMinutes: hour * 60 + minute
    }
  } catch {
    const d = new Date(dateInput)
    const hour = d.getHours()
    const minute = d.getMinutes()
    return {
      hour,
      minute,
      second: d.getSeconds(),
      totalMinutes: hour * 60 + minute
    }
  }
}

/**
 * Calculates late minutes accurately against scheduled start.
 *
 * Example:
 * Schedule: 8:00 AM (480 minutes past midnight)
 * Actual IN: 8:10 AM (490 minutes past midnight)
 * Late: 10 minutes (Math.max(0, 490 - 480))
 *
 * Actual IN: 7:55 AM (475 minutes past midnight)
 * Late: 0 minutes (never negative)
 */
export function calculateLateMinutes(
  timeIn: string | Date | number,
  config: AttendanceEngineConfig = DEFAULT_ATTENDANCE_CONFIG
): number {
  const comp = getManilaTimeComponents(timeIn)
  const scheduledStartMinutes = config.shiftStartHour * 60 + config.shiftStartMinute

  // If arrival is after scheduled start, compute late minutes
  if (comp.totalMinutes > scheduledStartMinutes) {
    return comp.totalMinutes - scheduledStartMinutes
  }
  return 0
}

/**
 * Calculates undertime minutes accurately against scheduled end.
 */
export function calculateUndertimeMinutes(
  timeOut: string | Date | number,
  config: AttendanceEngineConfig = DEFAULT_ATTENDANCE_CONFIG
): number {
  const comp = getManilaTimeComponents(timeOut)
  const scheduledEndMinutes = config.shiftEndHour * 60 + config.shiftEndMinute

  if (comp.totalMinutes < scheduledEndMinutes) {
    return scheduledEndMinutes - comp.totalMinutes
  }
  return 0
}

/**
 * Processes raw biometric punches for a single employee on a single day.
 *
 * Core guarantees:
 * 1. Attendance Status is never concatenated with Late minutes (e.g. No "Single Punch (No OUT - Late 546m)")
 * 2. Status is "Awaiting OUT" for today's ongoing shift before cutoff, and "Single Punch (No OUT)" for historical/past cutoff
 * 3. Near-duplicate scans (e.g. 7:52:37 AM & 7:52:39 AM) are collapsed so they don't produce a 0.0 hr workday
 * 4. Late minutes is a clean, non-negative integer
 */
export function processEmployeeDayPunches(
  bioId: string,
  rawLogs: AttendanceLog[],
  selectedDate: string,
  employeeInfo?: { name: string; location: string },
  customConfig: Partial<AttendanceEngineConfig> = {}
): DailyAttendanceRecord | null {
  if (!rawLogs || rawLogs.length === 0) return null

  const config: AttendanceEngineConfig = { ...DEFAULT_ATTENDANCE_CONFIG, ...customConfig }

  // 1. Sort raw logs chronologically ascending (earliest first)
  const sortedLogs = [...rawLogs].sort(
    (a, b) => new Date(a.attendance_time).getTime() - new Date(b.attendance_time).getTime()
  )

  // 2. Identify duplicate/near-duplicate punches using configurable threshold
  const thresholdMs = config.duplicatePunchThresholdSeconds * 1000
  const validPunches: AttendanceLog[] = []
  const processedPunches: ProcessedPunch[] = []

  let lastValidMs = -Infinity

  for (let i = 0; i < sortedLogs.length; i++) {
    const log = sortedLogs[i]
    const ms = new Date(log.attendance_time).getTime()
    const diffMs = ms - lastValidMs

    if (i > 0 && diffMs <= thresholdMs) {
      // Near-duplicate punch: preserve raw record, flag as duplicate
      processedPunches.push({
        rawLog: log,
        timestampMs: ms,
        timeFormatted: formatManilaTime(log.attendance_time),
        isDuplicate: true,
        duplicateReason: `Duplicate punch within ${Math.round(diffMs / 1000)}s of previous scan`
      })
    } else {
      // Meaningful valid attendance punch
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

  const employeeName = employeeInfo?.name || sortedLogs[0].employee_name || `User ${bioId}`
  const employeeLocation = employeeInfo?.location || sortedLogs[0].location_name || 'DBB CEBU'

  const firstPunch = validPunches[0]
  const firstPunchMs = new Date(firstPunch.attendance_time).getTime()
  const timeInStr = formatManilaTime(firstPunch.attendance_time)

  let breakOutStr = '-'
  let breakInStr = '-'
  let timeOutStr = '-'
  let totalHoursStr = '-'
  let totalHoursDecimal = 0
  let undertimeMinutes = 0
  let hasValidOut = false
  let isAwaitingOut = false

  // Calculate Late Minutes (clean non-negative integer)
  const lateMinutes = calculateLateMinutes(firstPunch.attendance_time, config)

  const manilaNow = getManilaCurrentTime()
  const isToday = selectedDate === manilaNow.dateStr
  const isPastCutoff = manilaNow.hour >= config.attendanceOutCutoffHour

  let status = 'Regular Day'
  let statusVariant: 'success' | 'warning' | 'outline' | 'destructive' | 'info' = 'success'

  // CASE 1: Only 1 valid punch
  if (validCount === 1) {
    if (isToday && !isPastCutoff) {
      status = 'Awaiting OUT'
      statusVariant = 'info'
      isAwaitingOut = true
      hasValidOut = false
    } else {
      status = 'Single Punch (No OUT)'
      statusVariant = 'warning'
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
      // Two punches too close together to constitute a full workday session
      if (isToday && !isPastCutoff) {
        status = 'Awaiting OUT'
        statusVariant = 'info'
        isAwaitingOut = true
        hasValidOut = false
      } else {
        status = 'Single Punch (No OUT)'
        statusVariant = 'warning'
        isAwaitingOut = false
        hasValidOut = false
      }
    } else {
      // Legitimate IN and OUT session
      timeOutStr = formatManilaTime(secondPunch.attendance_time)
      const grossHours = Math.max(0, sessionDurationMs / 3600000)
      totalHoursDecimal = Number(grossHours.toFixed(2))
      totalHoursStr = `${grossHours.toFixed(1)} hrs`
      hasValidOut = true
      undertimeMinutes = calculateUndertimeMinutes(secondPunch.attendance_time, config)

      status = 'Regular Day'
      statusVariant = lateMinutes > 0 ? 'warning' : 'success'
    }
  }
  // CASE 3: 4 or more valid punches (IN, Break OUT, Break IN, Final OUT)
  else if (validCount >= 4) {
    const lastPunch = validPunches[validCount - 1]
    const lastPunchMs = new Date(lastPunch.attendance_time).getTime()

    breakOutStr = formatManilaTime(validPunches[1].attendance_time)
    breakInStr = formatManilaTime(validPunches[2].attendance_time)
    timeOutStr = formatManilaTime(lastPunch.attendance_time)

    const grossMs = lastPunchMs - firstPunchMs
    const breakMs = new Date(validPunches[2].attendance_time).getTime() - new Date(validPunches[1].attendance_time).getTime()
    const netMs = Math.max(0, grossMs - Math.max(0, breakMs))
    const netHours = netMs / 3600000

    totalHoursDecimal = Number(netHours.toFixed(2))
    totalHoursStr = `${netHours.toFixed(1)} hrs`
    hasValidOut = true
    undertimeMinutes = calculateUndertimeMinutes(lastPunch.attendance_time, config)

    status = 'Regular Day'
    statusVariant = lateMinutes > 0 ? 'warning' : 'success'
  }
  // CASE 4: 3 valid punches (e.g. IN, Lunch OUT, Final OUT)
  else if (validCount === 3) {
    const lastPunch = validPunches[2]
    const lastPunchMs = new Date(lastPunch.attendance_time).getTime()

    breakOutStr = formatManilaTime(validPunches[1].attendance_time)
    timeOutStr = formatManilaTime(lastPunch.attendance_time)

    const grossMs = lastPunchMs - firstPunchMs
    const grossHours = Math.max(0, grossMs / 3600000)

    totalHoursDecimal = Number(grossHours.toFixed(2))
    totalHoursStr = `${grossHours.toFixed(1)} hrs`
    hasValidOut = true
    undertimeMinutes = calculateUndertimeMinutes(lastPunch.attendance_time, config)

    status = 'Regular Day'
    statusVariant = lateMinutes > 0 ? 'warning' : 'success'
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
    date: formattedDisplayDate,
    raw_date: selectedDate,
    time_in: timeInStr,
    break_out: breakOutStr,
    break_in: breakInStr,
    time_out: timeOutStr,
    total_hours: totalHoursStr,
    total_hours_decimal: totalHoursDecimal,
    status, // Guaranteed clean status string!
    status_variant: statusVariant,
    late_minutes: lateMinutes, // Dedicated integer metric!
    undertime_minutes: undertimeMinutes,
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
