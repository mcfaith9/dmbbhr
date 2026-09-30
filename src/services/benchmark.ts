/**
 * Biometric Attendance Performance Benchmarking Suite
 *
 * Tests the system under high loads:
 * - 10,000 records
 * - 50,000 records
 * - 90,000 records
 * - 100,000+ records
 *
 * Measures:
 * - Single-day O(1) partition access time
 * - Daily Attendance engine calculation with punch deduplication
 * - Large-scale search filtering time
 * - Pagination slice time
 */

import type { AttendanceLog } from '@/types'
import { attendanceService } from './attendance'
import { getManilaDateString } from './attendanceEngine'

export interface BenchmarkResult {
  recordCount: number
  generatedInMs: number
  indexingTimeMs: number
  dayLookupTimeMs: number
  dailyAttendanceCalculationTimeMs: number
  searchFilterTimeMs: number
  paginationTimeMs: number
  totalTimeMs: number
  dailyRecordsCount: number
  uniqueEmployeesCount: number
  notes: string
}

export async function runPerformanceBenchmark(targetCount: number = 90000): Promise<BenchmarkResult> {
  const overallStart = performance.now()

  // 1. Generate realistic synthetic raw biometric punch dataset spanning multiple months
  const genStart = performance.now()
  const syntheticLogs: AttendanceLog[] = []
  const todayStr = getManilaDateString(new Date())

  // Realistic employee pool (150 employees)
  const employeePool = Array.from({ length: 150 }, (_, i) => ({
    bioId: String(50000 + i),
    name: `Employee ${50000 + i}`
  }))

  const locations = ['DBB CEBU', 'DMBB CEBU', 'DBB NEGROS', 'DBB ILOILO']

  for (let i = 0; i < targetCount; i++) {
    // Generate dates: 20% today, 80% distributed over past 180 days
    let dateStr: string
    let hour: number
    let minute: number
    let second: number

    if (i < Math.round(targetCount * 0.05)) {
      // Today punches (including intentional duplicate scans to stress the engine)
      dateStr = todayStr
      hour = 7 + (i % 12)
      minute = i % 60
      second = (i * 7) % 60
    } else {
      // Historical dates
      const daysAgo = 1 + (i % 180)
      const d = new Date()
      d.setDate(d.getDate() - daysAgo)
      dateStr = getManilaDateString(d)
      hour = 7 + (i % 12)
      minute = i % 60
      second = (i * 13) % 60
    }

    const emp = employeePool[i % employeePool.length]
    const loc = locations[i % locations.length]

    // Create realistic Manila ISO timestamp
    const mStr = String(minute).padStart(2, '0')
    const sStr = String(second).padStart(2, '0')
    const hStr = String(hour).padStart(2, '0')
    const timeIso = `${dateStr}T${hStr}:${mStr}:${sStr}+08:00`

    syntheticLogs.push({
      id: `bench-${i}-${emp.bioId}`,
      user_id: emp.bioId,
      employee_name: emp.name,
      attendance_time: timeIso,
      type: 1,
      state: hour >= 16 ? 2 : 1,
      serial_number: i % 1000,
      device_id: 'dev-1',
      device_name: 'BISMAC BISBIO B-29b',
      device_ip: '192.168.1.201',
      location_id: 'loc-cebu',
      location_name: loc,
      is_duplicate: false,
      created_at: new Date().toISOString()
    })
  }
  const genTime = performance.now() - genStart

  // 2. Measure Store Ingestion & Partition Indexing Time
  const indexStart = performance.now()
  attendanceService.setDeviceLogs(syntheticLogs)
  const indexTime = performance.now() - indexStart

  // 3. Measure O(1) Single-Day Lookup Time (The critical Daily Attendance operation)
  const dayLookupStart = performance.now()
  await attendanceService.getLogs({ quickRange: 'today', pageSize: 999999 })
  const dayLookupTime = performance.now() - dayLookupStart

  // 4. Measure Daily Attendance Engine Calculation Time (Duplicate collapsing & session detection)
  const dailyCalcStart = performance.now()
  const dailyResults = await attendanceService.getDailyAttendance(todayStr)
  const dailyCalcTime = performance.now() - dailyCalcStart

  // 5. Measure Full Dataset Search Filter Time
  const searchStart = performance.now()
  await attendanceService.getLogs({ search: '50044', page: 1, pageSize: 10 })
  const searchTime = performance.now() - searchStart

  // 6. Measure Pagination Slice Time
  const pageStart = performance.now()
  await attendanceService.getLogs({ page: 250, pageSize: 25 })
  const pageTime = performance.now() - pageStart

  const totalTime = performance.now() - overallStart

  return {
    recordCount: targetCount,
    generatedInMs: Math.round(genTime),
    indexingTimeMs: Math.round(indexTime),
    dayLookupTimeMs: Number(dayLookupTime.toFixed(2)),
    dailyAttendanceCalculationTimeMs: Number(dailyCalcTime.toFixed(2)),
    searchFilterTimeMs: Number(searchTime.toFixed(2)),
    paginationTimeMs: Number(pageTime.toFixed(2)),
    totalTimeMs: Math.round(totalTime),
    dailyRecordsCount: dailyResults.length,
    uniqueEmployeesCount: employeePool.length,
    notes: `Engine successfully processed ${targetCount.toLocaleString()} records. Date partition lookup completed in ${dayLookupTime.toFixed(2)}ms.`
  }
}
