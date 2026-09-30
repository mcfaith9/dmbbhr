/**
 * Zero-dependency WebSocket & HTTP Bridge for BISMAC BISBIO B-29b
 *
 * Runs on port 5174 (0.0.0.0).
 * Broadcasts real-time events, heartbeat status, and socket state directly to Vue.
 */

const http = require('http');
const { loadLocalStore } = require('../device/attendanceSync');

class DevSocketBridge {
  constructor(port = 5174) {
    this.port = port;
    this.clients = new Set();
    this.server = null;
    this.recentEvents = [];
    this.deviceLogs = [];
    this.seenEventKeys = new Set();
    this.syncHandler = null;
    this.isSyncing = false;

    // Load any existing valid records from local JSON store on startup (Section 9)
    const initialLocalStore = loadLocalStore();
    if (initialLocalStore && initialLocalStore.length > 0) {
      this.deviceLogs = initialLocalStore;
      for (const log of this.deviceLogs) {
        const uid = String(log.user_id || log.userId || '').trim();
        const timeMs = new Date(log.attendance_time || log.timestamp).getTime();
        const timeSec = Math.floor(timeMs / 1000);
        const ip = log.device_ip || '192.168.1.201';
        this.seenEventKeys.add(`${ip}:${uid}:${timeSec}`);
        const sn = Number(log.serial_number || 0);
        if (sn > 0) this.seenEventKeys.add(`${ip}:sn:${sn}`);
      }
    }

    // Hardware status representation
    this.deviceState = {
      model: 'BISMAC BISBIO B-29b',
      ip: '192.168.1.201',
      port: 4370,
      serial: '0476141400046',
      status: 'offline', // 'offline' | 'connecting' | 'online'
      reason: 'Agent initializing...',
      lastConnected: null,
      lastDisconnected: null,
      lastAttempt: null,
      lastEvent: null,
      uptimeSeconds: 0
    };
  }

  setSyncHandler(fn) {
    this.syncHandler = fn;
  }

  broadcastProgress(progress) {
    this.broadcastMessage({
      type: 'SYNC_PROGRESS',
      payload: progress
    });
  }

  setDeviceStatus(status, reason = '') {
    const prevStatus = this.deviceState.status;
    this.deviceState.status = status;
    this.deviceState.reason = reason;
    this.deviceState.lastAttempt = new Date().toISOString();

    if (status === 'online') {
      this.deviceState.lastConnected = new Date().toISOString();
    } else if (status === 'offline' && prevStatus === 'online') {
      this.deviceState.lastDisconnected = new Date().toISOString();
    }

    // Broadcast updated device state to all connected Vue browser instances
    this.broadcastMessage({
      type: 'DEVICE_STATUS',
      payload: { ...this.deviceState }
    });
  }

  setDeviceLogs(logs = []) {
    this.deviceLogs = Array.isArray(logs) ? logs : [];
    // Populate deduplication registry
    for (const log of this.deviceLogs) {
      const uid = String(log.user_id || log.userId || '').trim();
      const timeMs = new Date(log.attendance_time || log.timestamp).getTime();
      const timeSec = Math.floor(timeMs / 1000);
      const ip = log.device_ip || '192.168.1.201';
      this.seenEventKeys.add(`${ip}:${uid}:${timeSec}`);
      const sn = Number(log.serial_number || 0);
      if (sn > 0) {
        this.seenEventKeys.add(`${ip}:sn:${sn}`);
      }
    }

    // Broadcast updated device logs to connected Vue browser instances
    this.broadcastMessage({
      type: 'DEVICE_LOGS',
      payload: this.deviceLogs
    });
  }

  start() {
    this.server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url === '/health' || req.url === '/api/device/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          device: this.deviceState,
          clientsConnected: this.clients.size,
          logsCount: this.deviceLogs.length,
          recentEventsCount: this.recentEvents.length
        }));
        return;
      }

      if (req.url === '/api/logs') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          count: this.deviceLogs.length,
          logs: this.deviceLogs
        }));
        return;
      }

      if (req.url === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', events: this.recentEvents }));
        return;
      }

      // POST /api/sync: Trigger manual biometric attendance sync with live progress
      if (req.url === '/api/sync' && req.method === 'POST') {
        if (!this.syncHandler) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: 'Sync handler not initialized or device not connected' }));
          return;
        }

        if (this.isSyncing) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'busy', message: 'Synchronization is already in progress' }));
          return;
        }

        this.isSyncing = true;
        this.broadcastProgress({ stage: 'connecting', message: 'Starting manual synchronization...', progress: 10 });

        this.syncHandler((progress) => {
          this.broadcastProgress(progress);
        }).then((result) => {
          this.isSyncing = false;
          if (result && Array.isArray(result.allRecords)) {
            this.setDeviceLogs(result.allRecords);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', ...result }));
        }).catch((err) => {
          this.isSyncing = false;
          this.broadcastProgress({ stage: 'error', message: `Sync failed: ${err.message}`, progress: 0 });
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: err.message }));
        });

        return;
      }

      // POST /api/scan endpoint for manual or test dispatches
      if (req.url === '/api/scan' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body || '{}');
            this.broadcastScan(parsed);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', message: 'Scan dispatched' }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'error', message: err.message }));
          }
        });
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    // Handle WebSocket upgrade manually using native Node.js HTTP
    this.server.on('upgrade', (req, socket, head) => {
      const key = req.headers['sec-websocket-key'];
      if (!key) {
        socket.destroy();
        return;
      }

      const crypto = require('crypto');
      const acceptValue = crypto
        .createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

      const responseHeaders = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptValue}`
      ];

      socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');

      const client = {
        socket,
        id: Math.random().toString(36).substring(2, 9)
      };

      this.clients.add(client);

      // Immediately send current live device status, all retrieved device logs, and recent events
      this.sendToClient(client, {
        type: 'INITIAL_STATE',
        payload: {
          device: { ...this.deviceState },
          logs: this.deviceLogs,
          recentEvents: this.recentEvents.slice(0, 10)
        }
      });

      socket.on('close', () => {
        this.clients.delete(client);
      });

      socket.on('error', () => {
        this.clients.delete(client);
      });
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`[Dev Bridge] Local WebSocket & status bridge listening on port ${this.port}`);
    });
  }

  sendToClient(client, data) {
    try {
      const payload = JSON.stringify(data);
      const buffer = Buffer.from(payload, 'utf8');
      const length = buffer.length;

      let header;
      if (length <= 125) {
        header = Buffer.from([0x81, length]);
      } else if (length <= 65535) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(length, 2);
      } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(length), 2);
      }

      client.socket.write(Buffer.concat([header, buffer]));
    } catch (e) {
      this.clients.delete(client);
    }
  }

  broadcastMessage(message) {
    for (const client of this.clients) {
      this.sendToClient(client, message);
    }
  }

  broadcastScan(scanRecord) {
    const uid = String(scanRecord.user_id || scanRecord.userId || '').trim();
    const timeMs = new Date(scanRecord.attendance_time || scanRecord.timestamp).getTime();
    const timeSec = Math.floor(timeMs / 1000);
    const ip = scanRecord.device_ip || '192.168.1.201';
    const key = `${ip}:${uid}:${timeSec}`;
    const sn = Number(scanRecord.serial_number || 0);

    // Track in seen keys
    this.seenEventKeys.add(key);
    if (sn > 0) {
      this.seenEventKeys.add(`${ip}:sn:${sn}`);
    }

    // Prepend to deviceLogs if not already present
    if (!this.deviceLogs.some(l => l.id === scanRecord.id)) {
      this.deviceLogs.unshift(scanRecord);
    }

    this.recentEvents.unshift(scanRecord);
    if (this.recentEvents.length > 50) this.recentEvents.pop();

    this.deviceState.lastEvent = scanRecord.attendance_time || new Date().toISOString();

    const message = {
      type: 'BIOMETRIC_SCAN',
      payload: scanRecord
    };

    this.broadcastMessage(message);
  }

  stop() {
    for (const client of this.clients) {
      try { client.socket.destroy(); } catch (e) {}
    }
    this.clients.clear();
    if (this.server) {
      this.server.close();
    }
  }
}

module.exports = { DevSocketBridge };
