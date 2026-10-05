/**
 * HR Attendance Reports Service
 *
 * Implements high-performance, non-duplicative aggregation of attendance data.
 * Reuses the authoritative Daily Attendance and Employee services.
 */

import { attendanceService, getManilaDateString, type DailyAttendanceRecord } from './attendance'
import { employeeService } from './employees'
import { formatDuration } from '@/lib/timeUtils'

export type DateRangePreset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom'

export interface ReportFilterOptions {
  preset: DateRangePreset
  startDate?: string // YYYY-MM-DD
  endDate?: string // YYYY-MM-DD
  location?: string // 'all', 'DBB CEBU', etc.
  workGroupId?: string // 'all' or specific
  employeeBioId?: string // 'all' or specific bioId
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
  lateDates: string[]
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
    totalLateMinutes: number
  }
  dailyTrend: DayTrendPoint[]
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

  // Limit max range to 62 days to safeguard browser performance
  let count = 0
  while (cur <= end && count < 62) {
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

export const reportsService = {
  /**
   * Generates aggregated HR attendance report summary for the requested filter
   */
  async getReportSummary(filters: ReportFilterOptions, forceRefresh = false): Promise<ReportSummaryResult> {
    const { preset, startDate, endDate, location = 'all', workGroupId = 'all', employeeBioId = 'all' } = filters
    const { start, end, label } = resolveDateRange(preset, startDate, endDate)

    const cacheKey = `${start}_${end}_${location}_${workGroupId}_${employeeBioId}`
    if (!forceRefresh && reportCache.has(cacheKey)) {
      const cached = reportCache.get(cacheKey)!
      if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
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

    // 2. Fetch employee total count for absent calculation
    const allEmployees = await employeeService.getEmployees({
      location: location !== 'all' ? location : undefined,
      workGroupId: workGroupId !== 'all' ? workGroupId : undefined
    })
    const totalExpectedPerDay = bioFilter ? 1 : Math.max(allEmployees.length, 1)

    // 3. Process aggregations
    let totalPresentDays = 0
    let totalLateDays = 0
    let totalMissingOutDays = 0
    let totalRenderedHours = 0
    let totalLateMinutes = 0
    let totalAbsentDays = 0

    const dayTrends: DayTrendPoint[] = []
    const lateByEmployee = new Map<string, { emp: DailyAttendanceRecord; lateCount: number; minutes: number; lastDate: string; lateDates: string[] }>()
    const missingOutItems: MissingOutItem[] = []

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

      let dayPresent = 0
      let dayLate = 0
      let dayMissingOut = 0
      let dayHours = 0

      for (const r of records) {
        // Did the employee have attendance on this day?
        const hasAttended = r.actual_in && !r.actual_in.startsWith('Missing')
        if (hasAttended) {
          dayPresent++
          dayHours += r.total_hours_decimal || 0

          if (r.late_minutes > 0) {
            dayLate++
            totalLateMinutes += r.late_minutes

            const empKey = r.biometric_user_id
            const dateKey = r.raw_date || dStr
            if (!lateByEmployee.has(empKey)) {
              lateByEmployee.set(empKey, { emp: r, lateCount: 0, minutes: 0, lastDate: dateKey, lateDates: [] })
            }
            const agg = lateByEmployee.get(empKey)!
            agg.lateCount++
            agg.minutes += r.late_minutes
            agg.lastDate = dateKey
            if (!agg.lateDates.includes(dateKey)) {
              agg.lateDates.push(dateKey)
            }
          }

          const isMissingOut = !r.has_valid_out || r.status.includes('No OUT') || r.status === 'Awaiting OUT'
          if (isMissingOut) {
            dayMissingOut++
            if (missingOutItems.length < 10) {
              missingOutItems.push({
                bioId: r.biometric_user_id,
                name: r.employee_name,
                date: r.date,
                timeIn: r.actual_in,
                workGroupName: r.work_group_name,
                status: r.status
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

      // Calculate estimated absents on regular working days (Mon-Sat, not Sunday)
      let dayAbsent = 0
      if (!isSunday && !bioFilter) {
        dayAbsent = Math.max(0, totalExpectedPerDay - dayPresent)
      } else if (bioFilter && dayPresent === 0 && !isSunday) {
        dayAbsent = 1
      }
      totalAbsentDays += dayAbsent

      dayTrends.push({
        date: dStr,
        shortLabel,
        dayName,
        present: dayPresent,
        late: dayLate,
        absent: dayAbsent,
        missingOut: dayMissingOut,
        renderedHours: Number(dayHours.toFixed(1))
      })
    }

    // Top late employees
    const topLateEmployees: TopLateEmployee[] = Array.from(lateByEmployee.values())
      .map(({ emp, lateCount, minutes, lastDate, lateDates }) => ({
        bioId: emp.biometric_user_id,
        name: emp.employee_name,
        department: emp.department || 'Operations',
        workGroupName: emp.work_group_name,
        lateDays: lateCount,
        totalLateMinutes: minutes,
        avgLateMinutes: Math.round(minutes / (lateCount || 1)),
        latestLateDate: lastDate,
        lateDates: [...lateDates].sort((a, b) => a.localeCompare(b))
      }))
      .sort((a, b) => b.lateDays - a.lateDays || b.totalLateMinutes - a.totalLateMinutes)
      .slice(0, 10)

    // Summary calculations
    const roundedTotalHours = Number(totalRenderedHours.toFixed(1))
    const avgDailyHours = totalPresentDays > 0 ? Number((totalRenderedHours / totalPresentDays).toFixed(1)) : 0
    const totalPotential = totalPresentDays + totalAbsentDays
    const attendanceRate = totalPotential > 0 ? Math.round((totalPresentDays / totalPotential) * 100) : 100

    // Status breakdown percentages
    const onTimeCount = Math.max(0, totalPresentDays - totalLateDays)
    const breakdownTotal = (onTimeCount + totalLateDays + totalMissingOutDays + totalAbsentDays) || 1

    const statusBreakdown: AttendanceStatusBreakdown[] = [
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
      {
        label: 'Missing OUT',
        count: totalMissingOutDays,
        percentage: Math.round((totalMissingOutDays / breakdownTotal) * 100),
        color: '#6366f1' // indigo-500
      },
      {
        label: 'Absent / Unrecorded',
        count: totalAbsentDays,
        percentage: Math.round((totalAbsentDays / breakdownTotal) * 100),
        color: '#ef4444' // red-500
      }
    ]

    // Construct concise HR insights
    const insights: string[] = []
    if (totalLateDays > 0) {
      insights.push(`${totalLateDays} late attendance instance${totalLateDays > 1 ? 's' : ''} recorded, totaling ${formatDuration(totalLateMinutes)} (${totalLateMinutes.toLocaleString()}m) lost time.`)
    } else {
      insights.push('Zero lateness instances recorded across this period.')
    }

    if (totalMissingOutDays > 0) {
      insights.push(`${totalMissingOutDays} punch record${totalMissingOutDays > 1 ? 's' : ''} have missing OUT scans requiring HR review or manual time adjustment.`)
    } else {
      insights.push('All recorded shifts have complete biometric check-in and check-out pairs.')
    }

    insights.push(`Overall attendance rate is ${attendanceRate}% across ${dateList.length} date${dateList.length > 1 ? 's' : ''}.`)

    if (topLateEmployees.length > 0) {
      const topEmp = topLateEmployees[0]
      insights.push(`Highest tardiness frequency: ${topEmp.name} (${topEmp.lateDays} late day${topEmp.lateDays > 1 ? 's' : ''}, ${formatDuration(topEmp.totalLateMinutes)} / ${topEmp.totalLateMinutes}m total).`)
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
        absentCount: totalAbsentDays,
        missingOutCount: totalMissingOutDays,
        totalRenderedHours: roundedTotalHours,
        avgDailyHours,
        attendanceRate,
        totalLateMinutes
      },
      dailyTrend: dayTrends,
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
