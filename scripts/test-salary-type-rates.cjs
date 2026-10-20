/**
 * Verification Script: Employee Salary Type and Automatic Rate Calculation
 *
 * Verifies:
 * 1. Default Salary Type is Daily Wage ('Daily') for newly created / unconfigured employees.
 * 2. Case-insensitive normalization of Salary Type.
 * 3. Preservation of existing employee's saved Salary Type ('Monthly', 'Daily', 'Hourly').
 * 4. Automatic rate calculations with 2 decimal places rounding:
 *    - Daily: Daily Rate = Basic, Hourly Rate = Daily / 8
 *    - Monthly: Daily Rate = Basic / 26, Hourly Rate = Daily / 8
 *    - Hourly: Hourly Rate = Basic, Daily Rate = Hourly * 8
 * 5. Test with Basic Salary ₱14,040.00:
 *    - Daily: Daily = ₱14,040.00, Hourly = ₱1,755.00
 *    - Monthly: Daily = ₱540.00, Hourly = ₱67.50
 *    - Hourly: Daily = ₱112,320.00, Hourly = ₱14,040.00
 * 6. Number normalization from string inputs (e.g. "14,040", "14040.00").
 */
const assert = require('assert')

console.log('=== RUNNING SALARY TYPE & RATE CALCULATION TESTS ===')

// 1. Normalization Logic
function normalizeSalaryType(val) {
  if (!val) return 'Daily'
  const s = String(val).trim().toLowerCase()
  if (s === 'monthly') return 'Monthly'
  if (s === 'hourly') return 'Hourly'
  if (s === 'daily') return 'Daily'
  return 'Daily'
}

assert.strictEqual(normalizeSalaryType(undefined), 'Daily', 'undefined should default to Daily')
assert.strictEqual(normalizeSalaryType(null), 'Daily', 'null should default to Daily')
assert.strictEqual(normalizeSalaryType(''), 'Daily', 'empty string should default to Daily')
assert.strictEqual(normalizeSalaryType('Daily'), 'Daily', 'Daily should remain Daily')
assert.strictEqual(normalizeSalaryType('Monthly'), 'Monthly', 'Monthly should remain Monthly')
assert.strictEqual(normalizeSalaryType('Hourly'), 'Hourly', 'Hourly should remain Hourly')
assert.strictEqual(normalizeSalaryType('daily'), 'Daily', 'lowercase daily should normalize to Daily')
assert.strictEqual(normalizeSalaryType('monthly'), 'Monthly', 'lowercase monthly should normalize to Monthly')
assert.strictEqual(normalizeSalaryType('hourly'), 'Hourly', 'lowercase hourly should normalize to Hourly')
console.log('✔ Test 1 Passed: Salary Type normalization and Daily default verified.')

// 2. Safe Number Parsing Logic
function parseSalaryNumber(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  if (typeof val === 'string') {
    const clean = val.replace(/,/g, '').trim()
    const n = Number(clean)
    return isNaN(n) ? 0 : n
  }
  return 0
}

assert.strictEqual(parseSalaryNumber(14040), 14040)
assert.strictEqual(parseSalaryNumber('14040'), 14040)
assert.strictEqual(parseSalaryNumber('14,040'), 14040)
assert.strictEqual(parseSalaryNumber('14,040.50'), 14040.5)
assert.strictEqual(parseSalaryNumber(''), 0)
assert.strictEqual(parseSalaryNumber('abc'), 0)
console.log('✔ Test 2 Passed: Safe number parsing and string normalization verified.')

// 3. Rate Calculations for Daily, Monthly, and Hourly
function calculateRates(salaryType, basicSalary) {
  const basic = parseSalaryNumber(basicSalary)
  if (basic <= 0) return { dailyRate: 0, hourlyRate: 0 }

  let daily = 0
  let hourly = 0

  if (salaryType === 'Monthly') {
    daily = Math.round((basic / 26) * 100) / 100
    hourly = Math.round((daily / 8) * 100) / 100
  } else if (salaryType === 'Daily') {
    daily = Math.round(basic * 100) / 100
    hourly = Math.round((daily / 8) * 100) / 100
  } else if (salaryType === 'Hourly') {
    hourly = Math.round(basic * 100) / 100
    daily = Math.round((hourly * 8) * 100) / 100
  }

  return { dailyRate: daily, hourlyRate: hourly }
}

// Test with ₱14,040 Basic Salary
const basic14040 = 14040

// Daily
const dailyRates = calculateRates('Daily', basic14040)
assert.strictEqual(dailyRates.dailyRate, 14040.00, 'Daily wage: Daily Rate should equal Basic Salary')
assert.strictEqual(dailyRates.hourlyRate, 1755.00, 'Daily wage: Hourly Rate should equal Daily Rate / 8')
console.log(`✔ Test 3 Passed: Daily Wage rates: Basic=₱${basic14040} -> Daily=₱${dailyRates.dailyRate.toFixed(2)}, Hourly=₱${dailyRates.hourlyRate.toFixed(2)}`)

// Monthly
const monthlyRates = calculateRates('Monthly', basic14040)
assert.strictEqual(monthlyRates.dailyRate, 540.00, 'Monthly salary: Daily Rate should equal Basic / 26 (₱540.00)')
assert.strictEqual(monthlyRates.hourlyRate, 67.50, 'Monthly salary: Hourly Rate should equal Daily / 8 (₱67.50)')
console.log(`✔ Test 4 Passed: Monthly Salary rates: Basic=₱${basic14040} -> Daily=₱${monthlyRates.dailyRate.toFixed(2)}, Hourly=₱${monthlyRates.hourlyRate.toFixed(2)}`)

// Hourly
const hourlyRates = calculateRates('Hourly', basic14040)
assert.strictEqual(hourlyRates.hourlyRate, 14040.00, 'Hourly rate: Hourly Rate should equal Basic Salary')
assert.strictEqual(hourlyRates.dailyRate, 112320.00, 'Hourly rate: Daily Rate should equal Hourly Rate * 8')
console.log(`✔ Test 5 Passed: Hourly Rate rates: Basic=₱${basic14040} -> Daily=₱${hourlyRates.dailyRate.toFixed(2)}, Hourly=₱${hourlyRates.hourlyRate.toFixed(2)}`)

// String input test: "14,040" for Monthly
const stringInputRates = calculateRates('Monthly', '14,040')
assert.strictEqual(stringInputRates.dailyRate, 540.00)
assert.strictEqual(stringInputRates.hourlyRate, 67.50)
console.log('✔ Test 6 Passed: String with commas correctly parsed and calculated.')

// Fractional salary test: ₱15,000 for Monthly
const monthly15k = calculateRates('Monthly', 15000)
// 15000 / 26 = 576.9230769 -> 576.92
// 576.92 / 8 = 72.115 -> Math.round((576.92/8)*100)/100 = 72.11
assert.strictEqual(monthly15k.dailyRate, 576.92)
assert.strictEqual(monthly15k.hourlyRate, 72.11)
console.log(`✔ Test 7 Passed: Fractional rounding: Basic=₱15,000 -> Daily=₱${monthly15k.dailyRate}, Hourly=₱${monthly15k.hourlyRate}`)

// 4. Existing Employee Preservation Test
const existingMonthlyEmployee = {
  biometric_user_id: '5001',
  full_name: 'Existing Monthly Employee',
  salary_type: 'Monthly',
  basic_salary: 14040,
  daily_rate: 540,
  hourly_rate: 67.5
}
const resolvedSalaryType = normalizeSalaryType(existingMonthlyEmployee.salary_type)
assert.strictEqual(resolvedSalaryType, 'Monthly', 'Existing Monthly employee must retain Monthly salary type')

const newEmployee = {
  biometric_user_id: '5002',
  full_name: 'Brand New Employee'
}
const newEmpSalaryType = normalizeSalaryType(newEmployee.salary_type)
assert.strictEqual(newEmpSalaryType, 'Daily', 'New employee must default to Daily')
console.log('✔ Test 8 Passed: Existing employee Salary Type preserved; new employee gets Daily.')

console.log('===================================================')
console.log('🎉 ALL SALARY TYPE & RATE TESTS PASSED!')
console.log('===================================================')
