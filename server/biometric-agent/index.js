/**
 * DMBBHR Biometric Attendance Listener & Synchronization Agent
 * Target: BISMAC BISBIO B-29b (192.168.1.201:4370)
 * Location: DBB Cebu
 *
 * PRE-LARAVEL ARCHITECTURE:
 * - Dedicated Real-time Push Socket: ZKLib getRealTimeLogs() continuously listening for scans
 * - Dedicated On-Demand Sync Socket: Independent short-lived ZKLib connection for 24K+ syncs
 * - DevSocketBridge (ws://0.0.0.0:5174): Realtime WebSocket broadcaster to Vue Web App
 */
const { createDeviceInstance } = require('./src/device/deviceClient');
const { startAttendanceListener, stopAttendanceListener } = require('./src/device/attendanceListener');
const { syncBiometricAttendance, loadLocalStore } = require('./src/device/attendanceSync');
const { DevSocketBridge } = require('./src/bridge/devSocketBridge');

const WS_PORT = parseInt(process.env.WS_PORT || '5174', 10);
const bridge = new DevSocketBridge(WS_PORT);

let realtimeDevice = null;
let currentConfig = null;
let isShuttingDown = false;
let reconnectTimeout = null;
let isConnecting = false;

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

async function startRealtimeAgent() {
  if (isConnecting || isShuttingDown) return;
  isConnecting = true;

  const { device, config } = createDeviceInstance();
  realtimeDevice = device;
  currentConfig = config;

  log(`Agent starting...`);
  log(`Device: ${config.name}`);
  log(`Target: ${config.ip}:${config.port}`);
  log(`Connecting...`);

  bridge.setDeviceStatus('connecting', 'Attempting socket connection...');

  try {
    // 1. Create dedicated socket for real-time push events
    const cbErr = (err) => {
      log(`Realtime socket error: ${err.message || err}`);
      handleRealtimeSocketDrop('Socket error: ' + (err.message || err));
    };
    const cbClose = () => {
      log(`Realtime socket closed.`);
      handleRealtimeSocketDrop('Socket closed');
    };

    await realtimeDevice.createSocket(cbErr, cbClose);

    log(`Connected to ${config.name}`);
    log(`Device ONLINE`);
    log(`Realtime listener active`);

    bridge.setDeviceStatus('online', 'Connected via dedicated real-time TCP socket');

    // 2. Load locally persisted valid records into bridge
    const localStore = loadLocalStore();
    log(`Loaded ${localStore.length} locally persisted record(s). Ready for manual sync.`);
    bridge.setDeviceLogs(localStore);

    // 3. Register manual sync handler using a SEPARATE, INDEPENDENT connection
    // This guarantees manual sync never touches or interrupts the realtime listener socket!
    bridge.setSyncHandler(async (onProgress) => {
      log(`User initiated manual attendance sync (using dedicated sync connection)...`);
      return await syncBiometricAttendance(null, config, onProgress);
    });

    // 4. Start real-time push attendance listener on the dedicated socket
    // No conflicting command packets (like getTime or getUsers) are sent down this socket!
    log(`Real-time hardware event socket active and waiting for fingerprint scans...`);
    await startAttendanceListener(realtimeDevice, config, new Map(), async (eventRecord) => {
      log(`[DMBBHR REALTIME] Dispatching scan event to WebSocket bridge: User ${eventRecord.user_id}`);
      bridge.broadcastScan(eventRecord);
    });

  } catch (error) {
    const errorReason = parseErrorMessage(error);
    log(`Connection failed: ${errorReason}`);
    log(`Device OFFLINE`);

    bridge.setDeviceStatus('offline', errorReason);
    handleRealtimeSocketDrop(errorReason);
  } finally {
    isConnecting = false;
  }
}

async function handleRealtimeSocketDrop(reason) {
  if (isShuttingDown) return;
  stopAttendanceListener();
  bridge.setDeviceStatus('offline', reason);

  if (realtimeDevice) {
    try {
      await realtimeDevice.disconnect();
    } catch {}
    realtimeDevice = null;
  }

  scheduleReconnect();
}

function scheduleReconnect() {
  if (reconnectTimeout || isShuttingDown) return;
  log(`Retrying connection in 10 seconds...`);
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    if (!isShuttingDown) {
      startRealtimeAgent();
    }
  }, 10000);
}

// Graceful termination handling
async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log(`Gracefully shutting down agent...`);
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  stopAttendanceListener();
  bridge.setDeviceStatus('offline', 'Agent terminated');
  bridge.stop();
  if (realtimeDevice) {
    try {
      await realtimeDevice.disconnect();
    } catch {}
    realtimeDevice = null;
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Entry point
bridge.start();
startRealtimeAgent();

module.exports = { startRealtimeAgent, shutdown };
