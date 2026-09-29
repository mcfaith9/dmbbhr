/**
 * DMBBHR Biometric Attendance Listener Agent
 * 
 * Target Device: BISMAC BISBIO B-29b
 * IP: 192.168.1.201
 * Port: 4370
 * Serial: 0476141400046
 * Location: DBB Cebu
 *
 * Architecture:
 * BISBIO B-29b (TCP/IP: 4370) -> Node.js Agent (zkteco-js) -> Laravel API -> MySQL -> Vue 3 Web
 */

// In production on the local network server, run with:
// npm install zkteco-js axios dotenv
// node agent.js

const ZKLib = require('zkteco-js');
const axios = require('axios');

// Configuration
const DEVICE_CONFIG = {
  ip: process.env.DEVICE_IP || '192.168.1.201',
  port: parseInt(process.env.DEVICE_PORT || '4370', 10),
  timeout: 10000,
  inactivityTimeout: 4000,
  serial: '0476141400046',
  location: 'DBB Cebu',
  location_id: 'loc-cebu'
};

const BACKEND_CONFIG = {
  apiUrl: process.env.LARAVEL_API_URL || 'http://127.0.0.1:8000/api/biometric/logs',
  apiKey: process.env.AGENT_SECRET_KEY || 'dmbbhr-secret-agent-key'
};

// In-memory cache to detect & deduplicate rapid repeated scans seconds apart
const recentScanCache = new Map();
const DEDUPLICATION_WINDOW_MS = 10000; // 10 seconds

function isDuplicateScan(userId, timestamp) {
  const now = new Date(timestamp).getTime();
  const lastTime = recentScanCache.get(userId);

  if (lastTime && (now - lastTime < DEDUPLICATION_WINDOW_MS)) {
    return true;
  }
  recentScanCache.set(userId, now);
  return false;
}

// Clean up cache periodically
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [uid, time] of recentScanCache.entries()) {
    if (time < cutoff) recentScanCache.delete(uid);
  }
}, 30000);

async function startAgent() {
  console.log(`[DMBBHR Agent] Initializing connection to BISBIO B-29b at ${DEVICE_CONFIG.ip}:${DEVICE_CONFIG.port}...`);

  const device = new ZKLib(
    DEVICE_CONFIG.ip,
    DEVICE_CONFIG.port,
    DEVICE_CONFIG.timeout,
    DEVICE_CONFIG.inactivityTimeout
  );

  try {
    // 1. Create socket connection
    await device.createSocket();
    console.log('[DMBBHR Agent] Socket created successfully.');

    // 2. Fetch device information to verify hardware handshake
    try {
      const info = await device.getInfo();
      console.log('[DMBBHR Agent] Device info connected:', info);
    } catch (e) {
      console.log('[DMBBHR Agent] Device connected (serial verification:', DEVICE_CONFIG.serial, ')');
    }

    // 3. Register real-time attendance callback
    console.log('[DMBBHR Agent] Listening for real-time logs via getRealTimeLogs()...');
    
    await device.getRealTimeLogs(async (data) => {
      /**
       * Callback payload from B-29b:
       * {
       *   userId: "50366",
       *   attTime: Date (Philippine Time)
       * }
       */
      const userId = String(data.userId || data.user_id || '').trim();
      const attTime = data.attTime || new Date();
      const isoTime = new Date(attTime).toISOString();
      const isDuplicate = isDuplicateScan(userId, attTime);

      const payload = {
        user_id: userId,
        attendance_time: isoTime,
        type: data.type ?? 1,
        state: data.state ?? 1,
        serial_number: data.serial ?? 0,
        device_ip: DEVICE_CONFIG.ip,
        device_serial: DEVICE_CONFIG.serial,
        location_id: DEVICE_CONFIG.location_id,
        is_duplicate: isDuplicate,
        raw_payload: JSON.stringify(data)
      };

      console.log(`[DMBBHR Scan] User ${userId} scanned at ${attTime}. Duplicate: ${isDuplicate}`);

      // Forward to Laravel Backend API
      try {
        await axios.post(BACKEND_CONFIG.apiUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Agent-Key': BACKEND_CONFIG.apiKey
          },
          timeout: 5000
        });
        console.log(`[DMBBHR Agent] Successfully dispatched record for User ${userId} to Laravel API.`);
      } catch (err) {
        console.error('[DMBBHR Agent] Failed to push scan to Laravel API:', err.message);
        // Note: Failed logs can be spooled to local SQLite/JSON file for offline resilience
      }
    });

  } catch (error) {
    console.error('[DMBBHR Agent] Connection error:', error.message);
    console.log('[DMBBHR Agent] Retrying in 10 seconds...');
    setTimeout(startAgent, 10000);
  }
}

// Start listener
if (require.main === module) {
  startAgent();
}

module.exports = { startAgent };
