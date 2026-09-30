/**
 * Biometric Attendance Synchronization & Local Persistence for BISMAC BISBIO B-29b
 * Reference: Standalone ZKLib implementation tested on 192.168.1.201:4370
 *
 * Implements:
 * - Read-only device operation (NEVER deletes or clears device records)
 * - Uses standard device.getUsers() and device.getAttendances()
 * - Full 24K+ record processing without arbitrary record discards
 * - Wall-clock preservation in Philippine Standard Time (PST, UTC+08:00)
 * - Safe deduplication by (device_ip + user_id + timestamp + type + state)
 * - Detailed diagnostic logging at every stage
 * - Local JSON persistence (data/attendance_store.json)
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'attendance_store.json');
const CURSOR_FILE = path.join(DATA_DIR, 'sync_cursor.json');

// Ensure local data storage directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

/**
 * Normalizes device raw timestamp into a standardized Philippine Time ISO string (+08:00).
 * Preserves the exact wall-clock year, month, day, hour, minute, second recorded by the hardware.
 */
function normalizeDeviceDate(rawDate) {
  if (!rawDate) return null;
  const parsed = rawDate instanceof Date ? rawDate : new Date(rawDate);
  if (isNaN(parsed.getTime())) return null;

  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  const hh = String(parsed.getHours()).padStart(2, '0');
  const mm = String(parsed.getMinutes()).padStart(2, '0');
  const ss = String(parsed.getSeconds()).padStart(2, '0');

  // Exact wall-clock timestamp in Asia/Manila (+08:00)
  const isoPHT = `${y}-${m}-${d}T${hh}:${mm}:${ss}+08:00`;
  const dateObj = new Date(isoPHT);

  return {
    iso: dateObj.toISOString(),
    isoPHT,
    localDate: `${y}-${m}-${d}`,
    localTime: `${hh}:${mm}:${ss}`
  };
}

/**
 * Loads locally stored attendance records from JSON store
 */
function loadLocalStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const content = fs.readFileSync(STORE_FILE, 'utf8');
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (err) {
    console.error('[Sync Store] Error loading local store:', err.message);
  }
  return [];
}

/**
 * Persists records to local JSON store
 */
function saveLocalStore(records) {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(records, null, 2), 'utf8');
  } catch (err) {
    console.error('[Sync Store] Error saving local store:', err.message);
  }
}

function loadSyncCursor() {
  try {
    if (fs.existsSync(CURSOR_FILE)) {
      const content = fs.readFileSync(CURSOR_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch {
    // fallback
  }
  return { lastSyncTime: null, totalSynced: 0 };
}

function saveSyncCursor(cursor) {
  try {
    fs.writeFileSync(CURSOR_FILE, JSON.stringify(cursor, null, 2), 'utf8');
  } catch (err) {
    console.error('[Sync Cursor] Error saving cursor:', err.message);
  }
}

/**
 * Performs manual, read-only synchronization from BISMAC BISBIO B-29b
 * Follows the proven working reference:
 *   const usersResult = await device.getUsers();
 *   const attendanceResult = await device.getAttendances();
 */
async function syncBiometricAttendance(device, config, onProgress = () => {}) {
  console.log('\n========================================================');
  console.log(`[DMBBHR Sync] Initiating manual sync with ${config.name} (${config.ip}:${config.port})`);
  console.log('========================================================');

  // Stage 1: Device connectivity verification
  onProgress({
    stage: 'connecting',
    message: `Connecting to biometric device (${config.ip}:${config.port})...`,
    progress: 10
  });

  try {
    await device.getTime();
  } catch (connErr) {
    throw new Error(`Device is unreachable at ${config.ip}:${config.port} (${connErr.message})`);
  }

  // Stage 2: Download user registry for employee mapping
  onProgress({
    stage: 'downloading',
    message: 'Connected. Retrieving users from device registry...',
    progress: 25
  });

  const userMap = new Map();
  let usersCount = 0;
  try {
    const usersResult = await device.getUsers();
    const users = Array.isArray(usersResult?.data) ? usersResult.data : (Array.isArray(usersResult) ? usersResult : []);
    usersCount = users.length;
    for (const u of users) {
      const uid = String(u.userId ?? u.user_id ?? u.uid ?? '').trim();
      if (uid) {
        userMap.set(uid, u.name || '');
      }
    }
    console.log(`[DMBBHR Sync] Users retrieved: ${usersCount} profiles (${userMap.size} unique IDs)`);
  } catch (uErr) {
    console.warn(`[DMBBHR Sync] Notice: User registry fetch notice: ${uErr.message}. Continuing...`);
  }

  // Stage 3: Retrieve complete attendance records using working getAttendances()
  onProgress({
    stage: 'downloading',
    message: 'Retrieving attendance records from biometric device...',
    progress: 45
  });

  let rawRecords = [];
  try {
    const attendanceResult = await device.getAttendances((received, total) => {
      if (total > 0) {
        const pct = Math.min(Math.round(45 + (received / total) * 30), 75);
        onProgress({
          stage: 'downloading',
          message: `Downloading attendance records: ${received.toLocaleString()} / ${total.toLocaleString()} bytes received...`,
          progress: pct
        });
      }
    });

    if (attendanceResult && Array.isArray(attendanceResult.data)) {
      rawRecords = attendanceResult.data;
    } else if (Array.isArray(attendanceResult)) {
      rawRecords = attendanceResult;
    }
  } catch (dlErr) {
    throw new Error(`Failed to retrieve attendance records from device: ${dlErr.message}`);
  }

  console.log(`[DMBBHR Sync] Raw records retrieved from device: ${rawRecords.length}`);

  // Stage 4: Parse & validate records
  onProgress({
    stage: 'validating',
    message: `Processing and validating ${rawRecords.length.toLocaleString()} attendance records...`,
    progress: 80
  });

  const existingLocalStore = loadLocalStore();
  const existingKeys = new Set(
    existingLocalStore.map(l => {
      const timeSec = Math.floor(new Date(l.attendance_time).getTime() / 1000);
      const ip = l.device_ip || config.ip || '192.168.1.201';
      const uid = String(l.user_id || l.userId || '').trim();
      const type = Number(l.type ?? 1);
      const state = Number(l.state ?? 1);
      return `${ip}:${uid}:${timeSec}:${type}:${state}`;
    })
  );
  const existingIds = new Set(existingLocalStore.map(l => l.id));

  let parsedCount = 0;
  let rejectedCount = 0;
  let duplicatesCount = 0;
  let newCount = 0;
  const newRecordsToAdd = [];

  for (let i = 0; i < rawRecords.length; i++) {
    const r = rawRecords[i];
    const uid = String(r.user_id ?? r.userId ?? r.uid ?? '').trim();
    const rawTime = r.record_time ?? r.timestamp ?? r.attendance_time;
    const normalizedDate = normalizeDeviceDate(rawTime);

    if (!uid || !normalizedDate) {
      rejectedCount++;
      continue;
    }

    parsedCount++;

    const timeSec = Math.floor(new Date(normalizedDate.iso).getTime() / 1000);
    const type = Number(r.type ?? 1);
    const state = Number(r.state ?? 1);
    const sn = Number(r.sn ?? r.serial ?? 0);
    const ip = r.ip || config.ip || '192.168.1.201';

    // Stable unique record key based on device, user, timestamp, type, and state
    const key = `${ip}:${uid}:${timeSec}:${type}:${state}`;
    const id = `dev-${config.serial || '0476141400046'}-${uid}-${timeSec}-${type}-${state}`;

    if (existingKeys.has(key) || existingIds.has(id)) {
      duplicatesCount++;
    } else {
      newCount++;
      existingKeys.add(key);
      existingIds.add(id);

      const empName = userMap.get(uid) || (uid ? `User ${uid}` : 'Biometric User');

      const record = {
        id,
        user_id: uid,
        employee_id: undefined,
        employee_name: empName,
        attendance_time: normalizedDate.isoPHT, // Preserves exact wall-clock in PST (+08:00)
        philippines_time: `${normalizedDate.localDate} ${normalizedDate.localTime}`,
        type,
        state,
        serial_number: sn,
        device_id: 'dev-1',
        device_name: config.name || 'BISMAC BISBIO B-29b',
        device_ip: ip,
        location_id: config.location_id || 'loc-cebu',
        location_name: config.location || 'DBB Cebu',
        is_duplicate: false,

        // Normalized specification fields
        userId: uid,
        timestamp: normalizedDate.isoPHT,
        deviceId: config.serial || '0476141400046',
        deviceName: config.name || 'BISMAC BISBIO B-29b',
        verificationMethod: type,
        status: state,
        source: 'manual_sync',
        created_at: new Date().toISOString()
      };

      newRecordsToAdd.push(record);
    }
  }

  // Stage 5: Save to local store
  onProgress({
    stage: 'saving',
    message: `Storing ${newCount.toLocaleString()} new records (${duplicatesCount.toLocaleString()} already synced)...`,
    progress: 92
  });

  const updatedStore = [...newRecordsToAdd, ...existingLocalStore];
  // Sort descending by attendance_time (newest first)
  updatedStore.sort((a, b) => new Date(b.attendance_time).getTime() - new Date(a.attendance_time).getTime());

  saveLocalStore(updatedStore);

  // Update sync cursor
  const cursor = loadSyncCursor();
  cursor.lastSyncTime = new Date().toISOString();
  cursor.totalSynced = updatedStore.length;
  saveSyncCursor(cursor);

  // Diagnostic logging (Section 5)
  console.log('\n========================================================');
  console.log('[DMBBHR Sync Diagnostic Report]');
  console.log(`Device returned:     ${rawRecords.length}`);
  console.log(`Successfully parsed: ${parsedCount}`);
  console.log(`Rejected:            ${rejectedCount}`);
  console.log(`Duplicates skipped:  ${duplicatesCount}`);
  console.log(`New records stored:  ${newCount}`);
  console.log(`Total Stored:        ${updatedStore.length}`);
  console.log('========================================================\n');

  // Stage 6: Complete
  const summary = {
    success: true,
    deviceReturned: rawRecords.length,
    parsedCount,
    rejectedCount,
    duplicatesCount,
    newRecords: newCount,
    alreadySynced: duplicatesCount,
    totalValid: updatedStore.length,
    allRecords: updatedStore
  };

  onProgress({
    stage: 'complete',
    message: `Sync completed. ${rawRecords.length.toLocaleString()} records retrieved from device (${newCount.toLocaleString()} new, ${duplicatesCount.toLocaleString()} already present).`,
    progress: 100,
    summary
  });

  return summary;
}

module.exports = {
  syncBiometricAttendance,
  loadLocalStore,
  saveLocalStore,
  loadSyncCursor,
  saveSyncCursor,
  normalizeDeviceDate
};
