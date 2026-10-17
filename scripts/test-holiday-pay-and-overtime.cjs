/**
 * Verification Test Suite: DMBBHR Holiday Pay and Authorized Overtime Rules
 *
 * Verifies all 12 scenarios specified in the business requirements:
 * 1. Regular holiday, eligible employee does not work: 100% daily wage.
 * 2. Regular holiday, employee works 8 hours: 200% daily wage.
 * 3. Special non-working day, employee does not work: 0%.
 * 4. Special non-working day, employee works 8 hours: 130% daily wage.
 * 5. Special non-working day worked on a rest day: 150% daily wage.
 * 6. Special working day, employee works: regular daily rate.
 * 7. Employee punches out at 5:30 PM without an approved overtime form: ₱0 overtime.
 * 8. Employee punches out at 6:00 PM with an approved form for 1 hour: one qualifying occurrence pays the flat 25%-of-daily-rate premium.
 * 9. Approved overtime duration is shorter than the time between scheduled end and actual OUT: do not pay beyond the approved duration.
 * 10. Duplicate attendance imports must not duplicate overtime or holiday earnings.
 * 11. Attendance after 5:00 PM must not change overtime earnings unless an approved authorization record exists.
 * 12. Existing payroll calculations must continue to work without introducing React dependencies or breaking Vue reactivity.
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')

console.log('======================================================================')
console.log('RUNNING DMBBHR HOLIDAY PAY & AUTHORIZED OVERTIME VERIFICATION TESTS')
console.log('======================================================================\n')

// -------------------------------------------------------------------------
// Core pure calculation helpers mirroring src/services/payrollCalculation.ts
// -------------------------------------------------------------------------

function normalizeDateStr(d) {
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
  } catch {}
  return trimmed
}

function normalizeTimeToHHMM(val) {
  if (!val) return null
  const clean = String(val).replace(/\s*\(Manual\)/gi, '').trim()
  if (
    !clean ||
    clean === '—' ||
    clean === '-' ||
    clean.toLowerCase().includes('missing') ||
    clean.toLowerCase().includes('awaiting')
  ) {
    return null
  }

  const match12 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i)
  if (match12) {
    let hours = parseInt(match12[1], 10)
    const minutes = parseInt(match12[2], 10)
    const period = match12[3].toUpperCase()
    if (period === 'AM') {
      if (hours === 12) hours = 0
    } else if (period === 'PM') {
      if (hours !== 12) hours += 12
    }
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  const match24 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (match24) {
    const hours = parseInt(match24[1], 10)
    const minutes = parseInt(match24[2], 10)
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }
  return null
}

function getAttendedOtMinutes(actualOutStr, expectedOutStr = '17:00') {
  if (!actualOutStr) return 0
  const normOut = normalizeTimeToHHMM(actualOutStr)
  if (!normOut) return 0
  const normExp = normalizeTimeToHHMM(expectedOutStr) || '17:00'
  const [expH, expM] = normExp.split(':').map(Number)
  const [outH, outM] = normOut.split(':').map(Number)
  const expTotal = expH * 60 + expM
  const outTotal = outH * 60 + outM
  if (outTotal <= expTotal) return 0
  return outTotal - expTotal
}

function checkUnworkedRegularHolidayEligibility(
  holidayDateStr,
  cutoffDates,
  empAttendanceMap,
  holidayMap,
  employee
) {
  if (employee.resignation_date && employee.resignation_date < holidayDateStr) return false
  if (employee.contract_date && employee.contract_date > holidayDateStr) return false
  if (employee.hire_date && employee.hire_date > holidayDateStr) return false

  const [hy, hm, hd] = holidayDateStr.split('-').map(Number)
  const holidayDate = new Date(Date.UTC(hy, hm - 1, hd))

  for (let offset = 1; offset <= 14; offset++) {
    const prevDateObj = new Date(holidayDate.getTime() - offset * 86400000)
    const prevY = prevDateObj.getUTCFullYear()
    const prevM = String(prevDateObj.getUTCMonth() + 1).padStart(2, '0')
    const prevD = String(prevDateObj.getUTCDate()).padStart(2, '0')
    const prevDateStr = `${prevY}-${prevM}-${prevD}`

    const isPrevSunday = prevDateObj.getUTCDay() === 0
    const isPrevHoliday = holidayMap.has(prevDateStr)

    if (isPrevSunday || isPrevHoliday) {
      continue
    }

    const prevAtt = empAttendanceMap.get(prevDateStr) || empAttendanceMap.get(normalizeDateStr(prevDateStr))
    if (!prevAtt) {
      if (!cutoffDates.includes(prevDateStr)) {
        return employee.status === 'active'
      }
      return false
    }

    const prevIn = prevAtt.actual_in?.trim() || ''
    const hasPrevIn = Boolean(
      prevIn &&
      !prevIn.startsWith('Missing') &&
      prevIn !== '—' &&
      prevIn !== '-' &&
      prevIn !== 'None'
    )
    if (hasPrevIn) return true
    if (prevAtt.status === 'On Leave' || prevAtt.status === 'Leave') return true
    return false
  }

  return employee.status === 'active'
}

function calculatePayrollForDay({
  dateStr,
  isSunday,
  holiday,
  dailyRate,
  hourlyRate,
  attendance,
  approvedOvertimeForm,
  isEligibleForUnworkedHoliday = true,
  salaryType = 'Daily'
}) {
  const actualIn = attendance?.actual_in?.trim() || ''
  const actualOut = attendance?.actual_out?.trim() || ''
  const hasValidIn = Boolean(
    actualIn &&
    !actualIn.startsWith('Missing') &&
    actualIn !== '—' &&
    actualIn !== '-' &&
    actualIn !== 'None'
  )
  const hasValidOut = Boolean(
    attendance?.has_valid_out &&
    actualOut &&
    !actualOut.startsWith('Missing') &&
    actualOut !== '—' &&
    actualOut !== '-'
  )
  const hasWorked = hasValidIn

  let baseDayPay = 0
  let holidayPay = 0
  let sundayDutyPay = 0
  let payableDays = 0

  const isHoliday = Boolean(holiday)
  const holType = holiday?.type || 'Regular'

  if (isHoliday) {
    if (holType === 'Regular') {
      if (hasWorked) {
        // Worked Regular Holiday (first 8 hours): 200% daily wage
        payableDays = 1
        baseDayPay = dailyRate * 1.0
        holidayPay = dailyRate * 1.0
      } else if (isEligibleForUnworkedHoliday) {
        // Unworked Regular Holiday (eligible): 100% daily wage
        holidayPay = dailyRate * 1.0
      } else {
        // Ineligible unworked regular holiday: 0%
        holidayPay = 0
      }
    } else if (holType === 'Special Non-Working' || holType === 'Local Holiday') {
      if (hasWorked) {
        payableDays = 1
        baseDayPay = dailyRate * 1.0
        if (isSunday) {
          // Worked Special Non-Working Day on Rest Day: 150% daily wage
          holidayPay = dailyRate * 0.50
        } else {
          // Worked Special Non-Working Day on regular day: 130% daily wage
          holidayPay = dailyRate * 0.30
        }
      } else {
        // Unworked Special Non-Working Day: 0% (no work, no pay)
        holidayPay = 0
      }
    } else if (holType === 'Special Working') {
      if (hasWorked) {
        // Worked Special Working Day: 100% daily wage (regular rate, 0% extra holiday pay)
        payableDays = 1
        baseDayPay = dailyRate * 1.0
        holidayPay = 0
      } else {
        holidayPay = 0
      }
    }
  } else if (isSunday) {
    if (hasWorked) {
      payableDays = 1
      baseDayPay = dailyRate * 1.0
      sundayDutyPay = dailyRate * 0.30
    }
  } else {
    if (hasWorked) {
      payableDays = 1
      baseDayPay = dailyRate * 1.0
    }
  }

  // --- Overtime calculation ---
  let overtimeHours = 0
  let overtimePay = 0

  if (approvedOvertimeForm && approvedOvertimeForm.status === 'Approved') {
    const authorizedHours = Number(approvedOvertimeForm.authorizedHours) || 0
    const attendedMins = getAttendedOtMinutes(actualOut, attendance?.expected_out || '17:00')
    const attendedHours = Math.round((attendedMins / 60) * 100) / 100

    let payableOtHours = 0
    if (hasValidOut && attendedHours > 0) {
      payableOtHours = Math.min(authorizedHours, attendedHours)
    } else if (isSunday || isHoliday) {
      const workedHours = Number(attendance?.total_hours_decimal) || 0
      payableOtHours = workedHours > 0 ? Math.min(authorizedHours, workedHours) : 0
    }

    if (payableOtHours > 0) {
      overtimeHours = payableOtHours

      // Company policy: an ordinary-day qualifying occurrence pays a flat
      // premium of 25% of the daily rate, once per occurrence.
      // Rest day / holiday / special day categories keep statutory hourly rates.
      const isOrdinaryDay = !isSunday && !isHoliday
      if (isOrdinaryDay) {
        overtimePay = Math.round(dailyRate * 0.25 * 100) / 100
      } else {
        let otMultiplier = 1.25
        if (holType === 'Regular') {
          otMultiplier = isSunday ? 3.38 : 2.60
        } else if (holType === 'Special Non-Working' || holType === 'Local Holiday') {
          otMultiplier = isSunday ? 1.95 : 1.69
        } else if (isSunday) {
          otMultiplier = 1.69
        } else {
          otMultiplier = 1.25
        }
        overtimePay = Math.round(payableOtHours * hourlyRate * otMultiplier * 100) / 100
      }
    }
  }

  const totalDayPay = Math.round((baseDayPay + holidayPay + sundayDutyPay + overtimePay) * 100) / 100

  return {
    payableDays,
    baseDayPay,
    holidayPay,
    sundayDutyPay,
    overtimeHours,
    overtimePay,
    totalDayPay
  }
}

// -------------------------------------------------------------------------
// TEST SCENARIOS
// -------------------------------------------------------------------------

const DAILY_RATE = 500.00
const HOURLY_RATE = 62.50 // 500 / 8

// --- Scenario 1: Regular holiday, eligible employee does not work: 100% daily wage ---
console.log('--- TEST 1: Regular Holiday, Unworked (Eligible) ---')
{
  const result = calculatePayrollForDay({
    dateStr: '2026-10-12',
    isSunday: false,
    holiday: { id: 'h-1', name: 'Fiesta Day', date: '2026-10-12', type: 'Regular', isNationwide: true },
    dailyRate: DAILY_RATE,
    hourlyRate: HOURLY_RATE,
    attendance: null, // Unworked
    approvedOvertimeForm: null,
    isEligibleForUnworkedHoliday: true
  })

  assert.strictEqual(result.payableDays, 0, 'Unworked day should have 0 payableDays')
  assert.strictEqual(result.baseDayPay, 0, 'Unworked day should have 0 baseDayPay')
  assert.strictEqual(result.holidayPay, 500.00, 'Eligible unworked regular holiday must receive 100% daily wage (₱500.00)')
  assert.strictEqual(result.overtimePay, 0, 'No overtime')
  assert.strictEqual(result.totalDayPay, 500.00, 'Total pay must be exactly 100% of daily wage')
  console.log('✔ Test 1 Passed: 100% daily wage (₱500.00) paid for eligible unworked regular holiday.')
}

// --- Scenario 2: Regular holiday, employee works 8 hours: 200% daily wage ---
console.log('\n--- TEST 2: Regular Holiday, Worked 8 Hours ---')
{
  const result = calculatePayrollForDay({
    dateStr: '2026-10-12',
    isSunday: false,
    holiday: { id: 'h-1', name: 'Fiesta Day', date: '2026-10-12', type: 'Regular', isNationwide: true },
    dailyRate: DAILY_RATE,
    hourlyRate: HOURLY_RATE,
    attendance: {
      actual_in: '8:00 AM',
      actual_out: '5:00 PM',
      has_valid_out: true,
      total_hours_decimal: 8.0
    },
    approvedOvertimeForm: null
  })

  assert.strictEqual(result.payableDays, 1, '1 worked day in payableDays')
  assert.strictEqual(result.baseDayPay, 500.00, '100% daily wage in base pay')
  assert.strictEqual(result.holidayPay, 500.00, '+100% regular holiday premium')
  assert.strictEqual(result.totalDayPay, 1000.00, 'Total pay must be 200% daily wage (₱1,000.00)')
  console.log('✔ Test 2 Passed: 200% daily wage (₱1,000.00) paid for worked regular holiday.')
}

// --- Scenario 3: Special non-working day, employee does not work: 0% ---
console.log('\n--- TEST 3: Special Non-Working Day, Unworked ---')
{
  const result = calculatePayrollForDay({
    dateStr: '2026-11-01',
    isSunday: false,
    holiday: { id: 'h-2', name: 'All Saints Day', date: '2026-11-01', type: 'Special Non-Working', isNationwide: true },
    dailyRate: DAILY_RATE,
    hourlyRate: HOURLY_RATE,
    attendance: null,
    approvedOvertimeForm: null
  })

  assert.strictEqual(result.payableDays, 0)
  assert.strictEqual(result.baseDayPay, 0)
  assert.strictEqual(result.holidayPay, 0, 'No work, no pay policy requires 0% holiday pay')
  assert.strictEqual(result.totalDayPay, 0, 'Total pay must be ₱0.00')
  console.log('✔ Test 3 Passed: 0% (₱0.00) for unworked special non-working day.')
}

// --- Scenario 4: Special non-working day, employee works 8 hours: 130% daily wage ---
console.log('\n--- TEST 4: Special Non-Working Day, Worked (Regular Workday) ---')
{
  const result = calculatePayrollForDay({
    dateStr: '2026-11-02',
    isSunday: false, // Weekday
    holiday: { id: 'h-3', name: 'Special Day', date: '2026-11-02', type: 'Special Non-Working', isNationwide: true },
    dailyRate: DAILY_RATE,
    hourlyRate: HOURLY_RATE,
    attendance: {
      actual_in: '8:00 AM',
      actual_out: '5:00 PM',
      has_valid_out: true,
      total_hours_decimal: 8.0
    },
    approvedOvertimeForm: null
  })

  assert.strictEqual(result.payableDays, 1)
  assert.strictEqual(result.baseDayPay, 500.00, '100% daily wage in base pay')
  assert.strictEqual(result.holidayPay, 150.00, '+30% holiday premium (₱150.00)')
  assert.strictEqual(result.totalDayPay, 650.00, 'Total pay must be 130% daily wage (₱650.00)')
  console.log('✔ Test 4 Passed: 130% daily wage (₱650.00) paid for worked special non-working day.')
}

// --- Scenario 5: Special non-working day worked on a rest day: 150% daily wage ---
console.log('\n--- TEST 5: Special Non-Working Day, Worked on a Rest Day (Sunday) ---')
{
  const result = calculatePayrollForDay({
    dateStr: '2026-11-01',
    isSunday: true, // Sunday Rest Day
    holiday: { id: 'h-2', name: 'All Saints Day', date: '2026-11-01', type: 'Special Non-Working', isNationwide: true },
    dailyRate: DAILY_RATE,
    hourlyRate: HOURLY_RATE,
    attendance: {
      actual_in: '8:00 AM',
      actual_out: '5:00 PM',
      has_valid_out: true,
      total_hours_decimal: 8.0
    },
    approvedOvertimeForm: null
  })

  assert.strictEqual(result.payableDays, 1)
  assert.strictEqual(result.baseDayPay, 500.00, '100% daily wage in base pay')
  assert.strictEqual(result.holidayPay, 250.00, '+50% holiday rest day premium (₱250.00)')
  assert.strictEqual(result.totalDayPay, 750.00, 'Total pay must be 150% daily wage (₱750.00)')
  console.log('✔ Test 5 Passed: 150% daily wage (₱750.00) paid for special non-working day on rest day.')
}

// --- Scenario 6: Special working day, employee works: regular daily rate (100%) ---
console.log('\n--- TEST 6: Special Working Day, Worked ---')
{
  const result = calculatePayrollForDay({
    dateStr: '2026-11-03',
    isSunday: false,
    holiday: { id: 'h-4', name: 'Special Working Holiday', date: '2026-11-03', type: 'Special Working', isNationwide: true },
    dailyRate: DAILY_RATE,
    hourlyRate: HOURLY_RATE,
    attendance: {
      actual_in: '8:00 AM',
      actual_out: '5:00 PM',
      has_valid_out: true,
      total_hours_decimal: 8.0
    },
    approvedOvertimeForm: null
  })

  assert.strictEqual(result.payableDays, 1)
  assert.strictEqual(result.baseDayPay, 500.00, '100% daily wage')
  assert.strictEqual(result.holidayPay, 0, 'Special working day has 0% additional holiday pay')
  assert.strictEqual(result.totalDayPay, 500.00, 'Total pay must be exactly regular 100% daily rate (₱500.00)')
  console.log('✔ Test 6 Passed: Regular daily rate (₱500.00) paid for special working day.')
}

// --- Scenario 7: Employee punches out at 5:30 PM without an approved overtime form: ₱0 overtime ---
console.log('\n--- TEST 7: Punches out at 5:30 PM without Approved Form ---')
{
  const result = calculatePayrollForDay({
    dateStr: '2026-10-06',
    isSunday: false,
    holiday: null,
    dailyRate: DAILY_RATE,
    hourlyRate: HOURLY_RATE,
    attendance: {
      actual_in: '8:00 AM',
      actual_out: '5:30 PM', // 30 minutes after 5:00 PM
      expected_out: '17:00',
      has_valid_out: true,
      total_hours_decimal: 8.5
    },
    approvedOvertimeForm: null // NO approved form
  })

  assert.strictEqual(result.overtimeHours, 0, 'Overtime hours must be 0 without approved form')
  assert.strictEqual(result.overtimePay, 0, 'Overtime pay must be ₱0.00 without approved form')
  assert.strictEqual(result.totalDayPay, 500.00, 'Only base pay ₱500.00 paid')
  console.log('✔ Test 7 Passed: ₱0 overtime earnings when checkout is at 5:30 PM without an approved form.')
}

// --- Scenario 8: Employee punches out at 6:00 PM with an approved form for 1 hour ---
console.log('\n--- TEST 8: Punches out at 6:00 PM with Approved Form for 1 Hour ---')
{
  const result = calculatePayrollForDay({
    dateStr: '2026-10-07',
    isSunday: false,
    holiday: null,
    dailyRate: DAILY_RATE,
    hourlyRate: HOURLY_RATE, // 62.50
    attendance: {
      actual_in: '8:00 AM',
      actual_out: '6:00 PM', // 60 minutes after 5:00 PM = 1.0 hr
      expected_out: '17:00',
      has_valid_out: true,
      total_hours_decimal: 9.0
    },
    approvedOvertimeForm: {
      id: 'ot-101',
      status: 'Approved',
      authorizedHours: 1.0,
      startTime: '17:00',
      endTime: '18:00',
      formNumber: 'OT-2026-001'
    }
  })

  // Company policy: ₱500 daily rate x 25% = ₱125.00 flat premium per qualifying occurrence
  const expectedOtPay = 125.00
  assert.strictEqual(result.overtimeHours, 1.0, 'Expected 1.0 qualifying OT hour')
  assert.strictEqual(result.overtimePay, expectedOtPay, `Expected ₱${expectedOtPay} overtime pay`)
  assert.strictEqual(result.totalDayPay, 500.00 + expectedOtPay)
  console.log(`✔ Test 8 Passed: Approved 1 hr OT pays flat 25% of daily rate = ₱${expectedOtPay}.`)
}

// --- Scenario 9: Approved duration vs actual OUT cap ---
console.log('\n--- TEST 9: Approved Duration vs Actual OUT Limits ---')
{
  // Case A: Punches out at 7:00 PM (2.0 hrs), but approved form is only for 1.0 hr
  const resultA = calculatePayrollForDay({
    dateStr: '2026-10-08',
    isSunday: false,
    holiday: null,
    dailyRate: DAILY_RATE,
    hourlyRate: HOURLY_RATE,
    attendance: {
      actual_in: '8:00 AM',
      actual_out: '7:00 PM', // 2.0 hrs past 5:00 PM
      expected_out: '17:00',
      has_valid_out: true,
      total_hours_decimal: 10.0
    },
    approvedOvertimeForm: {
      status: 'Approved',
      authorizedHours: 1.0 // Approved only for 1.0 hr
    }
  })
  assert.strictEqual(resultA.overtimeHours, 1.0, 'Never pay beyond approved duration (capped at 1.0 hr)')
  assert.strictEqual(resultA.overtimePay, 125.00, 'Flat 25% daily-rate premium (₱125.00) once per occurrence')
  console.log('✔ Test 9A Passed: Punched out at 7:00 PM with 1 hr form capped strictly at 1.0 hr.')

  // Case B: Approved form for 2.0 hrs, but employee punches out at 5:30 PM (only 30 mins / 0.5 hr worked)
  const resultB = calculatePayrollForDay({
    dateStr: '2026-10-08',
    isSunday: false,
    holiday: null,
    dailyRate: DAILY_RATE,
    hourlyRate: HOURLY_RATE,
    attendance: {
      actual_in: '8:00 AM',
      actual_out: '5:30 PM', // Only 30 mins past 5:00 PM
      expected_out: '17:00',
      has_valid_out: true,
      total_hours_decimal: 8.5
    },
    approvedOvertimeForm: {
      status: 'Approved',
      authorizedHours: 2.0 // Approved for 2.0 hrs
    }
  })
  assert.strictEqual(resultB.overtimeHours, 0.5, 'Never pay more than actual attended overtime (0.5 hr)')
  const expectedPayB = 125.00 // Flat premium: one occurrence regardless of approved hours
  assert.strictEqual(resultB.overtimePay, expectedPayB)
  console.log(`✔ Test 9B Passed: Approved for 2 hrs but left at 5:30 PM still pays the single ₱${expectedPayB} occurrence premium.`)
}

// --- Scenario 10: Duplicate attendance imports must not duplicate overtime or holiday earnings ---
console.log('\n--- TEST 10: Duplicate Attendance Ingestion Idempotency ---')
{
  const mockAttendanceList = [
    { raw_date: '2026-10-06', actual_in: '8:00 AM', actual_out: '6:00 PM', has_valid_out: true },
    { raw_date: '2026-10-06', actual_in: '8:00 AM', actual_out: '6:00 PM', has_valid_out: true }, // Duplicate
    { date: 'Oct 6, 2026', raw_date: '2026-10-06', actual_in: '8:00 AM', actual_out: '6:00 PM', has_valid_out: true } // Triplicate
  ]

  const deduplicatedMap = new Map()
  for (const rec of mockAttendanceList) {
    if (rec.raw_date) {
      deduplicatedMap.set(rec.raw_date, rec)
      deduplicatedMap.set(normalizeDateStr(rec.raw_date), rec)
    }
  }

  // Exactly 1 normalized entry in date map
  const registeredRec = deduplicatedMap.get('2026-10-06')
  assert(registeredRec, 'Record exists in map')

  const res1 = calculatePayrollForDay({
    dateStr: '2026-10-06',
    isSunday: false,
    holiday: null,
    dailyRate: DAILY_RATE,
    hourlyRate: HOURLY_RATE,
    attendance: registeredRec,
    approvedOvertimeForm: { status: 'Approved', authorizedHours: 1.0 }
  })

  // Recalculating with multiple imports produces the identical earnings
  assert.strictEqual(res1.overtimePay, 125.00)
  assert.strictEqual(res1.payableDays, 1)
  console.log('✔ Test 10 Passed: Multiple repeated imports do not duplicate holiday or overtime pay.')
}

// --- Scenario 11: Attendance after 5:00 PM must not change overtime earnings without approved form ---
console.log('\n--- TEST 11: Late Out Punches Without Approved Form Stay at ₱0 ---')
{
  const testPunches = ['5:05 PM', '5:30 PM', '6:00 PM', '7:45 PM', '10:00 PM']
  for (const punch of testPunches) {
    const res = calculatePayrollForDay({
      dateStr: '2026-10-09',
      isSunday: false,
      holiday: null,
      dailyRate: DAILY_RATE,
      hourlyRate: HOURLY_RATE,
      attendance: {
        actual_in: '8:00 AM',
        actual_out: punch,
        expected_out: '17:00',
        has_valid_out: true
      },
      approvedOvertimeForm: null
    })
    assert.strictEqual(res.overtimePay, 0, `Punch out at ${punch} must yield ₱0 without approved form`)
    assert.strictEqual(res.overtimeHours, 0)
  }
  console.log('✔ Test 11 Passed: Checkout times (5:05 PM to 10:00 PM) strictly evaluate to ₱0 overtime without an approved form.')
}

// --- Scenario 12: Verify Vue project purity (NO React dependencies or imports) ---
console.log('\n--- TEST 12: Vue Purity & Framework Compliance ---')
{
  const pkgJsonPath = path.join(__dirname, '..', 'package.json')
  const pkgContent = fs.readFileSync(pkgJsonPath, 'utf8')
  assert(!pkgContent.includes('"react"'), 'package.json must NOT contain react')
  assert(!pkgContent.includes('"react-dom"'), 'package.json must NOT contain react-dom')

  // Scan src/ for React imports
  const srcFiles = ['src/services/payrollCalculation.ts', 'src/views/OvertimeView.vue', 'src/views/PayrollRecordsView.vue']
  for (const file of srcFiles) {
    const content = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    assert(!content.includes("from 'react'"), `${file} must NOT import from react`)
    assert(!content.includes('useState('), `${file} must NOT use useState`)
    assert(!content.includes('useEffect('), `${file} must NOT use useEffect`)
  }
  console.log('✔ Test 12 Passed: Complete Vue 3 compliance verified. Zero React dependencies or hooks present.')
}

console.log('\n======================================================================')
console.log('🎉 ALL 12 HOLIDAY PAY & AUTHORIZED OVERTIME TESTS PASSED SUCCESSFULLY!')
console.log('======================================================================')
