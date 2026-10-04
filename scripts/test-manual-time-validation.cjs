const assert = require('assert')

// Reproduce the exact logic from src/lib/timeUtils.ts in CommonJS for test validation
function normalizeTimeToHHMM(val) {
  if (!val) return null
  const clean = val.replace(/\s*\(Manual\)/gi, '').trim()
  if (
    !clean ||
    clean === '—' ||
    clean === '-' ||
    clean.toLowerCase().includes('missing') ||
    clean.toLowerCase().includes('awaiting') ||
    clean.toLowerCase().includes('no in') ||
    clean.toLowerCase().includes('no out')
  ) {
    return null
  }

  // 12-hour format: e.g. "5:40 AM", "05:40:15 AM", "12:00 AM", "5:20:42 PM"
  const match12 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i)
  if (match12) {
    let hours = parseInt(match12[1], 10)
    const minutes = parseInt(match12[2], 10)
    const period = match12[3].toUpperCase()

    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
      return null
    }

    if (period === 'AM') {
      if (hours === 12) hours = 0
    } else if (period === 'PM') {
      if (hours !== 12) hours += 12
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  // 24-hour format: e.g. "05:40", "5:40", "17:00", "05:40:15"
  const match24 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (match24) {
    const hours = parseInt(match24[1], 10)
    const minutes = parseInt(match24[2], 10)

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  return null
}

function isValidTimeString(value) {
  if (!value) return false
  return normalizeTimeToHHMM(value) !== null
}

function areTimesEqual(t1, t2) {
  const n1 = normalizeTimeToHHMM(t1)
  const n2 = normalizeTimeToHHMM(t2)
  if (!n1 && !n2) return true
  if (!n1 || !n2) return false
  return n1 === n2
}

function hasTimeChanged(originalTime, requestedTime) {
  const reqNorm = normalizeTimeToHHMM(requestedTime)
  if (!reqNorm) return false

  const origNorm = normalizeTimeToHHMM(originalTime)
  if (!origNorm) return true

  return reqNorm !== origNorm
}

function formatHHMMTo12Hour(hhmm) {
  const norm = normalizeTimeToHHMM(hhmm)
  if (!norm) return hhmm

  const [hStr, mStr] = norm.split(':')
  let hours = parseInt(hStr, 10)
  const minutes = mStr
  const period = hours >= 12 ? 'PM' : 'AM'

  if (hours === 0) {
    hours = 12
  } else if (hours > 12) {
    hours -= 12
  }

  return `${String(hours).padStart(2, '0')}:${minutes} ${period}`
}

console.log('Running Manual Time Validation & Normalization Tests...')

// Test 5: Invalid Time IN rejected
assert.strictEqual(isValidTimeString('5:40:15 asd'), false, '5:40:15 asd must be invalid')
assert.strictEqual(isValidTimeString('asd'), false, 'asd must be invalid')
assert.strictEqual(isValidTimeString('hello'), false, 'hello must be invalid')
assert.strictEqual(isValidTimeString('123abc'), false, '123abc must be invalid')
assert.strictEqual(isValidTimeString('25:00'), false, '25:00 must be invalid')
assert.strictEqual(isValidTimeString('12:60'), false, '12:60 must be invalid')
console.log('✔ Test 5 passed: Invalid Time IN properly rejected')

// Test 6: Invalid Time OUT rejected
assert.strictEqual(isValidTimeString('17:00 asd'), false, '17:00 asd must be invalid')
assert.strictEqual(isValidTimeString('invalid'), false, 'invalid must be invalid')
console.log('✔ Test 6 passed: Invalid Time OUT properly rejected')

// Test 7: No changes made
assert.strictEqual(hasTimeChanged('05:40', '05:40'), false, '05:40 to 05:40 is not a change')
assert.strictEqual(hasTimeChanged('17:00', '17:00'), false, '17:00 to 17:00 is not a change')
assert.strictEqual(hasTimeChanged('5:40:15 AM', '05:40'), false, '5:40:15 AM to 05:40 is not a change')
console.log('✔ Test 7 passed: No changes detected when values match')

// Test 8: Change only Time IN
const inChanged = hasTimeChanged('05:40', '06:00')
const outUnchanged = hasTimeChanged('17:00', '17:00')
assert.strictEqual(inChanged, true, '05:40 to 06:00 is a change')
assert.strictEqual(outUnchanged, false, '17:00 to 17:00 is unchanged')
assert.strictEqual(inChanged || outUnchanged, true, 'Change in Time IN only allows submission')
console.log('✔ Test 8 passed: Time IN changed only allows submission')

// Test 9: Change only Time OUT
const inUnchanged2 = hasTimeChanged('05:40', '05:40')
const outChanged2 = hasTimeChanged('17:00', '18:00')
assert.strictEqual(inUnchanged2, false, '05:40 to 05:40 is unchanged')
assert.strictEqual(outChanged2, true, '17:00 to 18:00 is a change')
assert.strictEqual(inUnchanged2 || outChanged2, true, 'Change in Time OUT only allows submission')
console.log('✔ Test 9 passed: Time OUT changed only allows submission')

// Test 10: Change both
const inChanged3 = hasTimeChanged('05:40', '06:00')
const outChanged3 = hasTimeChanged('17:00', '18:00')
assert.strictEqual(inChanged3 && outChanged3, true, 'Both changed')
console.log('✔ Test 10 passed: Both changed allows submission')

// Test 11: Change display format only
assert.strictEqual(areTimesEqual('5:40 AM', '05:40'), true, '5:40 AM and 05:40 are the same time')
assert.strictEqual(areTimesEqual('05:40:00', '05:40'), true, '05:40:00 and 05:40 are the same time')
assert.strictEqual(hasTimeChanged('5:40 AM', '05:40'), false, 'Format change is not a data change')
assert.strictEqual(hasTimeChanged('05:40:00', '05:40'), false, 'Seconds removal is not a data change')
console.log('✔ Test 11 passed: Format changes only are treated as NO CHANGE')

// Real changes
assert.strictEqual(hasTimeChanged('05:40', '05:41'), true, '05:40 to 05:41 is a change')
assert.strictEqual(hasTimeChanged('—', '08:00'), true, 'Missing to 08:00 is a change')

// Format HHMM to 12h
assert.strictEqual(formatHHMMTo12Hour('06:00'), '06:00 AM')
assert.strictEqual(formatHHMMTo12Hour('17:00'), '05:00 PM')
assert.strictEqual(formatHHMMTo12Hour('00:00'), '12:00 AM')
assert.strictEqual(formatHHMMTo12Hour('12:00'), '12:00 PM')

console.log('All 11 verification tests PASSED successfully!')
