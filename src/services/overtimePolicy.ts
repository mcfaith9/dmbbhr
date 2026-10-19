import { normalizeTimeToHHMM } from '../lib/timeUtils.ts'

/**
 * Overtime policy rules for DMBBHR payroll calculation.
 *
 * SCOPE & RATE SPECIFICATIONS:
 *
 * 1. Ordinary Working Day Overtime (DMBBHR Company Policy):
 *    - Overtime premium is calculated as a percentage of the employee's DAILY WAGE, NOT hourly rate.
 *    - Overtime premium = daily wage × 25% (multiplier: 0.25) per qualifying overtime occurrence.
 *    - Example (₱540 daily wage):
 *      ₱540 × 25% = ₱135.00 overtime premium per qualifying overtime occurrence.
 *      Total daily earnings: 8 regular hours (₱540 in basePay) + 1 qualifying overtime occurrence (₱135 in overtimePay) = ₱675.00.
 *    - Base daily wage and overtime premium are kept separate to prevent duplicate payment.
 *    - Statutory Minimum Comparison:
 *      Statutory minimum for 1 OT hour = (₱540 ÷ 8) × 1.25 = ₱84.38.
 *      The company policy of ₱135.00 is substantially higher and more favorable to the worker.
 *      Under Philippine labor jurisprudence, superior company benefits must not be diminished.
 *
 * 2. Special Non-Working Holiday Overtime:
 *    - Base daily pay for first 8 hours worked = daily wage × 130% (₱702 for ₱540 daily wage)
 *    - Interim calculation applies statutory rate pending company policy confirmation of how the
 *      30% holiday premium and 25% daily-wage overtime premium combine.
 *
 * 3. Regular Holiday Overtime:
 *    - Base daily pay for first 8 hours worked = daily wage × 200% (₱1,080 for ₱540 daily wage)
 *    - Interim calculation applies statutory rate pending company policy confirmation of how the
 *      regular holiday premium and daily-wage overtime premium interact.
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
  const normTargetIds = new Set<string>()
  for (const tid of targetIds) {
    const s = String(tid).trim().toLowerCase()
    normTargetIds.add(s)
    normTargetIds.add(s.replace(/^emp[-_]/i, ''))
  }

  for (const ot of records) {
    if ((ot.status || '').trim().toLowerCase() !== 'approved') continue
    const otBio = String(ot.bioId).trim().toLowerCase()
    const otBioUnprefixed = otBio.replace(/^emp[-_]/i, '')
    if (normTargetIds.size > 0 && !normTargetIds.has(otBio) && !normTargetIds.has(otBioUnprefixed)) continue
    const date = String(ot.date || '').trim()
    if (!date) continue

    const addRecord = (key: string) => {
      const list = map.get(key) || []
      const otId = ot.id
      if (!otId || !list.some(item => item.id === otId)) {
        list.push(ot)
      }
      if (!('status' in list)) {
        Object.defineProperties(list, {
          status: { get: () => list[0]?.status, configurable: true },
          authorizedHours: { get: () => list[0]?.authorizedHours, configurable: true },
          startTime: { get: () => list[0]?.startTime, configurable: true },
          endTime: { get: () => list[0]?.endTime, configurable: true },
          id: { get: () => list[0]?.id, configurable: true },
          date: { get: () => list[0]?.date, configurable: true },
          formNumber: { get: () => list[0]?.formNumber, configurable: true }
        })
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
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
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
  const dailyRate = Number(input.dailyRate) || 0
  const hourlyRate = Number(input.hourlyRate) || (dailyRate > 0 ? dailyRate / 8 : 0)

  if (input.authorizationStatus !== undefined && input.authorizationStatus !== 'Approved') {
    return { qualifying: false, overtimeHours: 0, overtimePay: 0 }
  }
  if (authorizedHours <= 0 || (dailyRate <= 0 && hourlyRate <= 0)) {
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

  let pay = 0
  if (input.dayClass === 'ordinary' || input.dayClass === 'specialWorking' || input.dayClass === 'restDay') {
    // DMBBHR Company Policy: 25% of employee's DAILY WAGE per qualifying overtime occurrence
    const dailyWage = dailyRate > 0 ? dailyRate : hourlyRate * 8
    pay = Math.round(dailyWage * 0.25 * 100) / 100
  } else {
    // Holiday overtime (interim statutory multiplier pending company policy confirmation)
    const multiplier = OVERTIME_HOURLY_MULTIPLIERS[input.dayClass] ?? 1.25
    pay = Math.round(payableOtHours * hourlyRate * multiplier * 100) / 100
  }

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
 * - DMBBHR Company Policy: 25% of DAILY WAGE per qualifying overtime occurrence
 */
export function evaluateMultipleOvertimeRecordsForDay(input: OvertimeDayMultiInput): OvertimeDayEvaluation {
  const approvedRecords = (input.records || []).filter(r => r.status === 'Approved')
  const dailyRate = Number(input.dailyRate) || 0
  const hourlyRate = Number(input.hourlyRate) || (dailyRate > 0 ? dailyRate / 8 : 0)

  if (approvedRecords.length === 0 || (dailyRate <= 0 && hourlyRate <= 0)) {
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

      let recPay = 0
      if (input.dayClass === 'ordinary' || input.dayClass === 'specialWorking' || input.dayClass === 'restDay') {
        // DMBBHR Company Policy: 25% of employee's DAILY WAGE per qualifying overtime occurrence
        const dailyWage = dailyRate > 0 ? dailyRate : hourlyRate * 8
        recPay = Math.round(dailyWage * 0.25 * 100) / 100
      } else {
        // Holiday overtime (interim statutory multiplier pending company policy confirmation)
        recPay = Math.round(payableHours * hourlyRate * multiplier * 100) / 100
      }

      totalPay = Math.round((totalPay + recPay) * 100) / 100
    }
  }

  return {
    qualifying: anyQualifying,
    overtimeHours: totalQualifyingHours,
    overtimePay: totalPay
  }
}
