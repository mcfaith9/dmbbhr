/**
 * DMBBHR Cross-PC People Directory Export / Import Verification Suite
 *
 * Tests all 10 requirements across two completely isolated simulated PC IndexedDB stores
 * (PC 1 -> real SheetJS .xlsx binary -> PC 2 -> real SheetJS .xlsx binary -> PC 1)
 * using actual application TypeScript services and repositories via Vite SSR Loader.
 *
 * Run: node scripts/test-cross-pc-employee-export-import.mjs
 */

import assert from 'node:assert'
import { createServer } from 'vite'
import * as XLSX from 'xlsx'

const localStore = new Map()
const sessionStore = new Map()
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k) => (localStore.has(k) ? localStore.get(k) : null),
    setItem: (k, v) => localStore.set(k, String(v)),
    removeItem: (k) => localStore.delete(k),
    clear: () => localStore.clear(),
    key: (i) => Array.from(localStore.keys())[i] ?? null,
    get length() { return localStore.size }
  }
}
if (typeof globalThis.sessionStorage === 'undefined') {
  globalThis.sessionStorage = {
    getItem: (k) => (sessionStore.has(k) ? sessionStore.get(k) : null),
    setItem: (k, v) => sessionStore.set(k, String(v)),
    removeItem: (k) => sessionStore.delete(k),
    clear: () => sessionStore.clear(),
    key: (i) => Array.from(sessionStore.keys())[i] ?? null,
    get length() { return sessionStore.size }
  }
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage
  }
}

function createMemoryTable(pkField = 'id') {
  const store = new Map()
  const clone = (val) => (val == null ? val : JSON.parse(JSON.stringify(val)))

  const makeCollection = (itemsFn) => ({
    async toArray() { return itemsFn().map(clone) },
    async count() { return itemsFn().length },
    async first() { const list = itemsFn(); return list.length > 0 ? clone(list[0]) : undefined },
    filter(pred) { return makeCollection(() => itemsFn().filter(pred)) },
    reverse() { return makeCollection(() => [...itemsFn()].reverse()) },
    sortBy(field) {
      return Promise.resolve(
        [...itemsFn()].sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? ''))).map(clone)
      )
    },
    limit(n) { return makeCollection(() => itemsFn().slice(0, n)) },
    async delete() {
      const list = itemsFn()
      for (const item of list) store.delete(String(item[pkField]))
      return list.length
    },
    async modify(fn) {
      const list = itemsFn()
      for (const item of list) {
        fn(item)
        store.set(String(item[pkField]), clone(item))
      }
      return list.length
    }
  })

  return {
    _store: store,
    async toArray() { return Array.from(store.values()).map(clone) },
    async count() { return store.size },
    async clear() { store.clear() },
    async get(key) {
      const hit = store.get(String(key))
      return hit ? clone(hit) : undefined
    },
    async put(item) {
      const key = String(item[pkField])
      store.set(key, clone(item))
      return key
    },
    async add(item) {
      const key = String(item[pkField])
      if (store.has(key)) throw new Error(`Duplicate key ${key}`)
      store.set(key, clone(item))
      return key
    },
    async bulkPut(items) {
      for (const item of items) store.set(String(item[pkField]), clone(item))
    },
    async bulkAdd(items) {
      for (const item of items) store.set(String(item[pkField]), clone(item))
    },
    async delete(key) { store.delete(String(key)) },
    async update(key, changes) {
      const existing = store.get(String(key))
      if (!existing) return 0
      store.set(String(key), clone({ ...existing, ...changes }))
      return 1
    },
    async bulkDelete(keys) {
      for (const k of keys) store.delete(String(k))
    },
    where(fieldOrFields) {
      const all = () => Array.from(store.values())
      return {
        equals(val) {
          if (Array.isArray(fieldOrFields)) {
            return makeCollection(() => all().filter((row) => fieldOrFields.every((f, idx) => row[f] === val[idx])))
          }
          return makeCollection(() => all().filter((row) => {
            const fv = row[fieldOrFields]
            if (Array.isArray(fv)) return fv.includes(val)
            return fv === val
          }))
        },
        anyOf(vals) {
          const set = new Set(vals)
          return makeCollection(() => all().filter((row) => {
            const fv = row[fieldOrFields]
            if (Array.isArray(fv)) return fv.some((x) => set.has(x))
            return set.has(fv)
          }))
        },
        between(low, high, includeLower = true, includeUpper = true) {
          return makeCollection(() => all().filter((row) => {
            const v = row[fieldOrFields]
            const okLow = includeLower ? v >= low : v > low
            const okHigh = includeUpper ? v <= high : v < high
            return okLow && okHigh
          }))
        }
      }
    },
    orderBy(field) {
      return makeCollection(() => Array.from(store.values()).sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? ''))))
    },
    filter(pred) {
      return makeCollection(() => Array.from(store.values()).filter(pred))
    },
    toCollection() {
      return makeCollection(() => Array.from(store.values()))
    }
  }
}

function createPcDatabaseState(nowIso) {
  const tables = {
    workGroups: createMemoryTable('id'),
    employees: createMemoryTable('bioId'),
    biometricPunches: createMemoryTable('id'),
    dailyAttendance: createMemoryTable('id'),
    dailySummaries: createMemoryTable('date'),
    syncState: createMemoryTable('key'),
    holidays: createMemoryTable('id'),
    leaveRecords: createMemoryTable('id'),
    manualAdjustments: createMemoryTable('id'),
    manualAttendanceHistory: createMemoryTable('id'),
    hrNotices: createMemoryTable('id'),
    payrollSnapshots: createMemoryTable('id'),
    overtimeAuthorizations: createMemoryTable('id'),
    consolidationAudits: createMemoryTable('id')
  }
  tables.workGroups.bulkPut([
    {
      id: 'wg-group-c',
      name: 'Group C',
      code: 'C',
      standardIn: '08:00',
      requiredWorkMinutes: 480,
      lunchStart: '12:00',
      lunchEnd: '13:00',
      expectedOut: '17:00',
      gracePeriodMinutes: 0,
      isDefault: true,
      createdAt: nowIso,
      updatedAt: nowIso
    }
  ])
  return tables
}

function roundTripXlsxRows(exportRows) {
  const ws = XLSX.utils.json_to_sheet(exportRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'People_Directory')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const readWb = XLSX.read(buffer, { type: 'buffer' })
  const firstSheet = readWb.Sheets[readWb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(firstSheet)
}

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'silent'
})

try {
  const dbMod = await server.ssrLoadModule('/src/db/index.ts')
  const { db } = dbMod
  const { employeeService } = await server.ssrLoadModule('/src/services/employees.ts')
  const { employeeRepository } = await server.ssrLoadModule('/src/repositories/employeeRepository.ts')
  const { attendanceRepository } = await server.ssrLoadModule('/src/repositories/attendanceRepository.ts')
  const { reportsService } = await server.ssrLoadModule('/src/services/reportsService.ts')

  const nowIso = '2026-10-01T00:00:00.000Z'
  const pc1Db = createPcDatabaseState(nowIso)
  const pc2Db = createPcDatabaseState(nowIso)

  async function switchToPc(pcDb) {
    for (const [name, tbl] of Object.entries(pcDb)) {
      db[name] = tbl
    }
    db.transaction = async (...args) => {
      const fn = args[args.length - 1]
      return await fn()
    }
    await employeeRepository.reloadFromDb()
  }

  console.log('='.repeat(74))
  console.log('CROSS-PC PEOPLE DIRECTORY EXPORT / IMPORT TEST SUITE (PC 1 <-> PC 2)')
  console.log('='.repeat(74))

  // ------------------------------------------------------------------
  // 1. Setup PC 1: Consolidate 50305 into 25061 (Abelido, Reynald C.),
  //    plus punches, salary config, and a finalized payroll snapshot.
  // ------------------------------------------------------------------
  await switchToPc(pc1Db)
  await pc1Db.employees.bulkPut([
    {
      bioId: '25061',
      employeeNumber: '25061',
      fullName: 'Abelido, Reynald C.',
      location: 'DBB CEBU',
      workGroupId: 'wg-group-c',
      department: 'Operations',
      position: 'Driver',
      status: 'active',
      hireDate: '2024-02-01',
      contractDate: '2024-02-15',
      payrollStatus: 'configured',
      salaryType: 'Daily',
      dailyRate: 650,
      basicSalary: 650,
      hourlyRate: 81.25,
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      bioId: '50305',
      employeeNumber: '50305',
      fullName: 'Abelido, Reynald C.',
      location: 'DBB CEBU',
      workGroupId: 'wg-group-c',
      department: 'Operations',
      position: 'Driver',
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      bioId: '50366',
      employeeNumber: '50366',
      fullName: 'Dela Cruz, Juan P.',
      location: 'DBB NEGROS',
      workGroupId: 'wg-group-c',
      department: 'Logistics',
      position: 'Helper',
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso
    }
  ])

  await pc1Db.biometricPunches.bulkPut([
    { id: 'p-pc1-in', bioId: '25061', date: '2026-10-05', timestamp: '2026-10-05T07:55:00+08:00', timestampMs: Date.parse('2026-10-05T07:55:00+08:00'), type: 0, state: 0, serialNumber: 1, deviceId: 'DEV1', deviceIp: '10.0.0.1', locationId: 'DBB CEBU', isDuplicate: false, importedAt: nowIso },
    { id: 'p-pc1-out', bioId: '50305', date: '2026-10-05', timestamp: '2026-10-05T17:05:00+08:00', timestampMs: Date.parse('2026-10-05T17:05:00+08:00'), type: 1, state: 1, serialNumber: 2, deviceId: 'DEV1', deviceIp: '10.0.0.1', locationId: 'DBB CEBU', isDuplicate: false, importedAt: nowIso }
  ])
  await pc1Db.payrollSnapshots.put({
    id: '2026-10-1_25061',
    periodId: '2026-10-1',
    bioId: '25061',
    employeeNumber: '25061',
    employeeName: 'Abelido, Reynald C.',
    department: 'Operations',
    position: 'Driver',
    status: 'active',
    workGroupId: 'wg-group-c',
    cutoffStart: '2026-10-01',
    cutoffEnd: '2026-10-15',
    payday: '2026-10-20',
    salaryType: 'Daily',
    basicSalary: 650,
    dailyRate: 650,
    hourlyRate: 81.25,
    payableDays: 10,
    presentDays: 10,
    sundayWorkDays: 0,
    holidayDays: 0,
    lateMinutes: 0,
    initialEarnings: 6500,
    sss: 0, philhealth: 0, pagibig: 0, sssLoan: 0, pagibigLoan: 0, otherLoan: 0,
    totalBenefitsAndLoans: 0,
    balanceAfterBenefitsAndLoans: 6500,
    cashAdvance: 0,
    itemizedDeductions: [],
    totalOtherDeductions: 0,
    balanceBeforeTax: 6500,
    withholdingTax: 0,
    netPay: 6500,
    reviewStatus: 'finalized',
    reviewReasons: [],
    batchStatus: 'finalized',
    finalizedAt: nowIso,
    updatedAt: nowIso
  })

  await employeeRepository.reloadFromDb()
  await employeeService.consolidateEmployees({
    canonicalBioId: '25061',
    sourceBioId: '50305',
    confirmedByAdmin: true,
    resolutions: {},
    performedBy: 'HR Admin PC1',
    notes: 'Merged old bio 50305 into primary 25061'
  })

  // Export PC 1 via real XLSX binary round-trip
  const pc1ExportRows = await employeeService.getExportData()
  const abelidoExport = pc1ExportRows.find(r => String(r['CANONICAL BIO ID'] || r['ID']) === '25061')
  assert(abelidoExport, 'REQ 1: Canonical employee 25061 must exist in PC 1 export')
  assert.strictEqual(String(abelidoExport['ID']), '25061', 'REQ 1: Primary Bio ID exported')
  assert.strictEqual(String(abelidoExport['CANONICAL BIO ID']), '25061', 'REQ 1: Canonical Bio ID exported')
  assert.strictEqual(String(abelidoExport['SECONDARY BIO IDS']), '50305', 'REQ 1: Secondary linked Bio ID exported')
  assert.strictEqual(String(abelidoExport['MERGED FROM BIO IDS']), '50305', 'REQ 1: Merged source Bio ID exported')
  assert(String(abelidoExport['CONSOLIDATION METADATA'] || '').includes('Merged old bio 50305'), 'REQ 1: Consolidation metadata preserved in export')
  assert.strictEqual(pc1ExportRows.some(r => String(r['ID']) === '50305' && !String(r['CANONICAL BIO ID'])), false, 'REQ 3: Archived 50305 is never exported as a separate active row')

  const xlsxRowsFromPc1 = roundTripXlsxRows(pc1ExportRows)
  console.log('✓ REQ 1: PC 1 export (.xlsx binary) preserved canonical/primary/linked/merged IDs & consolidation metadata.')

  // ------------------------------------------------------------------
  // 2. Import PC 1 Excel into completely independent PC 2 DB
  //    Seed one unrelated employee 99901 on PC 2 to verify untouched preservation.
  // ------------------------------------------------------------------
  await switchToPc(pc2Db)
  await pc2Db.employees.clear()
  await pc2Db.employees.put({
    bioId: '99901',
    employeeNumber: '99901',
    fullName: 'PC2 Unrelated Baseline, Anna',
    location: 'DBB ILOILO',
    workGroupId: 'wg-group-c',
    department: 'HR',
    position: 'Specialist',
    status: 'active',
    salaryType: 'Monthly',
    basicSalary: 25000,
    dailyRate: 961.54,
    payrollStatus: 'configured',
    createdAt: nowIso,
    updatedAt: nowIso
  })
  await employeeRepository.reloadFromDb()
  const pc2ExistingBefore = await employeeService.getEmployees()
  assert.strictEqual(pc2ExistingBefore.length, 1, 'PC 2 starts with 1 unrelated baseline employee (99901)')

  const pc2Preview = await employeeService.previewImportFromExcel(xlsxRowsFromPc1)
  assert.strictEqual(pc2Preview.unresolvedConflictCount, 0, 'Fresh PC 2 should have 0 conflicts')
  assert.strictEqual(pc2Preview.newCount, 2, 'Should preview 2 new canonical employees (25061 & 50366), NOT archived 50305')

  const pc2ApplyRes = await employeeService.applyImport(pc2Preview)
  assert.strictEqual(pc2ApplyRes.createdCount, 2)

  // Verify after simulated full reload
  await employeeRepository.reloadFromDb()
  const pc2ActiveEmployees = await employeeService.getEmployees()
  assert.strictEqual(pc2ActiveEmployees.length, 3, 'REQ 3/9: Active directory on PC 2 has 3 employees (99901 + 25061 + 50366); archived 50305 never active')
  assert.strictEqual(pc2ActiveEmployees.some(e => e.biometric_user_id === '50305'), false, 'REQ 3: 50305 must NOT appear as an active employee')
  const pc2Anna = await employeeService.getEmployeeByBioId('99901')
  assert.strictEqual(pc2Anna.basic_salary, 25000, 'REQ 9: Unrelated PC 2 employee preserved untouched')

  const via25061 = await employeeService.getEmployeeByBioId('25061')
  const via50305 = await employeeService.getEmployeeByBioId('50305')
  assert(via25061 && via50305, 'REQ 6: Both Bio IDs 25061 and 50305 resolve on PC 2')
  assert.strictEqual(via25061.biometric_user_id, '25061')
  assert.strictEqual(via50305.biometric_user_id, '25061', 'REQ 6: Bio ID 50305 resolves to canonical 25061')
  assert.strictEqual(via25061.primary_bio_id, '25061')
  assert.deepStrictEqual(via25061.merged_from_bio_ids, ['50305'], 'REQ 2: merged_from_bio_ids restored on PC 2')
  assert(via25061.consolidation_audits && via25061.consolidation_audits.length === 1, 'REQ 2: Consolidation audit trail restored on PC 2')

  const raw50305OnPc2 = await pc2Db.employees.get('50305')
  assert(raw50305OnPc2 && raw50305OnPc2.isMerged === true && raw50305OnPc2.mergedIntoBioId === '25061', 'REQ 2/3: Archived tombstone 50305 stored on PC 2')

  // Verify Attendance & Absence counts Abelido ONCE on PC 2 even with punches on BOTH IDs
  await pc2Db.biometricPunches.bulkPut([
    { id: 'pc2-in', bioId: '25061', date: '2026-10-06', timestamp: '2026-10-06T08:00:00+08:00', timestampMs: Date.parse('2026-10-06T08:00:00+08:00'), type: 0, state: 0, serialNumber: 10, deviceId: 'DEV2', deviceIp: '10.0.0.2', locationId: 'DBB CEBU', isDuplicate: false, importedAt: nowIso },
    { id: 'pc2-out', bioId: '50305', date: '2026-10-06', timestamp: '2026-10-06T17:00:00+08:00', timestampMs: Date.parse('2026-10-06T17:00:00+08:00'), type: 1, state: 1, serialNumber: 11, deviceId: 'DEV2', deviceIp: '10.0.0.2', locationId: 'DBB CEBU', isDuplicate: false, importedAt: nowIso }
  ])
  const pc2Daily = await attendanceRepository.getDailyAttendance('2026-10-06', 'all')
  assert.strictEqual(pc2Daily.filter(r => r.employee_name.includes('Abelido')).length, 1, 'REQ 7: Abelido appears once in daily attendance on PC 2')
  const by25061Att = await attendanceRepository.getDailyAttendance('2026-10-06', 'all', 'all', {}, '25061')
  const by50305Att = await attendanceRepository.getDailyAttendance('2026-10-06', 'all', 'all', {}, '50305')
  assert.strictEqual(by25061Att.length, 1)
  assert.strictEqual(by50305Att.length, 1)
  assert.strictEqual(by25061Att[0].biometric_user_id, '25061')
  assert.strictEqual(by50305Att[0].biometric_user_id, '25061')
  assert.strictEqual(by25061Att[0].actual_in, '8:00:00 AM', 'REQ 6/7: IN punch from 25061 combined')
  assert.strictEqual(by50305Att[0].actual_out, '5:00:00 PM', 'REQ 6/7: OUT punch from 50305 combined')

  const pc2Report = await reportsService.getReportSummary(
    { preset: 'custom', startDate: '2026-10-06', endDate: '2026-10-06' },
    false
  )
  // 3 active employees (Abelido present; Dela Cruz & Anna absent -> 1 present, 2 absent, NOT 3 absent!)
  assert.strictEqual(pc2Report.kpis.presentCount, 1, 'REQ 7: Reports count consolidated Abelido once as Present')
  assert.strictEqual(pc2Report.kpis.absentCount, 2, 'REQ 7: Archived 50305 does NOT inflate absence count')
  console.log('✓ REQ 2, 3, 6, 7: PC 2 restored consolidated canonical 25061 + linked 50305 + tombstone + single attendance/absence count.')

  // ------------------------------------------------------------------
  // 3. Re-import same file on PC 2 -> UNCHANGED (no duplicate created),
  //    AND import legacy un-merged sheet containing stale row 50305 ->
  //    must NOT resurrect 50305 or hijack primaryBioId!
  // ------------------------------------------------------------------
  const pc2ReimportPreview = await employeeService.previewImportFromExcel(xlsxRowsFromPc1)
  assert.strictEqual(pc2ReimportPreview.newCount, 0, 'REQ 4: Re-import creates 0 new employees')
  assert.strictEqual(pc2ReimportPreview.updatedCount, 0, 'REQ 4: Identical re-import detects 0 changes')
  assert.strictEqual(pc2ReimportPreview.unchangedCount, 2, 'REQ 4: Identical re-import marks rows UNCHANGED')

  const legacyUnmergedRows = [
    { ID: '25061', NAME: 'Abelido, Reynald C.', DEPARTMENT: 'Operations', STATUS: 'Active' },
    { ID: '50305', NAME: 'Abelido, Reynald C.', DEPARTMENT: 'Operations', STATUS: 'Active' }
  ]
  const legacyPreview = await employeeService.previewImportFromExcel(legacyUnmergedRows)
  assert.strictEqual(legacyPreview.newCount, 0, 'REQ 3: Legacy row for 50305 must NEVER create an active employee')
  const pc2AfterLegacy = await employeeService.getEmployees()
  assert.strictEqual(pc2AfterLegacy.length, 3, 'REQ 3/4: Active employee count remains 3 after legacy import')
  console.log('✓ REQ 3 & 4: Re-importing identical export & legacy un-merged row 50305 updates/skips cleanly without duplicates or resurrection.')

  // ------------------------------------------------------------------
  // 4. Bio ID Ownership Conflict Detection & Required Resolution
  // ------------------------------------------------------------------
  // Case 4A: On a third isolated PC where 50305 belongs to ANOTHER active employee
  const pcConflictDb = createPcDatabaseState(nowIso)
  await switchToPc(pcConflictDb)
  await pcConflictDb.employees.clear()
  await pcConflictDb.employees.put({
    bioId: '50305',
    employeeNumber: '50305',
    fullName: 'Other Employee, Maria',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'Accounting',
    position: 'Staff',
    status: 'active',
    createdAt: nowIso,
    updatedAt: nowIso
  })
  await employeeRepository.reloadFromDb()

  const conflictPreview = await employeeService.previewImportFromExcel(xlsxRowsFromPc1)
  assert(conflictPreview.bioIdConflicts.length >= 1, 'REQ 5: Conflict on Bio ID 50305 detected')
  assert(conflictPreview.unresolvedConflictCount >= 1, 'REQ 5: Unresolved conflict count > 0')
  assert.strictEqual(conflictPreview.bioIdConflicts[0].conflictBioId, '50305')
  assert.strictEqual(conflictPreview.bioIdConflicts[0].existingOwnerName, 'Other Employee, Maria')

  await assert.rejects(
    async () => employeeService.applyImport(conflictPreview),
    /unresolved Bio ID ownership conflict/i,
    'REQ 5: Applying import with unresolved Bio ID conflict MUST throw and block!'
  )

  // Resolve with keep_existing_owner -> drops 50305 link from 25061 & keeps Maria intact
  const resolutionsKeepExisting = {}
  for (const c of conflictPreview.bioIdConflicts) {
    resolutionsKeepExisting[c.conflictId] = 'keep_existing_owner'
  }
  const resolvedKeepPreview = await employeeService.previewImportFromExcel(xlsxRowsFromPc1, resolutionsKeepExisting)
  assert.strictEqual(resolvedKeepPreview.unresolvedConflictCount, 0, 'REQ 5: Conflict count reaches 0 after resolution')
  await employeeService.applyImport(resolvedKeepPreview)
  await employeeRepository.reloadFromDb()

  const mariaAfter = await employeeService.getEmployeeByBioId('50305')
  const abelidoWithoutConflict = await employeeService.getEmployeeByBioId('25061')
  assert.strictEqual(mariaAfter.biometric_user_id, '50305', 'REQ 5/9: Existing owner Maria kept 50305 untouched')
  assert.strictEqual(abelidoWithoutConflict.biometric_user_id, '25061')
  assert.strictEqual(abelidoWithoutConflict.linked_bio_ids.includes('50305'), false, 'REQ 5: Conflicting link 50305 dropped when keeping existing owner')

  // Case 4B: Unconsolidated duplicate on another PC resolved via consolidate_into_incoming
  const pcUnconsolidatedDb = createPcDatabaseState(nowIso)
  await switchToPc(pcUnconsolidatedDb)
  await pcUnconsolidatedDb.employees.clear()
  await pcUnconsolidatedDb.employees.put({
    bioId: '50305',
    employeeNumber: '50305',
    fullName: 'Abelido, Reynald (Old ID)',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'Operations',
    position: 'Driver',
    status: 'active',
    createdAt: nowIso,
    updatedAt: nowIso
  })
  await pcUnconsolidatedDb.biometricPunches.put({
    id: 'pc-uncons-50305', bioId: '50305', date: '2026-10-04', timestamp: '2026-10-04T08:05:00+08:00', timestampMs: Date.parse('2026-10-04T08:05:00+08:00'), type: 0, state: 0, serialNumber: 9, deviceId: 'DEV', deviceIp: '10.0.0.9', locationId: 'DBB CEBU', isDuplicate: false, importedAt: nowIso
  })
  await employeeRepository.reloadFromDb()
  const unconsConflictPreview = await employeeService.previewImportFromExcel(xlsxRowsFromPc1)
  assert(unconsConflictPreview.unresolvedConflictCount >= 1, 'REQ 5: Unconsolidated DB owner 50305 flagged for resolution')
  const resolutionsConsolidate = {}
  for (const c of unconsConflictPreview.bioIdConflicts) {
    resolutionsConsolidate[c.conflictId] = 'consolidate_into_incoming'
  }
  const resolvedConsPreview = await employeeService.previewImportFromExcel(xlsxRowsFromPc1, resolutionsConsolidate)
  assert.strictEqual(resolvedConsPreview.unresolvedConflictCount, 0)
  const consApplyRes = await employeeService.applyImport(resolvedConsPreview)
  assert.strictEqual(consApplyRes.consolidatedCount, 1, 'REQ 5: Executed DB consolidation during conflict resolution')
  await employeeRepository.reloadFromDb()
  assert.strictEqual((await employeeService.getEmployees()).length, 2, 'REQ 3/5: Old 50305 archived after consolidate resolution')
  assert.strictEqual((await employeeService.getEmployeeByBioId('50305')).biometric_user_id, '25061')
  assert.strictEqual(await pcUnconsolidatedDb.biometricPunches.count(), 1, 'REQ 9: Existing punch history preserved after consolidation resolution')

  // Case 4C: Same-file Bio ID conflict (two active rows claiming 50305)
  const sameFileConflictRows = [
    { ID: '25061', 'CANONICAL BIO ID': '25061', 'SECONDARY BIO IDS': '50305', NAME: 'Abelido, Reynald C.', STATUS: 'Active' },
    { ID: '50305', NAME: 'Competing Row User', STATUS: 'Active' }
  ]
  const sameFilePreview = await employeeService.previewImportFromExcel(sameFileConflictRows)
  assert(sameFilePreview.bioIdConflicts.length >= 1, 'REQ 5: Same-file Bio ID collision detected')
  assert(sameFilePreview.unresolvedConflictCount >= 1)
  console.log('✓ REQ 5: Bio ID ownership conflicts (DB, unconsolidated duplicate, same-file) detected, blocked until resolved, and applied cleanly.')

  // ------------------------------------------------------------------
  // 5. PC 2 Update & Re-Export -> Import Back Into PC 1 Round-Trip
  //    Also verify when 50305 is promoted to PRIMARY Bio ID!
  // ------------------------------------------------------------------
  await switchToPc(pc2Db)
  await employeeService.updateEmployee('25061', { department: 'Dispatch & Hauling' })
  await employeeService.setPrimaryBioId('25061', '50305')
  const pc2ExportRows = await employeeService.getExportData()
  const abelidoPc2Exp = pc2ExportRows.find(r => String(r['CANONICAL BIO ID']) === '25061')
  assert.strictEqual(String(abelidoPc2Exp['ID']), '50305', 'Promoted primary Bio ID exported as ID')
  assert.strictEqual(String(abelidoPc2Exp['CANONICAL BIO ID']), '25061', 'Underlying canonical Bio ID preserved on re-export')
  assert.strictEqual(String(abelidoPc2Exp['SECONDARY BIO IDS']), '25061', 'Demoted canonical Bio ID retained in secondary Bio IDs')
  const xlsxRowsFromPc2 = roundTripXlsxRows(pc2ExportRows)

  await switchToPc(pc1Db)
  const pc1RoundTripPreview = await employeeService.previewImportFromExcel(xlsxRowsFromPc2)
  assert.strictEqual(pc1RoundTripPreview.unresolvedConflictCount, 0, 'REQ 8: Round-trip into PC 1 has 0 conflicts')
  assert.strictEqual(pc1RoundTripPreview.updatedCount, 1, 'REQ 8: Only modified Abelido updated')
  assert.strictEqual(pc1RoundTripPreview.unchangedCount, 1, 'REQ 8: Unmodified Dela Cruz unchanged')

  await employeeService.applyImport(pc1RoundTripPreview)
  await employeeRepository.reloadFromDb()

  const pc1AbelidoAfter = await employeeService.getEmployeeByBioId('25061')
  const pc1Via50305After = await employeeService.getEmployeeByBioId('50305')
  assert.strictEqual(pc1AbelidoAfter.department, 'Dispatch & Hauling', 'REQ 8: Updated People Directory field synced back to PC 1')
  assert.strictEqual(pc1AbelidoAfter.primary_bio_id, '50305', 'REQ 8: Promoted primary Bio ID synced cleanly back to PC 1')
  assert.strictEqual(pc1Via50305After.biometric_user_id, '25061', 'REQ 8: 50305 resolves to canonical 25061 on PC 1')
  assert.deepStrictEqual(pc1AbelidoAfter.merged_from_bio_ids, ['50305'], 'REQ 8: merged_from_bio_ids intact on PC 1')
  assert.strictEqual(pc1AbelidoAfter.daily_rate, 650, 'REQ 9: PC 1 salary configuration preserved untouched')
  assert.strictEqual(pc1AbelidoAfter.payroll_status, 'configured', 'REQ 9: PC 1 payroll status preserved untouched')
  assert.strictEqual((await pc1Db.employees.get('50305')).isMerged, true, 'REQ 8/9: Archived 50305 tombstone preserved on PC 1')
  assert.strictEqual(await pc1Db.biometricPunches.count(), 2, 'REQ 9: Raw biometric punch history preserved on PC 1')
  const snapAfter = await pc1Db.payrollSnapshots.get('2026-10-1_25061')
  assert(snapAfter && snapAfter.netPay === 6500 && snapAfter.batchStatus === 'finalized', 'REQ 9: Finalized payroll snapshot preserved on PC 1')
  const pc1EmpsAfter = await employeeService.getEmployees()
  assert.strictEqual(pc1EmpsAfter.length, 3, 'REQ 8/9: No duplicate Abelido/50305 created on PC 1 (25061, 50366, plus PC2 baseline 99901)')
  assert.strictEqual(pc1EmpsAfter.some(e => e.biometric_user_id === '50305'), false, 'REQ 3/8: Archived 50305 stays archived on PC 1')

  console.log('✓ REQ 8 & 9: PC 2 -> PC 1 round-trip preserved consolidation, promoted primary Bio ID, archived record, salary config, punches & finalized payroll snapshots!')

  console.log('\nALL CROSS-PC PEOPLE DIRECTORY EXPORT/IMPORT TESTS PASSED!')
} finally {
  await server.close()
}
