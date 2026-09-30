/**
 * Real-time attendance listener and polling fallback for BISMAC BISBIO B-29b
 * Connects via device.getRealTimeLogs() and provides polling fallback to detect new records
 */

// Global in-memory set for deduplication across real-time events, historical sync, and polling
const seenRecords = new Set();
let pollingIntervalTimer = null;

function getRecordKey(ip, userId, timestamp) {
  const uid = String(userId || '').trim();
  const timeMs = new Date(timestamp).getTime();
  const timeSec = Math.floor(timeMs / 1000);
  return `${ip}:${uid}:${timeSec}`;
}

function getSerialKey(ip, serial) {
  const sn = Number(serial || 0);
  return sn > 0 ? `${ip}:sn:${sn}` : null;
}

function primeSeenRecords(ip, initialLogs = []) {
  for (const log of initialLogs) {
    const key = getRecordKey(ip, log.user_id || log.userId, log.attendance_time || log.timestamp);
    seenRecords.add(key);
    const snKey = getSerialKey(ip, log.serial_number || log.sn || log.serial);
    if (snKey) seenRecords.add(snKey);
  }
}

/**
 * Starts the real-time event listener and concurrent lightweight polling fallback
 */
async function startAttendanceListener(device, config, userMap = new Map(), initialLogs = [], onEvent = () => {}) {
  console.log(`[DMBBHR Listener] Initializing listener on ${config.ip}:${config.port}...`);

  // 1. Prime seen records with initial logs to prevent duplicates
  primeSeenRecords(config.ip, initialLogs);

  // 2. Real-time push event listener via zkteco-js getRealTimeLogs
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
      if (!userId) return;

      const attTime = data.attTime instanceof Date ? data.attTime : new Date(data.attTime);
      const timeKey = getRecordKey(config.ip, userId, attTime);
      const sn = Number(data.serial ?? data.sn ?? 0);
      const snKey = getSerialKey(config.ip, sn);

      // Check if already processed
      if (seenRecords.has(timeKey) || (snKey && seenRecords.has(snKey))) {
        console.log(`[DMBBHR Listener] [REAL-TIME DEVICE EVENT] Duplicate scan ignored: User ${userId} at ${attTime.toISOString()}`);
        return;
      }

      seenRecords.add(timeKey);
      if (snKey) seenRecords.add(snKey);

      const phFormatted = new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        dateStyle: "full",
        timeStyle: "long"
      }).format(attTime);

      const employeeName = userMap.get(userId) || data.name || '';

      const normalizedRecord = {
        id: `real-${config.serial || config.ip}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        user_id: userId,
        employee_id: undefined,
        employee_name: employeeName || 'Biometric User',
        attendance_time: attTime.toISOString(),
        philippines_time: phFormatted,
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
        timestamp: attTime.toISOString(),
        deviceId: config.serial,
        deviceName: config.name,
        verificationMethod: Number(data.type ?? 1),
        status: Number(data.state ?? 1),
        source: 'REAL-TIME DEVICE EVENT',
        created_at: new Date().toISOString()
      };

      console.log(`\n========================================`);
      console.log(`[REAL-TIME DEVICE EVENT] NEW SCAN DETECTED!`);
      console.log(`User ID:           ${normalizedRecord.user_id} (${employeeName || 'Unknown'})`);
      console.log(`Time:              ${phFormatted}`);
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

    console.log(`[DMBBHR Listener] Real-time hardware event socket active.`);
  } catch (err) {
    console.warn(`[DMBBHR Listener] Real-time push registration note: ${err.message}. Relying on polling fallback.`);
  }

  // 3. Lightweight Polling Fallback (Section 5)
  // Checks device attendances every 10 seconds for firmware that does not push async events
  if (pollingIntervalTimer) clearInterval(pollingIntervalTimer);

  pollingIntervalTimer = setInterval(async () => {
    try {
      if (!device) return;

      const res = await device.getAttendances();
      const records = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);

      for (const rec of records) {
        const uid = String(rec.user_id ?? rec.userId ?? '').trim();
        if (!uid) continue;

        const recTime = rec.record_time || rec.dateTime || rec.timestamp;
        if (!recTime) continue;
        const parsedDate = new Date(recTime);
        const timeKey = getRecordKey(config.ip, uid, parsedDate);
        const sn = Number(rec.sn ?? rec.serial ?? 0);
        const snKey = getSerialKey(config.ip, sn);

        // Deduplicate against seen records
        if (seenRecords.has(timeKey) || (snKey && seenRecords.has(snKey))) {
          continue;
        }

        // New record detected via polling fallback
        seenRecords.add(timeKey);
        if (snKey) seenRecords.add(snKey);

        const phFormatted = new Intl.DateTimeFormat("en-PH", {
          timeZone: "Asia/Manila",
          dateStyle: "full",
          timeStyle: "long"
        }).format(parsedDate);

        const employeeName = userMap.get(uid) || rec.name || '';

        const normalizedRecord = {
          id: `poll-${config.serial || config.ip}-${sn || `${uid}-${parsedDate.getTime()}`}`,
          user_id: uid,
          employee_id: undefined,
          employee_name: employeeName || 'Biometric User',
          attendance_time: parsedDate.toISOString(),
          philippines_time: phFormatted,
          type: Number(rec.type ?? 1),
          state: Number(rec.state ?? 1),
          serial_number: sn,
          device_id: 'dev-1',
          device_name: config.name,
          device_ip: config.ip,
          location_id: config.location_id,
          location_name: config.location,
          is_duplicate: false,

          // Normalized internal fields:
          userId: uid,
          timestamp: parsedDate.toISOString(),
          deviceId: config.serial,
          deviceName: config.name,
          verificationMethod: Number(rec.type ?? 1),
          status: Number(rec.state ?? 1),
          source: 'POLLING FALLBACK',
          created_at: new Date().toISOString()
        };

        console.log(`\n========================================`);
        console.log(`[POLLING FALLBACK] NEW ATTENDANCE RECORD!`);
        console.log(`User ID:           ${uid} (${employeeName || 'Unknown'})`);
        console.log(`Time:              ${phFormatted}`);
        console.log(`Device:            ${config.name} (${config.ip})`);
        console.log(`========================================\n`);

        if (typeof onEvent === 'function') {
          try {
            await onEvent(normalizedRecord);
          } catch (err) {
            console.error('[DMBBHR Listener] Error in onEvent polling callback:', err.message);
          }
        }
      }
    } catch (pollErr) {
      // Non-fatal: device might be answering a heartbeat
    }
  }, 10000);
}

function stopAttendanceListener() {
  if (pollingIntervalTimer) {
    clearInterval(pollingIntervalTimer);
    pollingIntervalTimer = null;
  }
}

module.exports = {
  startAttendanceListener,
  stopAttendanceListener,
  primeSeenRecords
};
