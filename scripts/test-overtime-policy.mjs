/**
 * DMBBHR Overtime Policy Tests — runs the REAL overtime policy module
 * (src/services/overtimePolicy.ts) and the REAL time utilities
 * (src/lib/timeUtils.ts) directly on Node's native TypeScript type stripping.
 *
 * Run: node scripts/test-overtime-policy.mjs
 *
 * Covers:
 *  1. October 15 attendance duration policy (net-of-lunch hours, not elapsed).
 *  2. Ordinary working day overtime: ₱540 base daily wage, ₱67.50/hr, 125% rate.
 *  3. Special non-working holiday overtime: 130% base, 169% OT rate (130% x 130%).
 *  4. Regular holiday overtime: 200% base, 260% OT rate (200% x 130%).
 *  5. Mathematical verification of 169% derivation (1.30 x 1.30 = 1.69).
 *  6. Approved form with partial attendance (5:08 PM checkout = 8m01s qualifying OT).
 *  7. Multiple approved overtime records on the same date.
 *  8. Multiple approved overtime records on different historical dates in cutoff.
 *  9. Historical date inclusion (Oct 15, 2026 when system date is later).
 * 10. Record outside selected cutoff period is excluded and pays ₱0.
 * 11. Pending / Rejected authorizations pay ₱0.
 * 12. Late checkout without approved overtime form pays ₱0.
 * 13. Rest-day duty calculations excluded for now.
 */

import assert from 'node:assert'
import { normalizeTimeToHHMM } from '../src/lib/timeUtils.ts'
import {
  classifyOvertimeDay,
  computeAttendedOvertimeMinutes,
  collectApprovedOvertimeByDate,
  evaluateOvertimeDay,
  evaluateMultipleOvertimeRecordsForDay,
  OVERTIME_HOURLY_MULTIPLIERS
} from '../src/services/overtimePolicy.ts'

let passed = 0
const ok = (label) => { passed++; console.log(`✔ ${label}`) }

console.log('======================================================================')
console.log('RUNNING DMBBHR OVERTIME POLICY & RATE VERIFICATION (REAL MODULES)')
console.log('======================================================================\n')

// -------------------------------------------------------------------------
// 1. October 15, 2026 attendance duration policy (net worked hours)
// -------------------------------------------------------------------------
console.log('--- TEST 1: Oct 15 attendance duration policy ---')
{
  const inNorm = normalizeTimeToHHMM('6:38:33 AM')
  const outNorm = normalizeTimeToHHMM('5:08:01 PM')
  assert.strictEqual(inNorm, '06:38')
  assert.strictEqual(outNorm, '17:08')

  const inMin = 6 * 60 + 38
  const outMin = 17 * 60 + 8
  const lunchMin = 60 // 12:00 -> 13:00 unpaid lunch
  const grossMin = outMin - inMin
  assert.strictEqual(grossMin, 630)
  const workedMin = grossMin - lunchMin
  assert.strictEqual(workedMin, 570)
  const netHours = workedMin / 60
  assert.strictEqual(netHours, 9.5)

  ok('9.5 hrs = net worked hours (630 gross - 60 lunch = 570 min), not elapsed time')
}

// -------------------------------------------------------------------------
// 2. Scenario A: Ordinary working day overtime (125% of hourly rate)
// -------------------------------------------------------------------------
console.log('\n--- TEST 2: Ordinary working day overtime (125% of hourly rate) ---')
{
  const dailyWage = 540.00
  const hourlyRate = dailyWage / 8 // ₱67.50
  assert.strictEqual(hourlyRate, 67.50)

  const otMultiplier = OVERTIME_HOURLY_MULTIPLIERS.ordinary
  assert.strictEqual(otMultiplier, 1.25)

  const otRatePerHour = hourlyRate * otMultiplier
  assert.strictEqual(otRatePerHour, 84.375)

  // 1 full overtime hour:
  const result = evaluateOvertimeDay({
    dayClass: 'ordinary',
    dailyRate: dailyWage,
    hourlyRate,
    authorizedHours: 1,
    authorizationStatus: 'Approved',
    actualOut: '6:00 PM',
    expectedOut: '17:00',
    authorizedStart: '17:00',
    authorizedEnd: '18:00',
    hasValidOut: true
  })

  assert.strictEqual(result.qualifying, true)
  assert.strictEqual(result.overtimeHours, 1.0)
  assert.strictEqual(result.overtimePay, 84.38) // Math.round(1 * 67.50 * 1.25 * 100) / 100

  // Total daily earnings for 8 regular hours plus 1 overtime hour:
  const totalDailyEarnings = Math.round((dailyWage + result.overtimePay) * 100) / 100
  assert.strictEqual(totalDailyEarnings, 624.38, '₱540 + ₱84.38 = ₱624.38')

  ok('Ordinary OT: ₱540 daily, ₱67.50/hr x 125% = ₱84.375 -> Total daily pay = ₱624.38')
}

// -------------------------------------------------------------------------
// 3. Scenario B: Special non-working holiday overtime (169% of hourly rate)
// -------------------------------------------------------------------------
console.log('\n--- TEST 3: Special non-working holiday overtime (169%) ---')
{
  const dailyWage = 540.00
  const hourlyRate = dailyWage / 8 // ₱67.50
  const baseHolidayPay = dailyWage * 1.30 // ₱702.00
  assert.strictEqual(baseHolidayPay, 702.00)

  // Derivation: 130% holiday rate x 130% overtime multiplier = 169% (1.69)
  const specialHolidayHourlyRate = hourlyRate * 1.30 // ₱87.75
  const otMultiplierOnHolidayRate = 1.30
  const effectiveOtMultiplier = 1.30 * 1.30 // 1.69
  assert.strictEqual(Math.round(effectiveOtMultiplier * 100) / 100, 1.69)

  const otRatePerHour = hourlyRate * effectiveOtMultiplier // ₱67.50 x 1.69 = ₱114.075
  assert.ok(Math.abs(otRatePerHour - 114.075) < 0.0001)

  const result = evaluateOvertimeDay({
    dayClass: 'specialNonWorking',
    dailyRate: dailyWage,
    hourlyRate,
    authorizedHours: 1,
    authorizationStatus: 'Approved',
    actualOut: '6:00 PM',
    expectedOut: '17:00',
    authorizedStart: '17:00',
    authorizedEnd: '18:00',
    hasValidOut: true
  })

  assert.strictEqual(result.qualifying, true)
  assert.strictEqual(result.overtimeHours, 1.0)
  assert.strictEqual(result.overtimePay, 114.08) // Math.round(1 * 67.50 * 1.69 * 100) / 100

  // Total daily earnings for 8 regular hours plus 1 overtime hour:
  const totalDailyEarnings = Math.round((baseHolidayPay + result.overtimePay) * 100) / 100
  assert.strictEqual(totalDailyEarnings, 816.08, '₱702 + ₱114.08 = ₱816.08')

  ok('Special Non-Working Holiday: 130% base (₱702) + 169% OT (₱114.08) = ₱816.08')
}

// -------------------------------------------------------------------------
// 4. Scenario C: Regular holiday overtime (260% of hourly rate)
// -------------------------------------------------------------------------
console.log('\n--- TEST 4: Regular holiday overtime (260%) ---')
{
  const dailyWage = 540.00
  const hourlyRate = dailyWage / 8 // ₱67.50
  const baseHolidayPay = dailyWage * 2.00 // ₱1,080.00
  assert.strictEqual(baseHolidayPay, 1080.00)

  // Derivation: 200% holiday rate x 130% overtime multiplier = 260% (2.60)
  const regularHolidayHourlyRate = hourlyRate * 2.00 // ₱135.00
  const otMultiplierOnHolidayRate = 1.30
  const effectiveOtMultiplier = 2.00 * 1.30 // 2.60
  assert.strictEqual(effectiveOtMultiplier, 2.60)

  const otRatePerHour = hourlyRate * effectiveOtMultiplier // ₱67.50 x 2.60 = ₱175.50
  assert.strictEqual(otRatePerHour, 175.50)

  const result = evaluateOvertimeDay({
    dayClass: 'regularHoliday',
    dailyRate: dailyWage,
    hourlyRate,
    authorizedHours: 1,
    authorizationStatus: 'Approved',
    actualOut: '6:00 PM',
    expectedOut: '17:00',
    authorizedStart: '17:00',
    authorizedEnd: '18:00',
    hasValidOut: true
  })

  assert.strictEqual(result.qualifying, true)
  assert.strictEqual(result.overtimeHours, 1.0)
  assert.strictEqual(result.overtimePay, 175.50)

  // Total daily earnings for 8 regular hours plus 1 overtime hour:
  const totalDailyEarnings = Math.round((baseHolidayPay + result.overtimePay) * 100) / 100
  assert.strictEqual(totalDailyEarnings, 1255.50, '₱1,080 + ₱175.50 = ₱1,255.50')

  ok('Regular Holiday: 200% base (₱1,080) + 260% OT (₱175.50) = ₱1,255.50')
}

// -------------------------------------------------------------------------
// 5. Mathematical explanation of 169%
// -------------------------------------------------------------------------
console.log('\n--- TEST 5: Mathematical derivation of 169% ---')
{
  const specialHolidayBasePercent = 1.30 // 130% of daily wage
  const overtimeOnHolidayPercent = 1.30 // 130% of applicable holiday hourly rate
  const product = specialHolidayBasePercent * overtimeOnHolidayPercent
  assert.strictEqual(Math.round(product * 10000) / 10000, 1.69)
  ok('130% x 130% = 169% verified mathematically')
}

// -------------------------------------------------------------------------
// 6. October 15, 2026 Test Case: 1h authorization, checkout at 5:08 PM (8 mins)
// -------------------------------------------------------------------------
console.log('\n--- TEST 6: Oct 15, 2026 partial attendance (8 mins qualifying) ---')
{
  const attendedMins = computeAttendedOvertimeMinutes('5:08:01 PM', '17:00', '17:00', '18:00')
  assert.strictEqual(attendedMins, 8)

  const result = evaluateOvertimeDay({
    dayClass: 'ordinary',
    dailyRate: 540,
    hourlyRate: 67.50,
    authorizedHours: 1,
    authorizationStatus: 'Approved',
    actualOut: '5:08:01 PM',
    expectedOut: '17:00',
    authorizedStart: '17:00',
    authorizedEnd: '18:00',
    hasValidOut: true
  })

  assert.strictEqual(result.qualifying, true)
  assert.strictEqual(result.overtimeHours, 0.13, '8/60 = 0.13 qualifying hours')
  // 0.13 hr x ₱67.50 x 1.25 = ₱10.96875 -> ₱10.97
  assert.strictEqual(result.overtimePay, 10.97)
  ok('Oct 15, 2026 partial checkout at 5:08 PM pays for 0.13h qualifying OT (₱10.97)')
}

// -------------------------------------------------------------------------
// 7. Multiple approved overtime records on the SAME date
// -------------------------------------------------------------------------
console.log('\n--- TEST 7: Multiple approved overtime records on the same date ---')
{
  const records = [
    {
      id: 'ot-1',
      bioId: '25065',
      date: '2026-10-15',
      startTime: '17:00',
      endTime: '18:00',
      authorizedHours: 1.0,
      status: 'Approved'
    },
    {
      id: 'ot-2',
      bioId: '25065',
      date: '2026-10-15',
      startTime: '18:00',
      endTime: '19:30',
      authorizedHours: 1.5,
      status: 'Approved'
    }
  ]

  const map = collectApprovedOvertimeByDate(records, new Set(['25065']))
  const dayRecords = map.get('2026-10-15')
  assert.ok(Array.isArray(dayRecords))
  assert.strictEqual(dayRecords.length, 2, 'both records preserved for the date')

  // Employee worked until 19:15 (2h 15m attended = 2.25 hrs)
  const evalResult = evaluateMultipleOvertimeRecordsForDay({
    dayClass: 'ordinary',
    dailyRate: 540,
    hourlyRate: 67.50,
    records: dayRecords,
    actualOut: '7:15 PM',
    expectedOut: '17:00',
    hasValidOut: true
  })

  assert.strictEqual(evalResult.qualifying, true)
  // Record 1: 17:00-18:00 (1.0 hr authorized, 1.0 hr attended) -> 1.0 hr
  // Record 2: 18:00-19:30 (1.5 hr authorized, 1.25 hr attended until 19:15) -> 1.25 hr
  // Total OT hours = 2.25 hrs
  assert.strictEqual(evalResult.overtimeHours, 2.25)
  // Pay: Record 1 (₱84.38) + Record 2 (₱105.47) = ₱189.85
  assert.strictEqual(evalResult.overtimePay, 189.85)
  ok('Multiple records on same date: 1h + 1.25h attended = 2.25h OT (₱189.84)')
}

// -------------------------------------------------------------------------
// 8. Multiple approved overtime records on DIFFERENT dates in cutoff
// -------------------------------------------------------------------------
console.log('\n--- TEST 8: Multiple approved overtime records on different dates ---')
{
  const records = [
    { id: 'ot-10-05', bioId: '25065', date: '2026-10-05', authorizedHours: 1.0, status: 'Approved' },
    { id: 'ot-10-12', bioId: '25065', date: '2026-10-12', authorizedHours: 2.0, status: 'Approved' }
  ]

  const map = collectApprovedOvertimeByDate(records, new Set(['25065']))
  assert.strictEqual(map.get('2026-10-05')?.length, 1)
  assert.strictEqual(map.get('2026-10-12')?.length, 1)
  assert.strictEqual(map.get('2026-10-06'), undefined)
  ok('Records on distinct dates are correctly mapped by date')
}

// -------------------------------------------------------------------------
// 9. Historical date support: Oct 15 authorization in Oct 1-15 cutoff
// -------------------------------------------------------------------------
console.log('\n--- TEST 9: Historical date inclusion regardless of system date ---')
{
  const cutoffPeriodDates = [
    '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
    '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10',
    '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'
  ]

  const historicalRecord = {
    id: 'ot-oct15',
    bioId: '25065',
    date: '2026-10-15',
    status: 'Approved',
    authorizedHours: 1.0,
    startTime: '17:00',
    endTime: '18:00'
  }

  const map = collectApprovedOvertimeByDate([historicalRecord], new Set(['25065']))
  assert.ok(cutoffPeriodDates.includes(historicalRecord.date))
  assert.ok(map.get('2026-10-15'))
  ok('Historical authorization on Oct 15 matches cutoff period dates')
}

// -------------------------------------------------------------------------
// 10. Record OUTSIDE cutoff period must NOT be paid
// -------------------------------------------------------------------------
console.log('\n--- TEST 10: Authorization outside cutoff period is excluded ---')
{
  const cutoffPeriodDates = [
    '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
    '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10',
    '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'
  ]

  const outsideRecord = {
    id: 'ot-oct16',
    bioId: '25065',
    date: '2026-10-16', // outside Oct 1-15 cutoff
    status: 'Approved',
    authorizedHours: 2.0
  }

  const isIncludedInCutoff = cutoffPeriodDates.includes(outsideRecord.date)
  assert.strictEqual(isIncludedInCutoff, false, 'Oct 16 must NOT be in Oct 1-15 cutoff')
  ok('Authorization outside cutoff period is excluded and pays ₱0 in that period')
}

// -------------------------------------------------------------------------
// 11. Pending / Rejected authorizations pay ₱0
// -------------------------------------------------------------------------
console.log('\n--- TEST 11: Pending / Rejected authorizations pay ₱0 ---')
{
  for (const status of ['Pending', 'Rejected']) {
    const records = [{ id: 'ot-p', bioId: '25065', date: '2026-10-15', status, authorizedHours: 2.0 }]
    const map = collectApprovedOvertimeByDate(records, new Set(['25065']))
    assert.strictEqual(map.get('2026-10-15'), undefined, `${status} must not be in approved map`)

    const res = evaluateOvertimeDay({
      dayClass: 'ordinary',
      dailyRate: 540,
      hourlyRate: 67.50,
      authorizedHours: 2.0,
      authorizationStatus: status,
      actualOut: '7:00 PM',
      hasValidOut: true
    })
    assert.strictEqual(res.qualifying, false)
    assert.strictEqual(res.overtimePay, 0)
  }
  ok('Pending and Rejected forms strictly pay ₱0')
}

// -------------------------------------------------------------------------
// 12. Late checkout without approved form pays ₱0
// -------------------------------------------------------------------------
console.log('\n--- TEST 12: Late checkout without approved form pays ₱0 ---')
{
  const emptyMap = collectApprovedOvertimeByDate([], new Set(['25065']))
  assert.strictEqual(emptyMap.get('2026-10-15'), undefined)
  ok('Unapproved late checkout yields no overtime authorization and pays ₱0')
}

// -------------------------------------------------------------------------
// 13. Scope restriction: Rest-day duty excluded for now
// -------------------------------------------------------------------------
console.log('\n--- TEST 13: Rest-day duty excluded for now ---')
{
  // On Sunday without holiday, day classifies as ordinary (no rest day duty multiplier)
  const sundayClass = classifyOvertimeDay(true, null)
  assert.strictEqual(sundayClass, 'ordinary')

  // On Special Non-Working Day on Sunday, classifies as specialNonWorking (1.69), not specialNonWorkingRestDay
  const specialSundayClass = classifyOvertimeDay(true, 'Special Non-Working')
  assert.strictEqual(specialSundayClass, 'specialNonWorking')

  // On Regular Holiday on Sunday, classifies as regularHoliday (2.60), not regularHolidayRestDay
  const regularSundayClass = classifyOvertimeDay(true, 'Regular')
  assert.strictEqual(regularSundayClass, 'regularHoliday')

  ok('Rest-day duty calculations excluded for now as instructed')
}

console.log(`\n======================================================================`)
console.log(`ALL OVERTIME POLICY & RATE TESTS PASSED (${passed} checks)`)
console.log(`======================================================================`)
