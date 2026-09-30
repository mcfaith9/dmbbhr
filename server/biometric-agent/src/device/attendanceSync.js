/**
 * Controlled Manual Attendance Synchronization & Local Persistence for BISMAC BISBIO B-29b
 *
 * Implements:
 * - Read-only operation (NEVER deletes or clears device records)
 * - Stage-by-stage real progress reporting
 * - Multi-strategy parsing and strict validation (eliminates corrupt records like \}2)
 * - Safe local JSON persistence (data/attendance_store.json)
 * - Incremental synchronization & deduplication
 */

const fs = require('fs');
const path = require('path');
const { parseAndValidateAttendance } = require('./attendanceParser');

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
 * Loads locally stored attendance records
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
  return { lastSerialNumber: 0, lastSyncTime: null, totalSynced: 0 };
}

function saveSyncCursor(cursor) {
  try {
    fs.writeFileSync(CURSOR_FILE, JSON.stringify(cursor, null, 2), 'utf8');
  } catch (err) {
    console.error('[Sync Cursor] Error saving cursor:', err.message);
  }
}

/**
 * Performs manual, read-only synchronization from B-29b
 */
async function syncBiometricAttendance(device, config, onProgress = () => {}) {
  console.log('\n========================================================');
  console.log(`[DMBBHR Sync] Initiating manual sync with ${config.name} (${config.ip}:${config.port})`);
  console.log('========================================================');

  // Stage 1: Device connectivity check
  onProgress({
    stage: 'connecting',
    message: 'Verifying socket connection to BISMAC BISBIO B-29b...',
    progress: 15
  });

  // Verify connection is alive
  try {
    await device.getTime();
  } catch (connErr) {
    throw new Error(`Device is unreachable at ${config.ip}:${config.port} (${connErr.message})`);
  }

  // Stage 2: Download user list for name mapping
  onProgress({
    stage: 'downloading',
    message: 'Downloading user registry for employee mapping...',
    progress: 30
  });

  const userMap = new Map();
  try {
    const usersResult = await device.getUsers();
    const users = Array.isArray(usersResult)
      ? usersResult
      : (usersResult && Array.isArray(usersResult.data) ? usersResult.data : []);
    for (const u of users) {
      userMap.set(String(u.userId), u.name || '');
    }
    console.log(`[DMBBHR Sync] Loaded ${userMap.size} user names from device.`);
  } catch (uErr) {
    console.warn(`[DMBBHR Sync] Notice: User list could not be fetched (${uErr.message}). Continuing...`);
  }

  // Stage 3: Download raw attendance records (strictly read-only)
  onProgress({
    stage: 'downloading',
    message: 'Downloading attendance records from device memory...',
    progress: 50
  });

  let rawRecords = [];
  let rawBuffer = null;

  try {
    const attendanceResult = await device.getAttendances((received, total) => {
      if (total > 0) {
        const pct = Math.min(Math.round(50 + (received / total) * 20), 70);
        onProgress({
          stage: 'downloading',
          message: `Downloading records: ${received} / ${total} bytes received...`,
          progress: pct
        });
      }
    });

    if (attendanceResult && Array.isArray(attendanceResult.data)) {
      rawRecords = attendanceResult.data;
    } else if (Array.isArray(attendanceResult)) {
      rawRecords = attendanceResult;
    }

    if (attendanceResult && attendanceResult.rawBuffer) {
      rawBuffer = attendanceResult.rawBuffer;
    }
  } catch (dlErr) {
    throw new Error(`Failed to download attendance records from device: ${dlErr.message}`);
  }

  console.log(`[DMBBHR Sync] Download complete. Raw records reported: ${rawRecords.length}`);

  // Stage 4: Validate and decode records
  onProgress({
    stage: 'validating',
    message: `Validating ${rawRecords.length} records and checking timestamps...`,
    progress: 75
  });

  const parsed = parseAndValidateAttendance(rawBuffer, rawRecords, config, userMap);
  console.log(`[DMBBHR Sync] Valid parsed records: ${parsed.validRecords.length}`);
  console.log(`[DMBBHR Sync] Corrupt/invalid records skipped: ${parsed.invalidCount}`);

  // Stage 5: Deduplicate and save to local store (Section 9 & 10)
  onProgress({
    stage: 'saving',
    message: 'Saving valid records to local storage and checking for duplicates...',
    progress: 90
  });

  const existingLocalStore = loadLocalStore();
  const existingKeys = new Set(
    existingLocalStore.map(l => `${l.device_ip || config.ip}:${l.user_id}:${Math.floor(new Date(l.attendance_time).getTime() / 1000)}`)
  );
  const existingIds = new Set(existingLocalStore.map(l => l.id));
  const existingSerials = new Set(
    existingLocalStore
      .filter(l => Number(l.serial_number) > 0)
      .map(l => `${l.device_ip || config.ip}:sn:${l.serial_number}`)
  );

  let newCount = 0;
  let alreadySyncedCount = 0;
  const newRecordsToAdd = [];

  for (const record of parsed.validRecords) {
    const timeSec = Math.floor(new Date(record.attendance_time).getTime() / 1000);
    const key = `${record.device_ip || config.ip}:${record.user_id}:${timeSec}`;
    const snKey = Number(record.serial_number) > 0 ? `${record.device_ip || config.ip}:sn:${record.serial_number}` : null;

    if (existingIds.has(record.id) || existingKeys.has(key) || (snKey && existingSerials.has(snKey))) {
      alreadySyncedCount++;
    } else {
      newCount++;
      newRecordsToAdd.push(record);
      existingKeys.add(key);
      existingIds.add(record.id);
      if (snKey) existingSerials.add(snKey);
    }
  }

  // Merge and sort
  const updatedStore = [...newRecordsToAdd, ...existingLocalStore];
  updatedStore.sort((a, b) => new Date(b.attendance_time).getTime() - new Date(a.attendance_time).getTime());

  saveLocalStore(updatedStore);

  // Update cursor
  const cursor = loadSyncCursor();
  cursor.lastSyncTime = new Date().toISOString();
  cursor.totalSynced = updatedStore.length;
  saveSyncCursor(cursor);

  // Stage 6: Complete
  const summary = {
    success: true,
    newRecords: newCount,
    alreadySynced: alreadySyncedCount,
    invalidSkipped: parsed.invalidCount,
    totalValid: updatedStore.length,
    strategyUsed: parsed.strategyUsed,
    allRecords: updatedStore,
    invalidSamples: parsed.invalidSamples
  };

  onProgress({
    stage: 'complete',
    message: `Sync complete. ${newCount} new record(s) imported, ${alreadySyncedCount} already synced, ${parsed.invalidCount} corrupt record(s) skipped.`,
    progress: 100,
    summary
  });

  console.log(`[DMBBHR Sync] Summary: New: ${newCount}, Already Synced: ${alreadySyncedCount}, Invalid Skipped: ${parsed.invalidCount}`);
  console.log('========================================================\n');

  return summary;
}

module.exports = {
  syncBiometricAttendance,
  loadLocalStore,
  saveLocalStore,
  loadSyncCursor,
  saveSyncCursor
};
