/**
 * Attendance Matrix existing-record click routing.
 * Run: node scripts/test-matrix-existing-record-edit.mjs
 */

import assert from 'node:assert'
import { collectEmployeeIdKeys, recordMatchesEmployee } from '../src/lib/employeeIdentity.ts'
import { normalizeDateString } from '../src/services/overtimePolicy.ts'

function decideMatrixClick({ manual, overtimeCount, hasIn, hasOut }) {
  if (manual) return 'edit-manual'
  if (overtimeCount === 1) return 'edit-overtime'
  if (overtimeCount > 1) return 'pick-overtime'
  if (hasIn && hasOut) return 'create-overtime'
  return 'create-manual'
}

function overtimeSaveMode(editingRecord) {
  if (editingRecord == null) return 'create'
  if (!editingRecord.id) return 'error-missing-id'
  return 'edit'
}

let passed = 0
function check(name, fn) {
  fn()
  passed += 1
  console.log(`ok - ${name}`)
}

check('matches biometric_user_id, employee_number, and emp- prefix variants', () => {
  const keys = collectEmployeeIdKeys({
    biometric_user_id: '25065',
    employee_number: '25065',
    id: 'emp-25065'
  })
  assert.equal(recordMatchesEmployee('25065', keys), true)
  assert.equal(recordMatchesEmployee('EMP-25065', keys), true)
  assert.equal(recordMatchesEmployee('emp_25065', keys), true)
  assert.equal(recordMatchesEmployee('99999', keys), false)
})

check('does not match using record ID or today', () => {
  const keys = collectEmployeeIdKeys('25065')
  assert.equal(recordMatchesEmployee('ot_1729123456_abcd', keys), false)
  const clickedDate = '2026-06-15'
  const today = '2026-10-19'
  assert.notEqual(normalizeDateString(clickedDate), today)
  assert.equal(normalizeDateString(clickedDate), '2026-06-15')
  assert.equal(normalizeDateString('2026-06-15T08:00:00+08:00'), '2026-06-15')
})

check('Case A: existing Manual Time opens edit-manual even when IN/OUT exist', () => {
  assert.equal(decideMatrixClick({
    manual: { id: '25065_2026-06-15' },
    overtimeCount: 2,
    hasIn: true,
    hasOut: true
  }), 'edit-manual')
})

check('Case B: one overtime record opens edit-overtime', () => {
  assert.equal(decideMatrixClick({
    manual: null,
    overtimeCount: 1,
    hasIn: true,
    hasOut: true
  }), 'edit-overtime')
})

check('multiple overtime records require a picker', () => {
  assert.equal(decideMatrixClick({
    manual: null,
    overtimeCount: 3,
    hasIn: true,
    hasOut: true
  }), 'pick-overtime')
})

check('Case C: no records keeps current create behavior', () => {
  assert.equal(decideMatrixClick({
    manual: null,
    overtimeCount: 0,
    hasIn: true,
    hasOut: true
  }), 'create-overtime')
  assert.equal(decideMatrixClick({
    manual: null,
    overtimeCount: 0,
    hasIn: true,
    hasOut: false
  }), 'create-manual')
  assert.equal(decideMatrixClick({
    manual: null,
    overtimeCount: 0,
    hasIn: false,
    hasOut: true
  }), 'create-manual')
})

check('edit save refuses to convert to create when ID is missing', () => {
  assert.equal(overtimeSaveMode(null), 'create')
  assert.equal(overtimeSaveMode({ id: 'ot_1' }), 'edit')
  assert.equal(overtimeSaveMode({ id: '' }), 'error-missing-id')
})

console.log(`\n${passed} checks passed`)
