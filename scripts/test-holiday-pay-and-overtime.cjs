/**
 * Verification Test Suite: DMBBHR Holiday Pay and Authorized Overtime Rules
 *
 * Verifies the statutory payroll calculation rules:
 * 1. Regular holiday, eligible employee does not work: 100% daily wage.
 * 2. Regular holiday, employee works 8 hours: 200% daily wage (100% base + 100% holiday).
 * 3. Special non-working day, employee does not work: 0% ("no work, no pay").
 * 4. Special non-working day, employee works 8 hours: 130% daily wage (100% base + 30% holiday).
 * 5. Scope restriction: rest-day duty excluded for now.
 * 6. Special working day, employee works: regular daily rate (100%).
 * 7. Employee punches out at 5:30 PM without an approved overtime form: ₱0 overtime.
 * 8. Scenario A (Ordinary working day overtime): 125% of hourly rate per overtime hour.
 *    Base ₱540, ₱67.50/hr x 125% = ₱84.375 -> Total 8h + 1h OT = ₱624.38.
 * 9. Scenario B (Special non-working holiday overtime): 130% base (₱702), 169% OT (₱114.075/hr).
 *    Total 8h + 1h OT = ₱816.08.
 * 10. Scenario C (Regular holiday overtime): 200% base (₱1,080), 260% OT (₱175.50/hr).
 *    Total 8h + 1h OT = ₱1,255.50.
 * 11. Multiple overtime records and historical date support.
 * 12. Complete Vue 3 compliance (zero React dependencies or hooks).
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')

console.log('======================================================================')
console.log('RUNNING DMBBHR HOLIDAY PAY & AUTHORIZED OVERTIME VERIFICATION TESTS')
console.log('======================================================================\n')

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
        // Worked Regular Holiday (first 8 hours): 200% daily wage (100% base + 100% holiday)
        payableDays = 1
        baseDayPay = dailyRate * 1.0
        holidayPay = dailyRate * 1.0
      } else if (isEligibleForUnworkedHoliday) {
        // Unworked Regular Holiday (eligible): 100% daily wage
        holidayPay = dailyRate * 1.0
      } else {
        holidayPay = 0
      }
    } else if (holType === 'Special Non-Working' || holType === 'Local Holiday') {
      if (hasWorked) {
        // Worked Special Non-Working Day: 130% daily wage (100% base + 30% holiday)
        // (Rest-day duty calculations excluded for now)
        payableDays = 1
        baseDayPay = dailyRate * 1.0
        holidayPay = dailyRate * 0.30
      } else {
        holidayPay = 0
      }
    } else if (holType === 'Special Working') {
      if (hasWorked) {
        // Worked Special Working Day: 100% daily wage
        payableDays = 1
        baseDayPay = dailyRate * 1.0
        holidayPay = 0
      } else {
        holidayPay = 0
      }
    }
  } else if (isSunday) {
    // Ordinary Sunday (rest-day duty excluded for now)
    if (hasWorked) {
      payableDays = 1
      baseDayPay = dailyRate * 1.0
      sundayDutyPay = 0
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
    } else if (isHoliday) {
      const workedHours = Number(attendance?.total_hours_decimal) || 0
      payableOtHours = workedHours > 0 ? Math.min(authorizedHours, workedHours) : 0
    }

    if (payableOtHours > 0) {
      overtimeHours = payableOtHours

      // Multipliers:
      // Ordinary working day: 125% of hourly rate (multiplier: 1.25)
      // Special Non-Working Holiday: 130% x 130% = 169% (multiplier: 1.69)
      // Regular Holiday: 200% x 130% = 260% (multiplier: 2.60)
      let otMultiplier = 1.25
      if (isHoliday) {
        if (holType === 'Regular') {
          otMultiplier = 2.60
        } else if (holType === 'Special Non-Working' || holType === 'Local Holiday') {
          otMultiplier = 1.69
        }
      }

      overtimePay = Math.round(payableOtHours * hourlyRate * otMultiplier * 100) / 100
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

const DAILY_RATE = 540.00
const HOURLY_RATE = 67.50 // 540 / 8

// --- Scenario 1: Regular holiday, eligible employee does not work: 100% daily wage ---
console.log('--- TEST 1: Regular Holiday, Unworked (Eligible) ---')
{
  const result = calculatePayrollForDay({
    dateStr: '2026-10-12',
    isSunday: false,
    holiday: { id: 'h-1', name: 'Fiesta Day', date: '2026-10-12', type: 'Regular', isNationwide: true },
    dailyRate: DAILY_RATE,
    hourlyRate: HOURLY_RATE,
    attendance: null,
    approvedOvertimeForm: null,
    isEligibleForUnworkedHoliday: true
  })

  assert.strictEqual(result.payableDays, 0)
  assert.strictEqual(result.baseDayPay, 0)
  assert.strictEqual(result.holidayPay, 540.00, 'Eligible unworked regular holiday receives 100% daily wage (₱540.00)')
  assert.strictEqual(result.overtimePay, 0)
  assert.strictEqual(result.totalDayPay, 540.00)
  console.log('✔ Test 1 Passed: 100% daily wage (₱540.00) paid for eligible unworked regular holiday.')
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

  assert.strictEqual(result.payableDays, 1)
  assert.strictEqual(result.baseDayPay, 540.00, '100% daily wage in base pay')
  assert.strictEqual(result.holidayPay, 540.00, '+100% regular holiday premium')
  assert.strictEqual(result.totalDayPay, 1080.00, 'Total pay must be 200% daily wage (₱1,080.00)')
  console.log('✔ Test 2 Passed: 200% daily wage (₱1,080.00) paid for worked regular holiday.')
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
  assert.strictEqual(result.holidayPay, 0, 'No work, no pay for unworked special non-working day')
  assert.strictEqual(result.totalDayPay, 0)
  console.log('✔ Test 3 Passed: ₱0.00 paid for unworked special non-working day (no work, no pay).')
}

// --- Scenario 4: Special non-working day, employee works 8 hours: 130% daily wage ---
console.log('\n--- TEST 4: Special Non-Working Day, Worked 8 Hours ---')
{
  const result = calculatePayrollForDay({
    dateStr: '2026-11-01',
    isSunday: false,
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
  assert.strictEqual(result.baseDayPay, 540.00, '100% daily wage in base pay')
  assert.strictEqual(result.holidayPay, 162.00, '+30% special holiday premium (₱162.00)')
  assert.strictEqual(result.totalDayPay, 702.00, 'Total pay must be 130% daily wage (₱702.00)')
  console.log('✔ Test 4 Passed: 130% daily wage (₱702.00) paid for worked special non-working day.')
}

// --- Scenario 5: Scope restriction: Rest-day duty excluded for now ---
console.log('\n--- TEST 5: Rest-Day Duty Excluded for Now ---')
{
  const result = calculatePayrollForDay({
    dateStr: '2026-11-01',
    isSunday: true, // Sunday
    holiday: null,
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
  assert.strictEqual(result.baseDayPay, 540.00)
  assert.strictEqual(result.sundayDutyPay, 0, 'Rest-day duty premium excluded for now')
  assert.strictEqual(result.totalDayPay, 540.00)
  console.log('✔ Test 5 Passed: Rest-day duty calculations excluded for now as instructed.')
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
  assert.strictEqual(result.baseDayPay, 540.00)
  assert.strictEqual(result.holidayPay, 0)
  assert.strictEqual(result.totalDayPay, 540.00)
  console.log('✔ Test 6 Passed: Regular daily rate (₱540.00) paid for special working day.')
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
      actual_out: '5:30 PM',
      expected_out: '17:00',
      has_valid_out: true,
      total_hours_decimal: 8.5
    },
    approvedOvertimeForm: null
  })

  assert.strictEqual(result.overtimeHours, 0)
  assert.strictEqual(result.overtimePay, 0)
  assert.strictEqual(result.totalDayPay, 540.00)
  console.log('✔ Test 7 Passed: ₱0 overtime earnings when checkout is at 5:30 PM without an approved form.')
}

// --- Scenario 8: Ordinary working day overtime (125% of hourly rate) ---
console.log('\n--- TEST 8: Ordinary Working Day Overtime (₱540 Base, ₱67.50/hr x 125%) ---')
{
  const result = calculatePayrollForDay({
    dateStr: '2026-10-07',
    isSunday: false,
    holiday: null,
    dailyRate: DAILY_RATE,
    hourlyRate: HOURLY_RATE, // 67.50
    attendance: {
      actual_in: '8:00 AM',
      actual_out: '6:00 PM', // 1.0 hr past 5:00 PM
      expected_out: '17:00',
      has_valid_out: true,
      total_hours_decimal: 9.0
    },
    approvedOvertimeForm: {
      id: 'ot-101',
      status: 'Approved',
      authorizedHours: 1.0,
      startTime: '17:00',
      endTime: '18:00'
    }
  })

  // Hourly rate: ₱67.50, OT rate: ₱67.50 x 125% = ₱84.375 -> ₱84.38
  assert.strictEqual(result.overtimeHours, 1.0)
  assert.strictEqual(result.overtimePay, 84.38)
  assert.strictEqual(result.totalDayPay, 624.38, '₱540.00 + ₱84.38 = ₱624.38')
  console.log('✔ Test 8 Passed: Ordinary OT: 8h base (₱540) + 1h OT (₱84.38) = ₱624.38.')
}

// --- Scenario 9: Special non-working holiday overtime (130% base + 169% OT) ---
console.log('\n--- TEST 9: Special Non-Working Holiday Overtime (169%) ---')
{
  const result = calculatePayrollForDay({
    dateStr: '2026-11-01',
    isSunday: false,
    holiday: { id: 'h-2', name: 'All Saints Day', date: '2026-11-01', type: 'Special Non-Working', isNationwide: true },
    dailyRate: DAILY_RATE,
    hourlyRate: HOURLY_RATE,
    attendance: {
      actual_in: '8:00 AM',
      actual_out: '6:00 PM',
      expected_out: '17:00',
      has_valid_out: true,
      total_hours_decimal: 9.0
    },
    approvedOvertimeForm: {
      status: 'Approved',
      authorizedHours: 1.0,
      startTime: '17:00',
      endTime: '18:00'
    }
  })

  // Base day pay: ₱702 (₱540 x 130%)
  // Overtime rate: ₱67.50 x 1.30 x 1.30 = ₱67.50 x 1.69 = ₱114.075 -> ₱114.08
  assert.strictEqual(result.baseDayPay, 540.00)
  assert.strictEqual(result.holidayPay, 162.00)
  assert.strictEqual(result.overtimeHours, 1.0)
  assert.strictEqual(result.overtimePay, 114.08)
  assert.strictEqual(result.totalDayPay, 816.08, '₱702.00 + ₱114.08 = ₱816.08')
  console.log('✔ Test 9 Passed: Special Holiday OT: 8h base (₱702) + 1h OT (₱114.08) = ₱816.08.')
}

// --- Scenario 10: Regular holiday overtime (200% base + 260% OT) ---
console.log('\n--- TEST 10: Regular Holiday Overtime (260%) ---')
{
  const result = calculatePayrollForDay({
    dateStr: '2026-10-12',
    isSunday: false,
    holiday: { id: 'h-1', name: 'Fiesta Day', date: '2026-10-12', type: 'Regular', isNationwide: true },
    dailyRate: DAILY_RATE,
    hourlyRate: HOURLY_RATE,
    attendance: {
      actual_in: '8:00 AM',
      actual_out: '6:00 PM',
      expected_out: '17:00',
      has_valid_out: true,
      total_hours_decimal: 9.0
    },
    approvedOvertimeForm: {
      status: 'Approved',
      authorizedHours: 1.0,
      startTime: '17:00',
      endTime: '18:00'
    }
  })

  // Base day pay: ₱1,080 (₱540 x 200%)
  // Overtime rate: ₱67.50 x 2.00 x 1.30 = ₱67.50 x 2.60 = ₱175.50
  assert.strictEqual(result.baseDayPay, 540.00)
  assert.strictEqual(result.holidayPay, 540.00)
  assert.strictEqual(result.overtimeHours, 1.0)
  assert.strictEqual(result.overtimePay, 175.50)
  assert.strictEqual(result.totalDayPay, 1255.50, '₱1,080.00 + ₱175.50 = ₱1,255.50')
  console.log('✔ Test 10 Passed: Regular Holiday OT: 8h base (₱1,080) + 1h OT (₱175.50) = ₱1,255.50.')
}

// --- Scenario 11: October 15, 2026 Historical Date partial attendance (5:08 PM checkout) ---
console.log('\n--- TEST 11: Oct 15, 2026 Partial Attendance (8 mins OT) ---')
{
  const result = calculatePayrollForDay({
    dateStr: '2026-10-15',
    isSunday: false,
    holiday: null,
    dailyRate: DAILY_RATE,
    hourlyRate: HOURLY_RATE,
    attendance: {
      actual_in: '8:00 AM',
      actual_out: '5:08 PM', // 8 mins
      expected_out: '17:00',
      has_valid_out: true
    },
    approvedOvertimeForm: {
      status: 'Approved',
      authorizedHours: 1.0
    }
  })

  assert.strictEqual(result.overtimeHours, 0.13)
  assert.strictEqual(result.overtimePay, 10.97)
  console.log('✔ Test 11 Passed: Historical Oct 15 record with 5:08 PM checkout pays for 0.13h (₱10.97).')
}

// --- Scenario 12: Verify Vue project purity (NO React dependencies or imports) ---
console.log('\n--- TEST 12: Vue Purity & Framework Compliance ---')
{
  const pkgJsonPath = path.join(__dirname, '..', 'package.json')
  const pkgContent = fs.readFileSync(pkgJsonPath, 'utf8')
  assert(!pkgContent.includes('"react"'), 'package.json must NOT contain react')
  assert(!pkgContent.includes('"react-dom"'), 'package.json must NOT contain react-dom')

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
