/**
 * Real-time attendance listener for BISMAC BISBIO B-29b
 * Connects via device.getRealTimeLogs() and passes events to callback
 */

// In-memory cache for duplicate throttle (10-second window)
const recentScans = new Map();
const THROTTLE_MS = 10000;

function checkDuplicateScan(userId, timestamp) {
  const time = new Date(timestamp).getTime();
  const lastTime = recentScans.get(userId);

  if (lastTime && (time - lastTime < THROTTLE_MS)) {
    return true;
  }
  recentScans.set(userId, time);
  return false;
}

// Periodic cleanup
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [id, t] of recentScans.entries()) {
    if (t < cutoff) recentScans.delete(id);
  }
}, 30000);

async function startAttendanceListener(device, config, onEvent) {
  console.log(`[DMBBHR Listener] Starting real-time listener on ${config.ip}:${config.port}...`);

  await device.getRealTimeLogs(async (data) => {
    /**
     * Raw callback payload from B-29b:
     * {
     *   userId: "50366",
     *   attTime: Date (Philippine Time)
     * }
     */
    const userId = String(data.userId || data.user_id || '').trim();
    const attTime = data.attTime instanceof Date ? data.attTime : new Date(data.attTime);

    // Format Philippine Time (Asia/Manila)
    const phFormatted = new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "full",
      timeStyle: "long"
    }).format(attTime);

    const isDuplicate = checkDuplicateScan(userId, attTime);

    const normalizedRecord = {
      device_id: config.serial,
      device_name: config.name,
      device_ip: config.ip,
      location_id: config.location_id,
      location: config.location,
      user_id: userId,
      attendance_time: attTime.toISOString(),
      philippines_time: phFormatted,
      type: Number(data.type ?? 1),
      state: Number(data.state ?? 1),
      serial_number: data.serial ?? (data.sn ?? 0),
      is_duplicate: isDuplicate,
      raw_data: {
        userId: data.userId,
        attTime: data.attTime
      }
    };

    console.log(`\n================================`);
    console.log(`NEW ATTENDANCE DETECTED!`);
    console.log(`================================`);
    console.log(`User ID:           ${normalizedRecord.user_id}`);
    console.log(`Philippines Time:  ${phFormatted}`);
    console.log(`Duplicate Flag:    ${isDuplicate ? 'YES (Preserved for audit)' : 'NO'}`);
    console.log(`================================\n`);

    if (typeof onEvent === 'function') {
      try {
        await onEvent(normalizedRecord);
      } catch (err) {
        console.error('[DMBBHR Listener] Error in onEvent callback:', err.message);
      }
    }
  });
}

module.exports = {
  startAttendanceListener
};
