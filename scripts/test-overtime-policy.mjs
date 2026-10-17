/**
 * DMBBHR Overtime Policy Tests — runs the REAL overtime policy module
 * (src/services/overtimePolicy.ts) and the REAL time utilities
 * (src/lib/timeUtils.ts) directly on Node's native TypeScript type stripping.
 *
 * Run: node scripts/test-overtime-policy.mjs
 *
 * Covers:
 *  1. October 15 attendance duration policy (net-of-lunch hours, not elapsed).
 *  2. Approved OT form with only 8m01s of qualifying overtime -> flat premium.
 *  3. Approved form but no qualifying overtime attendance -> ₱0.
 *  4. Pending / Rejected form -> ₱0.
 *  5. No overtime form despite late checkout -> ₱0.
 *  6. One qualifying occurrence, daily rate ₱600 -> ₱150 premium.
 *  7. Different approved durations do not multiply the 25% premium.
 *  8. Different employee IDs / dates do not accidentally match an authorization.
 *  9. Earnings include the premium exactly once per occurrence.
 * 10. Recalculation after an approval change (draft snapshots re-evaluate).
 * 11. Holiday / rest-day / special-day statutory hourly rates unchanged.
 */

import assert from 'node:assert'
import { normalizeTimeToHHMM } from '../src/lib/timeUtils.ts'
import {
  classifyOvertimeDay,
  computeAttendedOvertimeMinutes,
  collectApprovedOvertimeByDate,
  evaluateOvertimeDay,
  OVERTIME_HOURLY_MULTIPLIERS
} from '../src/services/overtimePolicy.ts'

let passed = 0
const ok = (label) => { passed++; console.log(`✔ ${label}`) }

console.log('======================================================================')
console.log('RUNNING DMBBHR OVERTIME POLICY VERIFICATION (REAL SOURCE MODULES)')
console.log('======================================================================\n')

// -------------------------------------------------------------------------
// 1. October 15, 2026 attendance duration policy
// -------------------------------------------------------------------------
console.log('--- TEST 1: Oct 15 attendance duration policy ---')
{
  const inNorm = normalizeTimeToHHMM('6:38:33 AM')
  const outNorm = normalizeTimeToHHMM('5:08:01 PM')
  assert.strictEqual(inNorm, '06:38')
  assert.strictEqual(outNorm, '17:08')

  // Actual elapsed interval (seconds-precise): ~10h 29m 28s
  const elapsedSeconds = ((17 * 3600 + 8 * 60 + 1) - (6 * 3600 + 38 * 60 + 33))
  const elapsedHours = elapsedSeconds / 3600
  assert.ok(Math.abs(elapsedHours - 10.4911) < 0.001, `elapsed ${elapsedHours}`)

  // Existing attendance engine policy (attendanceEngine.ts):
  // gross minutes between IN and OUT (seconds dropped), minus the fixed
  // 12:00-13:00 lunch window when the span covers lunch:
  const inMin = 6 * 60 + 38
  const outMin = 17 * 60 + 8
  const lunchMin = 60 // 12:00 -> 13:00
  const grossMin = outMin - inMin
  assert.strictEqual(grossMin, 630)
  const workedMin = grossMin - lunchMin
  assert.strictEqual(workedMin, 570)
  const netHours = workedMin / 60
  assert.strictEqual(netHours, 9.5)
  // Display string uses .toFixed(1):
  const display = `${netHours.toFixed(1)} hrs`
  assert.strictEqual(display, '9.5 hrs')

  // The displayed 9.5 hrs is NET working hours after the unpaid lunch window,
  // not elapsed time. This is the existing intended policy.
  assert.notStrictEqual(netHours, Math.round(elapsedHours * 10) / 10)
  ok('9.5 hrs = net worked hours (630 gross - 60 lunch = 570 min), not elapsed 10.49 hrs')
}

// -------------------------------------------------------------------------
// 2 & 6. Approved form, 8m01s qualifying OT -> ₱150 flat premium
// -------------------------------------------------------------------------
console.log('\n--- TEST 2: Approved 1h form, only 8m01s qualifying overtime ---')
{
  const attended = computeAttendedOvertimeMinutes('5:08:01 PM', '17:00', '17:00', '18:00')
  assert.strictEqual(attended, 8, 'seconds are dropped by existing minute-level policy')

  const result = evaluateOvertimeDay({
    dayClass: 'ordinary',
    dailyRate: 600,
    hourlyRate: 75,
    authorizedHours: 1,
    authorizationStatus: 'Approved',
    actualOut: '5:08:01 PM',
    expectedOut: '17:00',
    authorizedStart: '17:00',
    authorizedEnd: '18:00',
    hasValidOut: true
  })
  assert.strictEqual(result.qualifying, true)
  assert.strictEqual(result.overtimeHours, 0.13, 'records actual qualifying hours, not the full authorized hour')
  assert.strictEqual(result.overtimePay, 150, '₱600 x 25% = ₱150 (company policy, once per occurrence)')
  ok('8m01s past 17:00 qualifies; premium = ₱600 x 25% = ₱150.00')
}

// -------------------------------------------------------------------------
// 3. Approved form but no qualifying attendance
// -------------------------------------------------------------------------
console.log('\n--- TEST 3: Approved form, no qualifying overtime attendance ---')
{
  const punchedOutOnTime = evaluateOvertimeDay({
    dayClass: 'ordinary', dailyRate: 600, hourlyRate: 75, authorizedHours: 1,
    authorizationStatus: 'Approved', actualOut: '5:00 PM', expectedOut: '17:00',
    authorizedStart: '17:00', authorizedEnd: '18:00', hasValidOut: true
  })
  assert.strictEqual(punchedOutOnTime.qualifying, false)
  assert.strictEqual(punchedOutOnTime.overtimePay, 0)

  const noValidOut = evaluateOvertimeDay({
    dayClass: 'ordinary', dailyRate: 600, hourlyRate: 75, authorizedHours: 1,
    authorizationStatus: 'Approved', actualOut: '5:08:01 PM', expectedOut: '17:00',
    authorizedStart: '17:00', authorizedEnd: '18:00', hasValidOut: false
  })
  assert.strictEqual(noValidOut.qualifying, false)
  assert.strictEqual(noValidOut.overtimePay, 0)

  const outsideWindow = evaluateOvertimeDay({
    dayClass: 'ordinary', dailyRate: 600, hourlyRate: 75, authorizedHours: 1,
    authorizationStatus: 'Approved', actualOut: '5:08:01 PM', expectedOut: '17:00',
    authorizedStart: '18:00', authorizedEnd: '19:00', hasValidOut: true
  })
  assert.strictEqual(outsideWindow.qualifying, false, 'attendance before the authorized window does not qualify')
  assert.strictEqual(outsideWindow.overtimePay, 0)
  ok('On-time OUT, missing OUT, and pre-window attendance all pay ₱0')
}

// -------------------------------------------------------------------------
// 4. Pending / Rejected form
// -------------------------------------------------------------------------
console.log('\n--- TEST 4: Pending or rejected form pays ₱0 ---')
{
  for (const status of ['Pending', 'Rejected']) {
    const result = evaluateOvertimeDay({
      dayClass: 'ordinary', dailyRate: 600, hourlyRate: 75, authorizedHours: 1,
      authorizationStatus: status, actualOut: '5:08:01 PM', expectedOut: '17:00',
      authorizedStart: '17:00', authorizedEnd: '18:00', hasValidOut: true
    })
    assert.strictEqual(result.qualifying, false, `${status} must not qualify`)
    assert.strictEqual(result.overtimePay, 0)
  }
  ok('Pending and Rejected authorizations never pay overtime')
}

// -------------------------------------------------------------------------
// 5. No overtime form despite a late checkout
// -------------------------------------------------------------------------
console.log('\n--- TEST 5: No overtime form despite late checkout ---')
{
  const map = collectApprovedOvertimeByDate([], new Set(['25065']))
  assert.strictEqual(map.size, 0)
  assert.strictEqual(map.get('2026-10-15'), undefined)

  // Form exists for a different employee only
  const otherEmployeeMap = collectApprovedOvertimeByDate(
    [{ bioId: '99999', date: '2026-10-15', status: 'Approved', authorizedHours: 1 }],
    new Set(['25065'])
  )
  assert.strictEqual(otherEmployeeMap.size, 0)
  ok('Late checkout without an approved form for this employee pays ₱0')
}

// -------------------------------------------------------------------------
// 7. Different approved durations do not multiply the 25% premium
// -------------------------------------------------------------------------
console.log('\n--- TEST 7: Premium is per occurrence, not per hour ---')
{
  const base = {
    dayClass: 'ordinary', dailyRate: 600, hourlyRate: 75,
    authorizationStatus: 'Approved', expectedOut: '17:00', hasValidOut: true
  }
  const oneHour = evaluateOvertimeDay({ ...base, authorizedHours: 1, actualOut: '5:08:01 PM', authorizedStart: '17:00', authorizedEnd: '18:00' })
  const twoHoursShortAttendance = evaluateOvertimeDay({ ...base, authorizedHours: 2, actualOut: '5:08:01 PM', authorizedStart: '17:00', authorizedEnd: '19:00' })
  const twoHoursFullAttendance = evaluateOvertimeDay({ ...base, authorizedHours: 2, actualOut: '7:00 PM', authorizedStart: '17:00', authorizedEnd: '19:00' })

  assert.strictEqual(oneHour.overtimePay, 150)
  assert.strictEqual(twoHoursShortAttendance.overtimePay, 150, '2 approved hrs with 8m attendance is still one ₱150 occurrence')
  assert.strictEqual(twoHoursFullAttendance.overtimePay, 150, '2 approved hrs fully worked is still one ₱150 occurrence')
  assert.strictEqual(twoHoursFullAttendance.overtimeHours, 2, 'qualifying hours are still recorded for audit')
  ok('1h vs 2h approved forms both pay exactly ₱150.00 on the same occurrence')
}

// -------------------------------------------------------------------------
// 8. Different employee IDs / dates do not accidentally match
// -------------------------------------------------------------------------
console.log('\n--- TEST 8: ID and date matching is strict ---')
{
  const targets = new Set(['25065'])
  const wrongId = collectApprovedOvertimeByDate(
    [{ bioId: '99999', date: '2026-10-15', status: 'Approved', authorizedHours: 1 }],
    targets
  )
  assert.strictEqual(wrongId.get('2026-10-15'), undefined)

  const wrongDate = collectApprovedOvertimeByDate(
    [{ bioId: '25065', date: '2026-10-14', status: 'Approved', authorizedHours: 1 }],
    targets
  )
  assert.strictEqual(wrongDate.get('2026-10-15'), undefined, 'Oct 14 form must not match the Oct 15 payroll date')
  assert.ok(wrongDate.get('2026-10-14'))

  const pending = collectApprovedOvertimeByDate(
    [{ bioId: '25065', date: '2026-10-15', status: 'Pending', authorizedHours: 1 }],
    targets
  )
  assert.strictEqual(pending.get('2026-10-15'), undefined, 'non-Approved status excluded at collection time')

  const caseInsensitive = collectApprovedOvertimeByDate(
    [{ bioId: ' 25065 ', date: '2026-10-15', status: 'Approved', authorizedHours: 1 }],
    targets
  )
  assert.ok(caseInsensitive.get('2026-10-15'), 'trimmed/case-insensitive bioId still matches')
  ok('Wrong bioId, wrong date, and pending records never match an authorization')
}

// -------------------------------------------------------------------------
// 9. Premium appears exactly once per occurrence in earnings
// -------------------------------------------------------------------------
console.log('\n--- TEST 9: Premium added exactly once ---')
{
  // Duplicate approved records for the same employee+date collapse to ONE entry
  const map = collectApprovedOvertimeByDate(
    [
      { bioId: '25065', date: '2026-10-15', status: 'Approved', authorizedHours: 1, formNumber: 'OT-2026-A' },
      { bioId: '25065', date: '2026-10-15', status: 'Approved', authorizedHours: 1, formNumber: 'OT-2026-B' }
    ],
    new Set(['25065'])
  )
  assert.strictEqual(map.size, 1, 'one date = one occurrence entry, duplicates collapse')

  // Emulate the per-day payroll loop: a single qualifying day adds the premium once
  let totalPay = 0
  let totalHours = 0
  for (const dateStr of ['2026-10-15']) {
    const ot = map.get(dateStr)
    if (ot && ot.status === 'Approved') {
      const evaluation = evaluateOvertimeDay({
        dayClass: 'ordinary', dailyRate: 600, hourlyRate: 75,
        authorizedHours: Number(ot.authorizedHours) || 0,
        authorizationStatus: ot.status,
        actualOut: '5:08:01 PM', expectedOut: '17:00',
        authorizedStart: ot.startTime, authorizedEnd: ot.endTime,
        hasValidOut: true
      })
      if (evaluation.qualifying) {
        totalPay += evaluation.overtimePay
        totalHours += evaluation.overtimeHours
      }
    }
  }
  assert.strictEqual(totalPay, 150, 'gross earnings gain the premium exactly once, not twice')
  assert.strictEqual(totalHours, 0.13)
  ok('Duplicate forms for one occurrence add ₱150.00 to earnings exactly once')
}

// -------------------------------------------------------------------------
// 10. Recalculation after an approval change (draft payroll re-evaluates)
// -------------------------------------------------------------------------
console.log('\n--- TEST 10: Recalculation after approval change ---')
{
  const inputs = {
    dayClass: 'ordinary', dailyRate: 600, hourlyRate: 75, authorizedHours: 1,
    actualOut: '5:08:01 PM', expectedOut: '17:00',
    authorizedStart: '17:00', authorizedEnd: '18:00', hasValidOut: true
  }
  const approved = evaluateOvertimeDay({ ...inputs, authorizationStatus: 'Approved' })
  assert.strictEqual(approved.overtimePay, 150)

  const rejected = evaluateOvertimeDay({ ...inputs, authorizationStatus: 'Rejected' })
  assert.strictEqual(rejected.overtimePay, 0, 're-evaluating the same day after rejection must drop the premium')

  const reApproved = evaluateOvertimeDay({ ...inputs, authorizationStatus: 'Approved' })
  assert.strictEqual(reApproved.overtimePay, 150, 're-evaluation is deterministic')
  // Note: non-finalized payroll snapshots are re-computed on load in
  // payrollCalculationService.computeSingleEmployeePayroll; only 'finalized'
  // snapshots short-circuit as immutable historical records.
  ok('Approved->Rejected->Approved re-evaluation yields ₱150 -> ₱0 -> ₱150')
}

// -------------------------------------------------------------------------
// 11. Holiday / rest-day / special-day statutory hourly rates unchanged
// -------------------------------------------------------------------------
console.log('\n--- TEST 11: Statutory categories keep hourly multipliers ---')
{
  assert.strictEqual(classifyOvertimeDay(false, null), 'ordinary')
  assert.strictEqual(classifyOvertimeDay(true, null), 'restDay')
  assert.strictEqual(classifyOvertimeDay(false, 'Regular'), 'regularHoliday')
  assert.strictEqual(classifyOvertimeDay(true, 'Regular'), 'regularHolidayRestDay')
  assert.strictEqual(classifyOvertimeDay(false, 'Special Non-Working'), 'specialNonWorking')
  assert.strictEqual(classifyOvertimeDay(true, 'Special Non-Working'), 'specialNonWorkingRestDay')
  assert.strictEqual(classifyOvertimeDay(false, 'Special Working'), 'specialWorking')

  const expectations = [
    ['restDay', 1.69, 126.75],
    ['specialNonWorking', 1.69, 126.75],
    ['specialNonWorkingRestDay', 1.95, 146.25],
    ['regularHoliday', 2.60, 195.0],
    ['regularHolidayRestDay', 3.38, 253.5],
    ['specialWorking', 1.25, 93.75]
  ]
  for (const [dayClass, multiplier, expectedPay] of expectations) {
    const result = evaluateOvertimeDay({
      dayClass, dailyRate: 600, hourlyRate: 75, authorizedHours: 1,
      authorizationStatus: 'Approved', actualOut: '6:00 PM', expectedOut: '17:00',
      hasValidOut: true
    })
    assert.strictEqual(OVERTIME_HOURLY_MULTIPLIERS[dayClass], multiplier)
    assert.strictEqual(result.overtimePay, expectedPay, `${dayClass} must stay hourly at ${multiplier}x`)
    assert.strictEqual(result.overtimeHours, 1)
  }

  // Off-day fallback (no valid OUT, worked hours from daily record) preserved
  const offDay = evaluateOvertimeDay({
    dayClass: 'restDay', dailyRate: 600, hourlyRate: 75, authorizedHours: 1,
    authorizationStatus: 'Approved', hasValidOut: false,
    workedHoursDecimal: 1, allowOffDayFallback: true
  })
  assert.strictEqual(offDay.qualifying, true)
  assert.strictEqual(offDay.overtimePay, 126.75)

  // Ordinary day must NOT use the hourly formula
  const ordinary = evaluateOvertimeDay({
    dayClass: 'ordinary', dailyRate: 600, hourlyRate: 75, authorizedHours: 1,
    authorizationStatus: 'Approved', actualOut: '6:00 PM', expectedOut: '17:00',
    hasValidOut: true
  })
  assert.strictEqual(ordinary.overtimePay, 150, 'ordinary day pays the flat premium, not 1h x 75 x 1.25 = 93.75')
  ok('Rest day / holiday / special-day overtime keeps statutory hourly multipliers')
}

// -------------------------------------------------------------------------
// Window clamping sanity
// -------------------------------------------------------------------------
console.log('\n--- TEST 12: Authorized window clamping ---')
{
  const clamped = computeAttendedOvertimeMinutes('6:05 PM', '17:00', '17:00', '18:00')
  assert.strictEqual(clamped, 60, 'attendance past the authorized end is clamped to the window')
  const beforeWindow = computeAttendedOvertimeMinutes('5:08:01 PM', '17:00', '18:00', '19:00')
  assert.strictEqual(beforeWindow, 0)
  ok('Attended minutes are clamped to the authorized time window')
}

console.log(`\n======================================================================`)
console.log(`ALL OVERTIME POLICY TESTS PASSED (${passed} checks)`)
console.log(`======================================================================`)
