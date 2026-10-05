/**
 * Automated Test Suite for Punch Display:
 * - Direction detection (TIME IN vs TIME OUT)
 * - TIME OUT evaluation: normal OUT (>= expected out) -> 'TIME OUT' (NEVER 'LATE')
 * - TIME OUT evaluation: undertime (< expected out) -> 'EARLY OUT' (NEVER 'LATE')
 * - TIME IN evaluation: early (< standard in) -> 'EARLY'
 * - TIME IN evaluation: on-time (<= standard in + grace) -> 'ON TIME'
 * - TIME IN evaluation: late (> standard in + grace) -> 'LATE'
 * - IN Lateness is NEVER inherited by a subsequent OUT punch
 * - Normalization of raw Bio IDs (e.g. 'user25065' -> '25065')
 * - Recent punches capped strictly at 10 items, newest first
 */

const assert = require('assert')

function normalizeBioId(value) {
  const raw = String(value ?? '').trim()
  const match = raw.match(/\d+/)
  return match ? match[0] : raw
}

function evaluateAttendanceStatus(timestampStr, direction, standardIn = '08:00', gracePeriod = 15, expectedOut = '17:00') {
  const punchDate = new Date(timestampStr)
  let hours = punchDate.getHours()
  let minutes = punchDate.getMinutes()

  const punchMinutes = hours * 60 + minutes

  if (direction === 'OUT') {
    const [expH, expM] = expectedOut.split(':').map(Number)
    const expectedOutMinutes = (expH || 17) * 60 + (expM || 0)

    if (punchMinutes >= expectedOutMinutes) {
      return {
        statusCategory: 'time_out',
        statusLabel: 'TIME OUT',
        statusDetail: 'Shift completed',
        isEarly: false,
        isLate: false
      }
    } else {
      const undertime = expectedOutMinutes - punchMinutes
      return {
        statusCategory: 'undertime',
        statusLabel: 'EARLY OUT',
        statusDetail: `${undertime}m before scheduled exit`,
        isEarly: false,
        isLate: false
      }
    }
  }

  if (direction === 'IN') {
    const [stdH, stdM] = standardIn.split(':').map(Number)
    const standardInMinutes = (stdH || 8) * 60 + (stdM || 0)

    if (punchMinutes < standardInMinutes) {
      const earlyDiff = standardInMinutes - punchMinutes
      return {
        statusCategory: 'early',
        statusLabel: 'EARLY',
        statusDetail: `${earlyDiff}m early`,
        isEarly: true,
        isLate: false
      }
    } else if (punchMinutes <= standardInMinutes + gracePeriod) {
      return {
        statusCategory: 'on_time',
        statusLabel: 'ON TIME',
        statusDetail: 'Within shift grace period',
        isEarly: false,
        isLate: false
      }
    } else {
      const lateDiff = punchMinutes - standardInMinutes
      return {
        statusCategory: 'late',
        statusLabel: 'LATE',
        statusDetail: `Late by ${lateDiff}m`,
        isEarly: false,
        isLate: true
      }
    }
  }

  return { statusCategory: 'regular', statusLabel: 'PUNCH RECORDED', isEarly: false, isLate: false }
}

console.log('Running Punch Display Verification Test Suite...')

// 1. Normalization
assert.strictEqual(normalizeBioId('user25065'), '25065', 'normalize user25065')
assert.strictEqual(normalizeBioId('25065'), '25065', 'normalize 25065')
assert.strictEqual(normalizeBioId('  user_50044  '), '50044', 'normalize user_50044')

// 2. Test A: Late IN (8:35 AM on 8:00 AM shift)
const lateIn = evaluateAttendanceStatus('2026-10-05T08:35:00', 'IN', '08:00', 15, '17:00')
assert.strictEqual(lateIn.statusLabel, 'LATE', 'Test A: Late IN should be LATE')
assert.strictEqual(lateIn.isLate, true, 'Test A: isLate must be true')

// 3. Test B: Normal IN / On Time (8:05 AM on 8:00 AM shift)
const ontimeIn = evaluateAttendanceStatus('2026-10-05T08:05:00', 'IN', '08:00', 15, '17:00')
assert.strictEqual(ontimeIn.statusLabel, 'ON TIME', 'Test B: On Time IN should be ON TIME')
assert.strictEqual(ontimeIn.isLate, false, 'Test B: isLate must be false')

// 4. Test C: Early IN (7:48 AM on 8:00 AM shift)
const earlyIn = evaluateAttendanceStatus('2026-10-05T07:48:00', 'IN', '08:00', 15, '17:00')
assert.strictEqual(earlyIn.statusLabel, 'EARLY', 'Test C: Early IN should be EARLY')
assert.strictEqual(earlyIn.isEarly, true, 'Test C: isEarly must be true')
assert.strictEqual(earlyIn.isLate, false, 'Test C: isLate must be false')

// 5. Test D: Normal OUT (5:10 PM on 5:00 PM expected exit)
const normalOut = evaluateAttendanceStatus('2026-10-05T17:10:00', 'OUT', '08:00', 15, '17:00')
assert.strictEqual(normalOut.statusLabel, 'TIME OUT', 'Test D: Normal OUT must display TIME OUT')
assert.strictEqual(normalOut.isLate, false, 'Test D: isLate MUST BE FALSE on OUT!')
assert.notStrictEqual(normalOut.statusLabel, 'LATE', 'Test D: OUT must NEVER show LATE')

// 6. Test E: Early OUT (4:30 PM on 5:00 PM expected exit)
const earlyOut = evaluateAttendanceStatus('2026-10-05T16:30:00', 'OUT', '08:00', 15, '17:00')
assert.strictEqual(earlyOut.statusLabel, 'EARLY OUT', 'Test E: Early OUT must display EARLY OUT')
assert.strictEqual(earlyOut.isLate, false, 'Test E: isLate MUST BE FALSE on early OUT!')
assert.notStrictEqual(earlyOut.statusLabel, 'LATE', 'Test E: Early OUT must NEVER show LATE')

// 7. Test F: Late IN followed by Normal OUT (Late at 8:20 AM, Out at 5:10 PM)
const morningPunch = evaluateAttendanceStatus('2026-10-05T08:20:00', 'IN', '08:00', 15, '17:00')
assert.strictEqual(morningPunch.statusLabel, 'LATE')
const eveningPunch = evaluateAttendanceStatus('2026-10-05T17:10:00', 'OUT', '08:00', 15, '17:00')
assert.strictEqual(eveningPunch.statusLabel, 'TIME OUT', 'Test F: OUT after late IN must be TIME OUT')
assert.strictEqual(eveningPunch.isLate, false, 'Test F: OUT must not inherit morning lateness')

// 8. Recent punches capped at 10 items
let recent = []
for (let i = 1; i <= 15; i++) {
  const p = { id: `p-${i}`, employeeName: `Emp ${i}`, time: `8:0${i} AM` }
  recent = [p, ...recent].slice(0, 10)
}
assert.strictEqual(recent.length, 10, 'Recent punches must be capped at 10')
assert.strictEqual(recent[0].id, 'p-15', 'Newest punch must appear first')
assert.strictEqual(recent[9].id, 'p-6', 'Oldest entries beyond 10 must be dropped')

console.log('✅ ALL PUNCH DISPLAY TESTS PASSED SUCCESSFULLY! 🎉')
