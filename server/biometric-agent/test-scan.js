/**
 * Quick Test Simulator for Pre-Laravel Real-Time Scan Bridge
 * Run: node server/biometric-agent/test-scan.js [userId]
 *
 * Emulates a real fingerprint scan event and posts it to the local agent bridge (port 5174).
 * Connected Vue browsers immediately render the record at the top of Attendance Logs.
 */

const http = require('http');

const userId = process.argv[2] || '50366';

const payload = {
  user_id: userId,
  employee_name: userId === '50366' ? 'Santos, Roberto' : (userId === '5009' ? 'K Pasana, Dothy Marie' : 'Test Employee'),
  attendance_time: new Date().toISOString(),
  type: 1,
  state: 1,
  serial_number: Math.floor(Math.random() * 500) + 1,
  device_id: 'dev-1',
  device_name: 'BISMAC BISBIO B-29b',
  device_ip: '192.168.1.201',
  location_id: 'loc-cebu',
  location: 'DBB Cebu',
  is_duplicate: false
};

const data = JSON.stringify(payload);

const options = {
  hostname: '127.0.0.1',
  port: 5174,
  path: '/api/scan',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log(`[Test Trigger] Successfully dispatched simulated scan for User ID ${userId}!`);
    console.log('[Test Trigger] Check your browser in Attendance Logs — the record should appear at the top immediately without refreshing.');
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error(`[Test Trigger] Error: Could not connect to bridge on port 5174 (${e.message}).`);
  console.log('Make sure the agent is running first:');
  console.log('  node server/biometric-agent/index.js');
  process.exit(1);
});

req.write(data);
req.end();
