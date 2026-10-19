import { normalizeTimeToHHMM } from '../lib/timeUtils.ts'

/**
 * Overtime policy rules for DMBBHR payroll calculation.
 *
 * SCOPE & RATE SPECIFICATIONS:
 *
 * 1. Ordinary Working Day Overtime:
 *    - Base hourly rate = daily wage ÷ 8
 *    - Overtime rate = hourly rate × 125% (multiplier: 1.25)
 *    - Overtime Pay = payable overtime hours × hourly rate × 1.25
 *    - Example (₱540 daily wage, ₱67.50/hr):
 *      ₱67.50 × 1.25 = ₱84.375 per overtime hour.
 *      Total earnings for 8 regular hours (₱540) + 1 overtime hour (₱84.38) = ₱624.38.
 *
 * 2. Special Non-Working Holiday Overtime:
 *    - Base daily pay for first 8 hours worked = daily wage × 130%
 *    - Base holiday hourly rate = (daily wage × 130%) ÷ 8 = regular hourly rate × 130%
 *    - Overtime rate = applicable holiday hourly rate × 130%
 *    - Mathematical Derivation of 169%:
 *      130% × 130% = 169% (multiplier: 1.69 of the ordinary hourly rate).
 *      The 30% special holiday premium applies to the applicable hourly rate,
 *      and the additional 30% overtime premium applies to that holiday hourly rate.
 *    - Example (₱540 daily wage, ₱67.50/hr):
 *      ₱67.50 × 1.30 × 1.30 = ₱67.50 × 1.69 = ₱114.075 per overtime hour.
 *      Total earnings for 8 regular hours (₱702) + 1 overtime hour (₱114.08) = ₱816.08.
 *
 * 3. Regular Holiday Overtime:
 *    - Base daily pay for first 8 hours worked = daily wage × 200%
 *    - Base holiday hourly rate = (daily wage × 200%) ÷ 8 = regular hourly rate × 200%
 *    - Overtime rate = applicable holiday hourly rate × 130%
 *    - Mathematical Derivation of 260%:
 *      200% × 130% = 260% (multiplier: 2.60 of the ordinary hourly rate).
 *      The 100% regular holiday premium sets the base holiday hourly rate to 200%,
 *      and the additional 30% overtime premium applies to that holiday hourly rate.
 *    - Example (₱540 daily wage, ₱67.50/hr):
 *      ₱67.50 × 2.00 × 1.30 = ₱67.50 × 2.60 = ₱175.50 per overtime hour.
 *      Total earnings for 8 regular hours (₱1,080) + 1 overtime hour (₱175.50) = ₱1,255.50.
 *
 * 4. Scope Restrictions:
 *    - Rest-day duty calculations are excluded for now as per instructions.
 *    - Do not implement rest-day overtime, special holiday + rest day, or regular holiday + rest day calculations yet.
 */

export type OvertimeDayClass =
  | 'ordinary'
  | 'specialWorking'
  | 'restDay'
  | 'specialNonWorking'
  | 'specialNonWorkingRestDay'
  | 'regularHoliday'
  | 'regularHolidayRestDay'

export const OVERTIME_HOURLY_MULTIPLIERS: Record<OvertimeDayClass, number> = {
  ordinary: 1.25,
  specialWorking: 1.25,
  // Rest-day duty excluded for now: fall back to statutory holiday or standard rates
  restDay: 1.25,
  specialNonWorking: 1.69,
  specialNonWorkingRestDay: 1.69,
  regularHoliday: 2.60,
  regularHolidayRestDay: 2.60
}

/**
 * Classifies a day for overtime calculation purposes.
 * Note: Rest-day duty calculations are excluded for now.
 */
export function classifyOvertimeDay(_isSunday: boolean, holidayType?: string | null): OvertimeDayClass {
  const holType = holidayType || ''
  if (holType === 'Regular') {
    return 'regularHoliday'
  }
  if (holType === 'Special Non-Working' || holType === 'Local Holiday') {
    return 'specialNonWorking'
  }
  if (holType === 'Special Working') {
    return 'specialWorking'
  }
  return 'ordinary'
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
  id?: string
  bioId: string
  date: string
  status: string
  authorizedHours?: number | string
  startTime?: string
  endTime?: string
  formNumber?: string
  purpose?: string
  approvedBy?: string
}

/**
 * Builds the approved-overtime lookup map keyed by date (both raw and normalized YYYY-MM-DD),
 * returning an array of approved authorization records for each date.
 *
 * This preserves multiple authorized overtime records on the same date or different dates.
 * Records with status !== 'Approved' and records for other employees are excluded.
 */
export function collectApprovedOvertimeByDate<T extends OvertimeAuthorizationLike>(
  records: T[],
  targetIds: Set<string>
): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const ot of records) {
    if (ot.status !== 'Approved') continue
    const otBio = String(ot.bioId).trim().toLowerCase()
    if (targetIds.size > 0 && !targetIds.has(otBio)) continue
    const date = String(ot.date || '').trim()
    if (!date) continue

    const addRecord = (key: string) => {
      const list = map.get(key) || []
      const otId = ot.id
      if (!otId || !list.some(item => item.id === otId)) {
        list.push(ot)
      }
      map.set(key, list)
    }

    addRecord(date)
    const normalized = normalizeDateString(date)
    if (normalized && normalized !== date) {
      addRecord(normalized)
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
  /** Off-day scheduled OT fallback (holiday worked hours with approved form) */
  allowOffDayFallback?: boolean
}

/**
 * Evaluates a single overtime record for an employee on a given day.
 *
 * Overtime rate:
 * - Ordinary day: 125% of hourly rate per overtime hour (hourlyRate × 1.25)
 * - Special Non-Working Holiday: 130% × 130% = 169% of hourly rate (hourlyRate × 1.69)
 * - Regular Holiday: 200% × 130% = 260% of hourly rate (hourlyRate × 2.60)
 */
export function evaluateOvertimeDay(input: OvertimeDayInput): OvertimeDayEvaluation {
  const authorizedHours = Math.max(0, Number(input.authorizedHours) || 0)
  const hourlyRate = Number(input.hourlyRate) || 0

  if (input.authorizationStatus !== undefined && input.authorizationStatus !== 'Approved') {
    return { qualifying: false, overtimeHours: 0, overtimePay: 0 }
  }
  if (authorizedHours <= 0 || hourlyRate <= 0) {
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

  const multiplier = OVERTIME_HOURLY_MULTIPLIERS[input.dayClass] ?? 1.25
  const pay = Math.round(payableOtHours * hourlyRate * multiplier * 100) / 100
  return { qualifying: true, overtimeHours: payableOtHours, overtimePay: pay }
}

export interface OvertimeDayMultiInput {
  dayClass: OvertimeDayClass
  dailyRate: number
  hourlyRate: number
  records: OvertimeAuthorizationLike[]
  actualOut?: string
  expectedOut?: string
  hasValidOut?: boolean
  workedHoursDecimal?: number
  allowOffDayFallback?: boolean
}

/**
 * Evaluates multiple overtime authorization records for an employee on a single day.
 *
 * Supports:
 * - Multiple authorized records on the same date (e.g. separate shifts/tasks)
 * - Clamping each record to its authorized hours and attended window
 * - Allocating non-overlapping attended minutes so attendance is not double-paid
 */
export function evaluateMultipleOvertimeRecordsForDay(input: OvertimeDayMultiInput): OvertimeDayEvaluation {
  const approvedRecords = (input.records || []).filter(r => r.status === 'Approved')
  if (approvedRecords.length === 0 || input.hourlyRate <= 0) {
    return { qualifying: false, overtimeHours: 0, overtimePay: 0 }
  }

  const totalAttendedMins = computeAttendedOvertimeMinutes(
    input.actualOut,
    input.expectedOut || '17:00'
  )
  const totalAttendedHours = Math.round((totalAttendedMins / 60) * 100) / 100

  let remainingAttendedMins = totalAttendedMins
  let totalQualifyingHours = 0
  let totalPay = 0
  let anyQualifying = false

  const multiplier = OVERTIME_HOURLY_MULTIPLIERS[input.dayClass] ?? 1.25

  for (const record of approvedRecords) {
    const authorizedHours = Math.max(0, Number(record.authorizedHours) || 0)
    if (authorizedHours <= 0) continue

    let payableHours = 0

    if (input.hasValidOut && totalAttendedHours > 0) {
      if (record.startTime && record.endTime) {
        const windowMins = computeAttendedOvertimeMinutes(
          input.actualOut,
          input.expectedOut || '17:00',
          record.startTime,
          record.endTime
        )
        const windowHours = Math.round((windowMins / 60) * 100) / 100
        payableHours = Math.min(authorizedHours, windowHours)
      } else {
        const authMins = Math.round(authorizedHours * 60)
        const claimMins = Math.min(authMins, remainingAttendedMins)
        payableHours = Math.round((claimMins / 60) * 100) / 100
        remainingAttendedMins = Math.max(0, remainingAttendedMins - claimMins)
      }
    } else if (input.allowOffDayFallback) {
      const workedHours = Number(input.workedHoursDecimal) || 0
      payableHours = workedHours > 0 ? Math.min(authorizedHours, workedHours) : 0
    }

    if (payableHours > 0) {
      anyQualifying = true
      totalQualifyingHours = Math.round((totalQualifyingHours + payableHours) * 100) / 100
      const recPay = Math.round(payableHours * input.hourlyRate * multiplier * 100) / 100
      totalPay = Math.round((totalPay + recPay) * 100) / 100
    }
  }

  return {
    qualifying: anyQualifying,
    overtimeHours: totalQualifyingHours,
    overtimePay: totalPay
  }
}
