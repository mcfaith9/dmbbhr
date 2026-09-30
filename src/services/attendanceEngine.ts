/**
 * Biometric Attendance Interpretation Engine
 *
 * Implements:
 * - Configurable duplicate punch threshold (e.g. 30 seconds)
 * - Raw biometric punches preservation
 * - Real OUT detection vs duplicate biometric punch collapsing
 * - Multi-punch recognition (IN, Break OUT, Break IN, OUT)
 * - Workday status evaluation: "Awaiting OUT" vs "Single Punch (No OUT)"
 * - Configurable attendance cutoff time
 * - High-speed processing for 90,000+ raw punches
 */

import type { AttendanceLog } from '@/types'

export interface AttendanceEngineConfig {
  /**
   * If two punches occur within this many seconds, the second punch is treated
   * as a near-duplicate scan and ignored for session transitions.
   */
  duplicatePunchThresholdSeconds: number

  /**
   * Minimum duration in minutes required between IN and legitimate OUT.
   * Prevents punches 2 minutes apart from being treated as a completed day.
   */
  minSessionDurationMinutes: number

  /**
   * Hour of the day (24-hour format, 0-23 in Asia/Manila) after which an unclosed
   * single punch on today's date transitions from "Awaiting OUT" to "Single Punch (No OUT)".
   * Default: 19 (7:00 PM).
   */
  attendanceOutCutoffHour: number

  /**
   * Expected regular shift start hour in Asia/Manila. Default: 8 (08:00 AM).
   */
  shiftStartHour: number

  /**
   * Expected shift start minute. Default: 0.
   */
  shiftStartMinute: number

  /**
   * Grace period minutes before flagging as Late. Default: 15 (08:15 AM).
   */
  gracePeriodMinutes: number
}

export const DEFAULT_ATTENDANCE_CONFIG: AttendanceEngineConfig = {
  duplicatePunchThresholdSeconds: 30, // Configurable: 10, 15, 30, 60s
  minSessionDurationMinutes: 20,
  attendanceOutCutoffHour: 19, // 7:00 PM
  shiftStartHour: 8,
  shiftStartMinute: 0,
  gracePeriodMinutes: 15
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
  date: string
  raw_date: string // YYYY-MM-DD in Asia/Manila
  time_in: string
  break_out: string
  break_in: string
  time_out: string
  total_hours: string
  status: string
  status_variant: 'success' | 'warning' | 'outline' | 'destructive' | 'info'
  late_minutes: number
  undertime_minutes: number
  raw_punches_count: number
  valid_punches_count: number
  total_punches: number
  punches_summary: string
  is_awaiting_out: boolean
  raw_punches: AttendanceLog[]
  valid_punches: AttendanceLog[]
}

/**
 * Gets the current hour in Asia/Manila (0-23)
 */
export function getManilaCurrentHour(): number {
  try {
    const str = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      hour12: false
    }).format(new Date())
    return parseInt(str, 10) || new Date().getHours()
  } catch {
    return new Date().getHours()
  }
}

/**
 * Gets local date string YYYY-MM-DD in Asia/Manila
 */
export function getManilaDateString(dateInput: string | Date | number = new Date()): string {
  try {
    const d = new Date(dateInput)
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
export function formatManilaTime(dateInput: string | Date | number): string {
  try {
    const d = new Date(dateInput)
    if (isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(d)
  } catch {
    return ''
  }
}

/**
 * Processes raw punches for a single employee on a single day.
 * Implements strict duplicate punch collapsing and real-time status detection.
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
      // Near-duplicate punch! Retain raw record, but flag as duplicate
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
  let lateMinutes = 0
  let undertimeMinutes = 0
  let status = 'Regular Day'
  let statusVariant: 'success' | 'warning' | 'outline' | 'destructive' | 'info' = 'success'
  let isAwaitingOut = false

  // Evaluate Late Status against Shift Start (e.g. 08:15 AM)
  const firstPunchDate = new Date(firstPunch.attendance_time)
  const shiftCutoffDate = new Date(firstPunch.attendance_time)
  shiftCutoffDate.setHours(config.shiftStartHour, config.shiftStartMinute + config.gracePeriodMinutes, 0, 0)

  if (firstPunchDate > shiftCutoffDate) {
    lateMinutes = Math.round((firstPunchDate.getTime() - shiftCutoffDate.getTime()) / 60000)
  }

  const todayStr = getManilaDateString(new Date())
  const isToday = selectedDate === todayStr
  const currentHour = getManilaCurrentHour()
  const isPastCutoff = currentHour >= config.attendanceOutCutoffHour

  // Case A: Only 1 valid punch
  if (validCount === 1) {
    if (isToday && !isPastCutoff) {
      status = lateMinutes > 0 ? `Awaiting OUT (Late ${lateMinutes}m)` : 'Awaiting OUT'
      statusVariant = 'info'
      isAwaitingOut = true
    } else {
      status = lateMinutes > 0 ? `Single Punch (No OUT - Late ${lateMinutes}m)` : 'Single Punch (No OUT)'
      statusVariant = 'warning'
      isAwaitingOut = false
    }
  }
  // Case B: 2 valid punches
  else if (validCount === 2) {
    const secondPunch = validPunches[1]
    const secondPunchMs = new Date(secondPunch.attendance_time).getTime()
    const sessionDurationMs = secondPunchMs - firstPunchMs
    const sessionDurationMins = sessionDurationMs / 60000

    if (sessionDurationMins < config.minSessionDurationMinutes) {
      // Two punches too close together to be a full work session
      if (isToday && !isPastCutoff) {
        status = 'Awaiting OUT'
        statusVariant = 'info'
        isAwaitingOut = true
      } else {
        status = 'Single Punch (No OUT)'
        statusVariant = 'warning'
      }
    } else {
      // Legitimate IN and OUT
      timeOutStr = formatManilaTime(secondPunch.attendance_time)
      const grossHours = Math.max(0, sessionDurationMs / 3600000)
      totalHoursStr = `${grossHours.toFixed(1)} hrs`

      if (lateMinutes > 0) {
        status = `Late (${lateMinutes} mins)`
        statusVariant = 'warning'
      } else {
        status = 'Regular Day'
        statusVariant = 'success'
      }
    }
  }
  // Case C: 4 or more valid punches (IN, Break OUT, Break IN, Final OUT)
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
    totalHoursStr = `${netHours.toFixed(1)} hrs`

    if (lateMinutes > 0) {
      status = `Late (${lateMinutes} mins)`
      statusVariant = 'warning'
    } else {
      status = 'Regular Day'
      statusVariant = 'success'
    }
  }
  // Case D: 3 valid punches (e.g. IN, Lunch, OUT)
  else if (validCount === 3) {
    const lastPunch = validPunches[2]
    const lastPunchMs = new Date(lastPunch.attendance_time).getTime()

    breakOutStr = formatManilaTime(validPunches[1].attendance_time)
    timeOutStr = formatManilaTime(lastPunch.attendance_time)

    const grossMs = lastPunchMs - firstPunchMs
    const grossHours = Math.max(0, grossMs / 3600000)
    totalHoursStr = `${grossHours.toFixed(1)} hrs`

    if (lateMinutes > 0) {
      status = `Late (${lateMinutes} mins)`
      statusVariant = 'warning'
    } else {
      status = 'Regular Day'
      statusVariant = 'success'
    }
  }

  const formattedDisplayDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(firstPunchDate)

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
    status,
    status_variant: statusVariant,
    late_minutes: lateMinutes,
    undertime_minutes: undertimeMinutes,
    raw_punches_count: rawCount,
    valid_punches_count: validCount,
    total_punches: validCount,
    punches_summary: punchesSummary,
    is_awaiting_out: isAwaitingOut,
    raw_punches: sortedLogs,
    valid_punches: validPunches
  }
}
