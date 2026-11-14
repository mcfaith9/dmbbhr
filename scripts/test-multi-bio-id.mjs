/**
 * DMBBHR Multi-Biometric ID Verification Suite (Real Modules via Vite SSR Loader)
 *
 * Exercises the actual TypeScript modules:
 * - src/lib/employeeIdentity.ts
 * - src/repositories/employeeRepository.ts
 * - src/repositories/attendanceRepository.ts
 * - src/repositories/punchRepository.ts
 * - src/services/attendanceEngine.ts
 * - src/services/reportsService.ts
 * - src/services/payrollCalculation.ts
 * - src/services/punchDisplay.ts
 *
 * Run: node scripts/test-multi-bio-id.mjs
 */

import assert from 'node:assert'
import { createServer } from 'vite'

// Minimal browser-like storage shims for Node SSR execution
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

/**
 * Creates a lightweight in-memory Dexie-compatible Table shim so real repositories
 * run directly against actual production code in Node without IndexedDB.
 */
function createMemoryTable(pkField = 'id') {
  const store = new Map()
  const clone = (val) => (val == null ? val : JSON.parse(JSON.stringify(val)))

  const makeCollection = (itemsFn) => {
    const col = {
      async toArray() {
        return itemsFn().map(clone)
      },
      async count() {
        return itemsFn().length
      },
      filter(pred) {
        return makeCollection(() => itemsFn().filter(pred))
      },
      reverse() {
        return makeCollection(() => [...itemsFn()].reverse())
      },
      sortBy(field) {
        return Promise.resolve(
          [...itemsFn()].sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? ''))).map(clone)
        )
      },
      limit(n) {
        return makeCollection(() => itemsFn().slice(0, n))
      },
      async delete() {
        const list = itemsFn()
        for (const item of list) {
          store.delete(String(item[pkField]))
        }
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
    }
    return col
  }

  return {
    _store: store,
    async toArray() {
      return Array.from(store.values()).map(clone)
    },
    async count() {
      return store.size
    },
    async clear() {
      store.clear()
    },
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
      for (const item of items) {
        store.set(String(item[pkField]), clone(item))
      }
    },
    async bulkAdd(items) {
      for (const item of items) {
        store.set(String(item[pkField]), clone(item))
      }
    },
    async delete(key) {
      store.delete(String(key))
    },
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
            return makeCollection(() =>
              all().filter((row) => fieldOrFields.every((f, idx) => row[f] === val[idx]))
            )
          }
          return makeCollection(() =>
            all().filter((row) => {
              const fv = row[fieldOrFields]
              if (Array.isArray(fv)) return fv.includes(val)
              return fv === val
            })
          )
        },
        anyOf(vals) {
          const set = new Set(vals)
          return makeCollection(() =>
            all().filter((row) => {
              const fv = row[fieldOrFields]
              if (Array.isArray(fv)) return fv.some((x) => set.has(x))
              return set.has(fv)
            })
          )
        },
        between(low, high, includeLower = true, includeUpper = true) {
          return makeCollection(() =>
            all().filter((row) => {
              const v = row[fieldOrFields]
              const okLow = includeLower ? v >= low : v > low
              const okHigh = includeUpper ? v <= high : v < high
              return okLow && okHigh
            })
          )
        }
      }
    },
    orderBy(field) {
      return makeCollection(() =>
        Array.from(store.values()).sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')))
      )
    },
    filter(pred) {
      return makeCollection(() => Array.from(store.values()).filter(pred))
    },
    toCollection() {
      return makeCollection(() => Array.from(store.values()))
    }
  }
}

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'silent'
})

try {
  // Load DB module and replace tables with deterministic in-memory stores
  const dbMod = await server.ssrLoadModule('/src/db/index.ts')
  const { db } = dbMod

  const memTables = {
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
    overtimeAuthorizations: createMemoryTable('id')
  }

  for (const [name, tbl] of Object.entries(memTables)) {
    db[name] = tbl
  }
  db.transaction = async (...args) => {
    const fn = args[args.length - 1]
    return await fn()
  }

  // Seed default Work Groups
  const nowIso = '2026-10-01T00:00:00.000Z'
  await memTables.workGroups.bulkPut([
    {
      id: 'wg-group-a', name: 'Group A', code: 'A', standardIn: '06:00',
      requiredWorkMinutes: 480, lunchStart: '12:00', lunchEnd: '13:00', expectedOut: '15:00',
      gracePeriodMinutes: 0, isDefault: false, createdAt: nowIso, updatedAt: nowIso
    },
    {
      id: 'wg-group-b', name: 'Group B', code: 'B', standardIn: '07:00',
      requiredWorkMinutes: 480, lunchStart: '12:00', lunchEnd: '13:00', expectedOut: '16:00',
      gracePeriodMinutes: 0, isDefault: false, createdAt: nowIso, updatedAt: nowIso
    },
    {
      id: 'wg-group-c', name: 'Group C', code: 'C', standardIn: '08:00',
      requiredWorkMinutes: 480, lunchStart: '12:00', lunchEnd: '13:00', expectedOut: '17:00',
      gracePeriodMinutes: 0, isDefault: true, createdAt: nowIso, updatedAt: nowIso
    }
  ])

  const identityMod = await server.ssrLoadModule('/src/lib/employeeIdentity.ts')
  const empRepoMod = await server.ssrLoadModule('/src/repositories/employeeRepository.ts')
  const attRepoMod = await server.ssrLoadModule('/src/repositories/attendanceRepository.ts')
  const punchRepoMod = await server.ssrLoadModule('/src/repositories/punchRepository.ts')
  const engineMod = await server.ssrLoadModule('/src/services/attendanceEngine.ts')
  const reportsMod = await server.ssrLoadModule('/src/services/reportsService.ts')
  const payrollMod = await server.ssrLoadModule('/src/services/payrollCalculation.ts')
  const punchDisplayMod = await server.ssrLoadModule('/src/services/punchDisplay.ts')

  const { employeeRepository } = empRepoMod
  const { attendanceRepository } = attRepoMod
  const { punchRepository } = punchRepoMod
  const { deduplicateEmployees } = reportsMod
  const { payrollCalculationService } = payrollMod
  const { punchDisplayService } = punchDisplayMod

  // Run initial repository initialization before resetting to clean test state
  await employeeRepository.getEmployees()

  let passed = 0
  const ok = (msg) => {
    passed++
    console.log(`✔ ${msg}`)
  }

  async function resetAllTestData() {
    await memTables.employees.clear()
    await memTables.biometricPunches.clear()
    await memTables.dailyAttendance.clear()
    await memTables.manualAdjustments.clear()
    await memTables.leaveRecords.clear()
    await memTables.holidays.clear()
    await memTables.payrollSnapshots.clear()
    await memTables.overtimeAuthorizations.clear()
    await employeeRepository.reloadFromDb()
  }

  function manilaPunch(id, bioId, date, hhmmss, deviceName = 'BISMAC B-29b') {
    const ts = `${date}T${hhmmss}+08:00`
    const ms = new Date(ts).getTime()
    return {
      id,
      bioId,
      date,
      timestamp: ts,
      timestampMs: ms,
      type: 1,
      state: 1,
      serialNumber: '0476141400046',
      deviceId: 'dev-1',
      deviceIp: '192.168.1.201',
      deviceName,
      locationId: 'loc-cebu',
      locationName: 'DBB CEBU',
      employeeName: bioId,
      isDuplicate: false,
      importedAt: nowIso
    }
  }

  console.log('======================================================================')
  console.log('DMBBHR MULTI-BIOMETRIC ID TEST SUITE (14 SCENARIOS - REAL MODULES)')
  console.log('======================================================================\n')

  // -------------------------------------------------------------------------
  // Scenario 1: Single canonical employee with two linked Bio IDs (25061 + 50305)
  // -------------------------------------------------------------------------
  await resetAllTestData()
  await employeeRepository.registerFromPunch('25061', 'Abelido, Reynald C.', 'DBB CEBU', 'wg-group-c')
  let reynald = await employeeRepository.linkSecondaryBioId('25061', '50305', {
    confirmedByAdmin: true,
    notes: 'Second BISMAC enrollment'
  })
  const byPrimary = await employeeRepository.getByBioId('25061')
  const bySecondary = await employeeRepository.getByBioId('50305')
  assert.strictEqual(byPrimary?.biometric_user_id, '25061')
  assert.strictEqual(bySecondary?.biometric_user_id, '25061')
  assert.strictEqual(bySecondary?.full_name, 'Abelido, Reynald C.')
  assert.deepStrictEqual(identityMod.getEmployeeAllBioIds(reynald).slice(0, 2), ['25061', '50305'])
  ok('Scenario 1: Primary 25061 + Secondary 50305 resolve to single canonical profile Abelido, Reynald C.')

  // Also test secondary auto-punch registration never creates a duplicate employee
  const punchReg = await employeeRepository.registerFromPunch('50305', 'Abelido, Reynald', 'DBB CEBU', 'wg-group-c')
  assert.strictEqual(punchReg.bioId, '25061')
  assert.strictEqual((await employeeRepository.getEmployees()).length, 1)
  ok('Scenario 1b: Punch registration on secondary ID 50305 resolves to 25061 without creating duplicate employee')

  // -------------------------------------------------------------------------
  // Scenario 2: Morning IN with Primary (25061) + Afternoon OUT with Secondary (50305)
  // -------------------------------------------------------------------------
  await memTables.biometricPunches.bulkPut([
    manilaPunch('p2-in', '25061', '2026-10-12', '07:55:00'),
    manilaPunch('p2-out', '50305', '2026-10-12', '17:05:00')
  ])
  let daily = await attendanceRepository.getDailyAttendance('2026-10-12', 'all', 'all', { skipAutoSync: true })
  assert.strictEqual(daily.length, 1)
  assert.strictEqual(daily[0].biometric_user_id, '25061')
  assert.strictEqual(daily[0].status, 'Regular Day')
  assert.strictEqual(daily[0].raw_punches_count, 2)
  assert.strictEqual(daily[0].has_valid_out, true)
  assert.deepStrictEqual(daily[0].source_bio_ids, ['25061', '50305'])
  ok('Scenario 2: Morning IN (25061) + Afternoon OUT (50305) combine into 1 Regular Day record')

  // -------------------------------------------------------------------------
  // Scenario 3: Morning IN with Secondary (50305) + Afternoon OUT with Primary (25061)
  // -------------------------------------------------------------------------
  await memTables.biometricPunches.bulkPut([
    manilaPunch('p3-in', '50305', '2026-10-13', '07:58:00'),
    manilaPunch('p3-out', '25061', '2026-10-13', '17:02:00')
  ])
  daily = await attendanceRepository.getDailyAttendance('2026-10-13', 'all', 'all', { skipAutoSync: true })
  assert.strictEqual(daily.length, 1)
  assert.strictEqual(daily[0].biometric_user_id, '25061')
  assert.strictEqual(daily[0].status, 'Regular Day')
  assert.strictEqual(daily[0].late_minutes, 0)
  assert.strictEqual(daily[0].early_out_minutes, 0)
  assert.strictEqual(daily[0].has_valid_out, true)
  ok('Scenario 3: Morning IN (50305) + Afternoon OUT (25061) combine accurately into 1 Regular Day record')

  // -------------------------------------------------------------------------
  // Scenario 4: Switching Bio IDs mid-day (IN 25061 -> BreakOUT 50305 -> BreakIN 25061 -> OUT 50305)
  // -------------------------------------------------------------------------
  await memTables.biometricPunches.bulkPut([
    manilaPunch('p4-1', '25061', '2026-10-14', '07:53:00'),
    manilaPunch('p4-2', '50305', '2026-10-14', '12:02:00'),
    manilaPunch('p4-3', '25061', '2026-10-14', '12:55:00'),
    manilaPunch('p4-4', '50305', '2026-10-14', '17:04:00')
  ])
  daily = await attendanceRepository.getDailyAttendance('2026-10-14', 'all', 'all', { skipAutoSync: true })
  assert.strictEqual(daily.length, 1)
  assert.strictEqual(daily[0].status, 'Regular Day')
  assert.notStrictEqual(daily[0].break_out, '-')
  assert.notStrictEqual(daily[0].break_in, '-')
  assert.strictEqual(daily[0].raw_punches_count, 4)
  assert.strictEqual(daily[0].has_valid_out, true)
  ok('Scenario 4: Mid-day switching across 25061 & 50305 resolves IN, Lunch OUT/IN, and OUT in one record')

  // -------------------------------------------------------------------------
  // Scenario 5: Multiple rapid/conflicting punches across linked IDs (preserve raw logs + flag review)
  // -------------------------------------------------------------------------
  await memTables.biometricPunches.bulkPut([
    manilaPunch('p5-1', '25061', '2026-10-15', '08:00:05'),
    manilaPunch('p5-2', '50305', '2026-10-15', '08:00:25'),
    manilaPunch('p5-3', '50305', '2026-10-15', '17:01:00')
  ])
  daily = await attendanceRepository.getDailyAttendance('2026-10-15', 'all', 'all', { skipAutoSync: true })
  assert.strictEqual(daily.length, 1)
  assert.strictEqual(daily[0].duplicate_punches_count, 1)
  assert.strictEqual(daily[0].requires_admin_review, true)
  assert.ok(daily[0].review_reasons?.some((r) => r.includes('Conflicting rapid scans across linked Bio IDs')))
  const rawOct15 = await punchRepository.getPunchesByDate('2026-10-15')
  assert.strictEqual(rawOct15.length, 3, 'All 3 raw punches must be preserved')
  assert.strictEqual(rawOct15.every((l) => l.linked_employee_bio_id === '25061'), true)
  ok('Scenario 5: Rapid cross-ID punches cluster duplicate, preserve all raw logs, and flag admin review')

  // -------------------------------------------------------------------------
  // Scenario 6: Historical punches recorded under secondary ID BEFORE linking resolve once linked
  // -------------------------------------------------------------------------
  await memTables.biometricPunches.put(manilaPunch('p6-hist-in', '60999', '2026-10-05', '07:50:00'))
  await memTables.biometricPunches.put(manilaPunch('p6-hist-out', '60999', '2026-10-05', '17:05:00'))
  await employeeRepository.linkSecondaryBioId('25061', '60999', { confirmedByAdmin: true })
  const history = await attendanceRepository.getEmployeeDailyAttendanceHistory('25061')
  const oct5 = history.find((h) => h.raw_date === '2026-10-05')
  assert.ok(oct5, 'Historical punches on 60999 must appear under canonical employee history')
  assert.strictEqual(oct5.biometric_user_id, '25061')
  assert.strictEqual(oct5.status, 'Regular Day')
  ok('Scenario 6: Historical punches recorded under 60999 before linking resolve to canonical employee 25061')

  // -------------------------------------------------------------------------
  // Scenario 7: Similar-named employees are NEVER automatically merged
  // -------------------------------------------------------------------------
  await employeeRepository.registerFromPunch('30001', 'Santos, Juan', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.registerFromPunch('30002', 'Santos, Juan', 'DBB CEBU', 'wg-group-c')
  const allBeforeDedupe = await employeeRepository.getEmployees()
  const dedupeResult = deduplicateEmployees(allBeforeDedupe)
  assert.strictEqual(dedupeResult.mergedCount, 0, 'Must NEVER auto-merge by name!')
  const juanMatches = dedupeResult.canonicalEmployees.filter((c) => c.primary.full_name === 'Santos, Juan')
  assert.strictEqual(juanMatches.length, 2, 'Both Santos, Juan records must remain separate')
  ok('Scenario 7: Two distinct employees with identical/similar names are NOT auto-merged')

  // -------------------------------------------------------------------------
  // Scenario 8: Prevent assigning a Bio ID already assigned to another employee (active or inactive)
  // -------------------------------------------------------------------------
  let conflictThrown = false
  try {
    await employeeRepository.linkSecondaryBioId('30001', '50305', { confirmedByAdmin: true })
  } catch (err) {
    conflictThrown = true
    assert.ok(err.message.includes('Abelido, Reynald C.'))
  }
  assert.strictEqual(conflictThrown, true, 'Must reject assigning 50305 when already owned by Abelido')
  const conflictCheck = await employeeRepository.findBioIdConflict('50305', '30001')
  assert.ok(conflictCheck)
  assert.strictEqual(conflictCheck.conflictEmployee.biometric_user_id, '25061')
  ok('Scenario 8: Duplicate Bio ID assignment across different employees is strictly blocked')

  // -------------------------------------------------------------------------
  // Scenario 9: Deactivate vs Remove secondary ID (preserves history, flags post-deactivation punches)
  // -------------------------------------------------------------------------
  await employeeRepository.deactivateLinkedBioId('25061', '60999', 'Old terminal ID retired')
  // Historical punch on Oct 5 (before deactivation) must NOT trigger deactivated-ID review flag
  const histAfterDeact = await attendanceRepository.getEmployeeDailyAttendanceHistory('25061')
  const oct5AfterDeact = histAfterDeact.find((h) => h.raw_date === '2026-10-05')
  assert.strictEqual(Boolean(oct5AfterDeact?.requires_admin_review), false)
  // New punch AFTER deactivatedAt must preserve log and flag requires_admin_review
  const futureDate = '2099-01-15'
  await memTables.biometricPunches.put(manilaPunch('p9-after', '60999', futureDate, '08:00:00'))
  const futureDaily = await attendanceRepository.getDailyAttendance(futureDate, 'all', 'all', { skipAutoSync: true })
  assert.strictEqual(futureDaily.length, 1)
  assert.strictEqual(futureDaily[0].requires_admin_review, true)
  assert.ok(futureDaily[0].review_reasons?.some((r) => r.includes('used deactivated Bio ID 60999')))
  // Conflict check must STILL block another employee from claiming inactive 60999
  const inactiveConflict = await employeeRepository.findBioIdConflict('60999', '30001')
  assert.strictEqual(inactiveConflict?.entryStatus, 'inactive')
  // Remove 60999 cleanly; raw punches must remain in DB
  await employeeRepository.removeLinkedBioId('25061', '60999')
  const afterRemoveEmp = await employeeRepository.getByBioId('25061')
  assert.ok(!identityMod.getEmployeeAllBioIds(afterRemoveEmp).includes('60999'))
  assert.ok(await memTables.biometricPunches.get('p9-after'), 'Raw punch must remain preserved after unlinking')
  ok('Scenario 9: Deactivation preserves history, flags post-deactivation scans, and removal preserves raw punches')

  // -------------------------------------------------------------------------
  // Scenario 10: Export & Import preserves Primary / Secondary / Inactive Bio IDs (and omits safely)
  // -------------------------------------------------------------------------
  await employeeRepository.linkSecondaryBioId('25061', '50306', { confirmedByAdmin: true })
  await employeeRepository.deactivateLinkedBioId('25061', '50306')
  const exported = await employeeRepository.getAllForExport()
  const reynaldExport = exported.find((r) => r.NAME === 'Abelido, Reynald C.')
  assert.strictEqual(reynaldExport.ID, '25061')
  assert.strictEqual(reynaldExport['SECONDARY BIO IDS'], '50305')
  assert.strictEqual(reynaldExport['INACTIVE BIO IDS'], '50306')

  // Test omitting secondary/inactive columns preserves existing mappings during an update
  const partialImport = await employeeRepository.previewImportEmployeesFromExcel([
    { ID: '25061', NAME: 'Abelido, Reynald C.', STATUS: 'Active', DEPARTMENT: 'Logistics' }
  ])
  assert.strictEqual(partialImport.invalidCount, 0)
  assert.strictEqual(partialImport.recordsToApply.length, 1)
  const appliedPartial = partialImport.recordsToApply[0]
  assert.ok(appliedPartial.linkedBioIds.includes('50305'))
  assert.ok(appliedPartial.linkedBioIds.includes('50306'))
  await employeeRepository.applyBulkEmployeeImport(partialImport.recordsToApply, partialImport)
  const afterPartial = await employeeRepository.getByBioId('50305')
  assert.strictEqual(afterPartial?.department, 'Logistics')
  assert.ok(identityMod.getEmployeeAllBioIds(afterPartial).includes('50306'))

  // Full export -> clean DB -> re-import restores exact multi-Bio-ID mappings
  await resetAllTestData()
  const reimportPreview = await employeeRepository.previewImportEmployeesFromExcel(exported)
  assert.strictEqual(reimportPreview.invalidCount, 0)
  await employeeRepository.applyBulkEmployeeImport(reimportPreview.recordsToApply, reimportPreview)
  const restored = await employeeRepository.getByBioId('50305')
  assert.strictEqual(restored?.biometric_user_id, '25061')
  const restoredEntries = identityMod.getEmployeeBiometricEntries(restored)
  assert.strictEqual(restoredEntries.find((e) => e.bioId === '50305')?.status, 'active')
  assert.strictEqual(restoredEntries.find((e) => e.bioId === '50306')?.status, 'inactive')
  ok('Scenario 10: Export & Import round-trip preserves Primary, Secondary, and Inactive Bio IDs (and omission preserves)')

  // -------------------------------------------------------------------------
  // Scenario 11: Two-PC sync / re-import produces identical deterministic mappings
  // -------------------------------------------------------------------------
  const pc1List = await employeeRepository.getEmployees()
  await resetAllTestData()
  const reversedExport = [...exported].reverse()
  const pc2Preview = await employeeRepository.previewImportEmployeesFromExcel(reversedExport)
  await employeeRepository.applyBulkEmployeeImport(pc2Preview.recordsToApply, pc2Preview)
  const pc2List = await employeeRepository.getEmployees()
  const d1 = deduplicateEmployees(pc1List)
  const d2 = deduplicateEmployees(pc2List)
  assert.strictEqual(d1.canonicalEmployees.length, d2.canonicalEmployees.length)
  assert.deepStrictEqual(
    d1.canonicalEmployees.map((c) => c.primary.biometric_user_id),
    d2.canonicalEmployees.map((c) => c.primary.biometric_user_id)
  )
  ok('Scenario 11: Two-PC re-import regardless of row order yields identical deterministic canonical mappings')

  // -------------------------------------------------------------------------
  // Scenario 12: Payroll generates ONE payroll record (no double counting) + preserves finalized snapshot
  // -------------------------------------------------------------------------
  await employeeRepository.updateEmployee('25061', { dailyRate: 600, basicSalary: 15600, salaryType: 'Daily' })
  // Seed punches for Abelido across 25061 & 50305 on Oct 1, 2, 3 (2026)
  await memTables.biometricPunches.bulkPut([
    manilaPunch('pay-1-in', '25061', '2026-10-01', '07:55:00'),
    manilaPunch('pay-1-out', '50305', '2026-10-01', '17:05:00'),
    manilaPunch('pay-2-in', '50305', '2026-10-02', '07:59:00'),
    manilaPunch('pay-2-out', '25061', '2026-10-02', '17:01:00'),
    // Day 3: Late 15m (8:15 AM on 50305) and Early Out 30m (4:30 PM on 25061)
    manilaPunch('pay-3-in', '50305', '2026-10-03', '08:15:00'),
    manilaPunch('pay-3-out', '25061', '2026-10-03', '16:30:00')
  ])
  const octPeriod = payrollCalculationService.getCutoffPeriod(2026, 10, 1)
  const octDaily = [
    ...(await attendanceRepository.getDailyAttendance('2026-10-01', 'all', 'all', { skipAutoSync: true })),
    ...(await attendanceRepository.getDailyAttendance('2026-10-02', 'all', 'all', { skipAutoSync: true })),
    ...(await attendanceRepository.getDailyAttendance('2026-10-03', 'all', 'all', { skipAutoSync: true }))
  ]
  const currentEmps = await employeeRepository.getEmployees()
  const payrollBatch = await payrollCalculationService.computePayroll(
    octPeriod,
    currentEmps,
    [],
    octDaily
  )
  const reynaldPayroll = payrollBatch.filter((r) => r.employeeName.includes('Abelido'))
  assert.strictEqual(reynaldPayroll.length, 1, 'Must generate exactly ONE payroll record for Reynald')
  assert.strictEqual(reynaldPayroll[0].presentDays, 3, 'Must count all 3 combined days across 25061 & 50305')

  // Verify finalized snapshot preservation
  const finalizedSnapshot = {
    id: `${octPeriod.id}_25061`,
    periodId: octPeriod.id,
    bioId: '25061',
    employeeNumber: '25061',
    employeeName: 'Abelido, Reynald C.',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    workGroupId: 'wg-group-c',
    cutoffStart: octPeriod.startDate,
    cutoffEnd: octPeriod.endDate,
    payday: octPeriod.payday,
    salaryType: 'Daily',
    basicSalary: 15600,
    dailyRate: 600,
    hourlyRate: 75,
    scheduledDays: 13,
    presentDays: 3,
    sundayWorkDays: 0,
    holidayDays: 0,
    workedHolidayDays: 0,
    unworkedHolidayDays: 0,
    specialNonWorkingDays: 0,
    specialWorkingDays: 0,
    absentDays: 0,
    payableDays: 3,
    lateMinutes: 0,
    undertimeMinutes: 0,
    undertimeDeduction: 0,
    overtimeHours: 0,
    overtimePay: 0,
    initialEarnings: 1800,
    earningsBreakdown: { basePay: 1800, sundayDutyPay: 0, holidayPay: 0, overtimePay: 0, allowances: 0 },
    sss: 0, philhealth: 0, pagibig: 0, sssLoan: 0, pagibigLoan: 0, otherLoan: 0,
    totalBenefitsAndLoans: 0, balanceAfterBenefitsAndLoans: 1800,
    cashAdvance: 0, itemizedDeductions: [], totalOtherDeductions: 0, balanceBeforeTax: 1800,
    withholdingTax: 0, netPay: 1800,
    reviewStatus: 'finalized',
    reviewReasons: [],
    attendanceReviewNotes: [],
    batchStatus: 'finalized',
    updatedAt: nowIso
  }
  await memTables.payrollSnapshots.put(finalizedSnapshot)
  const lockedPayroll = await payrollCalculationService.computePayroll(octPeriod, currentEmps, [], octDaily)
  const lockedReynald = lockedPayroll.find((r) => r.bioId === '25061')
  assert.strictEqual(lockedReynald?.batchStatus, 'finalized')
  assert.strictEqual(lockedReynald?.netPay, 1800, 'Finalized payroll snapshot must not be overwritten')
  ok('Scenario 12: Payroll creates 1 combined record without double counting and preserves finalized snapshots')

  // -------------------------------------------------------------------------
  // Scenario 13: Late, Undertime, and Overtime combine accurately across linked Bio IDs
  // -------------------------------------------------------------------------
  const day3Record = octDaily.find((d) => d.raw_date === '2026-10-03' && d.biometric_user_id === '25061')
  assert.strictEqual(day3Record?.late_minutes, 15, 'Late minutes must combine IN from 50305')
  assert.strictEqual(day3Record?.early_out_minutes, 30, 'Early out minutes must combine OUT from 25061')
  assert.strictEqual(day3Record?.undertime_minutes, 45, 'Undertime minutes (480 - 435 net) must combine IN + OUT')

  // Add approved OT filed under secondary ID 50305 for Oct 2 (OUT 6:00 PM on 25061)
  await memTables.biometricPunches.put(manilaPunch('pay-2-out-ot', '25061', '2026-10-02', '18:05:00'))
  await memTables.overtimeAuthorizations.put({
    id: 'ot_test_50305',
    bioId: '50305',
    employeeName: 'Abelido, Reynald C.',
    date: '2026-10-02',
    startTime: '17:00',
    endTime: '18:00',
    authorizedHours: 1,
    purpose: 'Overtime logged under secondary Bio ID',
    status: 'Approved',
    createdAt: nowIso,
    updatedAt: nowIso
  })
  // Recompute payroll for a fresh period without finalized snapshot
  const oct2Period = { ...octPeriod, id: '2026-10-1-fresh' }
  const octDailyWithOt = [
    ...(await attendanceRepository.getDailyAttendance('2026-10-01', 'all', 'all', { skipAutoSync: true })),
    ...(await attendanceRepository.getDailyAttendance('2026-10-02', 'all', 'all', { skipAutoSync: true })),
    ...(await attendanceRepository.getDailyAttendance('2026-10-03', 'all', 'all', { skipAutoSync: true }))
  ]
  const payrollWithOt = await payrollCalculationService.computePayroll(oct2Period, currentEmps, [], octDailyWithOt)
  const otRec = payrollWithOt.find((r) => r.bioId === '25061')
  assert.strictEqual(otRec?.lateMinutes, 15)
  assert.strictEqual(otRec?.undertimeMinutes, 45)
  assert.strictEqual(otRec?.overtimeHours, 1, 'Approved OT filed under secondary ID 50305 must apply')
  assert.ok((otRec?.overtimePay ?? 0) > 0)
  ok('Scenario 13: Late (15m), Undertime (30m), and Overtime (1h under 50305) combine accurately in payroll')

  // -------------------------------------------------------------------------
  // Scenario 14: Backward compatibility for single-ID employees & Punch Display
  // -------------------------------------------------------------------------
  await resetAllTestData()
  // Insert legacy EmployeeRecord WITHOUT primaryBioId / biometricIds / linkedBioIds
  await memTables.employees.put({
    bioId: '40001',
    employeeNumber: '40001',
    fullName: 'Dela Cruz, Maria',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'Admin',
    status: 'active',
    excludeFromBiometric: false,
    createdAt: nowIso,
    updatedAt: nowIso
  })
  await employeeRepository.reloadFromDb()
  const maria = await employeeRepository.getByBioId('40001')
  assert.strictEqual(maria?.biometric_user_id, '40001')
  assert.strictEqual(identityMod.getEmployeePrimaryBioId(maria), '40001')
  await memTables.biometricPunches.bulkPut([
    manilaPunch('m1-in', '40001', '2026-10-12', '08:00:00'),
    manilaPunch('m1-out', '40001', '2026-10-12', '17:00:00')
  ])
  const mariaDaily = await attendanceRepository.getDailyAttendance('2026-10-12', 'all', 'all', { skipAutoSync: true })
  assert.strictEqual(mariaDaily.length, 1)
  assert.strictEqual(mariaDaily[0].status, 'Regular Day')

  // Verify Punch Display resolves secondary Bio IDs seamlessly under single canonical session
  await employeeRepository.registerFromPunch('25061', 'Abelido, Reynald C.', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.linkSecondaryBioId('25061', '50305', { confirmedByAdmin: true })
  punchDisplayService.resetResolverEmployee('25061')
  const todayStr = punchDisplayMod.getManilaDateString(new Date())
  await punchDisplayService.broadcastPunchFromLog({
    id: 'pd-1', user_id: '25061', employee_name: '25061', employee_id: '25061',
    attendance_time: `${todayStr}T07:55:00+08:00`, type: 1, state: 1,
    serial_number: '1', device_id: 'dev-1', device_name: 'B-29b', device_ip: '192.168.1.201',
    location_id: 'loc-cebu', location_name: 'DBB CEBU', is_duplicate: false, created_at: nowIso
  })
  const ev1 = punchDisplayService.currentPunch.value
  assert.strictEqual(ev1?.bioId, '25061')
  assert.strictEqual(ev1?.direction, 'IN')

  await punchDisplayService.broadcastPunchFromLog({
    id: 'pd-2', user_id: '50305', employee_name: '50305', employee_id: '50305',
    attendance_time: `${todayStr}T17:02:00+08:00`, type: 1, state: 4,
    serial_number: '1', device_id: 'dev-1', device_name: 'B-29b', device_ip: '192.168.1.201',
    location_id: 'loc-cebu', location_name: 'DBB CEBU', is_duplicate: false, created_at: nowIso
  })
  const ev2 = punchDisplayService.currentPunch.value
  assert.strictEqual(ev2?.bioId, '25061')
  assert.strictEqual(ev2?.direction, 'OUT')
  assert.strictEqual(ev2?.employeeName, 'Abelido, Reynald C.')
  ok('Scenario 14: Single-ID backward compatibility & Punch Display multi-ID session resolution verified')

  console.log('\n======================================================================')
  console.log(`ALL ${passed} MULTI-BIOMETRIC ID VERIFICATION CHECKS PASSED SUCCESSFULLY!`)
  console.log('======================================================================')
} finally {
  await server.close()
}
