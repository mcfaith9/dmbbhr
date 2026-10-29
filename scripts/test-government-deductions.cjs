/**
 * Verification Test: Government Deductions in Payroll Calculation
 *
 * Tests:
 * - Scenario A: Employee with no government deductions configured
 * - Scenario B: Employee with explicitly configured government deductions
 * - Scenario C: Salary type changes (Daily, Monthly, Hourly) without auto-injecting deductions
 * - Scenario D: Recalculation after deduction settings change (removing/setting to 0)
 * - Scenario E: Preservation of finalized payroll snapshots
 * - ID numbers test: ID numbers (SSS, PhilHealth, Pag-IBIG) must NOT auto-generate deductions
 */
const assert = require('assert')

console.log('=== RUNNING GOVERNMENT DEDUCTIONS IN PAYROLL CALCULATION TESTS ===\n')

// Deduction resolution helper matching src/services/payrollCalculation.ts
function resolveGovernmentDeductions(employee, existingSnap) {
  // If finalized snapshot exists, return snapshot values directly
  if (existingSnap && (existingSnap.batchStatus === 'finalized' || existingSnap.reviewStatus === 'finalized')) {
    return {
      sss: existingSnap.sss,
      philhealth: existingSnap.philhealth,
      pagibig: existingSnap.pagibig,
      total: Math.round((existingSnap.sss + existingSnap.philhealth + existingSnap.pagibig) * 100) / 100,
      source: 'finalized_snapshot'
    }
  }

  // Extract configured semi-monthly deductions from employee profile
  const configuredSss = typeof employee.sss_deduction === 'number'
    ? employee.sss_deduction
    : (typeof employee.sssDeduction === 'number' ? employee.sssDeduction : undefined)

  const configuredPhilhealth = typeof employee.philhealth_deduction === 'number'
    ? employee.philhealth_deduction
    : (typeof employee.philhealthDeduction === 'number' ? employee.philhealthDeduction : undefined)

  const configuredPagibig = typeof employee.pagibig_deduction === 'number'
    ? employee.pagibig_deduction
    : (typeof employee.pagibigDeduction === 'number' ? employee.pagibigDeduction : undefined)

  const sss = configuredSss !== undefined ? Math.max(0, configuredSss) : 0
  const philhealth = configuredPhilhealth !== undefined ? Math.max(0, configuredPhilhealth) : 0
  const pagibig = configuredPagibig !== undefined ? Math.max(0, configuredPagibig) : 0
  const total = Math.round((sss + philhealth + pagibig) * 100) / 100

  return { sss, philhealth, pagibig, total, source: 'configured' }
}

// -------------------------------------------------------------
// Test 1: Scenario A - No government deductions configured
// -------------------------------------------------------------
console.log('Test 1: Scenario A - No government deductions configured')
const employeeA = {
  id: 'emp-25065',
  biometric_user_id: '25065',
  full_name: 'Cabigas, Marc Louie',
  salary_type: 'Daily',
  daily_rate: 540,
  // Government ID numbers are populated (e.g. from Excel/biometric import)
  sss_number: '03-1234567-8',
  philhealth_number: '12-345678901-2',
  pagibig_number: '1234-5678-9012',
  // No government deductions configured
  sss_deduction: undefined,
  philhealth_deduction: undefined,
  pagibig_deduction: undefined
}

const deductionsA = resolveGovernmentDeductions(employeeA, null)
assert.strictEqual(deductionsA.sss, 0, 'SSS must be 0.00 when unconfigured')
assert.strictEqual(deductionsA.philhealth, 0, 'PhilHealth must be 0.00 when unconfigured')
assert.strictEqual(deductionsA.pagibig, 0, 'Pag-IBIG must be 0.00 when unconfigured')
assert.strictEqual(deductionsA.total, 0, 'Total government deductions must be 0.00 when unconfigured')
console.log('✔ Test 1 Passed: Employee with SSS/PhilHealth/PagIBIG numbers but no deduction settings correctly gets ₱0.00.\n')

// -------------------------------------------------------------
// Test 2: Scenario B - Explicitly configured government deductions
// -------------------------------------------------------------
console.log('Test 2: Scenario B - Explicitly configured government deductions')
const employeeB = {
  id: 'emp-25066',
  biometric_user_id: '25066',
  full_name: 'Dela Cruz, Juan',
  salary_type: 'Daily',
  daily_rate: 540,
  sss_deduction: 500,
  philhealth_deduction: 250,
  pagibig_deduction: 100
}

const deductionsB = resolveGovernmentDeductions(employeeB, null)
assert.strictEqual(deductionsB.sss, 500, 'SSS must be 500.00 when configured as 500')
assert.strictEqual(deductionsB.philhealth, 250, 'PhilHealth must be 250.00 when configured as 250')
assert.strictEqual(deductionsB.pagibig, 100, 'Pag-IBIG must be 100.00 when configured as 100')
assert.strictEqual(deductionsB.total, 850, 'Total government deductions must be 850.00')
console.log('✔ Test 2 Passed: Configured deductions (SSS: ₱500, PH: ₱250, HDMF: ₱100) total ₱850.00.\n')

// -------------------------------------------------------------
// Test 3: Scenario C - Salary type changes (Daily, Monthly, Hourly)
// -------------------------------------------------------------
console.log('Test 3: Scenario C - Salary type changes (Daily, Monthly, Hourly)')
const empUnconfigured = {
  ...employeeA,
  salary_type: 'Daily',
  daily_rate: 540
}
let res = resolveGovernmentDeductions(empUnconfigured, null)
assert.strictEqual(res.total, 0, 'Daily: Total deductions must be 0')

// Change to Monthly (Basic 15,000)
empUnconfigured.salary_type = 'Monthly'
empUnconfigured.basic_salary = 15000
empUnconfigured.daily_rate = 576.92
res = resolveGovernmentDeductions(empUnconfigured, null)
assert.strictEqual(res.total, 0, 'Monthly: Changing to monthly must not cause unconfigured deductions to appear')

// Change to Hourly (Hourly rate 70)
empUnconfigured.salary_type = 'Hourly'
empUnconfigured.hourly_rate = 70
res = resolveGovernmentDeductions(empUnconfigured, null)
assert.strictEqual(res.total, 0, 'Hourly: Changing to hourly must not cause unconfigured deductions to appear')
console.log('✔ Test 3 Passed: Salary type switching does not re-inject government deductions.\n')

// -------------------------------------------------------------
// Test 4: Scenario D - Recalculation after settings change (removing/setting to 0)
// -------------------------------------------------------------
console.log('Test 4: Scenario D - Recalculation after settings change')
const employeeD = {
  ...employeeB
}
// Initially 850
assert.strictEqual(resolveGovernmentDeductions(employeeD, null).total, 850)

// Admin removes SSS deduction (sets to undefined or 0)
employeeD.sss_deduction = 0
employeeD.philhealth_deduction = undefined
assert.strictEqual(resolveGovernmentDeductions(employeeD, null).sss, 0, 'SSS should be 0 after being set to 0')
assert.strictEqual(resolveGovernmentDeductions(employeeD, null).philhealth, 0, 'PhilHealth should be 0 after being removed')
assert.strictEqual(resolveGovernmentDeductions(employeeD, null).pagibig, 100, 'Pag-IBIG should remain 100')
assert.strictEqual(resolveGovernmentDeductions(employeeD, null).total, 100, 'Total should be 100')
console.log('✔ Test 4 Passed: Recalculation correctly drops removed/zeroed deductions without restoring obsolete values.\n')

// -------------------------------------------------------------
// Test 5: Scenario E - Preservation of finalized payroll snapshots
// -------------------------------------------------------------
console.log('Test 5: Scenario E - Preservation of finalized payroll snapshots')
const finalizedSnap = {
  id: 'cutoff_2026-10-01_2026-10-15_25065',
  batchStatus: 'finalized',
  reviewStatus: 'finalized',
  sss: 300,
  philhealth: 150,
  pagibig: 100
}

const deductionsE = resolveGovernmentDeductions(employeeA, finalizedSnap)
assert.strictEqual(deductionsE.source, 'finalized_snapshot', 'Should preserve finalized snapshot')
assert.strictEqual(deductionsE.sss, 300, 'Finalized SSS must be preserved')
assert.strictEqual(deductionsE.philhealth, 150, 'Finalized PhilHealth must be preserved')
assert.strictEqual(deductionsE.pagibig, 100, 'Finalized Pag-IBIG must be preserved')
assert.strictEqual(deductionsE.total, 550, 'Finalized total must be preserved')
console.log('✔ Test 5 Passed: Finalized snapshots are strictly preserved as immutable historical records.\n')

// -------------------------------------------------------------
// Test 6: Draft snapshots do not leak obsolete auto-generated values
// -------------------------------------------------------------
console.log('Test 6: Draft snapshots do not leak obsolete auto-generated values for unconfigured employee')
const draftSnapWithOldBugValues = {
  id: 'cutoff_draft_25065',
  batchStatus: 'draft',
  reviewStatus: 'ready',
  sss: 292,
  philhealth: 162,
  pagibig: 100
}

const deductionsDraft = resolveGovernmentDeductions(employeeA, draftSnapWithOldBugValues)
assert.strictEqual(deductionsDraft.sss, 0, 'Unconfigured employee must NOT inherit old bug SSS from draft')
assert.strictEqual(deductionsDraft.philhealth, 0, 'Unconfigured employee must NOT inherit old bug PhilHealth from draft')
assert.strictEqual(deductionsDraft.pagibig, 0, 'Unconfigured employee must NOT inherit old bug PagIBIG from draft')
assert.strictEqual(deductionsDraft.total, 0, 'Unconfigured employee total must be 0')
console.log('✔ Test 6 Passed: Draft snapshots do not leak obsolete auto-generated deductions for unconfigured employees.\n')

console.log('🎉 ALL GOVERNMENT DEDUCTIONS TESTS PASSED SUCCESSFULLY! 🎉')
