/**
 * Robust Attendance Record Parser & Validator for BISMAC BISBIO B-29b
 *
 * Investigates raw device response, auto-detects true packet size,
 * eliminates malformed/corrupted records, and decodes genuine timestamps in Philippine local time.
 */

const timeParser = require('zkteco-js/src/helper/time');

/**
 * Validates a User ID.
 * Must be clean numeric (e.g. 50366, 5009) or clean alphanumeric (e.g. EMP-101).
 * Strictly rejects binary garbage, unprintable characters, or strings containing symbols like '}', '\', '{'.
 */
function isValidUserId(id) {
  if (id === null || id === undefined) return false;
  const str = String(id).trim();
  if (str.length === 0 || str.length > 24) return false;

  // Reject strings with braces, backslashes, control characters, or non-ASCII
  if (/[\\{}\x00-\x1F\x7F-\xFF]/.test(str)) {
    return false;
  }

  // Must be composed of valid alphanumeric characters or hyphens/underscores
  if (!/^[A-Za-z0-9_-]+$/.test(str)) {
    return false;
  }

  // Common corrupted tokens to reject
  if (str === '0' || str === 'Unknown' || str.includes('}2')) {
    return false;
  }

  return true;
}

/**
 * Validates a decoded Attendance Timestamp.
 * Must be a realistic real-world date between 2020 and 2030 (around current year 2026).
 * Strictly rejects year 2000 (null/zero-byte epoch), 1999, 2068 (TCP packet prefix leaked as date), or NaN.
 */
function isValidTimestamp(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return false;
  }

  const year = date.getFullYear();
  // Valid attendance timestamps must fall in modern operational range
  if (year < 2020 || year > 2030) {
    return false;
  }

  return true;
}

/**
 * Safe conversion to Philippine Time string
 */
function formatPhilippineDate(date) {
  try {
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "full",
      timeStyle: "long"
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/**
 * Diagnostic helper: logs raw buffer structure safely
 */
function inspectRawBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return {
      type: typeof buffer,
      isBuffer: false,
      length: 0,
      hexPreview: 'null'
    };
  }

  const length = buffer.length;
  const previewSlice = buffer.subarray(0, Math.min(length, 64));
  const hexPreview = previewSlice.toString('hex').match(/.{1,2}/g)?.join(' ') || '';
  
  // Safe ASCII preview (replaces non-printable bytes with '.')
  let asciiPreview = '';
  for (let i = 0; i < previewSlice.length; i++) {
    const b = previewSlice[i];
    asciiPreview += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
  }

  return {
    isBuffer: true,
    totalBytes: length,
    hexPreview,
    asciiPreview
  };
}

/**
 * Tries parsing a buffer with 16-byte record format
 */
function parseStrategy16(buffer, startOffset = 4) {
  const records = [];
  const RECORD_SIZE = 16;
  if (!buffer || buffer.length < startOffset + RECORD_SIZE) return records;

  let current = buffer.subarray(startOffset);
  while (current.length >= RECORD_SIZE) {
    const slice = current.subarray(0, RECORD_SIZE);
    
    // User ID is stored as 2-byte unsigned integer at offset 0
    const uidNum = slice.readUInt16LE(0);
    const verifyType = slice.readUInt8(2);
    const status = slice.readUInt8(3);
    const timeRaw = slice.readUInt32LE(4);
    const date = timeParser.decode(timeRaw);
    const sn = slice.readUInt16LE(8);

    records.push({
      userId: String(uidNum),
      date,
      type: verifyType,
      state: status,
      sn
    });

    current = current.subarray(RECORD_SIZE);
  }

  return records;
}

/**
 * Tries parsing a buffer with 40-byte TFT record format
 */
function parseStrategy40(buffer, startOffset = 4) {
  const records = [];
  const RECORD_SIZE = 40;
  if (!buffer || buffer.length < startOffset + RECORD_SIZE) return records;

  let current = buffer.subarray(startOffset);
  while (current.length >= RECORD_SIZE) {
    const slice = current.subarray(0, RECORD_SIZE);
    
    const sn = slice.readUInt16LE(0);
    // User ID null-terminated ASCII string at offset 2 (up to 24 bytes)
    const rawUid = slice.slice(2, 26).toString('ascii').replace(/\0.*$/, '').trim();
    const verifyType = slice.readUInt8(26);
    const timeRaw = slice.readUInt32LE(27);
    const date = timeParser.decode(timeRaw);
    const status = slice.readUInt8(31);

    records.push({
      userId: rawUid,
      date,
      type: verifyType,
      state: status,
      sn
    });

    current = current.subarray(RECORD_SIZE);
  }

  return records;
}

/**
 * Tries parsing a buffer with 8-byte record format
 */
function parseStrategy8(buffer, startOffset = 4) {
  const records = [];
  const RECORD_SIZE = 8;
  if (!buffer || buffer.length < startOffset + RECORD_SIZE) return records;

  let current = buffer.subarray(startOffset);
  while (current.length >= RECORD_SIZE) {
    const slice = current.subarray(0, RECORD_SIZE);
    
    const uidNum = slice.readUInt16LE(0);
    const status = slice.readUInt8(2);
    const verifyType = slice.readUInt8(3);
    const timeRaw = slice.readUInt32LE(4);
    const date = timeParser.decode(timeRaw);

    records.push({
      userId: String(uidNum),
      date,
      type: verifyType,
      state: status,
      sn: 0
    });

    current = current.subarray(RECORD_SIZE);
  }

  return records;
}

/**
 * Evaluates candidate records and returns valid & invalid counts
 */
function scoreCandidateRecords(candidateList) {
  let validCount = 0;
  let invalidCount = 0;

  for (const item of candidateList) {
    if (isValidUserId(item.userId) && isValidTimestamp(item.date)) {
      validCount++;
    } else {
      invalidCount++;
    }
  }

  return { validCount, invalidCount, total: candidateList.length };
}

/**
 * Master parser and validator
 */
function parseAndValidateAttendance(rawBuffer, libraryRecords = [], config = {}, userMap = new Map()) {
  const diagnostic = inspectRawBuffer(rawBuffer);

  console.log('\n========================================================');
  console.log('[DMBBHR Parser] DIAGNOSTIC: Raw Attendance Buffer Analysis');
  console.log('========================================================');
  console.log(`Buffer Total Bytes: ${diagnostic.totalBytes}`);
  console.log(`First 64 Bytes (Hex):`);
  console.log(`  ${diagnostic.hexPreview}`);
  console.log(`First 64 Bytes (ASCII Preview):`);
  console.log(`  "${diagnostic.asciiPreview}"`);
  console.log(`Library Parsed Records Count: ${libraryRecords.length}`);

  // Test candidate parsing strategies
  const candidateStrategies = [];

  // Strategy 1: Library's own output (if clean)
  if (libraryRecords.length > 0) {
    const libCandidate = libraryRecords.map(r => ({
      userId: String(r.user_id ?? r.userId ?? '').trim(),
      date: r.record_time instanceof Date ? r.record_time : new Date(r.record_time || r.dateTime || 0),
      type: Number(r.type ?? 1),
      state: Number(r.state ?? 1),
      sn: Number(r.sn ?? r.serial ?? 0)
    }));
    const score = scoreCandidateRecords(libCandidate);
    candidateStrategies.push({ name: 'Library 40-byte Default', records: libCandidate, score });
  }

  // Strategy 2: 16-byte record with 4-byte offset
  if (rawBuffer && rawBuffer.length > 4) {
    const s16_4 = parseStrategy16(rawBuffer, 4);
    candidateStrategies.push({ name: '16-Byte Record (Offset 4)', records: s16_4, score: scoreCandidateRecords(s16_4) });

    const s16_0 = parseStrategy16(rawBuffer, 0);
    candidateStrategies.push({ name: '16-Byte Record (Offset 0)', records: s16_0, score: scoreCandidateRecords(s16_0) });

    const s40_4 = parseStrategy40(rawBuffer, 4);
    candidateStrategies.push({ name: '40-Byte Record (Offset 4)', records: s40_4, score: scoreCandidateRecords(s40_4) });

    const s40_0 = parseStrategy40(rawBuffer, 0);
    candidateStrategies.push({ name: '40-Byte Record (Offset 0)', records: s40_0, score: scoreCandidateRecords(s40_0) });

    const s8_4 = parseStrategy8(rawBuffer, 4);
    candidateStrategies.push({ name: '8-Byte Record (Offset 4)', records: s8_4, score: scoreCandidateRecords(s8_4) });
  }

  // Log scores of each strategy
  console.log('[DMBBHR Parser] Strategy Candidate Evaluation:');
  for (const strat of candidateStrategies) {
    console.log(`  - ${strat.name.padEnd(28)}: ${strat.score.validCount} Valid, ${strat.score.invalidCount} Invalid (Total: ${strat.score.total})`);
  }

  // Choose the strategy with the highest number of valid records
  let bestStrategy = candidateStrategies[0];
  for (const strat of candidateStrategies) {
    if (strat.score.validCount > (bestStrategy ? bestStrategy.score.validCount : 0)) {
      bestStrategy = strat;
    }
  }

  const selectedStrategyName = bestStrategy ? bestStrategy.name : 'None';
  console.log(`[DMBBHR Parser] Selected Best Strategy: "${selectedStrategyName}"`);
  console.log('========================================================\n');

  // Filter and normalize valid records only with occurrence-aware identity
  const validRecords = [];
  const invalidRecords = [];
  const batchOccurrenceMap = new Map();

  const rawCandidateList = bestStrategy ? bestStrategy.records : [];
  for (const item of rawCandidateList) {
    const userValid = isValidUserId(item.userId);
    const dateValid = isValidTimestamp(item.date);

    if (userValid && dateValid) {
      const uid = String(item.userId).trim();
      const empName = userMap.get(uid) || 'Biometric User';
      const sn = Number(item.sn || 0);
      const timeSec = Math.floor(item.date.getTime() / 1000);
      const type = Number(item.type ?? 1);
      const state = Number(item.state ?? 1);
      const ip = config.ip || '192.168.1.201';

      const sig = `${ip}:${uid}:${timeSec}:${type}:${state}`;
      const occIndex = (batchOccurrenceMap.get(sig) || 0) + 1;
      batchOccurrenceMap.set(sig, occIndex);

      validRecords.push({
        id: `punch_${sig}_occ${occIndex}`,
        user_id: uid,
        employee_id: undefined,
        employee_name: empName,
        attendance_time: item.date.toISOString(),
        philippines_time: formatPhilippineDate(item.date),
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
        timestamp: item.date.toISOString(),
        deviceId: config.serial || '0476141400046',
        deviceName: config.name || 'BISMAC BISBIO B-29b',
        verificationMethod: type,
        status: state,
        source: 'manual_sync',
        created_at: new Date().toISOString()
      });
    } else {
      invalidRecords.push({
        rawUserId: item.userId,
        rawDate: item.date instanceof Date ? item.date.toString() : String(item.date),
        reason: !userValid ? 'Invalid User ID format or unprintable characters' : 'Invalid/Corrupt timestamp'
      });
    }
  }

  return {
    strategyUsed: selectedStrategyName,
    diagnostic,
    validRecords,
    invalidCount: invalidRecords.length,
    invalidSamples: invalidRecords.slice(0, 5)
  };
}

module.exports = {
  isValidUserId,
  isValidTimestamp,
  formatPhilippineDate,
  inspectRawBuffer,
  parseAndValidateAttendance
};
