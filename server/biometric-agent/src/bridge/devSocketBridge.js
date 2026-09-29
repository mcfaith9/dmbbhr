/**
 * Simple Lightweight WebSocket Bridge for Direct Node.js -> Vue Communication
 *
 * Runs on port 5174 (or custom WS_PORT) across 0.0.0.0.
 * Allows Laptop A (with biometric reader) to broadcast real-time scan events
 * directly to connected Vue browsers (on Laptop A or Laptop B over the LAN)
 * without requiring Laravel, MySQL, or complex external brokers.
 */

const http = require('http');

class DevSocketBridge {
  constructor(port = 5174) {
    this.port = port;
    this.clients = new Set();
    this.server = null;
    this.recentEvents = []; // Keeps last 20 events in memory for newly connected clients
  }

  start() {
    this.server = http.createServer((req, res) => {
      // Simple HTTP health check and scan event query endpoint
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', events: this.recentEvents }));
        return;
      }

      if (req.method === 'POST' && req.url === '/api/scan') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            this.broadcastScan(data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', broadcasted: true }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }

      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'online',
          device: 'BISMAC BISBIO B-29b',
          clientsConnected: this.clients.size,
          recentEventsCount: this.recentEvents.length
        }));
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    // Handle WebSocket upgrade manually using native Node.js HTTP (no extra npm packages required)
    this.server.on('upgrade', (req, socket, head) => {
      const key = req.headers['sec-websocket-key'];
      if (!key) {
        socket.destroy();
        return;
      }

      // Compute Sec-WebSocket-Accept
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
      console.log(`[Dev Bridge] Web client connected from ${req.socket.remoteAddress}. Total active listeners: ${this.clients.size}`);

      // Send greeting & connection confirmation
      this.sendToClient(client, {
        type: 'CONNECTED',
        message: 'Connected to B-29b Local Biometric Bridge',
        activeClients: this.clients.size
      });

      socket.on('close', () => {
        this.clients.delete(client);
        console.log(`[Dev Bridge] Web client disconnected. Active listeners: ${this.clients.size}`);
      });

      socket.on('error', (err) => {
        console.warn(`[Dev Bridge] Socket error (${client.id}):`, err.message);
        this.clients.delete(client);
      });
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`[Dev Bridge] Real-time WebSocket server listening on ws://0.0.0.0:${this.port}`);
      console.log(`[Dev Bridge] (Allows Vue browsers on this PC or other LAN laptops to receive scans)`);
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

  broadcastScan(scanRecord) {
    this.recentEvents.unshift(scanRecord);
    if (this.recentEvents.length > 50) this.recentEvents.pop();

    console.log(`[Dev Bridge] Broadcasting scan for User ${scanRecord.user_id} to ${this.clients.size} browser clients...`);

    const message = {
      type: 'BIOMETRIC_SCAN',
      payload: scanRecord
    };

    for (const client of this.clients) {
      this.sendToClient(client, message);
    }
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
