/**
 * DMBBHR Biometric Attendance Listener & Synchronization Agent
 * Target: BISMAC BISBIO B-29b (192.168.1.201:4370)
 * Location: DBB Cebu
 *
 * PRE-LARAVEL TEST ARCHITECTURE:
 * B-29b (192.168.1.201:4370) -> Node.js + zkteco-js -> DevSocketBridge (ws://0.0.0.0:5174) -> Vue Web App (Attendance Logs)
 */
const { createDeviceInstance } = require('./src/device/deviceClient');
const { startAttendanceListener } = require('./src/device/attendanceListener');
const { DevSocketBridge } = require('./src/bridge/devSocketBridge');

const WS_PORT = parseInt(process.env.WS_PORT || '5174', 10);
const bridge = new DevSocketBridge(WS_PORT);

let currentDevice = null;
let isShuttingDown = false;

async function run() {
  console.log('====================================================');
  console.log(' DMBBHR BIOMETRIC AGENT - BISMAC BISBIO B-29b');
  console.log(' Location: DBB Cebu (IP: 192.168.1.201 : 4370)');
  console.log(' Pre-Laravel Test Mode (Direct Node -> Vue Bridge)');
  console.log('====================================================\n');

  // Start local WebSocket bridge first so Vue can connect immediately
  bridge.start();

  const { device, config } = createDeviceInstance();
  currentDevice = device;

  let connected = false;
  try {
    console.log(`[DMBBHR Agent] Connecting to BISBIO B-29b at ${config.ip}:${config.port}...`);
    await device.createSocket();
    connected = true;
    console.log('[DMBBHR Agent] Connected to B-29b via TCP/IP socket successfully!');

    // Read device user list for immediate name matching
    console.log('[DMBBHR Agent] Loading device users for immediate name mapping...');
    let deviceUserMap = new Map();
    try {
      const usersResult = await device.getUsers();
      const users = Array.isArray(usersResult)
        ? usersResult
        : (usersResult && Array.isArray(usersResult.data) ? usersResult.data : []);
      for (const u of users) {
        deviceUserMap.set(String(u.userId), u.name || '');
      }
      console.log(`[DMBBHR Agent] Loaded ${deviceUserMap.size} users from biometric device.`);
    } catch (uErr) {
      console.warn('[DMBBHR Agent] Notice: Could not read user list directly:', uErr.message);
    }

    // Start real-time attendance listener
    console.log('\n[DMBBHR Agent] Listening for real-time fingerprint/biometric scans...');
    console.log('Ready. Scan fingerprint on the B-29b.');
    console.log('Scans will be broadcasted instantly to the Vue Attendance Logs view.\n');

    await startAttendanceListener(device, config, async (eventRecord) => {
      // Attach mapped employee name if present on device
      if (deviceUserMap.has(eventRecord.user_id)) {
        eventRecord.employee_name = deviceUserMap.get(eventRecord.user_id);
      }

      // Broadcast immediately to all connected Vue browser instances over LAN
      bridge.broadcastScan(eventRecord);
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
      console.log('[DMBBHR Agent] Will retry B-29b connection in 10 seconds...');
      setTimeout(run, 10000);
    }
  }
}

// Graceful termination handling
async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n[DMBBHR Agent] Gracefully shutting down...');
  bridge.stop();
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
