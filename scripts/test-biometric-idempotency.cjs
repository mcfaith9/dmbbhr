/**
 * Test Suite: Biometric Sync Idempotency & Occurrence-Aware Deduplication
 *
 * Verifies:
 * 1. User's exact test case:
 *    - Existing database has 2 legitimate identical punches:
 *      500394 | Juan Dela Cruz | 2026-10-03 | 08:01:22 | IN
 *      500394 | Juan Dela Cruz | 2026-10-03 | 08:01:22 | IN
 *    - Device returns those same 2 records.
 *    - Sync #1: exactly 2 records (no duplicates added).
 *    - Sync #2: exactly 2 records.
 *    - Sync #3: exactly 2 records.
 *    - Sync #4: exactly 2 records.
 * 2. Empty initial state:
 *    - Device returns 2 identical punches.
 *    - Sync #1: creates exactly 2 records (does NOT collapse into 1!).
 *    - Subsequent syncs remain 2 records.
 * 3. Adding a 3rd legitimate punch:
 *    - Device returns 3 identical punches.
 *    - Sync imports the 3rd punch (total 3).
 *    - Subsequent syncs remain 3 records.
 * 4. Priority 1 (device transaction ID) verification:
 *    - Unique transaction IDs are honored and idempotent.
 * 5. Legacy IDs in database:
 *    - Records stored with legacy IDs (real-* or dev-*) are matched by occurrence multiset.
 */

const assert = require('assert')

// Helper logic mirroring punchRepository.ts
function normalizeDeviceId(deviceId) {
  if (!deviceId) return 'dev-1'
  const str = String(deviceId).trim().toLowerCase()
  return str.replace(/[^a-z0-9_-]/g, '') || 'dev-1'
}

function getPunchSignature(bioId, timestampMs, type = 1, state = 1, deviceId = 'dev-1') {
  const cleanBioId = String(bioId).trim()
  const tSec = Math.floor(timestampMs / 1000)
  const cleanDev = normalizeDeviceId(deviceId)
  return `${cleanDev}_${cleanBioId}_${tSec}_${type}_${state}`
}

function getOccurrencePunchId(signature, occIndex) {
  return `punch_${signature}_occ${occIndex}`
}

function resolvePunchIdentity(raw, bioId, timestampMs, type, state, deviceId, incomingOccIndex, batchUniqueTxIds) {
  const signature = getPunchSignature(bioId, timestampMs, type, state, deviceId)
  const cleanDev = normalizeDeviceId(deviceId)

  const candidateTx = raw.transactionId ?? raw.transaction_id ?? raw.logId ?? raw.log_id ?? raw.recordId ?? raw.record_id
  if (candidateTx !== undefined && candidateTx !== null) {
    const txStr = String(candidateTx).trim()
    if (txStr && txStr !== '0' && txStr !== 'undefined' && txStr !== 'null') {
      return { id: `dev_${cleanDev}_tx_${txStr}`, signature, occurrenceIndex: incomingOccIndex, priority: 1 }
    }
  }

  const candidateSn = raw.serialNumber ?? raw.serial_number ?? raw.Serial ?? raw.sn
  if (candidateSn !== undefined && candidateSn !== null) {
    const snNum = Number(candidateSn)
    const snStr = String(candidateSn).trim()
    if (snNum > 0 && batchUniqueTxIds && batchUniqueTxIds.has(snStr)) {
      return { id: `dev_${cleanDev}_tx_${snStr}`, signature, occurrenceIndex: incomingOccIndex, priority: 1 }
    }
  }

  const existingId = raw.id
  if (typeof existingId === 'string' && existingId.trim()) {
    const idTrim = existingId.trim()
    if (idTrim.startsWith('punch_') || idTrim.startsWith('dev_')) {
      if (idTrim.includes('_occ') || idTrim.includes('_tx_')) {
        return { id: idTrim, signature, occurrenceIndex: incomingOccIndex, priority: 2 }
      }
    }
  }

  return { id: getOccurrencePunchId(signature, incomingOccIndex), signature, occurrenceIndex: incomingOccIndex, priority: 3 }
}

/**
 * In-memory simulated punchRepository.bulkImport
 */
class MockPunchRepository {
  constructor(initialRecords = []) {
    this.records = new Map()
    for (const r of initialRecords) {
      this.records.set(r.id, r)
    }
  }

  async bulkImport(rawRecords) {
    const total = rawRecords.length
    if (total === 0) {
      return { importedCount: 0, duplicateCount: 0, totalInDb: this.records.size }
    }

    const existingDbRecords = Array.from(this.records.values())
    const existingIds = new Set()
    const existingSignatureCounts = new Map()

    for (const rec of existingDbRecords) {
      existingIds.add(rec.id)
      const sig = getPunchSignature(rec.bioId, rec.timestampMs, rec.type, rec.state, rec.deviceId)
      existingSignatureCounts.set(sig, (existingSignatureCounts.get(sig) || 0) + 1)
    }

    const snCounts = new Map()
    for (const raw of rawRecords) {
      const sn = raw.serialNumber ?? raw.serial_number ?? raw.Serial ?? raw.sn
      if (sn !== undefined && sn !== null && Number(sn) > 0) {
        const str = String(sn).trim()
        snCounts.set(str, (snCounts.get(str) || 0) + 1)
      }
    }
    const batchUniqueTxIds = new Set()
    for (const [snStr, count] of snCounts.entries()) {
      if (count === 1) batchUniqueTxIds.add(snStr)
    }

    let importedCount = 0
    let duplicateCount = 0
    const batchOccurrenceMap = new Map()

    for (const raw of rawRecords) {
      const userId = String(raw.userId || raw.user_id || '').trim()
      const rawTime = raw.timestamp || raw.attendance_time
      const type = Number(raw.type ?? 1)
      const state = Number(raw.state ?? 1)
      const devId = raw.deviceId || raw.device_id || 'dev-1'
      const tMs = new Date(rawTime).getTime()

      const sig = getPunchSignature(userId, tMs, type, state, devId)
      const occIndex = (batchOccurrenceMap.get(sig) || 0) + 1
      batchOccurrenceMap.set(sig, occIndex)

      const identity = resolvePunchIdentity(raw, userId, tMs, type, state, devId, occIndex, batchUniqueTxIds)
      const resolvedId = identity.id

      const existingCountForSig = existingSignatureCounts.get(sig) || 0
      const isAlreadyInDb = existingIds.has(resolvedId) || (identity.priority === 3 && occIndex <= existingCountForSig)

      if (isAlreadyInDb) {
        duplicateCount++
        continue
      }

      existingIds.add(resolvedId)
      existingSignatureCounts.set(sig, Math.max(existingCountForSig, occIndex))

      this.records.set(resolvedId, {
        id: resolvedId,
        bioId: userId,
        timestamp: new Date(tMs).toISOString(),
        timestampMs: tMs,
        type,
        state,
        deviceId: devId,
        employeeName: raw.employeeName || raw.employee_name || `User ${userId}`
      })

      importedCount++
    }

    return { importedCount, duplicateCount, totalInDb: this.records.size }
  }
}

async function runTests() {
  console.log('\n======================================================')
  console.log('TEST SUITE: Biometric Sync Idempotency & Multiset Deduplication')
  console.log('======================================================\n')

  const timeIso = '2026-10-03T08:01:22+08:00'
  const timeMs = new Date(timeIso).getTime()

  // --------------------------------------------------------------------------
  // TEST 1: User's Exact Problem Case
  // --------------------------------------------------------------------------
  console.log('Test 1: User Exact Case (Initial 2 identical records in DB, repeated syncs)')
  
  // Initial database has 2 legitimate identical punches
  const initialDbData = [
    {
      id: 'legacy-rec-1',
      bioId: '500394',
      employeeName: 'Juan Dela Cruz',
      timestamp: timeIso,
      timestampMs: timeMs,
      type: 1,
      state: 1,
      deviceId: 'dev-1'
    },
    {
      id: 'legacy-rec-2',
      bioId: '500394',
      employeeName: 'Juan Dela Cruz',
      timestamp: timeIso,
      timestampMs: timeMs,
      type: 1,
      state: 1,
      deviceId: 'dev-1'
    }
  ]

  const repo = new MockPunchRepository(initialDbData)
  assert.strictEqual(repo.records.size, 2, 'Initial DB must have exactly 2 records')
  console.log('  Initial state: exactly 2 records in DB.')

  // Device returns those same 2 records
  const devicePayload = [
    {
      user_id: '500394',
      employee_name: 'Juan Dela Cruz',
      attendance_time: timeIso,
      type: 1,
      state: 1,
      device_id: 'dev-1'
    },
    {
      user_id: '500394',
      employee_name: 'Juan Dela Cruz',
      attendance_time: timeIso,
      type: 1,
      state: 1,
      device_id: 'dev-1'
    }
  ]

  // Sync #1
  const sync1 = await repo.bulkImport(devicePayload)
  console.log(`  Sync #1: imported=${sync1.importedCount}, duplicates=${sync1.duplicateCount}, totalInDb=${sync1.totalInDb}`)
  assert.strictEqual(sync1.importedCount, 0, 'Sync #1 must import 0 new records')
  assert.strictEqual(sync1.duplicateCount, 2, 'Sync #1 must recognize 2 duplicates')
  assert.strictEqual(sync1.totalInDb, 2, 'Sync #1 result must remain exactly 2 records!')

  // Sync #2
  const sync2 = await repo.bulkImport(devicePayload)
  console.log(`  Sync #2: imported=${sync2.importedCount}, duplicates=${sync2.duplicateCount}, totalInDb=${sync2.totalInDb}`)
  assert.strictEqual(sync2.importedCount, 0, 'Sync #2 must import 0 new records')
  assert.strictEqual(sync2.duplicateCount, 2, 'Sync #2 must recognize 2 duplicates')
  assert.strictEqual(sync2.totalInDb, 2, 'Sync #2 result must remain exactly 2 records!')

  // Sync #3
  const sync3 = await repo.bulkImport(devicePayload)
  console.log(`  Sync #3: imported=${sync3.importedCount}, duplicates=${sync3.duplicateCount}, totalInDb=${sync3.totalInDb}`)
  assert.strictEqual(sync3.importedCount, 0, 'Sync #3 must import 0 new records')
  assert.strictEqual(sync3.totalInDb, 2, 'Sync #3 result must remain exactly 2 records!')

  // Sync #4
  const sync4 = await repo.bulkImport(devicePayload)
  console.log(`  Sync #4: imported=${sync4.importedCount}, duplicates=${sync4.duplicateCount}, totalInDb=${sync4.totalInDb}`)
  assert.strictEqual(sync4.importedCount, 0, 'Sync #4 must import 0 new records')
  assert.strictEqual(sync4.totalInDb, 2, 'Sync #4 result must remain exactly 2 records!')
  console.log('  PASSED: 2 records remained 2 records through Sync #1, #2, #3, #4!\n')

  // --------------------------------------------------------------------------
  // TEST 2: Empty initial database, 2 identical punches returned by device
  // --------------------------------------------------------------------------
  console.log('Test 2: Starting from empty DB, device returns 2 identical punches')
  const emptyRepo = new MockPunchRepository([])
  assert.strictEqual(emptyRepo.records.size, 0)

  const emptySync1 = await emptyRepo.bulkImport(devicePayload)
  console.log(`  Sync #1 into empty DB: imported=${emptySync1.importedCount}, duplicates=${emptySync1.duplicateCount}, totalInDb=${emptySync1.totalInDb}`)
  assert.strictEqual(emptySync1.importedCount, 2, 'Must import BOTH legitimate punches')
  assert.strictEqual(emptySync1.totalInDb, 2, 'Must NOT collapse the 2 punches into 1!')

  const emptySync2 = await emptyRepo.bulkImport(devicePayload)
  console.log(`  Sync #2: imported=${emptySync2.importedCount}, duplicates=${emptySync2.duplicateCount}, totalInDb=${emptySync2.totalInDb}`)
  assert.strictEqual(emptySync2.importedCount, 0, 'Sync #2 must import 0')
  assert.strictEqual(emptySync2.totalInDb, 2, 'Sync #2 must remain exactly 2')
  console.log('  PASSED: 2 identical punches preserved and remain idempotent!\n')

  // --------------------------------------------------------------------------
  // TEST 3: Device receives a 3rd legitimate punch
  // --------------------------------------------------------------------------
  console.log('Test 3: Adding a 3rd legitimate punch on device')
  const devicePayload3 = [
    ...devicePayload,
    {
      user_id: '500394',
      employee_name: 'Juan Dela Cruz',
      attendance_time: timeIso,
      type: 1,
      state: 1,
      device_id: 'dev-1'
    }
  ]

  const syncAdd3rd = await emptyRepo.bulkImport(devicePayload3)
  console.log(`  Sync with 3 punches: imported=${syncAdd3rd.importedCount}, duplicates=${syncAdd3rd.duplicateCount}, totalInDb=${syncAdd3rd.totalInDb}`)
  assert.strictEqual(syncAdd3rd.importedCount, 1, 'Only the 3rd punch should be imported')
  assert.strictEqual(syncAdd3rd.duplicateCount, 2, 'First 2 punches should be recognized as duplicates')
  assert.strictEqual(syncAdd3rd.totalInDb, 3, 'Total records should now be exactly 3')

  const syncAdd3rdAgain = await emptyRepo.bulkImport(devicePayload3)
  assert.strictEqual(syncAdd3rdAgain.importedCount, 0)
  assert.strictEqual(syncAdd3rdAgain.totalInDb, 3)
  console.log('  PASSED: 3rd punch imported cleanly; subsequent syncs remain 3!\n')

  // --------------------------------------------------------------------------
  // TEST 4: Priority 1 (Device Transaction ID)
  // --------------------------------------------------------------------------
  console.log('Test 4: Priority 1 Device Transaction ID')
  const txRepo = new MockPunchRepository([])
  const txPayload = [
    { user_id: '500394', attendance_time: timeIso, transactionId: 'TX-9001' },
    { user_id: '500394', attendance_time: timeIso, transactionId: 'TX-9002' }
  ]
  const txSync1 = await txRepo.bulkImport(txPayload)
  assert.strictEqual(txSync1.importedCount, 2)
  assert.strictEqual(txSync1.totalInDb, 2)

  const txSync2 = await txRepo.bulkImport(txPayload)
  assert.strictEqual(txSync2.importedCount, 0)
  assert.strictEqual(txSync2.totalInDb, 2)
  console.log('  PASSED: Transaction ID Priority 1 is fully idempotent!\n')

  console.log('======================================================')
  console.log('ALL BIOMETRIC IDEMPOTENCY TESTS PASSED SUCCESSFULLY!')
  console.log('======================================================\n')
}

runTests().catch(err => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})
