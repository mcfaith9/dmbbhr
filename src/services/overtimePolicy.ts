import { normalizeTimeToHHMM } from '../lib/timeUtils.ts'

/**
 * Overtime policy rules for payroll calculation.
 *
 * Ordinary working day (company policy):
 *   One qualifying overtime occurrence earns a flat premium of 25% of the
 *   employee's DAILY rate, once per occurrence, regardless of approved hours.
 *   Formula: Overtime Pay = Daily Rate x 25%
 *
 * Rest day / holiday / special day categories keep the statutory hourly
 * treatment (payable hours x hourly rate x statutory multiplier).
 */

export type OvertimeDayClass =
  | 'ordinary'
  | 'specialWorking'
  | 'restDay'
  | 'specialNonWorking'
  | 'specialNonWorkingRestDay'
  | 'regularHoliday'
  | 'regularHolidayRestDay'

export const OVERTIME_HOURLY_MULTIPLIERS: Record<Exclude<OvertimeDayClass, 'ordinary'>, number> = {
  specialWorking: 1.25,
  restDay: 1.69,
  specialNonWorking: 1.69,
  specialNonWorkingRestDay: 1.95,
  regularHoliday: 2.6,
  regularHolidayRestDay: 3.38
}

export function classifyOvertimeDay(isSunday: boolean, holidayType?: string | null): OvertimeDayClass {
  const holType = holidayType || ''
  if (holType === 'Regular') {
    return isSunday ? 'regularHolidayRestDay' : 'regularHoliday'
  }
  if (holType === 'Special Non-Working' || holType === 'Local Holiday') {
    return isSunday ? 'specialNonWorkingRestDay' : 'specialNonWorking'
  }
  if (holType === 'Special Working') {
    return 'specialWorking'
  }
  return isSunday ? 'restDay' : 'ordinary'
}

/**
 * Minutes actually attended beyond the scheduled end of shift, clamped to the
 * authorized overtime window. Minute-granularity (seconds are dropped by the
 * existing time normalization policy).
 */
export function computeAttendedOvertimeMinutes(
  actualOutStr?: string,
  expectedOutStr: string = '17:00',
  authorizedStart?: string,
  authorizedEnd?: string
): number {
  if (!actualOutStr) return 0
  const normOut = normalizeTimeToHHMM(actualOutStr)
  if (!normOut) return 0
  const normExp = normalizeTimeToHHMM(expectedOutStr) || '17:00'
  const normStart = normalizeTimeToHHMM(authorizedStart) || normExp
  const normEnd = normalizeTimeToHHMM(authorizedEnd)

  const toMinutes = (t: string): number => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }

  const outMin = toMinutes(normOut)
  const startMin = Math.max(toMinutes(normExp), toMinutes(normStart))
  const endMin = normEnd ? toMinutes(normEnd) : Number.POSITIVE_INFINITY
  if (outMin <= startMin) return 0
  const cappedOut = Math.min(outMin, endMin)
  if (cappedOut <= startMin) return 0
  return cappedOut - startMin
}

export interface OvertimeAuthorizationLike {
  bioId: string
  date: string
  status: string
  authorizedHours?: number | string
  startTime?: string
  endTime?: string
}

/**
 * Builds the approved-overtime lookup map keyed by date (both the raw and the
 * normalized YYYY-MM-DD form) for the target employee IDs. Non-Approved
 * records and records for other employees/dates are excluded. Multiple
 * records for the same employee and date collapse to a single entry, so one
 * occurrence can never be paid more than once.
 */
export function collectApprovedOvertimeByDate<T extends OvertimeAuthorizationLike>(
  records: T[],
  targetIds: Set<string>
): Map<string, T> {
  const map = new Map<string, T>()
  for (const ot of records) {
    if (ot.status !== 'Approved') continue
    const otBio = String(ot.bioId).trim().toLowerCase()
    if (targetIds.size > 0 && !targetIds.has(otBio)) continue
    const date = String(ot.date || '').trim()
    if (!date) continue
    map.set(date, ot)
    const normalized = normalizeDateString(date)
    if (normalized && normalized !== date) {
      map.set(normalized, ot)
    }
  }
  return map
}

export function normalizeDateString(d?: string | null): string {
  if (!d) return ''
  const trimmed = d.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  try {
    const dt = new Date(trimmed)
    if (!isNaN(dt.getTime())) {
      const y = dt.getFullYear()
      const m = String(dt.getMonth() + 1).padStart(2, '0')
      const day = String(dt.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
  } catch {
    // ignore
  }
  return trimmed
}

export interface OvertimeDayEvaluation {
  qualifying: boolean
  overtimeHours: number
  overtimePay: number
}

export interface OvertimeDayInput {
  dayClass: OvertimeDayClass
  dailyRate: number
  hourlyRate: number
  authorizedHours: number
  authorizationStatus?: string
  actualOut?: string
  expectedOut?: string
  authorizedStart?: string
  authorizedEnd?: string
  hasValidOut?: boolean
  workedHoursDecimal?: number
  /** Off-day scheduled OT fallback (Sunday/holiday worked hours with approved form) */
  allowOffDayFallback?: boolean
}

/**
 * Evaluates one day's overtime for an approved authorization record.
 *
 * Qualifying rules:
 * - The authorization must be Approved.
 * - On regular duty days: a valid OUT punch must exist and the attended
 *   minutes after the scheduled end (clamped to the authorized window) must
 *   be greater than zero. The employee is never assumed to have completed the
 *   full authorized duration.
 * - On rest days / holidays (off-day fallback): worked hours from the daily
 *   attendance record are used, capped by the authorized duration.
 *
 * Pay rules:
 * - Ordinary day: flat Daily Rate x 25% once per qualifying occurrence.
 * - All other day classes: payable hours x hourly rate x statutory multiplier.
 */
export function evaluateOvertimeDay(input: OvertimeDayInput): OvertimeDayEvaluation {
  const authorizedHours = Math.max(0, Number(input.authorizedHours) || 0)
  const dailyRate = Number(input.dailyRate) || 0
  const hourlyRate = Number(input.hourlyRate) || 0

  if (input.authorizationStatus !== undefined && input.authorizationStatus !== 'Approved') {
    return { qualifying: false, overtimeHours: 0, overtimePay: 0 }
  }
  if (authorizedHours <= 0) {
    return { qualifying: false, overtimeHours: 0, overtimePay: 0 }
  }

  const attendedMins = computeAttendedOvertimeMinutes(
    input.actualOut,
    input.expectedOut || '17:00',
    input.authorizedStart,
    input.authorizedEnd
  )
  const attendedHours = Math.round((attendedMins / 60) * 100) / 100

  let payableOtHours = 0
  if (input.hasValidOut && attendedHours > 0) {
    payableOtHours = Math.min(authorizedHours, attendedHours)
  } else if (input.allowOffDayFallback) {
    const workedHours = Number(input.workedHoursDecimal) || 0
    payableOtHours = workedHours > 0 ? Math.min(authorizedHours, workedHours) : 0
  }

  if (payableOtHours <= 0) {
    return { qualifying: false, overtimeHours: 0, overtimePay: 0 }
  }

  if (input.dayClass === 'ordinary') {
    const pay = Math.round(dailyRate * 0.25 * 100) / 100
    return { qualifying: true, overtimeHours: payableOtHours, overtimePay: pay }
  }

  const multiplier = OVERTIME_HOURLY_MULTIPLIERS[input.dayClass] ?? 1.25
  const pay = Math.round(payableOtHours * hourlyRate * multiplier * 100) / 100
  return { qualifying: true, overtimeHours: payableOtHours, overtimePay: pay }
}
