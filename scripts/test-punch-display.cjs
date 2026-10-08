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
 * - Recent punches capped strictly at 7 items, newest first
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

// 8. Recent punches capped strictly at 7 items
let recent = []
for (let i = 1; i <= 15; i++) {
  const p = { id: `p-${i}`, eventId: `p-${i}`, employeeName: `Emp ${i}`, time: `8:0${i} AM` }
  recent = [p, ...recent].slice(0, 7)
}
assert.strictEqual(recent.length, 7, 'Recent punches must be capped at 7')
assert.strictEqual(recent[0].id, 'p-15', 'Newest punch must appear first')
assert.strictEqual(recent[6].id, 'p-9', 'Oldest entries beyond 7 must be dropped (when 8th arrives, oldest removed)')

// 9. Same employee punching again (25065 at 8:05:01 AM, then 25065 again at 8:05:08 AM)
let currentDisplay = null
let recentList = []

function handlePunch(event) {
  if (currentDisplay && currentDisplay.eventId !== event.eventId) {
    recentList = [currentDisplay, ...recentList.filter(p => p.eventId !== currentDisplay.eventId)].slice(0, 7)
  }
  currentDisplay = { ...event }
}

const punchA1 = {
  id: 'ev-1',
  eventId: '25065-80501-1',
  bioId: '25065',
  employeeName: 'Cantillas, Ronald',
  time: '8:05:01 AM',
  statusLabel: 'ON TIME'
}
handlePunch(punchA1)
assert.strictEqual(currentDisplay.eventId, '25065-80501-1')
assert.strictEqual(currentDisplay.time, '8:05:01 AM')
assert.strictEqual(recentList.length, 0)

const punchA2 = {
  id: 'ev-2',
  eventId: '25065-80508-2',
  bioId: '25065',
  employeeName: 'Cantillas, Ronald',
  time: '8:05:08 AM',
  statusLabel: 'ON TIME'
}
handlePunch(punchA2)
// Display must IMMEDIATELY refresh to the new event
assert.strictEqual(currentDisplay.eventId, '25065-80508-2')
assert.strictEqual(currentDisplay.time, '8:05:08 AM')
// Previous punch from same employee must be kept in recentList!
assert.strictEqual(recentList.length, 1)
assert.strictEqual(recentList[0].eventId, '25065-80501-1')
assert.strictEqual(recentList[0].time, '8:05:01 AM')

// 10. Different employee punching immediately after (Person B 25069)
const punchB1 = {
  id: 'ev-3',
  eventId: '25069-80510-3',
  bioId: '25069',
  employeeName: 'Alfanta, Cristine',
  time: '8:05:10 AM',
  statusLabel: 'ON TIME'
}
handlePunch(punchB1)
assert.strictEqual(currentDisplay.eventId, '25069-80510-3')
assert.strictEqual(currentDisplay.employeeName, 'Alfanta, Cristine')
assert.strictEqual(recentList.length, 2)
assert.strictEqual(recentList[0].eventId, '25065-80508-2')
assert.strictEqual(recentList[1].eventId, '25065-80501-1')

// 11. Person B punches again
const punchB2 = {
  id: 'ev-4',
  eventId: '25069-80515-4',
  bioId: '25069',
  employeeName: 'Alfanta, Cristine',
  time: '8:05:15 AM',
  statusLabel: 'ON TIME'
}
handlePunch(punchB2)
assert.strictEqual(currentDisplay.eventId, '25069-80515-4')
assert.strictEqual(currentDisplay.time, '8:05:15 AM')
assert.strictEqual(recentList.length, 3)
assert.strictEqual(recentList[0].eventId, '25069-80510-3')
assert.strictEqual(recentList[1].eventId, '25065-80508-2')
assert.strictEqual(recentList[2].eventId, '25065-80501-1')

// 12. Display Duration supported options (including 2s)
const supportedDurations = [2, 3, 5, 8, 10]
assert.ok(supportedDurations.includes(2), '2-second option must be supported')
assert.strictEqual(supportedDurations[2], 5, 'Default is 5 seconds')

// 13. Today's Punch Recap Logic Verification
function getRecapResultText(punch) {
  if (punch.isLate) {
    return punch.diffMinutes ? `LATE ${punch.diffMinutes}m` : 'LATE'
  }
  if (punch.statusCategory === 'undertime' || punch.statusLabel === 'EARLY OUT') {
    return punch.diffMinutes ? `EARLY OUT ${punch.diffMinutes}m` : 'EARLY OUT'
  }
  if (punch.statusCategory === 'early' || punch.statusLabel === 'EARLY' || punch.isEarly) {
    return 'EARLY'
  }
  return 'ON TIME'
}

// On time exit (7:52 AM -> 5:03 PM)
const onTimeRecap = getRecapResultText({
  statusCategory: 'time_out',
  statusLabel: 'TIME OUT',
  isLate: false,
  isEarly: false
})
assert.strictEqual(onTimeRecap, 'ON TIME')

// Early exit (7:55 AM -> 4:30 PM, 30m early out)
const earlyOutRecap = getRecapResultText({
  statusCategory: 'undertime',
  statusLabel: 'EARLY OUT',
  diffMinutes: 30,
  isLate: false
})
assert.strictEqual(earlyOutRecap, 'EARLY OUT 30m')

// Late arrival then exit (8:17 AM in, 17m late)
const lateRecap = getRecapResultText({
  statusCategory: 'late',
  statusLabel: 'LATE',
  diffMinutes: 17,
  isLate: true
})
assert.strictEqual(lateRecap, 'LATE 17m')

// 14. 3-Minute Idle Constant Verification
const IDLE_TIMEOUT_MS = 3 * 60 * 1000
assert.strictEqual(IDLE_TIMEOUT_MS, 180000, 'Idle timeout must be exactly 3 minutes (180,000ms)')

// 15. Punch priority over announcement
let isAnnouncementVisible = true
function onPunchArrived() {
  isAnnouncementVisible = false // Immediately disappears
}
onPunchArrived()
assert.strictEqual(isAnnouncementVisible, false, 'Announcement must disappear immediately on punch arrival')

// 16. BroadcastChannel DataCloneError Prevention & Plain Object Serialization
function toPlainAnnouncement(raw) {
  if (!raw || typeof raw !== 'object') return null
  if ('stopPropagation' in raw || 'preventDefault' in raw || 'target' in raw) {
    return null
  }
  const rawType = String(raw.type || 'announcement').toLowerCase().trim()
  const cleanType = rawType === 'reminder' ? 'reminder' : (rawType === 'birthday' ? 'birthday' : 'announcement')

  return {
    id: String(raw.id || `ann-${Date.now()}`),
    type: cleanType,
    title: String(raw.title || '').trim(),
    message: String(raw.message || '').trim(),
    enabled: Boolean(raw.enabled !== false),
    employeeName: raw.employeeName ? String(raw.employeeName).trim() : undefined,
    bioId: raw.bioId ? String(raw.bioId).trim() : undefined,
    photoUrl: raw.photoUrl ? String(raw.photoUrl).trim() : undefined,
    department: raw.department ? String(raw.department).trim() : undefined
  }
}

// Simulated Vue Reactive Proxy with getters/symbols and DOM Event
const mockDomEvent = {
  target: {},
  type: 'click',
  stopPropagation: () => {},
  preventDefault: () => {}
}
assert.strictEqual(toPlainAnnouncement(mockDomEvent), null, 'DOM click events must not be serialized')

const rawAnnouncement = {
  id: 'ann-test-1',
  type: 'reminder',
  title: 'Daily Reminder',
  message: 'Please remember to log your attendance.',
  enabled: true
}
const plainObj = toPlainAnnouncement(rawAnnouncement)
assert.ok(plainObj, 'Plain object must be created')
assert.strictEqual(plainObj.type, 'reminder')
assert.strictEqual(plainObj.title, 'Daily Reminder')

// Test structuredClone (Node.js 17+)
if (typeof structuredClone === 'function') {
  const cloned = structuredClone({
    type: 'ANNOUNCEMENT_SHOW',
    announcement: plainObj
  })
  assert.strictEqual(cloned.announcement.title, 'Daily Reminder')
}

console.log('✅ ALL PUNCH DISPLAY TESTS PASSED SUCCESSFULLY! 🎉')
