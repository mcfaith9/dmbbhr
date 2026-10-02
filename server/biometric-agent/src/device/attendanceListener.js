/**
 * Real-time attendance listener for BISMAC BISBIO B-29b
 * Connects via device.getRealTimeLogs() on a dedicated, undisturbed TCP socket
 * to receive true push events when a fingerprint is scanned.
 */

const { normalizeDeviceDate } = require('./attendanceSync');

let isListening = false;

/**
 * Starts the real-time push event listener directly on the dedicated socket.
 * Preserves ALL raw scans without dropping duplicate/repeated scans.
 */
async function startAttendanceListener(device, config, userMap = new Map(), onEvent = () => {}) {
  console.log(`[DMBBHR Listener] Initializing hardware push listener on ${config.ip}:${config.port}...`);

  try {
    isListening = true;

    // Direct invocation of getRealTimeLogs on the dedicated socket
    await device.getRealTimeLogs(async (data) => {
      /**
       * Raw callback payload from B-29b:
       * {
       *   userId: "500394",
       *   attTime: Date (Philippine Time)
       * }
       */
      const userId = String(data.userId || data.user_id || '').trim();
      const rawDate = data.attTime || data.record_time || new Date();
      const normalizedDate = normalizeDeviceDate(rawDate) || {
        iso: new Date().toISOString(),
        isoPHT: new Date().toISOString(),
        localDate: new Date().toISOString().slice(0, 10),
        localTime: new Date().toTimeString().slice(0, 8)
      };

      if (!userId) {
        console.warn(`[DMBBHR Listener] Rejected unparseable scan event: missing userId`);
        return;
      }

      const sn = Number(data.serial ?? data.sn ?? 0);
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

      console.log(`\n========================================================`);
      console.log(`[DMBBHR REALTIME] SCAN RECEIVED`);
      console.log(`User ID:         ${normalizedRecord.user_id} (${employeeName})`);
      console.log(`Attendance Time: ${rawDate}`);
      console.log(`Philippines:     ${normalizedDate.localDate} ${normalizedDate.localTime}`);
      console.log(`Device:          ${config.name} (${config.ip}:${config.port})`);
      console.log(`========================================================\n`);

      if (typeof onEvent === 'function') {
        try {
          console.log(`[DMBBHR REALTIME] Broadcasting scan event for User ${userId}`);
          await onEvent(normalizedRecord);
        } catch (err) {
          console.error('[DMBBHR Listener] Error in onEvent callback:', err.message);
        }
      }
    });

    console.log(`[DMBBHR Listener] Real-time hardware event socket active and waiting for fingerprint scans.`);
  } catch (err) {
    console.error(`[DMBBHR Listener] Error starting real-time listener: ${err.message}`);
    throw err;
  }
}

function stopAttendanceListener() {
  isListening = false;
}

module.exports = {
  startAttendanceListener,
  stopAttendanceListener
};
