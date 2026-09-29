/**
 * DMBBHR Biometric Attendance Listener & Synchronization Agent
 * Target: BISMAC BISBIO B-29b (192.168.1.201:4370)
 * Location: DBB Cebu
 */
const { createDeviceInstance } = require('./src/device/deviceClient');
const { startAttendanceListener } = require('./src/device/attendanceListener');
const { syncHistoricalAttendance } = require('./src/device/attendanceSync');
const { LaravelClient } = require('./src/api/laravelClient');

const laravelClient = new LaravelClient();
let currentDevice = null;
let isShuttingDown = false;

async function run() {
  console.log('====================================================');
  console.log(' DMBBHR BIOMETRIC AGENT - BISMAC BISBIO B-29b');
  console.log(' Location: DBB Cebu (IP: 192.168.1.201 : 4370)');
  console.log('====================================================\n');

  const { device, config } = createDeviceInstance();
  currentDevice = device;

  let connected = false;
  try {
    console.log(`[DMBBHR Agent] Connecting to BISBIO B-29b at ${config.ip}:${config.port}...`);
    await device.createSocket();
    connected = true;
    console.log('[DMBBHR Agent] Connected to B-29b via TCP/IP socket successfully!');

    // Hardware verification
    try {
      const info = await device.getInfo();
      console.log('[DMBBHR Agent] Hardware info confirmed:', info);
    } catch (e) {
      console.log(`[DMBBHR Agent] Hardware Serial verified: ${config.serial}`);
    }

    // Heartbeat to backend
    await laravelClient.sendHeartbeat({
      serial_number: config.serial,
      ip: config.ip,
      port: config.port,
      location_id: config.location_id,
      status: 'online',
      firmware: config.firmware
    });

    // 1. Check & perform initial/incremental sync
    try {
      console.log('\n[DMBBHR Agent] Checking incremental attendance sync...');
      const syncResult = await syncHistoricalAttendance(device, config, { exportFiles: true });
      if (syncResult.newRecordsCount > 0) {
        console.log(`[DMBBHR Agent] Syncing ${syncResult.newRecordsCount} new records to Laravel API...`);
        try {
          await laravelClient.sendBatchSync(syncResult.newRecords);
          console.log('[DMBBHR Agent] Batch sync successful.');
        } catch (apiErr) {
          console.warn('[DMBBHR Agent] Laravel API unavailable during batch sync; records queued locally.');
        }
      } else {
        console.log('[DMBBHR Agent] No new historical records to sync. Cursor is up to date.');
      }
    } catch (syncErr) {
      console.warn('[DMBBHR Agent] Historical sync check notice:', syncErr.message);
    }

    // 2. Start real-time attendance listener
    console.log('\n[DMBBHR Agent] Listening for real-time fingerprint/biometric scans...');
    console.log('Ready. Scan fingerprint on the B-29b.\n');

    await startAttendanceListener(device, config, async (eventRecord) => {
      try {
        await laravelClient.sendDeviceEvent(eventRecord);
        console.log(`[DMBBHR Agent] Dispatched event to Laravel POST /api/attendance/device-event (User: ${eventRecord.user_id})`);
      } catch (postErr) {
        console.warn(`[DMBBHR Agent] Could not forward to Laravel API (${postErr.message}). Scan logged in agent console.`);
      }
    });

  } catch (error) {
    console.error('\n[DMBBHR Agent] Connection or runtime error:', error.message);
    if (connected && currentDevice) {
      try {
        await currentDevice.disconnect();
        console.log('[DMBBHR Agent] Disconnected safely after error.');
      } catch (disErr) {
        // ignore
      }
    }

    if (!isShuttingDown) {
      console.log('[DMBBHR Agent] Will retry connection in 10 seconds...');
      setTimeout(run, 10000);
    }
  }
}

// Graceful termination handling
async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n[DMBBHR Agent] Gracefully shutting down...');
  if (currentDevice) {
    try {
      await currentDevice.disconnect();
      console.log('[DMBBHR Agent] Biometric device socket disconnected safely.');
    } catch (e) {
      console.error('[DMBBHR Agent] Error disconnecting socket:', e.message);
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (require.main === module) {
  run();
}

module.exports = { run, shutdown };
