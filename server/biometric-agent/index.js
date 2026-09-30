/**
 * DMBBHR Biometric Attendance Listener & Synchronization Agent
 * Target: BISMAC BISBIO B-29b (192.168.1.201:4370)
 * Location: DBB Cebu
 *
 * PRE-LARAVEL TEST ARCHITECTURE:
 * B-29b (192.168.1.201:4370) -> Node.js + zkteco-js -> DevSocketBridge (ws://0.0.0.0:5174) -> Vue Web App
 */
const { createDeviceInstance } = require('./src/device/deviceClient');
const { startAttendanceListener } = require('./src/device/attendanceListener');
const { DevSocketBridge } = require('./src/bridge/devSocketBridge');

const WS_PORT = parseInt(process.env.WS_PORT || '5174', 10);
const bridge = new DevSocketBridge(WS_PORT);

let currentDevice = null;
let isShuttingDown = false;
let heartbeatTimer = null;

function log(msg) {
  const timeStr = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date());
  console.log(`[${timeStr}] ${msg}`);
}

function parseErrorMessage(err) {
  if (!err) return 'Unknown error';
  const msg = (err.message || String(err)).toLowerCase();
  if (msg.includes('etimedout') || msg.includes('timeout')) return 'Connection timeout';
  if (msg.includes('econnrefused')) return 'Connection refused';
  if (msg.includes('ehostunreach')) return 'Host unreachable';
  if (msg.includes('enotfound')) return 'Network host not found';
  if (msg.includes('enetunreach')) return 'Network unreachable';
  return err.message || 'Unable to connect to biometric device';
}

async function connectAndListen() {
  const { device, config } = createDeviceInstance();
  currentDevice = device;

  log(`Agent starting...`);
  log(`Device: ${config.name}`);
  log(`Target: ${config.ip}:${config.port}`);
  log(`Connecting...`);

  bridge.setDeviceStatus('connecting', 'Attempting socket connection...');

  let connected = false;

  try {
    // Attempt socket connection with timeout
    await device.createSocket();
    connected = true;

    log(`Connected to ${config.name}`);
    log(`Device ONLINE`);
    log(`Real-time attendance listener started`);

    bridge.setDeviceStatus('online', 'Connected via TCP/IP socket');

    // Optional: read device user list for immediate name mapping
    let deviceUserMap = new Map();
    try {
      const usersResult = await device.getUsers();
      const users = Array.isArray(usersResult)
        ? usersResult
        : (usersResult && Array.isArray(usersResult.data) ? usersResult.data : []);
      for (const u of users) {
        deviceUserMap.set(String(u.userId), u.name || '');
      }
      log(`Device user registry: ${deviceUserMap.size} biometric profiles loaded`);
    } catch (uErr) {
      // Ignore user list fetch error if firmware doesn't permit while streaming
    }

    // Start periodic heartbeat to verify socket is actually still alive
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(async () => {
      try {
        if (!connected || !currentDevice) return;
        // Ping device with getTime() or getInfo() to confirm alive
        await currentDevice.getTime();
        bridge.setDeviceStatus('online', 'Active heartbeat confirmed');
      } catch (hbErr) {
        log(`Heartbeat failed: ${hbErr.message}`);
        log(`Device OFFLINE`);
        bridge.setDeviceStatus('offline', 'Heartbeat lost: ' + parseErrorMessage(hbErr));
        clearInterval(heartbeatTimer);
        cleanupSocket(currentDevice);
        if (!isShuttingDown) scheduleReconnect();
      }
    }, 15000); // 15-second heartbeat

    // Start real-time attendance listener
    await startAttendanceListener(device, config, async (eventRecord) => {
      // Attach mapped employee name if present on device
      if (deviceUserMap.has(eventRecord.user_id)) {
        eventRecord.employee_name = deviceUserMap.get(eventRecord.user_id);
      }

      log(`Attendance event received`);
      log(`User ID: ${eventRecord.user_id}`);
      log(`Timestamp: ${eventRecord.attendance_time}`);

      // Broadcast immediately to all connected Vue browser instances over LAN
      bridge.broadcastScan(eventRecord);
    });

  } catch (error) {
    const errorReason = parseErrorMessage(error);
    log(`${errorReason}`);
    log(`Device OFFLINE`);

    bridge.setDeviceStatus('offline', errorReason);

    cleanupSocket(currentDevice);

    if (!isShuttingDown) {
      scheduleReconnect();
    }
  }
}

async function cleanupSocket(dev) {
  if (dev) {
    try {
      await dev.disconnect();
    } catch {
      // ignore
    }
  }
}

function scheduleReconnect() {
  log(`Retrying connection in 10 seconds...`);
  setTimeout(() => {
    if (!isShuttingDown) {
      connectAndListen();
    }
  }, 10000);
}

// Graceful termination handling
async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log(`Gracefully shutting down agent...`);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  bridge.setDeviceStatus('offline', 'Agent terminated');
  bridge.stop();
  if (currentDevice) {
    await cleanupSocket(currentDevice);
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Entry point
bridge.start();
connectAndListen();

module.exports = { connectAndListen, shutdown };
