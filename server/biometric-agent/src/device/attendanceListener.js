/**
 * Real-time attendance listener for BISMAC BISBIO B-29b
 * Connects via device.getRealTimeLogs() to receive true push events when a fingerprint is scanned.
 * Continuous full log polling has been removed in favor of user-initiated manual sync.
 */

const { normalizeDeviceDate } = require('./attendanceSync');

// Global in-memory set for deduplication of push events
const seenRecords = new Set();

function getRecordKey(ip, userId, timestamp) {
  const uid = String(userId || '').trim();
  const timeMs = new Date(timestamp).getTime();
  const timeSec = Math.floor(timeMs / 1000);
  return `${ip}:${uid}:${timeSec}`;
}

function primeSeenRecords(ip, initialLogs = []) {
  for (const log of initialLogs) {
    const key = getRecordKey(ip, log.user_id || log.userId, log.attendance_time || log.timestamp);
    seenRecords.add(key);
  }
}

/**
 * Starts the real-time push event listener (NO aggressive full log polling)
 */
async function startAttendanceListener(device, config, userMap = new Map(), initialLogs = [], onEvent = () => {}) {
  console.log(`[DMBBHR Listener] Initializing hardware push listener on ${config.ip}:${config.port}...`);

  // Prime seen records with existing logs
  primeSeenRecords(config.ip, initialLogs);

  // Real-time push event listener via zkteco-js getRealTimeLogs
  try {
    await device.getRealTimeLogs(async (data) => {
      /**
       * Raw callback payload from B-29b:
       * {
       *   userId: "50366",
       *   attTime: Date (Philippine Time)
       * }
       */
      const userId = String(data.userId || data.user_id || '').trim();
      const rawDate = data.attTime || data.record_time || new Date();
      const normalizedDate = normalizeDeviceDate(rawDate);

      // Validate real-time push data before accepting
      if (!userId || !normalizedDate) {
        console.warn(`[DMBBHR Listener] Rejected unparseable real-time scan event: User ID="${userId}", Time="${rawDate}"`);
        return;
      }

      const timeKey = getRecordKey(config.ip, userId, normalizedDate.iso);
      const sn = Number(data.serial ?? data.sn ?? 0);

      // Deduplicate against seen records
      if (seenRecords.has(timeKey)) {
        console.log(`[DMBBHR Listener] [REAL-TIME DEVICE EVENT] Duplicate scan ignored: User ${userId} at ${normalizedDate.isoPHT}`);
        return;
      }

      seenRecords.add(timeKey);

      const employeeName = userMap.get(userId) || data.name || (userId ? `User ${userId}` : 'Biometric User');

      const normalizedRecord = {
        id: `real-${config.serial || config.ip}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        user_id: userId,
        employee_id: undefined,
        employee_name: employeeName,
        attendance_time: normalizedDate.isoPHT,
        philippines_time: `${normalizedDate.localDate} ${normalizedDate.localTime}`,
        type: Number(data.type ?? 1),
        state: Number(data.state ?? 1),
        serial_number: sn,
        device_id: 'dev-1',
        device_name: config.name,
        device_ip: config.ip,
        location_id: config.location_id,
        location_name: config.location,
        is_duplicate: false,

        // Normalized internal fields:
        userId: userId,
        timestamp: normalizedDate.isoPHT,
        deviceId: config.serial,
        deviceName: config.name,
        verificationMethod: Number(data.type ?? 1),
        status: Number(data.state ?? 1),
        source: 'REAL-TIME DEVICE EVENT',
        created_at: new Date().toISOString()
      };

      console.log(`\n========================================`);
      console.log(`[REAL-TIME DEVICE EVENT] NEW SCAN DETECTED!`);
      console.log(`User ID:           ${normalizedRecord.user_id} (${employeeName})`);
      console.log(`Time:              ${normalizedDate.localDate} ${normalizedDate.localTime}`);
      console.log(`Device:            ${config.name} (${config.ip})`);
      console.log(`========================================\n`);

      if (typeof onEvent === 'function') {
        try {
          await onEvent(normalizedRecord);
        } catch (err) {
          console.error('[DMBBHR Listener] Error in onEvent callback:', err.message);
        }
      }
    });

    console.log(`[DMBBHR Listener] Real-time hardware event socket active and waiting for fingerprint scans.`);
  } catch (err) {
    console.warn(`[DMBBHR Listener] Note: Real-time event registration: ${err.message}. Ready for manual sync.`);
  }
}

function stopAttendanceListener() {
  // Real-time listener cleanup
}

module.exports = {
  startAttendanceListener,
  stopAttendanceListener,
  primeSeenRecords
};
