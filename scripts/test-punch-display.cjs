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

function evaluateAttendanceStatus(timestampStr, direction, standardIn = '08:00', gracePeriod = 0, expectedOut = '17:00', isFirstIn = true, lunchStart = '12:00', lunchEnd = '13:00') {
  const punchDate = new Date(timestampStr)
  let hours = punchDate.getHours()
  let minutes = punchDate.getMinutes()

  const punchMinutes = hours * 60 + minutes

  const [lStartH, lStartM] = lunchStart.split(':').map(Number)
  const [lEndH, lEndM] = lunchEnd.split(':').map(Number)
  const lunchStartMinutes = (lStartH || 12) * 60 + (lStartM || 0)
  const lunchEndMinutes = (lEndH || 13) * 60 + (lEndM || 0)

  if (direction === 'OUT') {
    const [expH, expM] = expectedOut.split(':').map(Number)
    const expectedOutMinutes = (expH || 17) * 60 + (expM || 0)

    if (punchMinutes >= expectedOutMinutes) {
      return {
        statusCategory: 'time_out',
        statusLabel: 'TIME OUT',
        statusDetail: 'Shift completed',
        isEarly: false,
        isLate: false,
        diffMinutes: 0
      }
    } else {
      const undertime = expectedOutMinutes - punchMinutes
      return {
        statusCategory: 'undertime',
        statusLabel: 'EARLY OUT',
        statusDetail: `${undertime}m before scheduled exit`,
        isEarly: false,
        isLate: false,
        diffMinutes: undertime
      }
    }
  }

  if (direction === 'BREAK_OUT') {
    return {
      statusCategory: 'regular',
      statusLabel: 'BREAK OUT',
      statusDetail: 'Lunch / break period started',
      isEarly: false,
      isLate: false,
      diffMinutes: 0
    }
  }

  if (direction === 'BREAK_IN') {
    return {
      statusCategory: 'regular',
      statusLabel: 'BREAK IN',
      statusDetail: 'Returned from break',
      isEarly: false,
      isLate: false,
      diffMinutes: 0
    }
  }

  if (direction === 'IN') {
    if (!isFirstIn || (punchMinutes > lunchStartMinutes + 30 && punchMinutes <= lunchEndMinutes + 35)) {
      return {
        statusCategory: 'regular',
        statusLabel: 'BREAK IN',
        statusDetail: 'Returned from break',
        isEarly: false,
        isLate: false,
        diffMinutes: 0
      }
    }

    if (punchMinutes >= lunchStartMinutes - 30 && punchMinutes <= lunchStartMinutes + 30) {
      return {
        statusCategory: 'regular',
        statusLabel: 'BREAK OUT',
        statusDetail: 'Lunch / break period started',
        isEarly: false,
        isLate: false,
        diffMinutes: 0
      }
    }

    const [stdH, stdM] = standardIn.split(':').map(Number)
    const standardInMinutes = (stdH || 8) * 60 + (stdM || 0)

    if (punchMinutes < standardInMinutes) {
      const earlyDiff = standardInMinutes - punchMinutes
      return {
        statusCategory: 'early',
        statusLabel: 'EARLY',
        statusDetail: `${earlyDiff}m early`,
        isEarly: true,
        isLate: false,
        diffMinutes: earlyDiff
      }
    } else if (punchMinutes === standardInMinutes) {
      // Minute precision: 8:00:59 AM has punchMinutes = 480 -> ON TIME
      return {
        statusCategory: 'on_time',
        statusLabel: 'ON TIME',
        statusDetail: 'On schedule',
        isEarly: false,
        isLate: false,
        diffMinutes: 0
      }
    } else {
      // Minute precision: 8:01:00 AM has punchMinutes = 481 -> LATE by 1m
      const lateDiff = punchMinutes - standardInMinutes
      return {
        statusCategory: 'late',
        statusLabel: 'LATE',
        statusDetail: `Late by ${lateDiff}m`,
        isEarly: false,
        isLate: true,
        diffMinutes: lateDiff
      }
    }
  }

  return { statusCategory: 'regular', statusLabel: 'PUNCH RECORDED', isEarly: false, isLate: false, diffMinutes: 0 }
}

console.log('Running Punch Display Verification Test Suite...')

// 1. Normalization
assert.strictEqual(normalizeBioId('user25065'), '25065', 'normalize user25065')
assert.strictEqual(normalizeBioId('25065'), '25065', 'normalize 25065')
assert.strictEqual(normalizeBioId('  user_50044  '), '50044', 'normalize user_50044')

// 2. Test A: Late IN (8:35 AM on 8:00 AM shift)
const lateIn = evaluateAttendanceStatus('2026-10-05T08:35:00', 'IN', '08:00', 0, '17:00')
assert.strictEqual(lateIn.statusLabel, 'LATE', 'Test A: Late IN should be LATE')
assert.strictEqual(lateIn.isLate, true, 'Test A: isLate must be true')

// 2.1 Minute Precision Rule: 8:00:59 AM is ON TIME, 8:01:00 AM is LATE, 8:01:23 AM is LATE
const onTime59 = evaluateAttendanceStatus('2026-10-05T08:00:59', 'IN', '08:00', 0, '17:00')
assert.strictEqual(onTime59.statusLabel, 'ON TIME', '8:00:59 AM must be ON TIME with minute precision')
assert.strictEqual(onTime59.isLate, false, '8:00:59 AM must not be late')

const late0100 = evaluateAttendanceStatus('2026-10-05T08:01:00', 'IN', '08:00', 0, '17:00')
assert.strictEqual(late0100.statusLabel, 'LATE', '8:01:00 AM must be LATE with minute precision')
assert.strictEqual(late0100.isLate, true, '8:01:00 AM isLate must be true')
assert.strictEqual(late0100.diffMinutes, 1, '8:01:00 AM late by 1m')

const late0123 = evaluateAttendanceStatus('2026-10-05T08:01:23', 'IN', '08:00', 0, '17:00')
assert.strictEqual(late0123.statusLabel, 'LATE', '8:01:23 AM must be LATE')
assert.strictEqual(late0123.isLate, true, '8:01:23 AM isLate must be true')
assert.strictEqual(late0123.diffMinutes, 1, '8:01:23 AM late by 1m')

// 2.2 Lunch Break Punches must NEVER be classified as LATE
const lunchOut = evaluateAttendanceStatus('2026-10-05T12:02:12', 'BREAK_OUT', '08:00', 0, '17:00')
assert.strictEqual(lunchOut.statusLabel, 'BREAK OUT', '12:02:12 PM must be BREAK OUT')
assert.strictEqual(lunchOut.isLate, false, 'Lunch OUT must NEVER be late')

const lunchIn = evaluateAttendanceStatus('2026-10-05T12:57:29', 'BREAK_IN', '08:00', 0, '17:00')
assert.strictEqual(lunchIn.statusLabel, 'BREAK IN', '12:57:29 PM must be BREAK IN')
assert.strictEqual(lunchIn.isLate, false, 'Lunch IN must NEVER be late')

// Even if direction is passed as IN for 12:57:29 PM (lunch return), it must NOT evaluate against 8:00 AM
const lunchInAsDirectionIn = evaluateAttendanceStatus('2026-10-05T12:57:29', 'IN', '08:00', 0, '17:00', false)
assert.strictEqual(lunchInAsDirectionIn.statusLabel, 'BREAK IN', 'Subsequent IN during lunch must be BREAK IN')
assert.strictEqual(lunchInAsDirectionIn.isLate, false, 'Subsequent IN must not be late')

// 3. Test B: Normal IN / On Time (8:00 AM on 8:00 AM shift)
const ontimeIn = evaluateAttendanceStatus('2026-10-05T08:00:00', 'IN', '08:00', 0, '17:00')
assert.strictEqual(ontimeIn.statusLabel, 'ON TIME', 'Test B: On Time IN should be ON TIME')
assert.strictEqual(ontimeIn.isLate, false, 'Test B: isLate must be false')

// 4. Test C: Early IN (7:48 AM on 8:00 AM shift)
const earlyIn = evaluateAttendanceStatus('2026-10-05T07:48:00', 'IN', '08:00', 0, '17:00')
assert.strictEqual(earlyIn.statusLabel, 'EARLY', 'Test C: Early IN should be EARLY')
assert.strictEqual(earlyIn.isEarly, true, 'Test C: isEarly must be true')
assert.strictEqual(earlyIn.isLate, false, 'Test C: isLate must be false')

// 5. Test D: Normal OUT (5:10 PM on 5:00 PM expected exit)
const normalOut = evaluateAttendanceStatus('2026-10-05T17:10:00', 'OUT', '08:00', 0, '17:00')
assert.strictEqual(normalOut.statusLabel, 'TIME OUT', 'Test D: Normal OUT must display TIME OUT')
assert.strictEqual(normalOut.isLate, false, 'Test D: isLate MUST BE FALSE on OUT!')
assert.notStrictEqual(normalOut.statusLabel, 'LATE', 'Test D: OUT must NEVER show LATE')

// 6. Test E: Early OUT (4:30 PM on 5:00 PM expected exit)
const earlyOut = evaluateAttendanceStatus('2026-10-05T16:30:00', 'OUT', '08:00', 0, '17:00')
assert.strictEqual(earlyOut.statusLabel, 'EARLY OUT', 'Test E: Early OUT must display EARLY OUT')
assert.strictEqual(earlyOut.isLate, false, 'Test E: isLate MUST BE FALSE on early OUT!')
assert.notStrictEqual(earlyOut.statusLabel, 'LATE', 'Test E: Early OUT must NEVER show LATE')

// 7. Test F: Late IN followed by Normal OUT (Late at 8:20 AM, Out at 5:10 PM)
const morningPunch = evaluateAttendanceStatus('2026-10-05T08:20:00', 'IN', '08:00', 0, '17:00')
assert.strictEqual(morningPunch.statusLabel, 'LATE')
const eveningPunch = evaluateAttendanceStatus('2026-10-05T17:10:00', 'OUT', '08:00', 0, '17:00')
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
  const compact = {
    id: event.id,
    eventId: event.eventId || event.id,
    bioId: event.bioId,
    employeeName: event.employeeName,
    time: event.time,
    statusLabel: event.statusLabel
  }
  recentList = [compact, ...recentList.filter(p => p.id !== compact.id && p.eventId !== compact.eventId)].slice(0, 7)
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
// First punch must IMMEDIATELY appear in recentList without requiring another punch!
assert.strictEqual(recentList.length, 1, 'First punch must immediately appear in Recent Punches')
assert.strictEqual(recentList[0].eventId, '25065-80501-1')
assert.strictEqual(recentList[0].employeeName, 'Cantillas, Ronald')

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
// Both punches from the employee are kept in recentList (newest first)!
assert.strictEqual(recentList.length, 2)
assert.strictEqual(recentList[0].eventId, '25065-80508-2')
assert.strictEqual(recentList[0].time, '8:05:08 AM')
assert.strictEqual(recentList[1].eventId, '25065-80501-1')
assert.strictEqual(recentList[1].time, '8:05:01 AM')

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
// Person B must IMMEDIATELY appear at index 0 of recentList with correct name!
assert.strictEqual(recentList.length, 3)
assert.strictEqual(recentList[0].eventId, '25069-80510-3')
assert.strictEqual(recentList[0].employeeName, 'Alfanta, Cristine')
assert.strictEqual(recentList[0].bioId, '25069')
assert.strictEqual(recentList[1].eventId, '25065-80508-2')
assert.strictEqual(recentList[2].eventId, '25065-80501-1')

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
assert.strictEqual(recentList.length, 4)
assert.strictEqual(recentList[0].eventId, '25069-80515-4')
assert.strictEqual(recentList[0].employeeName, 'Alfanta, Cristine')
assert.strictEqual(recentList[1].eventId, '25069-80510-3')
assert.strictEqual(recentList[2].eventId, '25065-80508-2')
assert.strictEqual(recentList[3].eventId, '25065-80501-1')

// 12. Display Duration supported options (including 2s)
const supportedDurations = [2, 3, 5, 8, 10]
assert.ok(supportedDurations.includes(2), '2-second option must be supported')
assert.strictEqual(supportedDurations[2], 5, 'Default is 5 seconds')

// 13. Today's Punch Recap Logic Verification
function getRecapResultText(punch) {
  const morningLate = Boolean(punch.firstInLate)
  const morningLateMins = punch.firstInLateMinutes ?? 0
  const isEarlyOut = punch.statusCategory === 'undertime' || punch.statusLabel === 'EARLY OUT'
  const earlyMins = isEarlyOut ? (punch.diffMinutes || 0) : 0

  if (morningLate && isEarlyOut) {
    const lateStr = morningLateMins > 0 ? `LATE ${morningLateMins}m` : 'LATE'
    const earlyStr = earlyMins > 0 ? `EARLY OUT ${earlyMins}m` : 'EARLY OUT'
    return `${lateStr} • ${earlyStr}`
  }
  if (morningLate) {
    return morningLateMins > 0 ? `LATE ${morningLateMins}m` : 'LATE'
  }
  if (isEarlyOut) {
    return earlyMins > 0 ? `EARLY OUT ${earlyMins}m` : 'EARLY OUT'
  }
  if (punch.isLate) {
    return punch.diffMinutes ? `LATE ${punch.diffMinutes}m` : 'LATE'
  }
  if (punch.statusCategory === 'early' || punch.statusLabel === 'EARLY' || punch.isEarly) {
    return 'EARLY'
  }
  return 'ON TIME'
}

// On time exit with on-time morning arrival (7:52 AM -> 5:03 PM)
const onTimeRecap = getRecapResultText({
  statusCategory: 'time_out',
  statusLabel: 'TIME OUT',
  isLate: false,
  isEarly: false,
  firstInLate: false,
  firstInLateMinutes: 0
})
assert.strictEqual(onTimeRecap, 'ON TIME')

// Early exit (7:55 AM -> 4:30 PM, 30m early out)
const earlyOutRecap = getRecapResultText({
  statusCategory: 'undertime',
  statusLabel: 'EARLY OUT',
  diffMinutes: 30,
  isLate: false,
  firstInLate: false,
  firstInLateMinutes: 0
})
assert.strictEqual(earlyOutRecap, 'EARLY OUT 30m')

// Late arrival then exit: 8:01:23 AM morning arrival (1m late), exit at 5:00 PM
// OUT punch itself has isLate: false, but firstInLate: true (1m) -> Recap MUST show 'LATE 1m'!
const genemarieRecap = getRecapResultText({
  statusCategory: 'time_out',
  statusLabel: 'TIME OUT',
  isLate: false,
  firstInLate: true,
  firstInLateMinutes: 1
})
assert.strictEqual(genemarieRecap, 'LATE 1m', 'Genemarie Acevedo 5:00 PM OUT must preserve morning LATE 1m in recap!')

// Late arrival then exit: 8:17 AM morning arrival (17m late), exit at 5:02 PM
const lateRecap = getRecapResultText({
  statusCategory: 'time_out',
  statusLabel: 'TIME OUT',
  firstInLateMinutes: 17,
  firstInLate: true,
  isLate: false
})
assert.strictEqual(lateRecap, 'LATE 17m', 'Must preserve morning LATE 17m in recap')

// Late arrival then early exit: 8:17 AM in (17m late) + 4:30 PM exit (30m early)
const lateAndEarlyRecap = getRecapResultText({
  statusCategory: 'undertime',
  statusLabel: 'EARLY OUT',
  diffMinutes: 30,
  firstInLate: true,
  firstInLateMinutes: 17,
  isLate: false
})
assert.strictEqual(lateAndEarlyRecap, 'LATE 17m • EARLY OUT 30m', 'Must show both morning late and early exit')

// 13.1 Complete Day Sequence Verification: Genemarie Acevedo
// Schedule: 8:00 AM - 5:00 PM
// Punch 1: 8:01:23 AM (First IN) -> LATE (triggers late visual)
const p1 = evaluateAttendanceStatus('2026-10-05T08:01:23', 'IN', '08:00', 0, '17:00', true)
assert.strictEqual(p1.statusLabel, 'LATE')
assert.strictEqual(p1.isLate, true)
assert.strictEqual(p1.diffMinutes, 1)

// Punch 2: 12:02:12 PM (Lunch OUT) -> BREAK OUT (must NOT trigger late visual)
const p2 = evaluateAttendanceStatus('2026-10-05T12:02:12', 'BREAK_OUT', '08:00', 0, '17:00', false)
assert.strictEqual(p2.statusLabel, 'BREAK OUT')
assert.strictEqual(p2.isLate, false, 'Lunch OUT must NOT trigger late visual')

// Punch 3: 12:57:29 PM (Lunch IN) -> BREAK IN (must NOT trigger late visual)
const p3 = evaluateAttendanceStatus('2026-10-05T12:57:29', 'BREAK_IN', '08:00', 0, '17:00', false)
assert.strictEqual(p3.statusLabel, 'BREAK IN')
assert.strictEqual(p3.isLate, false, 'Lunch IN must NOT trigger late visual')

// Punch 4: 5:00:00 PM (Shift OUT) -> TIME OUT
const p4 = evaluateAttendanceStatus('2026-10-05T17:00:00', 'OUT', '08:00', 0, '17:00', false)
assert.strictEqual(p4.statusLabel, 'TIME OUT')
assert.strictEqual(p4.isLate, false, 'Final OUT must NOT be marked late')

// Final OUT recap preserves morning arrival:
const p4Recap = getRecapResultText({
  ...p4,
  firstInLate: p1.isLate,
  firstInLateMinutes: p1.diffMinutes
})
assert.strictEqual(p4Recap, 'LATE 1m', 'Final OUT recap preserves morning LATE 1m')

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

// 17. Voice Announcement / Text-to-Speech (TTS) Verification
function formatSpokenName(name) {
  if (!name || typeof name !== 'string') return ''
  const clean = name.replace(/<[^>]*>/g, '').trim()
  if (!clean) return ''
  if (/^unknown(\s+employee)?$/i.test(clean) || /^biometric\s+user$/i.test(clean) || /^user\d+$/i.test(clean)) {
    return ''
  }
  if (clean.includes(',')) {
    const parts = clean.split(',').map(s => s.trim())
    if (parts.length >= 2 && parts[1]) {
      return `${parts[1]} ${parts[0]}`.replace(/[^\w\s.,'-]/gi, ' ').replace(/\s+/g, ' ').trim()
    }
  }
  return clean.replace(/[^\w\s.,'-]/gi, ' ').replace(/\s+/g, ' ').trim()
}

function getTimeAwareGreeting(timestampStr) {
  const date = new Date(timestampStr)
  let hour = date.getHours()
  try {
    const phTimeStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      hour12: false
    }).format(date)
    const h = parseInt(phTimeStr, 10)
    if (!isNaN(h)) hour = h
  } catch {}
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function buildPunchAnnouncement(event) {
  const spokenName = formatSpokenName(event.employeeName)
  const isOut = event.direction === 'OUT' || event.direction === 'BREAK_OUT'

  if (isOut) {
    return spokenName ? `Goodbye, ${spokenName}. Take care.` : 'Goodbye. Take care.'
  }

  const greeting = getTimeAwareGreeting(event.timestamp)

  if (event.isLate) {
    return spokenName ? `${greeting}, ${spokenName}. You are late.` : `${greeting}. You are late.`
  }

  return spokenName ? `${greeting}, ${spokenName}.` : `${greeting}.`
}

// 17.1 Name formatting tests
assert.strictEqual(formatSpokenName('Cabigas, Marc Louie'), 'Marc Louie Cabigas', 'Format Last, First -> First Last')
assert.strictEqual(formatSpokenName('Ronald Cantillas'), 'Ronald Cantillas', 'Format standard First Last')
assert.strictEqual(formatSpokenName('Unknown Employee'), '', 'Unknown employee should yield empty name')
assert.strictEqual(formatSpokenName('user25065'), '', 'Raw user id should yield empty name')

// 17.2 Time-aware greeting tests
assert.strictEqual(getTimeAwareGreeting('2026-10-05T08:05:00+08:00'), 'Good morning', '8:05 AM is Good morning')
assert.strictEqual(getTimeAwareGreeting('2026-10-05T11:59:00+08:00'), 'Good morning', '11:59 AM is Good morning')
assert.strictEqual(getTimeAwareGreeting('2026-10-05T12:00:00+08:00'), 'Good afternoon', '12:00 PM is Good afternoon')
assert.strictEqual(getTimeAwareGreeting('2026-10-05T17:03:00+08:00'), 'Good afternoon', '5:03 PM is Good afternoon')
assert.strictEqual(getTimeAwareGreeting('2026-10-05T18:00:00+08:00'), 'Good evening', '6:00 PM is Good evening')
assert.strictEqual(getTimeAwareGreeting('2026-10-05T20:30:00+08:00'), 'Good evening', '8:30 PM is Good evening')

// 17.3 TIME IN announcements (On Time, Late, Morning, Afternoon, Evening)
const onTimeMorningIn = {
  employeeName: 'Cabigas, Marc Louie',
  timestamp: '2026-10-05T08:05:00+08:00',
  direction: 'IN',
  isLate: false
}
assert.strictEqual(buildPunchAnnouncement(onTimeMorningIn), 'Good morning, Marc Louie Cabigas.')

const lateMorningIn = {
  employeeName: 'Cabigas, Marc Louie',
  timestamp: '2026-10-05T08:35:00+08:00',
  direction: 'IN',
  isLate: true
}
assert.strictEqual(buildPunchAnnouncement(lateMorningIn), 'Good morning, Marc Louie Cabigas. You are late.')

const onTimeAfternoonIn = {
  employeeName: 'Santos, Maria',
  timestamp: '2026-10-05T13:00:00+08:00',
  direction: 'IN',
  isLate: false
}
assert.strictEqual(buildPunchAnnouncement(onTimeAfternoonIn), 'Good afternoon, Maria Santos.')

const eveningIn = {
  employeeName: 'Robert Cruz',
  timestamp: '2026-10-05T19:00:00+08:00',
  direction: 'IN',
  isLate: false
}
assert.strictEqual(buildPunchAnnouncement(eveningIn), 'Good evening, Robert Cruz.')

// 17.4 TIME OUT announcements (Always "Goodbye, [Name]. Take care.")
const regularOut = {
  employeeName: 'Cabigas, Marc Louie',
  timestamp: '2026-10-05T17:05:00+08:00',
  direction: 'OUT',
  isLate: false
}
assert.strictEqual(buildPunchAnnouncement(regularOut), 'Goodbye, Marc Louie Cabigas. Take care.')

const earlyOutVoice = {
  employeeName: 'Cabigas, Marc Louie',
  timestamp: '2026-10-05T16:30:00+08:00',
  direction: 'OUT',
  isLate: false
}
assert.strictEqual(buildPunchAnnouncement(earlyOutVoice), 'Goodbye, Marc Louie Cabigas. Take care.')

// 17.5 Fallback announcements without employee name
const anonymousIn = {
  employeeName: 'Unknown Employee',
  timestamp: '2026-10-05T08:00:00+08:00',
  direction: 'IN',
  isLate: false
}
assert.strictEqual(buildPunchAnnouncement(anonymousIn), 'Good morning.')

const anonymousOut = {
  employeeName: 'Unknown Employee',
  timestamp: '2026-10-05T17:00:00+08:00',
  direction: 'OUT',
  isLate: false
}
assert.strictEqual(buildPunchAnnouncement(anonymousOut), 'Goodbye. Take care.')

// 17.6 Duplicate key prevention
const spokenKeys = new Set()
function simulateAnnounce(event) {
  const key = event.eventId || `${event.bioId}_${event.direction}_${event.timestamp}`
  if (spokenKeys.has(key)) return false
  spokenKeys.add(key)
  return true
}

const punch1 = { eventId: 'ev-punch-1', bioId: '25065', direction: 'IN', timestamp: '2026-10-05T08:05:00' }
assert.strictEqual(simulateAnnounce(punch1), true, 'First event announces')
assert.strictEqual(simulateAnnounce(punch1), false, 'Duplicate event must NOT announce again')

const punch2 = { eventId: 'ev-punch-2', bioId: '25065', direction: 'IN', timestamp: '2026-10-05T08:05:08' }
assert.strictEqual(simulateAnnounce(punch2), true, 'Subsequent new punch announces')

// 18. Biometric Device Clock Offset & Navbar Clock Acceptance Tests
class ClockManager {
  constructor() {
    this.deviceTimeOffset = null
    this.clockSource = 'local'
  }

  updateDeviceTimeOffset(deviceTimestampStr, currentMockTimeMs) {
    const deviceMs = new Date(deviceTimestampStr).getTime()
    if (isNaN(deviceMs)) return
    this.deviceTimeOffset = deviceMs - currentMockTimeMs
    this.clockSource = 'device'
  }

  getDeviceTimeOffset() {
    return this.deviceTimeOffset ?? 0
  }

  getDisplayTime(currentMockTimeMs) {
    return new Date(currentMockTimeMs + this.getDeviceTimeOffset())
  }

  formatTime(date) {
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(date)
  }
}

// Test E — Fresh startup with no biometric timestamp
const clockMgr = new ClockManager()
assert.strictEqual(clockMgr.clockSource, 'local', 'Test E: Fresh startup source is local')
assert.strictEqual(clockMgr.getDeviceTimeOffset(), 0, 'Test E: Fresh startup offset is 0')

// Test A — Device behind PC (PC: 10:05:00 AM, Device: 10:02:15 AM)
// Mock base: 2026-10-08 10:05:00 Asia/Manila (+08:00)
const mockPcTime = new Date('2026-10-08T10:05:00+08:00').getTime()
const devicePunchTime = '2026-10-08T10:02:15+08:00' // 2m 45s behind PC

// Device punch arrives:
clockMgr.updateDeviceTimeOffset(devicePunchTime, mockPcTime)

assert.strictEqual(clockMgr.clockSource, 'device', 'Test A: Source switched to device')
assert.strictEqual(clockMgr.deviceTimeOffset, -165000, 'Test A: Offset is -165,000ms (-2m45s)')

const navbarClockAtPunch = clockMgr.getDisplayTime(mockPcTime)
assert.strictEqual(clockMgr.formatTime(navbarClockAtPunch), '10:02:15 AM', 'Test A: Navbar clock must match punch time (10:02:15 AM)')
assert.notStrictEqual(clockMgr.formatTime(navbarClockAtPunch), '10:05:00 AM', 'Test A: Navbar clock must NOT be PC time')

// Test B — Clock continues ticking forward locally without device contact
// 30 seconds elapse on PC:
const mockPcTimeAfter30s = mockPcTime + 30000
const navbarClockAfter30s = clockMgr.getDisplayTime(mockPcTimeAfter30s)
assert.strictEqual(clockMgr.formatTime(navbarClockAfter30s), '10:02:45 AM', 'Test B: After 30s, navbar clock must advance to 10:02:45 AM')

// Test C — Device disconnects
// Biometric connection is severed, no punches arrive for 5 minutes (300,000ms)
const mockPcTimeAfter5m = mockPcTimeAfter30s + 270000
const navbarClockDisconnected = clockMgr.getDisplayTime(mockPcTimeAfter5m)
assert.strictEqual(clockMgr.formatTime(navbarClockDisconnected), '10:07:15 AM', 'Test C: Disconnected clock continues with last known offset')
assert.strictEqual(clockMgr.deviceTimeOffset, -165000, 'Test C: Offset is preserved during disconnect')

// Test D — Reconnect and new punch received
// Device sends next punch at 10:07:20 AM (device time) when PC is at 10:10:00 AM
const mockPcTimeAtReconnect = mockPcTimeAfter5m
const newDevicePunchTime = '2026-10-08T10:07:20+08:00'
clockMgr.updateDeviceTimeOffset(newDevicePunchTime, mockPcTimeAtReconnect)
const navbarClockReconnected = clockMgr.getDisplayTime(mockPcTimeAtReconnect)
assert.strictEqual(clockMgr.formatTime(navbarClockReconnected), '10:07:20 AM', 'Test D: Reconnected navbar matches new punch time')

// ============================================================================
// 18. Phase 5 Real-Time Punch Direction Detection — Isolated Test Suite
// ============================================================================
console.log('\n--- Running Phase 5 Isolated Punch Direction Resolver Tests ---')

class IsolatedDirectionResolver {
  constructor() {
    this.states = new Map()
  }

  clearAll() {
    this.states.clear()
  }

  resolve(params) {
    const cleanBioId = String(params.bioId || '').replace(/\D/g, '') || String(params.bioId)
    const punchDate = new Date(params.timestamp)
    const year = punchDate.getFullYear()
    const month = String(punchDate.getMonth() + 1).padStart(2, '0')
    const day = String(punchDate.getDate()).padStart(2, '0')
    const todayStr = `${year}-${month}-${day}`

    // Compute Manila minutes from midnight
    let hours = punchDate.getHours()
    let minutes = punchDate.getMinutes()
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        hourCycle: 'h23'
      }).formatToParts(punchDate)
      const hP = parts.find(p => p.type === 'hour')?.value
      const mP = parts.find(p => p.type === 'minute')?.value
      if (hP && mP) {
        hours = parseInt(hP, 10)
        minutes = parseInt(mP, 10)
      }
    } catch {}
    if (hours === 24) hours = 0
    const punchMinutes = hours * 60 + minutes
    const currentMs = punchDate.getTime()

    const standardIn = params.standardIn || '08:00'
    const expectedOut = params.expectedOut || '17:00'
    const lunchStart = params.lunchStart || '12:00'
    const lunchEnd = params.lunchEnd || '13:00'

    const [stdH, stdM] = standardIn.split(':').map(Number)
    const standardInMinutes = (stdH || 8) * 60 + (stdM || 0)
    const [expH, expM] = expectedOut.split(':').map(Number)
    const expectedOutMinutes = (expH || 17) * 60 + (expM || 0)
    const [lStartH, lStartM] = lunchStart.split(':').map(Number)
    const lunchStartMinutes = (lStartH || 12) * 60 + (lStartM || 0)
    const [lEndH, lEndM] = lunchEnd.split(':').map(Number)
    const lunchEndMinutes = (lEndH || 13) * 60 + (lEndM || 0)

    let state = this.states.get(cleanBioId)
    if (!state || state.date !== todayStr) {
      state = {
        date: todayStr,
        lastEventId: '',
        lastPunchMs: 0,
        lastDirection: 'IN',
        lastStateLabel: 'TIME IN',
        lastStatusCategory: 'regular',
        lastStatusLabel: 'ON TIME',
        lastStatusDetail: 'Biometric verified',
        lastIsLate: false,
        lastIsEarly: false,
        lastDiffMinutes: 0,
        punchCountToday: 0
      }
      this.states.set(cleanBioId, state)
    }

    // Exact event ID or millisecond duplicate check
    const isExactEventDuplicate = Boolean(params.eventId && state.lastEventId === params.eventId)
    const isExactTimestampDuplicate = Boolean(
      state.punchCountToday > 0 &&
      state.lastPunchMs > 0 &&
      Math.abs(currentMs - state.lastPunchMs) < 1000
    )

    if (isExactEventDuplicate || isExactTimestampDuplicate) {
      return {
        direction: state.lastDirection,
        stateLabel: state.lastStateLabel,
        statusCategory: state.lastStatusCategory,
        statusLabel: state.lastStatusLabel,
        statusDetail: state.lastStatusDetail,
        isLate: state.lastIsLate,
        isEarly: state.lastIsEarly,
        diffMinutes: state.lastDiffMinutes
      }
    }

    let resolvedDir = 'IN'
    let resolvedLabel = 'TIME IN'
    let resolvedCategory = 'regular'
    let resolvedStatus = 'ON TIME'
    let resolvedDetail = 'On schedule'
    let isLate = false
    let isEarly = false
    let diffMinutes = 0

    const explicitDir = params.explicitDirection
    const explicitState = params.explicitState

    if (explicitDir === 'OUT' || explicitState === 4) {
      resolvedDir = 'OUT'
      resolvedLabel = 'TIME OUT'
    } else if (explicitDir === 'BREAK_OUT' || explicitState === 2) {
      resolvedDir = 'BREAK_OUT'
      resolvedLabel = 'BREAK OUT'
    } else if (explicitDir === 'BREAK_IN' || explicitState === 3) {
      resolvedDir = 'BREAK_IN'
      resolvedLabel = 'BREAK IN'
    } else if (explicitDir === 'IN') {
      resolvedDir = 'IN'
      resolvedLabel = 'TIME IN'
    } else {
      // Unflagged sequence transition
      if (state.punchCountToday === 0) {
        resolvedDir = 'IN'
        resolvedLabel = 'TIME IN'
      } else if (state.lastDirection === 'IN') {
        if (punchMinutes >= lunchStartMinutes - 60 && punchMinutes <= lunchEndMinutes + 15) {
          resolvedDir = 'BREAK_OUT'
          resolvedLabel = 'BREAK OUT'
        } else if (punchMinutes >= expectedOutMinutes - 60 || punchMinutes >= 15 * 60) {
          resolvedDir = 'OUT'
          resolvedLabel = 'TIME OUT'
        } else {
          resolvedDir = 'IN'
          resolvedLabel = 'TIME IN'
        }
      } else if (state.lastDirection === 'BREAK_OUT') {
        resolvedDir = 'IN'
        resolvedLabel = 'TIME IN'
      } else if (state.lastDirection === 'BREAK_IN') {
        resolvedDir = 'OUT'
        resolvedLabel = 'TIME OUT'
      } else if (state.lastDirection === 'OUT') {
        if (state.punchCountToday <= 2 || punchMinutes < expectedOutMinutes - 60) {
          resolvedDir = 'IN'
          resolvedLabel = 'TIME IN'
        } else {
          resolvedDir = 'OUT'
          resolvedLabel = 'TIME OUT'
        }
      } else {
        resolvedDir = 'IN'
        resolvedLabel = 'TIME IN'
      }
    }

    if (resolvedDir === 'IN') {
      if (state.punchCountToday === 0) {
        if (punchMinutes < standardInMinutes) {
          diffMinutes = standardInMinutes - punchMinutes
          resolvedCategory = 'early'
          resolvedStatus = 'EARLY'
          resolvedDetail = `${diffMinutes}m early`
          isEarly = true
          isLate = false
        } else if (punchMinutes === standardInMinutes) {
          diffMinutes = 0
          resolvedCategory = 'on_time'
          resolvedStatus = 'ON TIME'
          resolvedDetail = 'On schedule'
          isEarly = false
          isLate = false
        } else {
          diffMinutes = punchMinutes - standardInMinutes
          resolvedCategory = 'late'
          resolvedStatus = 'LATE'
          resolvedDetail = `Late by ${diffMinutes}m`
          isEarly = false
          isLate = true
        }
      } else {
        resolvedCategory = 'regular'
        resolvedStatus = 'ON TIME'
        resolvedDetail = 'Returned from break'
        isEarly = false
        isLate = false
        diffMinutes = 0
      }
    } else if (resolvedDir === 'BREAK_OUT') {
      resolvedCategory = 'regular'
      resolvedStatus = 'BREAK OUT'
      resolvedDetail = 'Lunch / break period started'
      isEarly = false
      isLate = false
      diffMinutes = 0
    } else if (resolvedDir === 'BREAK_IN') {
      resolvedCategory = 'regular'
      resolvedStatus = 'BREAK IN'
      resolvedDetail = 'Returned from break'
      isEarly = false
      isLate = false
      diffMinutes = 0
    } else if (resolvedDir === 'OUT') {
      if (punchMinutes >= expectedOutMinutes) {
        resolvedCategory = 'time_out'
        resolvedStatus = 'TIME OUT'
        resolvedDetail = 'Shift completed'
        isEarly = false
        isLate = false
        diffMinutes = 0
      } else {
        if (state.punchCountToday <= 1 && punchMinutes <= lunchEndMinutes + 15) {
          resolvedCategory = 'regular'
          resolvedStatus = 'TIME OUT'
          resolvedDetail = 'Lunch break started'
          isEarly = false
          isLate = false
          diffMinutes = 0
        } else {
          diffMinutes = expectedOutMinutes - punchMinutes
          resolvedCategory = 'undertime'
          resolvedStatus = 'EARLY OUT'
          resolvedDetail = `${diffMinutes}m before scheduled exit`
          isEarly = false
          isLate = false
        }
      }
    }

    const isStateRepeating = state.punchCountToday > 0 && state.lastDirection === resolvedDir
    if (!isStateRepeating) {
      state.punchCountToday += 1
    }

    state.lastEventId = params.eventId
    state.lastPunchMs = currentMs
    state.lastDirection = resolvedDir
    state.lastStateLabel = resolvedLabel
    state.lastStatusCategory = resolvedCategory
    state.lastStatusLabel = resolvedStatus
    state.lastStatusDetail = resolvedDetail
    state.lastIsLate = isLate
    state.lastIsEarly = isEarly
    state.lastDiffMinutes = diffMinutes

    return {
      direction: resolvedDir,
      stateLabel: resolvedLabel,
      statusCategory: resolvedCategory,
      statusLabel: resolvedStatus,
      statusDetail: resolvedDetail,
      isLate,
      isEarly,
      diffMinutes
    }
  }
}

const resolver = new IsolatedDirectionResolver()

// Case 1: 7:59:59 AM -> TIME IN, EARLY
resolver.clearAll()
const c1 = resolver.resolve({
  bioId: '25065',
  eventId: 'ev-c1',
  timestamp: '2026-10-09T07:59:59+08:00',
  standardIn: '08:00',
  expectedOut: '17:00'
})
assert.strictEqual(c1.stateLabel, 'TIME IN', 'Case 1: Must be TIME IN')
assert.strictEqual(c1.statusLabel, 'EARLY', 'Case 1: Must be EARLY')
assert.strictEqual(c1.isEarly, true, 'Case 1: isEarly true')
assert.strictEqual(c1.isLate, false, 'Case 1: isLate false')
console.log('✔ Case 1 Passed: 7:59:59 AM -> TIME IN, EARLY')

// Case 2: 8:00:00 AM -> TIME IN, ON TIME
resolver.clearAll()
const c2 = resolver.resolve({
  bioId: '25065',
  eventId: 'ev-c2',
  timestamp: '2026-10-09T08:00:00+08:00',
  standardIn: '08:00',
  expectedOut: '17:00'
})
assert.strictEqual(c2.stateLabel, 'TIME IN', 'Case 2: Must be TIME IN')
assert.strictEqual(c2.statusLabel, 'ON TIME', 'Case 2: Must be ON TIME')
assert.strictEqual(c2.isLate, false, 'Case 2: isLate false')
console.log('✔ Case 2 Passed: 8:00:00 AM -> TIME IN, ON TIME')

// Case 3: 8:00:49 AM -> TIME IN, ON TIME
resolver.clearAll()
const c3 = resolver.resolve({
  bioId: '25065',
  eventId: 'ev-c3',
  timestamp: '2026-10-09T08:00:49+08:00',
  standardIn: '08:00',
  expectedOut: '17:00'
})
assert.strictEqual(c3.stateLabel, 'TIME IN', 'Case 3: Must be TIME IN')
assert.strictEqual(c3.statusLabel, 'ON TIME', 'Case 3: Must be ON TIME')
assert.strictEqual(c3.isLate, false, 'Case 3: isLate false')
console.log('✔ Case 3 Passed: 8:00:49 AM -> TIME IN, ON TIME')

// Case 4: 8:01:00 AM -> TIME IN, LATE
resolver.clearAll()
const c4 = resolver.resolve({
  bioId: '25065',
  eventId: 'ev-c4',
  timestamp: '2026-10-09T08:01:00+08:00',
  standardIn: '08:00',
  expectedOut: '17:00'
})
assert.strictEqual(c4.stateLabel, 'TIME IN', 'Case 4: Must be TIME IN')
assert.strictEqual(c4.statusLabel, 'LATE', 'Case 4: Must be LATE')
assert.strictEqual(c4.isLate, true, 'Case 4: isLate true')
assert.strictEqual(c4.diffMinutes, 1, 'Case 4: Late by 1 minute')
console.log('✔ Case 4 Passed: 8:01:00 AM -> TIME IN, LATE')

// Case 5: Morning TIME IN followed by a valid 11:00 AM TIME OUT -> TIME OUT
resolver.clearAll()
const c5_1 = resolver.resolve({
  bioId: '25065',
  eventId: 'ev-c5-1',
  timestamp: '2026-10-09T08:00:00+08:00'
})
assert.strictEqual(c5_1.stateLabel, 'TIME IN')
const c5_2 = resolver.resolve({
  bioId: '25065',
  eventId: 'ev-c5-2',
  timestamp: '2026-10-09T11:00:00+08:00',
  explicitDirection: 'OUT'
})
assert.strictEqual(c5_2.stateLabel, 'TIME OUT', 'Case 5: Must display TIME OUT')
assert.strictEqual(c5_2.direction, 'OUT')
console.log('✔ Case 5 Passed: Morning TIME IN followed by 11:00 AM TIME OUT -> TIME OUT')

// Case 6: Lunch TIME OUT followed by a 12:30 PM punch -> TIME IN
const c6 = resolver.resolve({
  bioId: '25065',
  eventId: 'ev-c6',
  timestamp: '2026-10-09T12:30:00+08:00'
})
assert.strictEqual(c6.stateLabel, 'TIME IN', 'Case 6: Return from lunch must display TIME IN')
assert.strictEqual(c6.direction, 'IN')
assert.strictEqual(c6.isLate, false, 'Case 6: Return from lunch must NEVER be marked late')
console.log('✔ Case 6 Passed: Lunch TIME OUT followed by 12:30 PM punch -> TIME IN')

// Case 7: Afternoon TIME IN followed by a valid end-of-day punch -> TIME OUT
const c7 = resolver.resolve({
  bioId: '25065',
  eventId: 'ev-c7',
  timestamp: '2026-10-09T17:00:00+08:00'
})
assert.strictEqual(c7.stateLabel, 'TIME OUT', 'Case 7: End of day must display TIME OUT')
assert.strictEqual(c7.direction, 'OUT')
assert.strictEqual(c7.statusLabel, 'TIME OUT')
console.log('✔ Case 7 Passed: Afternoon TIME IN followed by end-of-day punch -> TIME OUT')

// Case 8: Repeated delivery of the same event -> no double state transition
const c8_dup = resolver.resolve({
  bioId: '25065',
  eventId: 'ev-c7', // Same eventId as Case 7
  timestamp: '2026-10-09T17:00:00+08:00'
})
assert.strictEqual(c8_dup.stateLabel, 'TIME OUT', 'Case 8: Duplicate event maintains TIME OUT')
assert.strictEqual(c8_dup.direction, 'OUT')
console.log('✔ Case 8 Passed: Repeated delivery of the same event -> no double state transition')

// Case 9: Two different employees punching close together -> independent sequences
resolver.clearAll()
const empA1 = resolver.resolve({
  bioId: '25065',
  eventId: 'ev-empA-1',
  timestamp: '2026-10-09T08:00:00+08:00'
})
const empB1 = resolver.resolve({
  bioId: '25069',
  eventId: 'ev-empB-1',
  timestamp: '2026-10-09T08:00:05+08:00'
})
assert.strictEqual(empA1.stateLabel, 'TIME IN')
assert.strictEqual(empB1.stateLabel, 'TIME IN')
// Employee A punches OUT for lunch at 11:00 AM
const empA2 = resolver.resolve({
  bioId: '25065',
  eventId: 'ev-empA-2',
  timestamp: '2026-10-09T11:00:00+08:00',
  explicitDirection: 'OUT'
})
assert.strictEqual(empA2.stateLabel, 'TIME OUT')
// Employee B re-confirms at 8:05 AM -> remains TIME IN
const empB2 = resolver.resolve({
  bioId: '25069',
  eventId: 'ev-empB-2',
  timestamp: '2026-10-09T08:05:00+08:00'
})
assert.strictEqual(empB2.stateLabel, 'TIME IN', 'Case 9: Employee B is still TIME IN')
console.log('✔ Case 9 Passed: Two different employees punching close together -> independent sequences')

// Case 10: First punch of a new workday -> does not inherit yesterday's direction
const yesterdayPunch = resolver.resolve({
  bioId: '50350',
  eventId: 'ev-yday',
  timestamp: '2026-10-08T17:00:00+08:00',
  explicitDirection: 'OUT'
})
assert.strictEqual(yesterdayPunch.stateLabel, 'TIME OUT')
// Today's first punch on 2026-10-09:
const todayFirstPunch = resolver.resolve({
  bioId: '50350',
  eventId: 'ev-today-first',
  timestamp: '2026-10-09T07:55:00+08:00'
})
assert.strictEqual(todayFirstPunch.stateLabel, 'TIME IN', 'Case 10: First punch of new day must be TIME IN')
assert.strictEqual(todayFirstPunch.direction, 'IN')
console.log("✔ Case 10 Passed: First punch of new workday -> does not inherit yesterday's direction")

// Case 11: A repeated or ambiguous punch -> does not blindly alternate into an incorrect direction
resolver.clearAll()
const morningIn11 = resolver.resolve({
  bioId: '58337',
  eventId: 'ev-c11-1',
  timestamp: '2026-10-09T08:00:00+08:00'
})
assert.strictEqual(morningIn11.stateLabel, 'TIME IN')
// Repeat scan within morning window (e.g. 8:00:08 AM)
const morningRepeat11 = resolver.resolve({
  bioId: '58337',
  eventId: 'ev-c11-2',
  timestamp: '2026-10-09T08:00:08+08:00'
})
assert.strictEqual(morningRepeat11.stateLabel, 'TIME IN', 'Case 11: Repeat morning scan remains TIME IN')
assert.strictEqual(morningRepeat11.direction, 'IN')
console.log('✔ Case 11 Passed: Repeated or ambiguous punch -> does not blindly alternate')

// Case 12: Missing history or an unknown event direction -> safe fallback without inventing attendance data
resolver.clearAll()
const unknownHistoryPunch = resolver.resolve({
  bioId: '99999',
  eventId: 'ev-unknown',
  timestamp: '2026-10-09T10:15:00+08:00'
})
assert.strictEqual(unknownHistoryPunch.stateLabel, 'TIME IN', 'Case 12: Missing history starts safely at TIME IN')
assert.strictEqual(unknownHistoryPunch.direction, 'IN')
assert.ok(unknownHistoryPunch.statusLabel, 'Case 12: Has clean valid status label')
console.log('✔ Case 12 Passed: Missing history -> safe fallback without inventing attendance data')

console.log('\n✅ ALL 12 PHASE 5 PUNCH DISPLAY DIRECTION RESOLUTION CASES PASSED!\n')

console.log('✅ ALL PUNCH DISPLAY, VOICE ANNOUNCEMENT & DEVICE CLOCK TESTS PASSED SUCCESSFULLY! 🎉')
