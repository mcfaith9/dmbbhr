/**
 * Payroll Calculation Service & Data Engine
 *
 * Implements semi-monthly payroll workflows compliant with DMBBHR business rules:
 * - 1st–15th cutoff: Payday on the 20th of the same month
 * - 16th–last day cutoff: Payday on the 5th of the following month
 *
 * Stages:
 * - Stage A: Initial Earnings (Rate x Payable Days + Rest/Holiday allowances)
 * - Stage B: Benefits Contributions & Loans (SSS, PhilHealth, Pag-IBIG, Loans)
 * - Stage C: Cash Advance & Other Itemized Deductions (Boots, Gloves, Uniforms, CA)
 * - Stage D: Manually Editable Withholding Tax
 * - Stage E: Net Pay Calculation
 *
 * Safe Snapshot Persistence:
 * - Finalized payroll is saved to IndexedDB `payrollSnapshots`
 * - Later attendance changes do NOT silently mutate approved/finalized payroll
 */

import { db, type PayrollSnapshotRecord, type ItemizedDeductionRecord, type HolidayRecord } from '@/db'
import type { Employee } from '@/types'
import { getManilaDateString, type DailyAttendanceRecord } from '@/services/attendanceEngine'
import { attendanceRepository } from '@/repositories'

export interface PayrollCutoffPeriod {
  id: string // e.g. "2026-06-1" or "2026-06-2"
  year: number
  month: number // 1-12
  half: 1 | 2
  label: string // e.g. "Jun 1 – 15, 2026 (1st Cutoff)"
  shortLabel: string // e.g. "Jun 1 – 15, 2026"
  startDate: string // "2026-06-01"
  endDate: string // "2026-06-15"
  payday: string // "2026-06-20" or "2026-07-05"
  paydayDisplay: string // e.g. "June 20, 2026" or "July 5, 2026"
  dates: string[] // List of all dates in the cutoff period
}

export interface ItemizedDeduction extends ItemizedDeductionRecord {}

export interface EmployeePayrollRecord {
  id: string // `${periodId}_${bioId}`
  periodId: string
  bioId: string
  employeeNumber: string
  employeeName: string
  department: string
  position: string
  status: string
  workGroupId: string
  cutoffStart: string
  cutoffEnd: string
  payday: string
  salaryType: 'Monthly' | 'Daily' | 'Hourly' | 'unconfigured'
  basicSalary: number
  dailyRate: number
  hourlyRate: number

  // Working & Attendance Days
  scheduledDays: number
  presentDays: number
  sundayWorkDays: number
  holidayDays: number
  absentDays: number
  payableDays: number
  lateMinutes: number

  // Stage A: Initial Earnings
  initialEarnings: number
  earningsBreakdown: {
    basePay: number
    sundayDutyPay: number
    holidayPay: number
    allowances: number
  }

  // Stage B: Statutory Benefits & Loans
  sss: number
  philhealth: number
  pagibig: number
  sssLoan: number
  pagibigLoan: number
  otherLoan: number
  totalBenefitsAndLoans: number
  balanceAfterBenefitsAndLoans: number

  // Stage C: Cash Advance & Other Itemized Deductions
  cashAdvance: number
  itemizedDeductions: ItemizedDeduction[]
  totalOtherDeductions: number
  balanceBeforeTax: number

  // Stage D: Withholding Tax (Manually editable)
  withholdingTax: number

  // Stage E: Final Net Pay
  netPay: number

  // Review Status & Flags
  reviewStatus: 'ready' | 'needs_review' | 'approved' | 'finalized'
  reviewReasons: string[]
  attendanceReviewNotes: string[]
  batchStatus: 'draft' | 'approved' | 'finalized'
  updatedAt: string
}

export const payrollCalculationService = {
  /**
   * Generates semi-monthly cutoff periods around a given anchor date.
   * Rules:
   * - 1st–15th: Payday on 20th of the SAME month
   * - 16th–last day: Payday on 5th of the FOLLOWING month
   */
  getCutoffPeriod(year: number, month: number, half: 1 | 2): PayrollCutoffPeriod {
    const mStr = String(month).padStart(2, '0')
    const periodId = `${year}-${mStr}-${half}`
    const dates: string[] = []

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]
    const mName = monthNames[month - 1]
    const shortMName = mName.slice(0, 3)

    let startDateStr = ''
    let endDateStr = ''
    let paydayStr = ''
    let paydayDisplay = ''

    if (half === 1) {
      startDateStr = `${year}-${mStr}-01`
      endDateStr = `${year}-${mStr}-15`
      for (let d = 1; d <= 15; d++) {
        dates.push(`${year}-${mStr}-${String(d).padStart(2, '0')}`)
      }
      paydayStr = `${year}-${mStr}-20`
      paydayDisplay = `${mName} 20, ${year}`
    } else {
      const lastDay = new Date(year, month, 0).getDate()
      startDateStr = `${year}-${mStr}-16`
      endDateStr = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`
      for (let d = 16; d <= lastDay; d++) {
        dates.push(`${year}-${mStr}-${String(d).padStart(2, '0')}`)
      }

      // 16th–last day cutoff: Payday on the 5th of the FOLLOWING month
      let nextY = year
      let nextM = month + 1
      if (nextM > 12) {
        nextM = 1
        nextY++
      }
      const nextMStr = String(nextM).padStart(2, '0')
      const nextMName = monthNames[nextM - 1]
      paydayStr = `${nextY}-${nextMStr}-05`
      paydayDisplay = `${nextMName} 5, ${nextY}`
    }

    const startDay = half === 1 ? 1 : 16
    const endDay = half === 1 ? 15 : new Date(year, month, 0).getDate()

    return {
      id: periodId,
      year,
      month,
      half,
      label: `${shortMName} ${startDay} – ${endDay}, ${year} (${half === 1 ? '1st Cutoff' : '2nd Cutoff'})`,
      shortLabel: `${shortMName} ${startDay} – ${endDay}, ${year}`,
      startDate: startDateStr,
      endDate: endDateStr,
      payday: paydayStr,
      paydayDisplay,
      dates
    }
  },

  /**
   * Generates a list of selectable semi-monthly cutoff periods (e.g. recent 8 periods).
   */
  getAvailableCutoffs(anchorDate: Date = new Date(), count = 8): PayrollCutoffPeriod[] {
    const list: PayrollCutoffPeriod[] = []
    let currY = anchorDate.getFullYear()
    let currM = anchorDate.getMonth() + 1
    let currHalf: 1 | 2 = anchorDate.getDate() <= 15 ? 1 : 2

    for (let i = 0; i < count; i++) {
      list.push(this.getCutoffPeriod(currY, currM, currHalf))
      if (currHalf === 2) {
        currHalf = 1
      } else {
        currHalf = 2
        currM--
        if (currM < 1) {
          currM = 12
          currY--
        }
      }
    }
    return list
  },

  /**
   * Computes semi-monthly payroll for a single employee for a given cutoff period.
   * Pulls attendance from Attendance Matrix data / IndexedDB and restores any saved snapshot.
   */
  async computeSingleEmployeePayroll(
    period: PayrollCutoffPeriod,
    employee: Employee,
    holidays: HolidayRecord[] = [],
    dailyAttendanceRecords: DailyAttendanceRecord[] = []
  ): Promise<EmployeePayrollRecord> {
    const rawBioId = String(employee.biometric_user_id || (employee as any).bioId || employee.employee_number || employee.id || '').trim()
    const targetIds = new Set<string>()
    if (employee.biometric_user_id) targetIds.add(String(employee.biometric_user_id).trim().toLowerCase())
    if ((employee as any).bioId) targetIds.add(String((employee as any).bioId).trim().toLowerCase())
    if (employee.employee_number) targetIds.add(String(employee.employee_number).trim().toLowerCase())
    if (employee.id) targetIds.add(String(employee.id).trim().toLowerCase())
    if (rawBioId) targetIds.add(rawBioId.toLowerCase())

    const bioId = employee.biometric_user_id || employee.employee_number || rawBioId

    // 1. Check if a saved snapshot exists in IndexedDB for this period and employee
    const existingSnap = await db.payrollSnapshots.get(`${period.id}_${bioId}`)

    // If an existing finalized snapshot exists, preserve it completely as an immutable historical record
    if (existingSnap && existingSnap.batchStatus === 'finalized') {
      return this.snapshotToPayrollRecord(existingSnap)
    }

    // 2. Index holidays in this period
    if (holidays.length === 0) {
      try {
        holidays = await db.holidays.toArray()
      } catch {
        holidays = []
      }
    }
    const holidayMap = new Map<string, HolidayRecord>()
    for (const h of holidays) {
      if (period.dates.includes(h.date)) {
        holidayMap.set(h.date, h)
      }
    }

    // Helper: Normalize date strings to YYYY-MM-DD
    const normalizeDate = (d: string): string => {
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

    // 3. Obtain daily attendance records for this employee across cutoff period dates
    const empAttendanceMap = new Map<string, DailyAttendanceRecord>()

    const registerRecord = (rec: DailyAttendanceRecord) => {
      if (!rec) return
      const recBio = String(rec.biometric_user_id || (rec as any).bioId || (rec as any).user_id || '').trim().toLowerCase()
      if (recBio && targetIds.size > 0 && !targetIds.has(recBio)) {
        return
      }
      if (rec.raw_date) {
        empAttendanceMap.set(rec.raw_date, rec)
        const n = normalizeDate(rec.raw_date)
        if (n) empAttendanceMap.set(n, rec)
      }
      if (rec.date) {
        empAttendanceMap.set(rec.date, rec)
        const n = normalizeDate(rec.date)
        if (n) empAttendanceMap.set(n, rec)
      }
      if ((rec as any).id) {
        const parts = String((rec as any).id).split('-')
        if (parts.length >= 4) {
          const dFromId = `${parts[parts.length - 3]}-${parts[parts.length - 2]}-${parts[parts.length - 1]}`
          if (/^\d{4}-\d{2}-\d{2}$/.test(dFromId)) {
            empAttendanceMap.set(dFromId, rec)
          }
        }
      }
    }

    if (dailyAttendanceRecords && dailyAttendanceRecords.length > 0) {
      for (const rec of dailyAttendanceRecords) {
        registerRecord(rec)
      }
    }

    // If attendance records were not passed or incomplete, query the repository for this employee
    if (empAttendanceMap.size === 0) {
      const results = await Promise.all(
        period.dates.map(d => attendanceRepository.getDailyAttendance(d, 'all', 'all', {}, bioId))
      )
      for (const list of results) {
        if (Array.isArray(list)) {
          for (const r of list) {
            registerRecord(r)
          }
        }
      }
    }

    // Also check db.dailyAttendance table for any pre-processed daily records
    if (empAttendanceMap.size === 0) {
      try {
        const cached = await db.dailyAttendance
          .where('bioId')
          .equals(bioId)
          .filter(r => period.dates.includes(r.date))
          .toArray()
        for (const c of cached) {
          registerRecord({
            id: c.id,
            biometric_user_id: c.bioId,
            employee_name: c.employeeName,
            location: c.location,
            work_group_id: c.workGroupId,
            work_group_name: c.workGroupName,
            date: c.displayDate || c.date,
            raw_date: c.date,
            expected_in: c.expectedIn,
            actual_in: c.actualIn,
            expected_out: c.expectedOut,
            actual_out: c.actualOut,
            break_out: c.breakOut,
            break_in: c.breakIn,
            total_hours: c.totalHours,
            total_hours_decimal: c.totalHoursDecimal,
            worked_minutes: c.workedMinutes,
            late_minutes: c.lateMinutes,
            early_out_minutes: c.earlyOutMinutes,
            undertime_minutes: c.undertimeMinutes,
            status: c.status,
            status_variant: c.statusVariant,
            raw_punches_count: c.rawPunchesCount,
            valid_punches_count: c.validPunchesCount,
            duplicate_punches_count: 0,
            total_punches: c.validPunchesCount,
            punches_summary: '',
            has_valid_out: c.hasValidOut,
            is_awaiting_out: c.isAwaitingOut,
            first_punch_time_ms: 0,
            latest_punch_time_ms: 0,
            latest_punch_time: '',
            raw_punches: [],
            valid_punches: [],
            scan_breakdown: []
          })
        }
      } catch {
        // ignore cache lookup
      }
    }

    const todayStr = getManilaDateString(new Date())
    let scheduledDays = 0
    let presentDays = 0
    let sundayWorkDays = 0
    let holidayDays = 0
    let absentDays = 0
    let lateMinutes = 0
    let futureScheduledDays = 0
    let unresolvedDays = 0
    let leaveDays = 0
    const attendanceReviewNotes: string[] = []

    for (const dStr of period.dates) {
      const [y, m, d] = dStr.split('-').map(Number)
      const dateObj = new Date(Date.UTC(y, m - 1, d))
      const isSunday = dateObj.getUTCDay() === 0
      const isHoliday = holidayMap.has(dStr)
      const hol = holidayMap.get(dStr)
      const isFuture = dStr > todayStr
      const att = empAttendanceMap.get(dStr) || empAttendanceMap.get(normalizeDate(dStr))

      const actualIn = att?.actual_in?.trim() || ''
      const actualOut = att?.actual_out?.trim() || ''
      const hasValidIn = Boolean(
        actualIn &&
        !actualIn.startsWith('Missing') &&
        actualIn !== '—' &&
        actualIn !== '-' &&
        actualIn !== 'None'
      )
      const hasValidOut = Boolean(
        att?.has_valid_out &&
        actualOut &&
        !actualOut.startsWith('Missing') &&
        actualOut !== '—' &&
        actualOut !== '-'
      )

      if (!isSunday && !isHoliday) {
        scheduledDays++
      }

      if (hasValidIn) {
        if (isSunday) {
          sundayWorkDays++
          if (!hasValidOut) {
            attendanceReviewNotes.push(`Sunday duty on ${dStr} has missing/awaiting OUT punch`)
          }
        } else if (isHoliday) {
          holidayDays++
          if (!hasValidOut) {
            attendanceReviewNotes.push(`Holiday duty on ${dStr} (${hol?.name || 'Holiday'}) has missing/awaiting OUT punch`)
          }
        } else {
          presentDays++
          if (!hasValidOut) {
            attendanceReviewNotes.push(`Duty punch on ${dStr} is awaiting or missing OUT punch`)
          }
        }

        if (att?.late_minutes && att.late_minutes > 0) {
          lateMinutes += att.late_minutes
        }
      } else if (isSunday) {
        // Standard unworked Sunday rest day - not an absence
      } else if (isHoliday) {
        // Standard unworked calendar holiday
      } else if (att?.status === 'On Leave' || att?.status === 'Leave') {
        leaveDays++
      } else if (isFuture) {
        futureScheduledDays++
      } else if (!att && empAttendanceMap.size === 0) {
        // No attendance records matched at all
        unresolvedDays++
      } else {
        // Date has arrived/passed and verified attendance confirms no duty punch
        absentDays++
      }
    }

    if (unresolvedDays > 0) {
      attendanceReviewNotes.push(`${unresolvedDays} scheduled date(s) have missing or unverified attendance records`)
    }

    // Total payable working days
    const payableDays = presentDays + sundayWorkDays + holidayDays

    // Salary Configuration & Rates
    const salaryType = (employee.salary_type || 'unconfigured') as 'Monthly' | 'Daily' | 'Hourly' | 'unconfigured'
    let basicSalary = typeof employee.basic_salary === 'number' && employee.basic_salary > 0 ? employee.basic_salary : 0
    let dailyRate = typeof employee.daily_rate === 'number' && employee.daily_rate > 0 ? employee.daily_rate : 0
    let hourlyRate = typeof employee.hourly_rate === 'number' && employee.hourly_rate > 0 ? employee.hourly_rate : 0

    // Infer daily/hourly if basicSalary is given but dailyRate was not entered
    if (basicSalary > 0 && dailyRate === 0) {
      if (salaryType === 'Monthly') {
        dailyRate = Math.round((basicSalary / 26) * 100) / 100
      } else if (salaryType === 'Daily') {
        dailyRate = basicSalary
      }
    } else if (dailyRate > 0 && basicSalary === 0 && salaryType === 'Monthly') {
      basicSalary = Math.round(dailyRate * 26 * 100) / 100
    }
    if (dailyRate > 0 && hourlyRate === 0) {
      hourlyRate = Math.round((dailyRate / 8) * 100) / 100
    }

    const reviewReasons: string[] = []

    // Stage A: Initial Earnings
    let basePay = 0
    let sundayDutyPay = 0
    let holidayPay = 0
    const allowances = typeof employee.allowances === 'number' ? (employee.allowances / 2) : 0 // semi-monthly allowance

    if (basicSalary <= 0 && dailyRate <= 0) {
      reviewReasons.push('Salary rate is not configured for this employee')
    } else if (salaryType === 'Daily') {
      // Daily wage worker: Base working pay is calculated strictly from actual payable days rendered
      basePay = Math.round(payableDays * dailyRate * 100) / 100
      // Sunday duty premium (+30% of daily rate under Philippine Labor Code Article 93)
      sundayDutyPay = Math.round(sundayWorkDays * (dailyRate * 0.3) * 100) / 100
      // Holiday duty premium (100% additional for worked regular holiday = 200% total)
      holidayPay = Math.round(holidayDays * (dailyRate * 1.0) * 100) / 100
    } else if (salaryType === 'Monthly') {
      // Semi-monthly basic pay
      const semiMonthlyBasic = Math.round((basicSalary / 2) * 100) / 100
      // Absences deduction based on confirmed absence days
      const absenceDeduction = Math.round(absentDays * dailyRate * 100) / 100
      basePay = Math.max(0, Math.round((semiMonthlyBasic - absenceDeduction) * 100) / 100)
      // Additional Sunday / Holiday duty premium
      sundayDutyPay = Math.round(sundayWorkDays * (dailyRate * 0.3) * 100) / 100
      holidayPay = Math.round(holidayDays * (dailyRate * 1.0) * 100) / 100
    } else if (salaryType === 'Hourly') {
      basePay = Math.round(payableDays * 8 * hourlyRate * 100) / 100
    } else {
      // Default / fallback: Paid per payable day rendered
      basePay = Math.round(payableDays * dailyRate * 100) / 100
    }

    const initialEarnings = Math.round((basePay + sundayDutyPay + holidayPay + allowances) * 100) / 100

    // Stage B: Statutory Benefits & Loans
    // Load saved values if draft exists, or establish default editable baselines
    let sss = existingSnap?.sss ?? 0
    let philhealth = existingSnap?.philhealth ?? 0
    let pagibig = existingSnap?.pagibig ?? 0
    let sssLoan = existingSnap?.sssLoan ?? 0
    let pagibigLoan = existingSnap?.pagibigLoan ?? 0
    let otherLoan = existingSnap?.otherLoan ?? 0

    // If no snapshot exists yet, default standard semi-monthly deductions
    if (!existingSnap && initialEarnings > 0) {
      // Pag-IBIG standard employee share (₱100/cutoff or ₱200/month)
      pagibig = 100
      // SSS approximate employee share baseline (subject to HR verification & edit)
      if (employee.sss_number) {
        sss = Math.min(1350, Math.max(180, Math.round(initialEarnings * 0.045)))
      }
      // PhilHealth employee share baseline (2.5% of basic / 2)
      if (employee.philhealth_number) {
        philhealth = Math.round(initialEarnings * 0.025)
      }
    }

    const totalBenefitsAndLoans = Math.round((sss + philhealth + pagibig + sssLoan + pagibigLoan + otherLoan) * 100) / 100
    const balanceAfterBenefitsAndLoans = Math.round((initialEarnings - totalBenefitsAndLoans) * 100) / 100

    // Stage C: Cash Advance and Other Itemized Deductions
    let cashAdvance = existingSnap?.cashAdvance ?? 0
    let itemizedDeductions: ItemizedDeduction[] = existingSnap?.itemizedDeductions ? [...existingSnap.itemizedDeductions] : []
    let totalOtherDeductions = 0

    for (const item of itemizedDeductions) {
      if (item.category === 'cash_advance') {
        cashAdvance += item.amount
      } else {
        totalOtherDeductions += item.amount
      }
    }

    const balanceBeforeTax = Math.round((balanceAfterBenefitsAndLoans - (cashAdvance + totalOtherDeductions)) * 100) / 100

    // Stage D: Withholding Tax (Manually editable, never fixed or threshold-automated)
    const withholdingTax = existingSnap?.withholdingTax ?? 0

    // Stage E: Final Net Pay
    const netPay = Math.round((balanceBeforeTax - withholdingTax) * 100) / 100

    if (netPay < 0) {
      reviewReasons.push(`Net pay is negative (₱${netPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}) due to deductions exceeding earnings`)
    }

    if (empAttendanceMap.size === 0) {
      reviewReasons.push('No attendance records could be matched for this cutoff. Please check attendance logs before finalization.')
    } else if (unresolvedDays > 0) {
      reviewReasons.push(`${unresolvedDays} day(s) have unresolved attendance requiring HR audit`)
    }

    if (attendanceReviewNotes.length > 0) {
      reviewReasons.push(`${attendanceReviewNotes.length} attendance issue(s) need review`)
    }

    let reviewStatus: EmployeePayrollRecord['reviewStatus'] = existingSnap?.reviewStatus || 'ready'
    if (reviewReasons.length > 0) {
      reviewStatus = 'needs_review'
    } else if (existingSnap?.reviewStatus === 'approved') {
      reviewStatus = 'approved'
    } else if (existingSnap?.reviewStatus === 'finalized') {
      reviewStatus = 'finalized'
    } else {
      reviewStatus = 'ready'
    }

    return {
      id: `${period.id}_${bioId}`,
      periodId: period.id,
      bioId,
      employeeNumber: employee.employee_number || bioId,
      employeeName: employee.full_name,
      department: employee.department || 'Operations',
      position: employee.position || 'Staff',
      status: employee.status,
      workGroupId: employee.work_group_id || 'wg-group-c',
      cutoffStart: period.startDate,
      cutoffEnd: period.endDate,
      payday: period.payday,
      salaryType,
      basicSalary,
      dailyRate,
      hourlyRate,
      scheduledDays,
      presentDays,
      sundayWorkDays,
      holidayDays,
      absentDays,
      payableDays,
      lateMinutes,
      initialEarnings,
      earningsBreakdown: {
        basePay,
        sundayDutyPay,
        holidayPay,
        allowances
      },
      sss,
      philhealth,
      pagibig,
      sssLoan,
      pagibigLoan,
      otherLoan,
      totalBenefitsAndLoans,
      balanceAfterBenefitsAndLoans,
      cashAdvance,
      itemizedDeductions,
      totalOtherDeductions,
      balanceBeforeTax,
      withholdingTax,
      netPay,
      reviewStatus,
      reviewReasons,
      attendanceReviewNotes,
      batchStatus: existingSnap?.batchStatus || 'draft',
      updatedAt: existingSnap?.updatedAt || new Date().toISOString()
    }
  },

  /**
   * Computes the semi-monthly payroll for all active employees for a given cutoff period.
   * Pulls attendance from Attendance Matrix data / IndexedDB.
   */
  async computePayroll(
    period: PayrollCutoffPeriod,
    employees: Employee[],
    holidays: HolidayRecord[] = [],
    dailyAttendanceRecords: DailyAttendanceRecord[] = []
  ): Promise<EmployeePayrollRecord[]> {
    const targetEmployees = employees.filter(e => e.status !== 'resigned')
    const payrollRecords: EmployeePayrollRecord[] = []

    for (const emp of targetEmployees) {
      const bioId = emp.biometric_user_id || emp.employee_number
      const empAttendance = dailyAttendanceRecords.filter(r => {
        const rBio = r.biometric_user_id || (r as any).bioId
        return rBio === bioId || rBio === emp.biometric_user_id || rBio === emp.employee_number
      })
      const record = await this.computeSingleEmployeePayroll(period, emp, holidays, empAttendance)
      payrollRecords.push(record)
    }

    return payrollRecords
  },

  /**
   * Recalculates subtotals, balances, and net pay whenever deductions, contributions, or tax change.
   */
  recalculateRecord(rec: EmployeePayrollRecord): EmployeePayrollRecord {
    // 1. Benefits & Loans subtotal
    rec.totalBenefitsAndLoans = Math.round(
      ((rec.sss || 0) +
        (rec.philhealth || 0) +
        (rec.pagibig || 0) +
        (rec.sssLoan || 0) +
        (rec.pagibigLoan || 0) +
        (rec.otherLoan || 0)) *
        100
    ) / 100

    rec.balanceAfterBenefitsAndLoans = Math.round((rec.initialEarnings - rec.totalBenefitsAndLoans) * 100) / 100

    // 2. Cash Advance and Other Deductions
    let caTotal = 0
    let otherTotal = 0
    if (Array.isArray(rec.itemizedDeductions)) {
      for (const item of rec.itemizedDeductions) {
        if (item.category === 'cash_advance') {
          caTotal += Number(item.amount || 0)
        } else {
          otherTotal += Number(item.amount || 0)
        }
      }
    }
    rec.cashAdvance = Math.round(caTotal * 100) / 100
    rec.totalOtherDeductions = Math.round(otherTotal * 100) / 100

    rec.balanceBeforeTax = Math.round(
      (rec.balanceAfterBenefitsAndLoans - (rec.cashAdvance + rec.totalOtherDeductions)) * 100
    ) / 100

    // 3. Withholding Tax (manual)
    const tax = Number(rec.withholdingTax || 0)
    rec.withholdingTax = Math.round(tax * 100) / 100

    // 4. Final Net Pay
    rec.netPay = Math.round((rec.balanceBeforeTax - rec.withholdingTax) * 100) / 100

    // Re-evaluate review status
    const reasons: string[] = []
    if (rec.basicSalary <= 0 && rec.dailyRate <= 0) {
      reasons.push('Salary rate is not configured for this employee')
    }
    if (rec.netPay < 0) {
      reasons.push('Net pay is negative')
    }
    if (rec.attendanceReviewNotes && rec.attendanceReviewNotes.length > 0) {
      reasons.push(`${rec.attendanceReviewNotes.length} attendance issue(s) need review`)
    }

    rec.reviewReasons = reasons
    if (reasons.length > 0) {
      rec.reviewStatus = 'needs_review'
    } else if (rec.reviewStatus === 'needs_review') {
      rec.reviewStatus = 'ready'
    }

    rec.updatedAt = new Date().toISOString()
    return rec
  },

  /**
   * Persists payroll snapshot into IndexedDB with clean structured cloning.
   * Eliminates Vue reactive Proxies or non-cloneable objects that trigger DataCloneError.
   */
  async savePayrollSnapshot(
    records: EmployeePayrollRecord[],
    batchStatus: 'draft' | 'approved' | 'finalized',
    finalizedBy?: string
  ): Promise<void> {
    const timestamp = new Date().toISOString()

    const snapshotRecords: PayrollSnapshotRecord[] = records.map(rawRecord => {
      // Deeply unwrap Vue 3 Reactive Proxies into pure plain JS objects
      const r = JSON.parse(JSON.stringify(rawRecord))

      const cleanItemizedDeductions: ItemizedDeductionRecord[] = Array.isArray(r.itemizedDeductions)
        ? r.itemizedDeductions.map((d: any) => ({
            id: String(d.id || `ded_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
            category: String(d.category || 'other') as any,
            description: String(d.description || '').trim(),
            amount: Number(d.amount) || 0,
            createdAt: String(d.createdAt || timestamp)
          }))
        : []

      const cleanReviewReasons: string[] = Array.isArray(r.reviewReasons)
        ? r.reviewReasons.map((reason: any) => String(reason).trim()).filter(Boolean)
        : []

      const recordId = String(r.id || `${r.periodId}_${r.bioId}`)

      return {
        id: recordId,
        periodId: String(r.periodId),
        bioId: String(r.bioId),
        employeeNumber: String(r.employeeNumber || r.bioId),
        employeeName: String(r.employeeName || ''),
        department: String(r.department || 'Operations'),
        position: String(r.position || 'Staff'),
        status: String(r.status || 'active'),
        workGroupId: String(r.workGroupId || 'wg-group-c'),
        cutoffStart: String(r.cutoffStart || ''),
        cutoffEnd: String(r.cutoffEnd || ''),
        payday: String(r.payday || ''),
        salaryType: String(r.salaryType || 'unconfigured'),
        basicSalary: Number(r.basicSalary) || 0,
        dailyRate: Number(r.dailyRate) || 0,
        hourlyRate: Number(r.hourlyRate) || 0,
        payableDays: Number(r.payableDays) || 0,
        presentDays: Number(r.presentDays) || 0,
        sundayWorkDays: Number(r.sundayWorkDays) || 0,
        holidayDays: Number(r.holidayDays) || 0,
        lateMinutes: Number(r.lateMinutes) || 0,
        initialEarnings: Number(r.initialEarnings) || 0,
        sss: Number(r.sss) || 0,
        philhealth: Number(r.philhealth) || 0,
        pagibig: Number(r.pagibig) || 0,
        sssLoan: Number(r.sssLoan) || 0,
        pagibigLoan: Number(r.pagibigLoan) || 0,
        otherLoan: Number(r.otherLoan) || 0,
        totalBenefitsAndLoans: Number(r.totalBenefitsAndLoans) || 0,
        balanceAfterBenefitsAndLoans: Number(r.balanceAfterBenefitsAndLoans) || 0,
        cashAdvance: Number(r.cashAdvance) || 0,
        itemizedDeductions: cleanItemizedDeductions,
        totalOtherDeductions: Number(r.totalOtherDeductions) || 0,
        balanceBeforeTax: Number(r.balanceBeforeTax) || 0,
        withholdingTax: Number(r.withholdingTax) || 0,
        netPay: Number(r.netPay) || 0,
        reviewStatus: batchStatus === 'finalized' ? 'finalized' : (r.reviewStatus || 'ready'),
        reviewReasons: cleanReviewReasons,
        batchStatus,
        finalizedAt: batchStatus === 'finalized' ? timestamp : (r.finalizedAt || undefined),
        finalizedBy: batchStatus === 'finalized' ? (finalizedBy || 'Authorized HR Admin') : (r.finalizedBy || undefined),
        updatedAt: timestamp
      }
    })

    // Persist via transaction and verify
    await db.transaction('rw', db.payrollSnapshots, async () => {
      await db.payrollSnapshots.bulkPut(snapshotRecords)
    })

    // Strict verification that snapshot is written to storage
    for (const item of snapshotRecords) {
      const verified = await db.payrollSnapshots.get(item.id)
      if (!verified) {
        throw new Error(`Failed to verify saved payroll snapshot for ID: ${item.id}`)
      }
    }
  },

  /**
   * Helper to convert database snapshot back to active payroll record.
   */
  snapshotToPayrollRecord(snap: PayrollSnapshotRecord): EmployeePayrollRecord {
    return {
      id: snap.id,
      periodId: snap.periodId,
      bioId: snap.bioId,
      employeeNumber: snap.employeeNumber,
      employeeName: snap.employeeName,
      department: snap.department,
      position: snap.position,
      status: snap.status,
      workGroupId: snap.workGroupId,
      cutoffStart: snap.cutoffStart,
      cutoffEnd: snap.cutoffEnd,
      payday: snap.payday,
      salaryType: (snap.salaryType as any) || 'unconfigured',
      basicSalary: snap.basicSalary,
      dailyRate: snap.dailyRate,
      hourlyRate: snap.hourlyRate,
      scheduledDays: snap.payableDays,
      presentDays: snap.presentDays,
      sundayWorkDays: snap.sundayWorkDays,
      holidayDays: snap.holidayDays,
      absentDays: 0,
      payableDays: snap.payableDays,
      lateMinutes: snap.lateMinutes,
      initialEarnings: snap.initialEarnings,
      earningsBreakdown: {
        basePay: snap.initialEarnings,
        sundayDutyPay: 0,
        holidayPay: 0,
        allowances: 0
      },
      sss: snap.sss,
      philhealth: snap.philhealth,
      pagibig: snap.pagibig,
      sssLoan: snap.sssLoan,
      pagibigLoan: snap.pagibigLoan,
      otherLoan: snap.otherLoan,
      totalBenefitsAndLoans: snap.totalBenefitsAndLoans,
      balanceAfterBenefitsAndLoans: snap.balanceAfterBenefitsAndLoans,
      cashAdvance: snap.cashAdvance,
      itemizedDeductions: snap.itemizedDeductions || [],
      totalOtherDeductions: snap.totalOtherDeductions,
      balanceBeforeTax: snap.balanceBeforeTax,
      withholdingTax: snap.withholdingTax,
      netPay: snap.netPay,
      reviewStatus: snap.reviewStatus,
      reviewReasons: snap.reviewReasons || [],
      attendanceReviewNotes: [],
      batchStatus: snap.batchStatus,
      updatedAt: snap.updatedAt
    }
  }
}
