/**
 * HR Attendance Reports Service
 *
 * Implements high-performance, non-duplicative aggregation of attendance data.
 * Reuses the authoritative Daily Attendance and Employee services.
 * Strictly adheres to resignation-date based active eligibility and absence accounting.
 */

import { attendanceService, getManilaDateString, type DailyAttendanceRecord } from './attendance'
import { employeeService } from './employees'
import { formatDuration } from '@/lib/timeUtils'
import { db } from '@/db'

export type DateRangePreset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom'

export interface ReportFilterOptions {
  preset: DateRangePreset
  startDate?: string // YYYY-MM-DD
  endDate?: string // YYYY-MM-DD
  location?: string // 'all', 'DBB CEBU', etc.
  workGroupId?: string // 'all' or specific
  employeeBioId?: string // 'all' or specific bioId
  department?: string // 'all' or specific
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

export interface ReportSummaryResult {
  dateRangeLabel: string
  startDate: string
  endDate: string
  daysCount: number
  kpis: {
    presentCount: number
    lateCount: number
    absentCount: number
    missingOutCount: number
    totalRenderedHours: number
    avgDailyHours: number
    attendanceRate: number
    absenceRate: number
    totalLateMinutes: number
    uniqueAbsentEmployees: number
    repeatedAbsenceEmployeesCount: number
    totalEligibleWorkdays: number
  }
  dailyTrend: DayTrendPoint[]
  weeklyTrend: WeekTrendPoint[]
  monthlyTrend: MonthTrendPoint[]
  departmentDistribution: DepartmentAbsencePoint[]
  topAbsentEmployees: TopAbsentEmployee[]
  absentRecords: AbsentEmployeeRecord[]
  statusBreakdown: AttendanceStatusBreakdown[]
  topLateEmployees: TopLateEmployee[]
  missingOutItems: MissingOutItem[]
  renderedHours: {
    total: number
    average: number
    peakDate: string
    peakHours: number
  }
  insights: string[]
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

/**
 * Resolves start and end dates for predefined range presets
 */
export function resolveDateRange(preset: DateRangePreset, customStart?: string, customEnd?: string): { start: string; end: string; label: string } {
  const todayStr = getManilaDateString(new Date())
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

  // Custom range fallback
  const start = customStart || todayStr
  const end = customEnd || todayStr
  return { start, end, label: `${start} to ${end}` }
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
 * Normalizes biometric IDs and employee numbers for bulletproof lookup
 */
function cleanBioKey(id?: string | null): string {
  return String(id || '').replace(/^emp[-_]/i, '').trim().toLowerCase()
}

/**
 * Normalizes employment status string for resilient comparison
 */
function normalizeEmploymentStatus(status?: string | null): string {
  return String(status || 'active').trim().toLowerCase()
}

function isResignedStatus(status?: string | null): boolean {
  const s = normalizeEmploymentStatus(status)
  return s === 'resigned' || s === 'r'
}

function isActiveStatus(status?: string | null): boolean {
  const s = normalizeEmploymentStatus(status)
  return s === 'active' || s === 'a'
}

// Clear report cache whenever employee records change (e.g. status updated to Resigned/Active)
employeeService.onEmployeesChanged(() => {
  reportCache.clear()
})

export const reportsService = {
  /**
   * Generates aggregated HR attendance report summary for the requested filter
   */
  async getReportSummary(filters: ReportFilterOptions, forceRefresh = false): Promise<ReportSummaryResult> {
    const { preset, startDate, endDate, location = 'all', workGroupId = 'all', employeeBioId = 'all', department = 'all' } = filters
    const { start, end, label } = resolveDateRange(preset, startDate, endDate)

    const todayStr = getManilaDateString(new Date())
    const isSingleToday = start === todayStr && end === todayStr
    const isVolatilePreset = preset === 'today' || preset === 'yesterday'
    const effectiveTtl = isSingleToday ? 10_000 : CACHE_TTL_MS

    const cacheKey = `${start}_${end}_${location}_${workGroupId}_${employeeBioId}_${department}`
    if (!forceRefresh && !isVolatilePreset && reportCache.has(cacheKey)) {
      const cached = reportCache.get(cacheKey)!
      if (Date.now() - cached.timestamp < effectiveTtl) {
        return cached.data
      }
    }

    const dateList = getDatesInRange(start, end)
    const bioFilter = employeeBioId && employeeBioId !== 'all' ? employeeBioId : undefined

    // 1. Fetch daily records for all dates in range concurrently
    const dailyRecordsArrays = await Promise.all(
      dateList.map(dateStr =>
        attendanceService.getDailyAttendance(dateStr, location, workGroupId, {}, bioFilter)
      )
    )

    // 2. Fetch all employees in scope & supporting lookup tables (WorkGroups, Approved Leaves, Holidays, Manual Adjustments)
    const [allEmployees, workGroups, leaves, holidays] = await Promise.all([
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
        .catch(() => [])
    ])

    // Build canonical employee lookup maps for accurate status & department matching
    const employeeDeptMap = new Map<string, string>()
    const employeeByKeyMap = new Map<string, typeof allEmployees[0]>()
    for (const e of allEmployees) {
      const dept = e.department || ''
      employeeDeptMap.set(e.biometric_user_id, dept)
      employeeDeptMap.set(cleanBioKey(e.biometric_user_id), dept)
      employeeDeptMap.set(cleanBioKey(e.employee_number), dept)

      employeeByKeyMap.set(e.biometric_user_id, e)
      employeeByKeyMap.set(cleanBioKey(e.biometric_user_id), e)
      if (e.employee_number) {
        employeeByKeyMap.set(cleanBioKey(e.employee_number), e)
      }
    }

    // Filter employees by department and bioId if specified
    const scopedEmployees = allEmployees.filter(emp => {
      if (department !== 'all' && emp.department !== department) return false
      if (bioFilter && cleanBioKey(emp.biometric_user_id) !== cleanBioKey(bioFilter)) return false
      return true
    })

    const workGroupMap = new Map(workGroups.map(wg => [wg.id, wg]))
    const holidayDateSet = new Set(holidays.map(h => h.date))

    // Index approved leaves by both raw bioId and cleaned bioKey
    const employeeLeavesMap = new Map<string, Array<{ startDate: string; endDate: string }>>()
    for (const l of leaves) {
      const keys = [l.bioId, cleanBioKey(l.bioId)].filter(Boolean)
      for (const k of keys) {
        if (!employeeLeavesMap.has(k)) {
          employeeLeavesMap.set(k, [])
        }
        employeeLeavesMap.get(k)!.push({ startDate: l.startDate, endDate: l.endDate })
      }
    }

    const isTodayScope = preset === 'today'

    const isEmployeeEligibleForAbsence = (emp: typeof allEmployees[0], dStr: string): boolean => {
      const empStatus = normalizeEmploymentStatus(emp.status)
      // Resigned employees must NEVER be counted as Absent
      if (isResignedStatus(empStatus)) {
        return false
      }
      // For Today: include ONLY employees whose employment status is Active
      if (isTodayScope) {
        if (!isActiveStatus(empStatus)) return false
      } else {
        // Respect existing eligibility rules for Yesterday and other periods
        if (empStatus === 'inactive' || empStatus === 'suspended' || empStatus === 'on_leave') {
          return false
        }
      }
      // Approved leave covering this date is not an unexcused absence
      const empLeaves = employeeLeavesMap.get(emp.biometric_user_id) || employeeLeavesMap.get(cleanBioKey(emp.biometric_user_id)) || []
      if (empLeaves.some(l => l.startDate <= dStr && l.endDate >= dStr)) {
        return false
      }
      return true
    }

    // 3. Process daily aggregations & individual absence records
    let totalPresentDays = 0
    let totalLateDays = 0
    let totalMissingOutDays = 0
    let totalRenderedHours = 0
    let totalLateMinutes = 0
    let totalEligibleWorkdays = 0
    let inProgressCount = 0

    const dayTrends: DayTrendPoint[] = []
    const lateByEmployee = new Map<string, { emp: DailyAttendanceRecord; lateCount: number; minutes: number; lastDate: string; lateRecords: LateAttendanceRecord[]; lateDates: string[] }>()
    const missingOutItems: MissingOutItem[] = []
    const allAbsentRecords: AbsentEmployeeRecord[] = []
    const absencesByEmployee = new Map<string, { emp: typeof scopedEmployees[0]; dates: string[] }>()

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
      const isToday = dStr === todayStr

      // Map of attendees with actual check-in for this day
      const attendedBioIds = new Set<string>()
      const countedPresentKeys = new Set<string>()

      let dayPresent = 0
      let dayLate = 0
      let dayMissingOut = 0
      let dayHours = 0

      for (const r of records) {
        const matchedEmp = employeeByKeyMap.get(r.biometric_user_id) || employeeByKeyMap.get(cleanBioKey(r.biometric_user_id))
        const canonicalStatus = normalizeEmploymentStatus(matchedEmp?.status ?? r.employee_status ?? 'active')

        // Exclude resigned employees from Present and Absent calculations
        if (isResignedStatus(canonicalStatus)) {
          continue
        }

        // For Today: include ONLY employees whose employment status is Active
        if (isTodayScope && !isActiveStatus(canonicalStatus)) {
          continue
        }

        // Exclude inactive employees across periods
        if (canonicalStatus === 'inactive') {
          continue
        }

        // Apply department filter to record using canonical employee department
        const empDept = matchedEmp?.department || employeeDeptMap.get(cleanBioKey(r.biometric_user_id)) || r.department || ''
        if (department !== 'all' && empDept !== department) {
          continue
        }

        // Attendance classification:
        // An employee is considered to have attended (PRESENT) if:
        // 1. actual_in has a valid recorded arrival time and is not missing/dash, OR
        // 2. valid_punches_count > 0, OR
        // 3. status indicates presence / manual adjustment / awaiting OUT
        // CRITICAL: An employee with an IN punch on Today (shift in progress) or historical must NEVER count as absent.
        const hasInPunch = Boolean(
          (r.actual_in && !r.actual_in.startsWith('Missing') && r.actual_in !== '—' && r.actual_in !== '-') ||
          (r.status === 'Awaiting OUT' || r.status.includes('Present') || r.status.includes('Late') || r.status.includes('Manual Time') || r.status.includes('Regular Day')) ||
          ((r.valid_punches_count || 0) > 0 && !r.status?.toLowerCase().includes('absent'))
        )

        if (hasInPunch) {
          const cleanKey = cleanBioKey(r.biometric_user_id) || r.biometric_user_id
          attendedBioIds.add(r.biometric_user_id)
          attendedBioIds.add(cleanKey)
          if (matchedEmp) {
            attendedBioIds.add(matchedEmp.biometric_user_id)
            attendedBioIds.add(cleanBioKey(matchedEmp.biometric_user_id))
          }

          // Guard against double-counting same employee on same date
          if (countedPresentKeys.has(cleanKey)) {
            continue
          }
          countedPresentKeys.add(cleanKey)

          dayPresent++
          dayHours += r.total_hours_decimal || 0

          if (r.late_minutes > 0) {
            dayLate++
            totalLateMinutes += r.late_minutes

            const empKey = r.biometric_user_id
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
            if (isSingleToday) {
              inProgressCount++
            }
            if (missingOutItems.length < 15) {
              const displayStatus = isToday ? 'Present / In Progress' : r.status
              missingOutItems.push({
                bioId: r.biometric_user_id,
                name: r.employee_name,
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
      // Regular working days: Mon-Sat (not Sunday), and not regular company holidays
      let dayAbsent = 0
      let dayExpected = 0

      if (!isSunday && !isHoliday) {
        for (const emp of scopedEmployees) {
          if (!isEmployeeEligibleForAbsence(emp, dStr)) {
            continue
          }

          dayExpected++
          totalEligibleWorkdays++

          // Check if employee had attendance
          const empBio = emp.biometric_user_id
          const empClean = cleanBioKey(emp.biometric_user_id)
          const empNum = cleanBioKey(emp.employee_number)
          const empId = cleanBioKey(emp.id)

          const attended = attendedBioIds.has(empBio) || attendedBioIds.has(empClean) || attendedBioIds.has(empNum) || attendedBioIds.has(empId)
          if (!attended) {
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

            if (!absencesByEmployee.has(emp.biometric_user_id)) {
              absencesByEmployee.set(emp.biometric_user_id, { emp, dates: [] })
            }
            absencesByEmployee.get(emp.biometric_user_id)!.dates.push(dStr)
          }
        }
      } else {
        // Sunday or Holiday: If an employee attended, that's already counted in dayPresent (rest duty)
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
    const weekMap = new Map<string, { label: string; absentCount: number; eligible: number }>()
    const monthMap = new Map<string, { label: string; absentCount: number; eligible: number }>()

    for (const pt of dayTrends) {
      const [y, m, d] = pt.date.split('-').map(Number)
      const dObj = new Date(Date.UTC(y, m - 1, d))

      // Week
      const { key: wKey, label: wLabel } = getWeekKeyAndLabel(dObj)
      if (!weekMap.has(wKey)) {
        weekMap.set(wKey, { label: wLabel, absentCount: 0, eligible: 0 })
      }
      const wItem = weekMap.get(wKey)!
      wItem.absentCount += pt.absent
      wItem.eligible += pt.expectedScheduled

      // Month
      const mKey = `${y}-${String(m).padStart(2, '0')}`
      const mLabel = dObj.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' })
      if (!monthMap.has(mKey)) {
        monthMap.set(mKey, { label: mLabel, absentCount: 0, eligible: 0 })
      }
      const mItem = monthMap.get(mKey)!
      mItem.absentCount += pt.absent
      mItem.eligible += pt.expectedScheduled
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

    const monthlyTrend: MonthTrendPoint[] = Array.from(monthMap.entries())
      .map(([monthKey, item]) => ({
        monthKey,
        label: item.label,
        absentCount: item.absentCount,
        eligibleWorkdays: item.eligible,
        absenceRate: item.eligible > 0 ? Number(((item.absentCount / item.eligible) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))

    // Department Distribution
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

    // Calculate eligible per department
    for (const emp of scopedEmployees) {
      const dept = emp.department || 'Operations'
      if (!deptMap.has(dept)) {
        deptMap.set(dept, { absentCount: 0, bioIds: new Set(), eligible: 0 })
      }
      // Count working days for this emp using unified eligibility rules
      let empEligible = 0
      for (const pt of dayTrends) {
        const [y, m, d] = pt.date.split('-').map(Number)
        const dObj = new Date(Date.UTC(y, m - 1, d))
        const isSun = dObj.getUTCDay() === 0
        const isHol = holidayDateSet.has(pt.date)
        if (isSun || isHol) continue

        if (!isEmployeeEligibleForAbsence(emp, pt.date)) continue

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
    const breakdownTotal = (onTimeCount + inProgressCount + totalLateDays + totalAbsentOccurrences) || 1

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
          }
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
          }
        ]

    // Construct concise HR insights
    const insights: string[] = []
    if (isSingleToday && inProgressCount > 0) {
      insights.push(`${inProgressCount} employee shift${inProgressCount > 1 ? 's are' : ' is'} currently in progress (clocked IN, awaiting OUT). Classified as Present.`)
    }
    if (totalAbsentOccurrences > 0) {
      insights.push(`${totalAbsentOccurrences} total absence occurrence${totalAbsentOccurrences > 1 ? 's' : ''} across ${uniqueAbsentEmployees} unique employee${uniqueAbsentEmployees > 1 ? 's' : ''} (${absenceRate}% absence rate; resigned employees accurately excluded based on effective separation dates).`)
    } else {
      insights.push('100% active workforce presence recorded; zero unexcused absences detected across this reporting period.')
    }

    if (repeatedAbsenceEmployeesCount > 0) {
      insights.push(`${repeatedAbsenceEmployeesCount} employee${repeatedAbsenceEmployeesCount > 1 ? 's have' : ' has'} repeated absences (2+ missed shifts) requiring supervisory counseling.`)
    }

    if (totalLateDays > 0) {
      insights.push(`${totalLateDays} late attendance instance${totalLateDays > 1 ? 's' : ''} recorded, totaling ${formatDuration(totalLateMinutes)} (${totalLateMinutes.toLocaleString()}m) lost time.`)
    } else {
      insights.push('Zero lateness instances recorded across this period.')
    }

    if (totalMissingOutDays > 0) {
      insights.push(`${totalMissingOutDays} punch record${totalMissingOutDays > 1 ? 's' : ''} have missing OUT scans requiring HR review or manual time adjustment.`)
    }

    insights.push(`Overall attendance rate is ${attendanceRate}% across ${dateList.length} date${dateList.length > 1 ? 's' : ''}.`)

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
        missingOutCount: totalMissingOutDays,
        totalRenderedHours: roundedTotalHours,
        avgDailyHours,
        attendanceRate,
        absenceRate,
        totalLateMinutes,
        uniqueAbsentEmployees,
        repeatedAbsenceEmployeesCount,
        totalEligibleWorkdays
      },
      dailyTrend: dayTrends,
      weeklyTrend,
      monthlyTrend,
      departmentDistribution,
      topAbsentEmployees,
      absentRecords: allAbsentRecords,
      statusBreakdown,
      topLateEmployees,
      missingOutItems,
      renderedHours: {
        total: roundedTotalHours,
        average: avgDailyHours,
        peakDate: peakDayDate,
        peakHours: Number(peakDayHours.toFixed(1))
      },
      insights
    }

    reportCache.set(cacheKey, { timestamp: Date.now(), data: result })
    return result
  },

  /**
   * Clears memoized reports cache
   */
  clearCache() {
    reportCache.clear()
  }
}
