/**
 * Biometric Attendance Interpretation Engine
 *
 * Implements schedule-aware HR attendance evaluation:
 * - Dynamic Work Group standard schedules (GROUP A: 6am-3pm, GROUP B: 7am-4pm, GROUP C: 8am-5pm)
 * - Lunch break evaluation (default 12:00 PM - 1:00 PM) without guessing employee intent
 * - Multi-punch window clustering: Morning IN, Lunch OUT/IN, and Afternoon/Shift OUT
 * - Correct Quimada scenario handling (IN + Lunch scans != Early departure; correctly identifies Awaiting OUT)
 * - Exact Late Minutes calculation against employee's Work Group Standard IN
 * - Exact Early Out Minutes calculation only on qualifying final OUT
 * - Preservation of ALL raw punch records for auditability (no deletion of duplicates)
 * - First valid punch in each cluster is primary; subsequent scans within threshold are duplicates
 * - Compact status strings:
 *   Regular Day, Awaiting OUT, Single Punch — No OUT, Likely OUT — Missing IN,
 *   Half Day, Half Day — PM, Late, Early OUT, Incomplete / Review, Leave,
 *   Field Work, Manual Time, Duplicate Scan
 * - Seamless integration with approved Leave, Manual Time, and HR context
 */

import type { AttendanceLog, EmploymentStatus } from '@/types'
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
  approvedLeave?: {
    id: string
    leaveType: string
    startDate: string
    endDate: string
    status: string
    reason?: string
  }
  isHalfDayApproved?: boolean
  isHalfDayPMApproved?: boolean
  isFieldWorkApproved?: boolean
  employeeStatus?: EmploymentStatus
  resignationDate?: string
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
  windowRoleLabel?: string
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
  expected_in: string // e.g. "8:00 AM"
  actual_in: string // e.g. "7:53 AM" or "Missing (Manual Request Required)"
  expected_out: string // e.g. "5:00 PM"
  actual_out: string // e.g. "5:03 PM" or "-"
  break_out: string
  break_in: string
  total_hours: string // e.g. "8.0 hrs"
  total_hours_decimal: number
  worked_minutes: number
  late_minutes: number // Clean integer against Work Group Standard IN
  early_out_minutes: number // Clean integer against Work Group Expected OUT
  undertime_minutes: number
  employee_status?: EmploymentStatus
  resignation_date?: string
  status: string // Compact HR Status
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
 */
export function processEmployeeDayPunches(
  bioId: string,
  rawLogs: AttendanceLog[],
  selectedDate: string,
  employeeContext?: EmployeeScheduleContext,
  customConfig: Partial<AttendanceEngineConfig> = {}
): DailyAttendanceRecord | null {
  const config: AttendanceEngineConfig = { ...DEFAULT_ATTENDANCE_CONFIG, ...customConfig }

  // 1. Resolve Work Group parameters
  const standardInHHMM = employeeContext?.standardIn || '08:00'
  const requiredWorkMins = employeeContext?.requiredWorkMinutes || 480 // 8 hours
  const lunchStartHHMM = employeeContext?.lunchStart || '12:00'
  const lunchEndHHMM = employeeContext?.lunchEnd || '13:00'
  const workGroupId = employeeContext?.workGroupId || 'wg-group-c'
  const workGroupName = employeeContext?.workGroupName || (workGroupId === 'wg-group-a' ? 'GROUP A' : (workGroupId === 'wg-group-b' ? 'GROUP B' : 'GROUP C'))

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

  const employeeName = employeeContext?.name || rawLogs?.[0]?.employee_name || `User ${bioId}`
  const employeeLocation = employeeContext?.location || rawLogs?.[0]?.location_name || 'DBB CEBU'

  // CHECK A: Approved Leave (0 punches or overriding)
  if (employeeContext?.approvedLeave && (!rawLogs || rawLogs.length === 0)) {
    const leave = employeeContext.approvedLeave
    return {
      id: `daily-${bioId}-${selectedDate}`,
      biometric_user_id: bioId,
      employee_name: employeeName,
      department: employeeContext.department || '',
      location: employeeLocation,
      work_group_id: workGroupId,
      work_group_name: workGroupName,
      date: selectedDate,
      raw_date: selectedDate,
      expected_in: expectedInFormatted,
      actual_in: '-',
      expected_out: expectedOutFormatted,
      actual_out: '-',
      break_out: '-',
      break_in: '-',
      total_hours: '8.0 hrs',
      total_hours_decimal: 8.0,
      worked_minutes: 480,
      late_minutes: 0,
      early_out_minutes: 0,
      undertime_minutes: 0,
      status: 'Leave',
      status_variant: 'outline',
      raw_punches_count: 0,
      valid_punches_count: 0,
      duplicate_punches_count: 0,
      total_punches: 0,
      punches_summary: '0',
      has_valid_out: false,
      is_awaiting_out: false,
      first_punch_time_ms: 0,
      latest_punch_time_ms: 0,
      latest_punch_time: '-',
      raw_punches: [],
      valid_punches: [],
      scan_breakdown: [],
      notes: `Approved ${leave.leaveType} Leave`
    }
  }

  // CHECK B: Approved Field Work / OB with 0 biometric punches
  const manual = employeeContext?.manualAdjustment
  const isFieldWorkContext = employeeContext?.isFieldWorkApproved ||
    (manual && (manual.reason?.toLowerCase().includes('field work') || manual.reason?.toLowerCase().includes('official business') || manual.notes?.toLowerCase().includes('field work') || manual.notes?.toLowerCase().includes('ob')))

  if (isFieldWorkContext && manual?.status === 'Approved' && (!rawLogs || rawLogs.length === 0)) {
    return {
      id: `daily-${bioId}-${selectedDate}`,
      biometric_user_id: bioId,
      employee_name: employeeName,
      department: employeeContext?.department || '',
      location: employeeLocation,
      work_group_id: workGroupId,
      work_group_name: workGroupName,
      date: selectedDate,
      raw_date: selectedDate,
      expected_in: expectedInFormatted,
      actual_in: manual.manualIn ? `${manual.manualIn} (Manual)` : expectedInFormatted,
      expected_out: expectedOutFormatted,
      actual_out: manual.manualOut ? `${manual.manualOut} (Manual)` : expectedOutFormatted,
      break_out: '-',
      break_in: '-',
      total_hours: '8.0 hrs',
      total_hours_decimal: 8.0,
      worked_minutes: 480,
      late_minutes: 0,
      early_out_minutes: 0,
      undertime_minutes: 0,
      status: 'Field Work',
      status_variant: 'secondary',
      raw_punches_count: 0,
      valid_punches_count: 0,
      duplicate_punches_count: 0,
      total_punches: 0,
      punches_summary: '0',
      has_valid_out: true,
      is_awaiting_out: false,
      is_manual_adjustment: true,
      manual_adjustment_reason: manual.reason || 'Field Work / Official Business',
      first_punch_time_ms: 0,
      latest_punch_time_ms: 0,
      latest_punch_time: '-',
      raw_punches: [],
      valid_punches: [],
      scan_breakdown: [],
      notes: 'Approved Field Work / Official Business'
    }
  }

  if (!rawLogs || rawLogs.length === 0) return null

  // 2. Sort raw logs chronologically ascending (earliest first)
  const sortedLogs = [...rawLogs].sort(
    (a, b) => new Date(a.attendance_time).getTime() - new Date(b.attendance_time).getTime()
  )

  // 3. Duplicate scan clustering (consecutive scans within duplicatePunchThresholdSeconds e.g. 60s)
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

  // Schedule Window Boundaries
  // Morning Arrival window: before lunch start minus 15 mins (e.g. < 11:45 AM for 12:00 lunch)
  const morningArrivalCutoffMins = lunchStartMins - 15
  // Afternoon Departure window: at least lunchEndMins + 35 (e.g. >= 1:35 PM) AND >= expectedInMinutes + 210
  const afternoonDepartureMinMins = Math.max(lunchEndMins + 35, expectedInMinutes + 210)

  // Check Approved HR Context
  const isApprovedHalfDayAM = employeeContext?.isHalfDayApproved ||
    (manual?.status === 'Approved' && (manual.reason?.toLowerCase().includes('half day') || manual.notes?.toLowerCase().includes('half day')) && !manual.reason?.toLowerCase().includes('pm'))
  const isApprovedHalfDayPM = employeeContext?.isHalfDayPMApproved ||
    (manual?.status === 'Approved' && (manual.reason?.toLowerCase().includes('half day - pm') || manual.notes?.toLowerCase().includes('half day - pm') || manual.reason?.toLowerCase().includes('half day pm')))

  // 4. Punch Classification
  // Classify valid punches into candidates
  const morningPunches: AttendanceLog[] = []
  const lunchOutPunches: AttendanceLog[] = []
  const lunchInPunches: AttendanceLog[] = []
  const afternoonOutPunches: AttendanceLog[] = []
  const otherPunches: AttendanceLog[] = []

  for (const p of validPunches) {
    const mins = getManilaMinutesFromMidnight(p.attendance_time)
    if (mins < morningArrivalCutoffMins) {
      morningPunches.push(p)
    } else if (mins >= lunchStartMins - 30 && mins <= lunchStartMins + 30) {
      lunchOutPunches.push(p)
    } else if (mins > lunchStartMins + 30 && mins <= lunchEndMins + 35) {
      lunchInPunches.push(p)
    } else if (mins >= afternoonDepartureMinMins) {
      afternoonOutPunches.push(p)
    } else {
      otherPunches.push(p)
    }
  }

  // -------------------------------------------------------------
  // EVALUATION SCENARIOS
  // -------------------------------------------------------------

  // CASE 1: Single primary valid punch
  if (validCount === 1) {
    const punch = validPunches[0]
    const pMins = getManilaMinutesFromMidnight(punch.attendance_time)
    const pTime = formatManilaTime(punch.attendance_time)

    // Subcase 1.1: Morning arrival punch (e.g. 8:07 AM on 8am-5pm)
    if (pMins < morningArrivalCutoffMins) {
      actualInStr = pTime
      actualOutStr = '-'
      lateMinutes = Math.max(0, pMins - expectedInMinutes)
      earlyOutMinutes = 0
      hasValidOut = false

      if (isToday && !isPastCutoff) {
        status = 'Awaiting OUT'
        statusVariant = 'secondary'
        isAwaitingOut = true
      } else {
        status = 'Single Punch — No OUT'
        statusVariant = 'outline'
        isAwaitingOut = false
      }
    }
    // Subcase 1.2: Afternoon shift-end punch (e.g. 5:20 PM on 8am-5pm)
    else if (pMins >= afternoonDepartureMinMins) {
      actualInStr = 'Missing (Manual Request Required)'
      actualOutStr = pTime
      hasValidOut = true
      isAwaitingOut = false
      isLikelyOut = true
      isMissingIn = true
      lateMinutes = 0
      earlyOutMinutes = Math.max(0, expectedOutMinutes - pMins)
      status = 'Likely OUT — Missing IN'
      statusVariant = 'destructive'
      notes = `Single punch recorded at departure (${pTime}). Morning biometric IN missing.`
    }
    // Subcase 1.3: Ambiguous midday / lunch scan only
    else {
      actualInStr = pTime
      actualOutStr = '-'
      hasValidOut = false
      status = 'Incomplete / Review'
      statusVariant = 'destructive'
      notes = `Single punch occurred at ${pTime}. Incomplete attendance.`
    }
  }

  // CASE 2: Exactly 2 primary valid punches
  else if (validCount === 2) {
    const p1 = validPunches[0]
    const p2 = validPunches[1]
    const p1Mins = getManilaMinutesFromMidnight(p1.attendance_time)
    const p2Mins = getManilaMinutesFromMidnight(p2.attendance_time)
    const sessionMins = p2Mins - p1Mins

    // Subcase 2.1: Morning arrival IN + Afternoon departure OUT (Standard Day / Late / Early OUT)
    if (p1Mins < morningArrivalCutoffMins && p2Mins >= afternoonDepartureMinMins) {
      actualInStr = formatManilaTime(p1.attendance_time)
      actualOutStr = formatManilaTime(p2.attendance_time)
      hasValidOut = true
      isAwaitingOut = false

      lateMinutes = Math.max(0, p1Mins - expectedInMinutes)
      earlyOutMinutes = Math.max(0, expectedOutMinutes - p2Mins)
      undertimeMinutes = earlyOutMinutes

      let grossMins = Math.max(0, p2Mins - p1Mins)
      if (p1Mins < lunchStartMins && p2Mins > lunchEndMins) {
        grossMins = Math.max(0, grossMins - (lunchEndMins - lunchStartMins))
      }
      workedMinutes = grossMins
      const netHours = workedMinutes / 60
      totalHoursDecimal = Number(netHours.toFixed(2))
      totalHoursStr = `${netHours.toFixed(1)} hrs`

      if (lateMinutes > 0) {
        status = 'Late'
        statusVariant = 'warning'
      } else if (earlyOutMinutes > 0) {
        status = 'Early OUT'
        statusVariant = 'warning'
      } else {
        status = 'Regular Day'
        statusVariant = 'success'
      }
    }

    // Subcase 2.2: Morning IN + Lunch-time punch (e.g. 7:53 AM + 12:00 PM or 7:53 AM + 12:57 PM)
    else if (p1Mins < morningArrivalCutoffMins && p2Mins < afternoonDepartureMinMins) {
      actualInStr = formatManilaTime(p1.attendance_time)
      lateMinutes = Math.max(0, p1Mins - expectedInMinutes)

      if (isApprovedHalfDayAM) {
        actualOutStr = formatManilaTime(p2.attendance_time)
        hasValidOut = true
        workedMinutes = Math.max(0, p2Mins - p1Mins)
        totalHoursStr = `${(workedMinutes / 60).toFixed(1)} hrs`
        totalHoursDecimal = Number((workedMinutes / 60).toFixed(2))
        status = 'Half Day'
        statusVariant = 'secondary'
      } else {
        // Without approved half day, 12:00-12:57 is a lunch scan, NOT final OUT
        if (p2Mins <= lunchStartMins + 25) {
          breakOutStr = formatManilaTime(p2.attendance_time)
        } else {
          breakInStr = formatManilaTime(p2.attendance_time)
        }
        actualOutStr = '-'
        hasValidOut = false
        earlyOutMinutes = 0 // Do not calculate early out on lunch punch

        if (isToday && !isPastCutoff) {
          status = 'Awaiting OUT'
          statusVariant = 'secondary'
          isAwaitingOut = true
        } else {
          status = 'Incomplete / Review'
          statusVariant = 'destructive'
        }
      }
    }

    // Subcase 2.3: Midday/Lunch IN + Afternoon OUT (e.g. 12:55 PM + 5:03 PM)
    else if (p1Mins >= lunchStartMins - 30 && p1Mins <= lunchEndMins + 35 && p2Mins >= afternoonDepartureMinMins) {
      if (isApprovedHalfDayPM) {
        actualInStr = formatManilaTime(p1.attendance_time)
        actualOutStr = formatManilaTime(p2.attendance_time)
        hasValidOut = true
        workedMinutes = Math.max(0, p2Mins - p1Mins)
        totalHoursStr = `${(workedMinutes / 60).toFixed(1)} hrs`
        totalHoursDecimal = Number((workedMinutes / 60).toFixed(2))
        status = 'Half Day — PM'
        statusVariant = 'secondary'
      } else {
        actualInStr = 'Missing (Manual Request Required)'
        breakInStr = formatManilaTime(p1.attendance_time)
        actualOutStr = formatManilaTime(p2.attendance_time)
        hasValidOut = true
        isLikelyOut = true
        isMissingIn = true
        status = 'Likely OUT — Missing IN'
        statusVariant = 'destructive'
      }
    }

    // Subcase 2.4: Both punches within lunch window (e.g. 11:57 AM + 12:57 PM)
    else if (p1Mins >= lunchStartMins - 30 && p2Mins <= lunchEndMins + 35) {
      actualInStr = '-'
      breakOutStr = formatManilaTime(p1.attendance_time)
      breakInStr = formatManilaTime(p2.attendance_time)
      actualOutStr = '-'
      hasValidOut = false
      status = 'Incomplete / Review'
      statusVariant = 'destructive'
      notes = 'Only lunch break punches recorded. Morning IN and shift OUT missing.'
    }

    // Subcase 2.5: Both punches in morning close together (< 30 mins)
    else if (p1Mins < morningArrivalCutoffMins && p2Mins < morningArrivalCutoffMins && sessionMins < config.minSessionDurationMinutes) {
      actualInStr = formatManilaTime(p1.attendance_time)
      actualOutStr = '-'
      lateMinutes = Math.max(0, p1Mins - expectedInMinutes)
      hasValidOut = false
      if (isToday && !isPastCutoff) {
        status = 'Awaiting OUT'
        statusVariant = 'secondary'
        isAwaitingOut = true
      } else {
        status = 'Single Punch — No OUT'
        statusVariant = 'outline'
      }
    }

    // Subcase 2.6: Both punches near shift end (< 60 mins)
    else if (p1Mins >= afternoonDepartureMinMins && sessionMins < 60) {
      actualInStr = 'Missing (Manual Request Required)'
      actualOutStr = formatManilaTime(p2.attendance_time)
      hasValidOut = true
      isLikelyOut = true
      isMissingIn = true
      status = 'Likely OUT — Missing IN'
      statusVariant = 'destructive'
    }

    else {
      actualInStr = formatManilaTime(p1.attendance_time)
      actualOutStr = formatManilaTime(p2.attendance_time)
      hasValidOut = true
      status = 'Incomplete / Review'
      statusVariant = 'destructive'
    }
  }

  // CASE 3: Exactly 3 primary valid punches (e.g. Quimada: 7:53 AM, 11:57 AM, 12:57 PM)
  else if (validCount === 3) {
    const p1 = validPunches[0]
    const p2 = validPunches[1]
    const p3 = validPunches[2]
    const p1Mins = getManilaMinutesFromMidnight(p1.attendance_time)
    const p2Mins = getManilaMinutesFromMidnight(p2.attendance_time)
    const p3Mins = getManilaMinutesFromMidnight(p3.attendance_time)

    // Subcase 3.1: QUIMADA SCENARIO — Morning IN + Lunch OUT + Lunch IN (P3 is within lunch return, NO departure punch yet)
    if (p1Mins < morningArrivalCutoffMins && p2Mins <= lunchStartMins + 30 && p3Mins <= lunchEndMins + 35) {
      actualInStr = formatManilaTime(p1.attendance_time)
      breakOutStr = formatManilaTime(p2.attendance_time)
      breakInStr = formatManilaTime(p3.attendance_time)
      actualOutStr = '-'
      hasValidOut = false
      isAwaitingOut = true
      lateMinutes = Math.max(0, p1Mins - expectedInMinutes)
      earlyOutMinutes = 0 // CRITICAL: 12:57 PM is lunch return, NOT final OUT! Zero early out minutes.
      workedMinutes = 0
      totalHoursStr = '-'
      status = 'Awaiting OUT'
      statusVariant = 'secondary'
    }

    // Subcase 3.2: Morning IN + 1 Lunch scan + Afternoon Departure OUT (e.g. 7:53 AM, 12:00 PM, 5:03 PM)
    else if (p1Mins < morningArrivalCutoffMins && p3Mins >= afternoonDepartureMinMins) {
      actualInStr = formatManilaTime(p1.attendance_time)
      if (p2Mins <= lunchStartMins + 30) {
        breakOutStr = formatManilaTime(p2.attendance_time)
      } else {
        breakInStr = formatManilaTime(p2.attendance_time)
      }
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

      if (lateMinutes > 0) {
        status = 'Late'
        statusVariant = 'warning'
      } else if (earlyOutMinutes > 0) {
        status = 'Early OUT'
        statusVariant = 'warning'
      } else {
        status = 'Regular Day'
        statusVariant = 'success'
      }
    }

    // Subcase 3.3: Lunch scans + Afternoon Departure OUT (Missing Morning IN)
    else if (p1Mins >= lunchStartMins - 30 && p3Mins >= afternoonDepartureMinMins) {
      actualInStr = 'Missing (Manual Request Required)'
      breakOutStr = formatManilaTime(p1.attendance_time)
      breakInStr = formatManilaTime(p2.attendance_time)
      actualOutStr = formatManilaTime(p3.attendance_time)
      hasValidOut = true
      isLikelyOut = true
      isMissingIn = true
      status = 'Likely OUT — Missing IN'
      statusVariant = 'destructive'
    }

    else {
      actualInStr = formatManilaTime(p1.attendance_time)
      actualOutStr = formatManilaTime(p3.attendance_time)
      hasValidOut = true
      status = 'Incomplete / Review'
      statusVariant = 'destructive'
    }
  }

  // CASE 4: 4 or more primary valid punches
  else {
    const hasMorning = morningPunches.length > 0
    const hasDeparture = afternoonOutPunches.length > 0

    if (hasMorning && hasDeparture) {
      const pIn = morningPunches[0]
      const pOut = afternoonOutPunches[afternoonOutPunches.length - 1]
      const inMins = getManilaMinutesFromMidnight(pIn.attendance_time)
      const outMins = getManilaMinutesFromMidnight(pOut.attendance_time)

      actualInStr = formatManilaTime(pIn.attendance_time)
      actualOutStr = formatManilaTime(pOut.attendance_time)
      hasValidOut = true
      isAwaitingOut = false

      if (lunchOutPunches.length > 0) breakOutStr = formatManilaTime(lunchOutPunches[0].attendance_time)
      if (lunchInPunches.length > 0) breakInStr = formatManilaTime(lunchInPunches[lunchInPunches.length - 1].attendance_time)

      lateMinutes = Math.max(0, inMins - expectedInMinutes)
      earlyOutMinutes = Math.max(0, expectedOutMinutes - outMins)
      undertimeMinutes = earlyOutMinutes

      const grossMins = Math.max(0, outMins - inMins)
      workedMinutes = Math.max(0, grossMins - (lunchEndMins - lunchStartMins))
      const netHours = workedMinutes / 60
      totalHoursDecimal = Number(netHours.toFixed(2))
      totalHoursStr = `${netHours.toFixed(1)} hrs`

      if (lateMinutes > 0) {
        status = 'Late'
        statusVariant = 'warning'
      } else if (earlyOutMinutes > 0) {
        status = 'Early OUT'
        statusVariant = 'warning'
      } else {
        status = 'Regular Day'
        statusVariant = 'success'
      }
    } else if (hasMorning && !hasDeparture) {
      actualInStr = formatManilaTime(morningPunches[0].attendance_time)
      if (lunchOutPunches.length > 0) breakOutStr = formatManilaTime(lunchOutPunches[0].attendance_time)
      if (lunchInPunches.length > 0) breakInStr = formatManilaTime(lunchInPunches[lunchInPunches.length - 1].attendance_time)
      actualOutStr = '-'
      hasValidOut = false
      isAwaitingOut = true
      earlyOutMinutes = 0
      status = 'Awaiting OUT'
      statusVariant = 'secondary'
    } else if (!hasMorning && hasDeparture) {
      actualInStr = 'Missing (Manual Request Required)'
      if (lunchOutPunches.length > 0) breakOutStr = formatManilaTime(lunchOutPunches[0].attendance_time)
      if (lunchInPunches.length > 0) breakInStr = formatManilaTime(lunchInPunches[lunchInPunches.length - 1].attendance_time)
      actualOutStr = formatManilaTime(afternoonOutPunches[afternoonOutPunches.length - 1].attendance_time)
      hasValidOut = true
      isLikelyOut = true
      isMissingIn = true
      status = 'Likely OUT — Missing IN'
      statusVariant = 'destructive'
    } else {
      status = 'Incomplete / Review'
      statusVariant = 'destructive'
    }
  }

  // -------------------------------------------------------------
  // HR CONTEXT & MANUAL TIME OVERRIDE
  // -------------------------------------------------------------
  let isManualAdjustment = false
  let isPendingAdjustment = false
  let manualAdjustmentReason = ''
  let manualAdjustmentRef = ''
  let manualAdjustmentStatus: 'Approved' | 'Pending' | undefined

  if (manual) {
    manualAdjustmentReason = manual.reason || manual.notes || 'Manual Adjustment'
    manualAdjustmentRef = manual.id
    manualAdjustmentStatus = manual.status === 'Approved' ? 'Approved' : 'Pending'

    if (manual.status === 'Pending') {
      isPendingAdjustment = true
      status = 'Manual Time'
      statusVariant = 'secondary'
    } else if (manual.status === 'Approved') {
      isManualAdjustment = true
      let effInMins = -1
      let effOutMins = -1

      if (manual.manualIn) {
        actualInStr = `${manual.manualIn} (Manual)`
        isMissingIn = false
        isLikelyOut = false
        effInMins = parseHHMMOr12hToMinutes(manual.manualIn)
      } else if (actualInStr !== '-' && !actualInStr.includes('Missing')) {
        effInMins = parseHHMMOr12hToMinutes(actualInStr)
      }

      if (manual.manualOut) {
        actualOutStr = `${manual.manualOut} (Manual)`
        hasValidOut = true
        isAwaitingOut = false
        effOutMins = parseHHMMOr12hToMinutes(manual.manualOut)
      } else if (actualOutStr !== '-' && !actualOutStr.includes('Missing') && !actualOutStr.includes('Awaiting')) {
        effOutMins = parseHHMMOr12hToMinutes(actualOutStr)
      }

      if (isFieldWorkContext) {
        status = 'Field Work'
        statusVariant = 'secondary'
      } else if (isApprovedHalfDayAM) {
        status = 'Half Day'
        statusVariant = 'secondary'
      } else if (isApprovedHalfDayPM) {
        status = 'Half Day — PM'
        statusVariant = 'secondary'
      } else if (effInMins >= 0 && effOutMins >= 0 && effOutMins >= effInMins) {
        lateMinutes = Math.max(0, effInMins - expectedInMinutes)
        earlyOutMinutes = Math.max(0, expectedOutMinutes - effOutMins)
        undertimeMinutes = earlyOutMinutes

        let grossMins = Math.max(0, effOutMins - effInMins)
        if (effInMins < lunchStartMins && effOutMins > lunchEndMins) {
          grossMins = Math.max(0, grossMins - (lunchEndMins - lunchStartMins))
        }
        workedMinutes = grossMins
        const netHours = workedMinutes / 60
        totalHoursDecimal = Number(netHours.toFixed(2))
        totalHoursStr = `${netHours.toFixed(1)} hrs`

        if (lateMinutes > 0) {
          status = 'Late'
          statusVariant = 'warning'
        } else if (earlyOutMinutes > 0) {
          status = 'Early OUT'
          statusVariant = 'warning'
        } else {
          status = 'Manual Time'
          statusVariant = 'secondary'
        }
      } else {
        status = 'Manual Time'
        statusVariant = 'secondary'
      }
    }
  }

  // 5. Assign window roles (IN, OUT, BREAK) to scan breakdown items
  for (const scan of scanBreakdown) {
    const scanMins = getManilaMinutesFromMidnight(scan.timestampMs)
    if (scanMins < morningArrivalCutoffMins) {
      scan.windowRole = 'IN'
      scan.windowRoleLabel = 'This is for IN (Shift Arrival Window)'
    } else if (scanMins >= afternoonDepartureMinMins) {
      scan.windowRole = 'OUT'
      scan.windowRoleLabel = 'This is for OUT (Shift Departure Window)'
    } else if (scanMins >= lunchStartMins - 30 && scanMins <= lunchStartMins + 30) {
      scan.windowRole = 'BREAK_OUT'
      scan.windowRoleLabel = 'This is for Lunch (Break OUT)'
    } else if (scanMins > lunchStartMins + 30 && scanMins <= lunchEndMins + 35) {
      scan.windowRole = 'BREAK_IN'
      scan.windowRoleLabel = 'This is for Lunch (Break IN / Return)'
    } else {
      scan.windowRole = 'EXTRA'
      scan.windowRoleLabel = 'Midday Scan'
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
    employee_status: employeeContext?.employeeStatus || 'active',
    resignation_date: employeeContext?.resignationDate,
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
    is_pending_adjustment: isPendingAdjustment,
    manual_adjustment_reason: manualAdjustmentReason,
    manual_adjustment_ref: manualAdjustmentRef,
    manual_adjustment_status: manualAdjustmentStatus,
    first_punch_time_ms: firstPunchMs,
    latest_punch_time_ms: latestPunchMs,
    latest_punch_time: latestPunchTimeStr,
    raw_punches: sortedLogs,
    valid_punches: validPunches,
    scan_breakdown: scanBreakdown,
    notes
  }
}
