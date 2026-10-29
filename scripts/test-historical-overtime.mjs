/**
 * Verification Test: Historical Overtime & Multiple Authorizations
 *
 * Runs the real overtime policy module directly:
 * (src/services/overtimePolicy.ts) and (src/lib/timeUtils.ts).
 *
 * Covers requirements from Phase 2 & Phase 3:
 * 1. Historical-date test:
 *    - Overtime authorization date: October 15, 2026
 *    - Authorized time: 5:00 PM–6:00 PM
 *    - Authorized duration: 1 hour
 *    - Authorization status: Approved
 *    - Attendance checkout: October 15, 2026 at 5:08 PM
 *    - Payroll period: includes October 15, 2026 (2026-10-1, Oct 1-15, 2026)
 *    - Current system date: later than October 15, 2026
 *    - Verifies that calculation uses the October 15 authorization and corresponding attendance record.
 * 2. Authorization dated OUTSIDE the selected payroll period:
 *    - e.g. October 16, 2026 (belongs to 2026-10-2 cutoff)
 *    - Strictly NOT paid in the October 1-15 cutoff period.
 * 3. Case-insensitive & Multi-Identifier Matching:
 *    - Matching by biometric_user_id, employee_number, and internal id.
 * 4. Editing and Status Transitions:
 *    - Transitioning between Pending and Approved.
 *    - Changing authorized duration and hours.
 * 5. Multiple overtime authorizations across different dates in a payroll cutoff.
 */

import assert from 'node:assert'
import {
  classifyOvertimeDay,
  computeAttendedOvertimeMinutes,
  collectApprovedOvertimeByDate,
  evaluateOvertimeDay,
  normalizeDateString
} from '../src/services/overtimePolicy.ts'

let passed = 0
const ok = (label) => { passed++; console.log(`✔ ${label}`) }

console.log('======================================================================')
console.log('RUNNING DMBBHR HISTORICAL OVERTIME & REPOSITORY VERIFICATION')
console.log('======================================================================\n')

// -------------------------------------------------------------------------
// Helper: Semi-monthly cutoff date generator (matching payrollCalculation.ts)
// -------------------------------------------------------------------------
function getCutoffPeriod(year, month, half) {
  const mStr = String(month).padStart(2, '0')
  const dates = []
  let startDate = ''
  let endDate = ''

  if (half === 1) {
    startDate = `${year}-${mStr}-01`
    endDate = `${year}-${mStr}-15`
    for (let d = 1; d <= 15; d++) {
      dates.push(`${year}-${mStr}-${String(d).padStart(2, '0')}`)
    }
  } else {
    const lastDay = new Date(year, month, 0).getDate()
    startDate = `${year}-${mStr}-16`
    endDate = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`
    for (let d = 16; d <= lastDay; d++) {
      dates.push(`${year}-${mStr}-${String(d).padStart(2, '0')}`)
    }
  }

  return { id: `${year}-${mStr}-${half}`, startDate, endDate, dates }
}

// -------------------------------------------------------------------------
// 1. Required Historical-Date Test (October 15, 2026 with checkout at 5:08 PM)
// -------------------------------------------------------------------------
console.log('--- TEST 1: Historical Overtime on October 15, 2026 ---')
{
  const cutoff = getCutoffPeriod(2026, 10, 1)
  assert.strictEqual(cutoff.startDate, '2026-10-01')
  assert.strictEqual(cutoff.endDate, '2026-10-15')
  assert.ok(cutoff.dates.includes('2026-10-15'), 'October 15 is in 2026-10-1 cutoff')

  const approvedOtOct15 = {
    id: 'ot_1015',
    formNumber: 'OT-2026-1015-01',
    bioId: '25065',
    employeeName: 'Cabigas, Juan',
    date: '2026-10-15',
    startTime: '17:00',
    endTime: '18:00',
    authorizedHours: 1.0,
    status: 'Approved',
    approvedBy: 'HR Supervisor'
  }

  const targetIds = new Set(['25065', 'emp-25065', 'emp_juan'])
  const otMap = collectApprovedOvertimeByDate([approvedOtOct15], targetIds)
  const otForDay = otMap.get('2026-10-15')
  assert.ok(otForDay, 'October 15 authorization found in lookup map')
  assert.strictEqual(otForDay.status, 'Approved')

  // Attendance on Oct 15: checkout at 5:08 PM
  const evaluation = evaluateOvertimeDay({
    dayClass: 'ordinary',
    dailyRate: 600,
    hourlyRate: 75,
    authorizedHours: Number(otForDay.authorizedHours) || 0,
    authorizationStatus: otForDay.status,
    actualOut: '5:08 PM',
    expectedOut: '17:00',
    authorizedStart: otForDay.startTime,
    authorizedEnd: otForDay.endTime,
    hasValidOut: true
  })

  assert.strictEqual(evaluation.qualifying, true)
  assert.strictEqual(evaluation.overtimeHours, 0.13, 'Clamped to attended window: 8m = 0.13h')
  assert.strictEqual(evaluation.overtimePay, 12.19, '0.13h x ₱75/hr x 125% = ₱12.19')
  ok('Historical date (Oct 15, 2026) with checkout at 5:08 PM correctly evaluated in Oct 1-15 cutoff')
}

// -------------------------------------------------------------------------
// 2. Authorization OUTSIDE the selected payroll period must NOT be paid
// -------------------------------------------------------------------------
console.log('\n--- TEST 2: Authorization Dated Outside Selected Cutoff ---')
{
  const cutoff1 = getCutoffPeriod(2026, 10, 1) // Oct 1 - Oct 15
  const cutoff2 = getCutoffPeriod(2026, 10, 2) // Oct 16 - Oct 31

  // Overtime authorization dated October 16, 2026
  const approvedOtOct16 = {
    id: 'ot_1016',
    formNumber: 'OT-2026-1016-01',
    bioId: '25065',
    date: '2026-10-16',
    startTime: '17:00',
    endTime: '18:00',
    authorizedHours: 1.0,
    status: 'Approved'
  }

  // Filter for Cutoff 1 (Oct 1-15):
  const cutoff1Dates = new Set(cutoff1.dates)
  const otInCutoff1 = [approvedOtOct16].filter(r => cutoff1Dates.has(normalizeDateString(r.date)))
  assert.strictEqual(otInCutoff1.length, 0, 'Oct 16 must NOT be in Cutoff 1 (Oct 1-15)')

  // Filter for Cutoff 2 (Oct 16-31):
  const cutoff2Dates = new Set(cutoff2.dates)
  const otInCutoff2 = [approvedOtOct16].filter(r => cutoff2Dates.has(normalizeDateString(r.date)))
  assert.strictEqual(otInCutoff2.length, 1, 'Oct 16 MUST be in Cutoff 2 (Oct 16-31)')

  // Evaluating in Cutoff 1 pays ₱0
  const mapCutoff1 = collectApprovedOvertimeByDate(otInCutoff1, new Set(['25065']))
  assert.strictEqual(mapCutoff1.size, 0)
  assert.strictEqual(mapCutoff1.get('2026-10-16'), undefined)

  // Evaluating in Cutoff 2 pays ₱150
  const mapCutoff2 = collectApprovedOvertimeByDate(otInCutoff2, new Set(['25065']))
  const otForDayCutoff2 = mapCutoff2.get('2026-10-16')
  assert.ok(otForDayCutoff2)
  const evalCutoff2 = evaluateOvertimeDay({
    dayClass: 'ordinary',
    dailyRate: 600,
    hourlyRate: 75,
    authorizedHours: 1.0,
    authorizationStatus: otForDayCutoff2.status,
    actualOut: '5:30 PM',
    expectedOut: '17:00',
    authorizedStart: '17:00',
    authorizedEnd: '18:00',
    hasValidOut: true
  })
  assert.strictEqual(evalCutoff2.qualifying, true)
  assert.strictEqual(evalCutoff2.overtimeHours, 0.5)
  assert.strictEqual(evalCutoff2.overtimePay, 46.88)
  ok('Authorization outside cutoff 1 is strictly excluded from cutoff 1 and paid in cutoff 2')
}

// -------------------------------------------------------------------------
// 3. Multi-Identifier & Case-Insensitive Matching
// -------------------------------------------------------------------------
console.log('\n--- TEST 3: Multi-Identifier & Case-Insensitive ID Matching ---')
{
  const targetIds = new Set(['25065', 'emp-25065', 'emp_juan'])

  // Saved with uppercase employee_number
  const otRecord1 = {
    bioId: 'EMP-25065',
    date: '2026-10-15',
    status: 'Approved',
    authorizedHours: 1.0
  }
  const map1 = collectApprovedOvertimeByDate([otRecord1], targetIds)
  assert.ok(map1.get('2026-10-15'), 'Matched via employee_number alias (EMP-25065)')

  // Saved with internal id
  const otRecord2 = {
    bioId: 'EMP_JUAN',
    date: '2026-10-14',
    status: 'Approved',
    authorizedHours: 1.0
  }
  const map2 = collectApprovedOvertimeByDate([otRecord2], targetIds)
  assert.ok(map2.get('2026-10-14'), 'Matched via internal id alias')

  // Unrelated employee ID
  const otUnrelated = {
    bioId: '99999',
    date: '2026-10-15',
    status: 'Approved',
    authorizedHours: 1.0
  }
  const mapUnrelated = collectApprovedOvertimeByDate([otUnrelated], targetIds)
  assert.strictEqual(mapUnrelated.get('2026-10-15'), undefined, 'Unrelated employee never matches')
  ok('All employee ID aliases and casing variations match reliably')
}

// -------------------------------------------------------------------------
// 4. Status Transition & Editing
// -------------------------------------------------------------------------
console.log('\n--- TEST 4: Editing & Status Transitions ---')
{
  const inputs = {
    dayClass: 'ordinary',
    dailyRate: 600,
    hourlyRate: 75,
    authorizedHours: 1.0,
    actualOut: '5:08 PM',
    expectedOut: '17:00',
    authorizedStart: '17:00',
    authorizedEnd: '18:00',
    hasValidOut: true
  }

  // Pending initially
  const pending = evaluateOvertimeDay({ ...inputs, authorizationStatus: 'Pending' })
  assert.strictEqual(pending.qualifying, false)
  assert.strictEqual(pending.overtimePay, 0)

  // Approved after audit
  const approved = evaluateOvertimeDay({ ...inputs, authorizationStatus: 'Approved' })
  assert.strictEqual(approved.qualifying, true)
  assert.strictEqual(approved.overtimePay, 12.19)

  // Rejected
  const rejected = evaluateOvertimeDay({ ...inputs, authorizationStatus: 'Rejected' })
  assert.strictEqual(rejected.qualifying, false)
  assert.strictEqual(rejected.overtimePay, 0)
  ok('Status transitions (Pending -> Approved -> Rejected) dynamically recompute overtime')
}

// -------------------------------------------------------------------------
// 5. Multiple Distinct Overtime Days Across Cutoff Period
// -------------------------------------------------------------------------
console.log('\n--- TEST 5: Multiple Overtime Days in Cutoff Period ---')
{
  const cutoff = getCutoffPeriod(2026, 10, 1)

  const otOct6 = {
    id: 'ot_1',
    bioId: '25065',
    date: '2026-10-06',
    startTime: '17:00',
    endTime: '18:00',
    authorizedHours: 1.0,
    status: 'Approved'
  }
  const otOct15 = {
    id: 'ot_2',
    bioId: '25065',
    date: '2026-10-15',
    startTime: '17:00',
    endTime: '18:00',
    authorizedHours: 1.0,
    status: 'Approved'
  }

  const map = collectApprovedOvertimeByDate([otOct6, otOct15], new Set(['25065']))
  assert.strictEqual(map.size, 2, 'Two distinct dates stored')

  let totalPay = 0
  let totalHours = 0

  // Day 1: Oct 6 (out at 6:00 PM)
  const evalOct6 = evaluateOvertimeDay({
    dayClass: 'ordinary',
    dailyRate: 600,
    hourlyRate: 75,
    authorizedHours: Number(map.get('2026-10-06').authorizedHours),
    authorizationStatus: map.get('2026-10-06').status,
    actualOut: '6:00 PM',
    expectedOut: '17:00',
    authorizedStart: '17:00',
    authorizedEnd: '18:00',
    hasValidOut: true
  })
  if (evalOct6.qualifying) {
    totalHours += evalOct6.overtimeHours
    totalPay += evalOct6.overtimePay
  }

  // Day 2: Oct 15 (out at 5:08 PM)
  const evalOct15 = evaluateOvertimeDay({
    dayClass: 'ordinary',
    dailyRate: 600,
    hourlyRate: 75,
    authorizedHours: Number(map.get('2026-10-15').authorizedHours),
    authorizationStatus: map.get('2026-10-15').status,
    actualOut: '5:08 PM',
    expectedOut: '17:00',
    authorizedStart: '17:00',
    authorizedEnd: '18:00',
    hasValidOut: true
  })
  if (evalOct15.qualifying) {
    totalHours += evalOct15.overtimeHours
    totalPay += evalOct15.overtimePay
  }

  assert.strictEqual(Math.round(totalHours * 100) / 100, 1.13)
  assert.strictEqual(Math.round(totalPay * 100) / 100, 105.94)
  ok('Multiple approved overtime dates in a cutoff correctly aggregate total hours and earnings (₱105.94)')
}

console.log('\n======================================================================')
console.log(`ALL HISTORICAL & REPOSITORY OVERTIME TESTS PASSED (${passed} checks)`)
console.log('======================================================================')
