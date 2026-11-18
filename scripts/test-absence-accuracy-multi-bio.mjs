/**
 * DMBBHR Absence Accuracy & Employee Eligibility Verification Suite (Multi-Bio-ID)
 *
 * Exercises REAL production TypeScript modules via Vite SSR:
 * - src/services/reportsService.ts
 * - src/repositories/employeeRepository.ts
 * - src/repositories/attendanceRepository.ts
 * - src/services/payrollCalculation.ts
 *
 * Covers all 7 Required Absence Accuracy Tests + Historical Reports, Payroll Alignment,
 * Approved Leave on Secondary IDs, Inactive/Suspended, Not-Yet-Employed, Raw ID Exclusion,
 * and Two-PC Determinism.
 *
 * Run: node scripts/test-absence-accuracy-multi-bio.mjs
 */

import assert from 'node:assert'
import { createServer } from 'vite'

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

  const makeCollection = (itemsFn) => {
    const col = {
      async toArray() {
        return itemsFn().map(clone)
      },
      async first() {
        const list = itemsFn()
        return list.length > 0 ? clone(list[0]) : undefined
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

  const nowIso = '2026-10-01T00:00:00.000Z'
  await memTables.workGroups.bulkPut([
    {
      id: 'wg-group-c', name: 'Group C', code: 'C', standardIn: '08:00',
      requiredWorkMinutes: 480, lunchStart: '12:00', lunchEnd: '13:00', expectedOut: '17:00',
      gracePeriodMinutes: 0, isDefault: true, createdAt: nowIso, updatedAt: nowIso
    }
  ])

  const empRepoMod = await server.ssrLoadModule('/src/repositories/employeeRepository.ts')
  const attRepoMod = await server.ssrLoadModule('/src/repositories/attendanceRepository.ts')
  const reportsMod = await server.ssrLoadModule('/src/services/reportsService.ts')
  const payrollMod = await server.ssrLoadModule('/src/services/payrollCalculation.ts')

  const { employeeRepository } = empRepoMod
  const { attendanceRepository } = attRepoMod
  const { reportsService, isAbsenceCutoffReached, ABSENCE_CUTOFF_HOUR } = reportsMod
  const { payrollCalculationService } = payrollMod

  // Initial warm-up before clearing
  await employeeRepository.getEmployees()

  let passed = 0
  const ok = (msg) => {
    passed++
    console.log(`✔ ${msg}`)
  }

  async function resetAll() {
    await memTables.employees.clear()
    await memTables.biometricPunches.clear()
    await memTables.dailyAttendance.clear()
    await memTables.dailySummaries.clear()
    await memTables.manualAdjustments.clear()
    await memTables.leaveRecords.clear()
    await memTables.holidays.clear()
    await memTables.payrollSnapshots.clear()
    await memTables.overtimeAuthorizations.clear()
    await employeeRepository.reloadFromDb()
    reportsService.clearCache()
  }

  function manilaPunch(id, bioId, date, hhmmss) {
    const ts = `${date}T${hhmmss}+08:00`
    return {
      id,
      bioId,
      date,
      timestamp: ts,
      timestampMs: new Date(ts).getTime(),
      type: 1,
      state: 1,
      serialNumber: '0476141400046',
      deviceId: 'dev-1',
      deviceIp: '192.168.1.201',
      deviceName: 'BISMAC B-29b',
      locationId: 'loc-cebu',
      locationName: 'DBB CEBU',
      employeeName: bioId,
      isDuplicate: false,
      importedAt: nowIso
    }
  }

  async function reportForDate(dateStr) {
    return await reportsService.getReportSummary(
      { preset: 'custom', startDate: dateStr, endDate: dateStr },
      true
    )
  }

  const TEST_DATE = '2026-10-12' // Monday (regular workday in past relative to Nov 2026)

  console.log('======================================================================')
  console.log('DMBBHR ABSENCE ACCURACY & ELIGIBILITY TESTS (MULTI-BIOMETRIC ID)')
  console.log('======================================================================\n')

  // -------------------------------------------------------------------------
  // Required Test 1: Primary ID has no punches, secondary ID has valid IN and OUT -> Present
  // -------------------------------------------------------------------------
  await resetAll()
  await employeeRepository.registerFromPunch('25061', 'Abelido, Reynald C.', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.linkSecondaryBioId('25061', '50305', { confirmedByAdmin: true })
  await memTables.biometricPunches.bulkPut([
    manilaPunch('t1-in', '50305', TEST_DATE, '07:55:00'),
    manilaPunch('t1-out', '50305', TEST_DATE, '17:02:00')
  ])
  let rep = await reportForDate(TEST_DATE)
  assert.strictEqual(rep.kpis.uniqueEligibleEmployees, 1)
  assert.strictEqual(rep.kpis.presentCount, 1)
  assert.strictEqual(rep.kpis.absentCount, 0)
  assert.strictEqual(rep.kpis.uniquePresentEmployees, 1)
  assert.strictEqual(rep.kpis.uniqueAbsentEmployees, 0)
  ok('Required Test 1: Primary ID (25061) has 0 punches, Secondary ID (50305) has IN+OUT -> Present, 0 Absent')

  // -------------------------------------------------------------------------
  // Required Test 2: Secondary ID has IN, primary ID has OUT -> Present
  // -------------------------------------------------------------------------
  await resetAll()
  await employeeRepository.registerFromPunch('25061', 'Abelido, Reynald C.', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.linkSecondaryBioId('25061', '50305', { confirmedByAdmin: true })
  await memTables.biometricPunches.bulkPut([
    manilaPunch('t2-in', '50305', TEST_DATE, '08:10:00'),
    manilaPunch('t2-out', '25061', TEST_DATE, '17:00:00')
  ])
  rep = await reportForDate(TEST_DATE)
  assert.strictEqual(rep.kpis.uniqueEligibleEmployees, 1)
  assert.strictEqual(rep.kpis.presentCount, 1)
  assert.strictEqual(rep.kpis.absentCount, 0)
  assert.strictEqual(rep.kpis.lateCount, 1)
  assert.strictEqual(rep.kpis.totalLateMinutes, 10)
  assert.strictEqual(rep.kpis.missingOutCount, 0)
  ok('Required Test 2: Secondary ID (50305) has IN + Primary ID (25061) has OUT -> Present (combined late 10m, 0 missing OUT)')

  // -------------------------------------------------------------------------
  // Required Test 3: Both IDs have valid punches -> One employee, one attendance record
  // -------------------------------------------------------------------------
  await resetAll()
  await employeeRepository.registerFromPunch('25061', 'Abelido, Reynald C.', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.linkSecondaryBioId('25061', '50305', { confirmedByAdmin: true })
  await memTables.biometricPunches.bulkPut([
    manilaPunch('t3-1', '25061', TEST_DATE, '07:55:00'),
    manilaPunch('t3-2', '50305', TEST_DATE, '12:00:00'),
    manilaPunch('t3-3', '25061', TEST_DATE, '12:55:00'),
    manilaPunch('t3-4', '50305', TEST_DATE, '17:05:00')
  ])
  const dailyT3 = await attendanceRepository.getDailyAttendance(TEST_DATE, 'all', 'all', { skipAutoSync: true })
  assert.strictEqual(dailyT3.length, 1, 'Daily attendance must combine both IDs into 1 record')
  rep = await reportForDate(TEST_DATE)
  assert.strictEqual(rep.kpis.uniqueEligibleEmployees, 1, 'Multiple Bio IDs must not inflate eligible employee count')
  assert.strictEqual(rep.kpis.presentCount, 1)
  assert.strictEqual(rep.kpis.uniquePresentEmployees, 1)
  assert.strictEqual(rep.diagnostics.employeesWithValidPunches, 1)
  assert.strictEqual(rep.diagnostics.dailyValidPunchRecords, 1)
  assert.strictEqual(rep.kpis.absentCount, 0)
  ok('Required Test 3: Both IDs have valid punches -> 1 canonical employee, 1 attendance record, 1 Present')

  // -------------------------------------------------------------------------
  // Required Test 4: Neither ID has punches -> Absent
  // -------------------------------------------------------------------------
  await resetAll()
  await employeeRepository.registerFromPunch('25061', 'Abelido, Reynald C.', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.linkSecondaryBioId('25061', '50305', { confirmedByAdmin: true })
  rep = await reportForDate(TEST_DATE)
  assert.strictEqual(rep.kpis.uniqueEligibleEmployees, 1)
  assert.strictEqual(rep.kpis.presentCount, 0)
  assert.strictEqual(rep.kpis.absentCount, 1)
  assert.strictEqual(rep.kpis.uniqueAbsentEmployees, 1)
  assert.strictEqual(rep.absentRecords.length, 1)
  assert.strictEqual(rep.absentRecords[0].bioId, '25061')
  ok('Required Test 4: Neither linked ID has punches -> 1 Absent occurrence for canonical employee')

  // -------------------------------------------------------------------------
  // Required Test 5: Employee is Active - NB -> Excluded regardless of linked historical IDs
  // -------------------------------------------------------------------------
  await resetAll()
  await employeeRepository.registerFromPunch('25061', 'Abelido, Reynald C.', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.linkSecondaryBioId('25061', '50305', { confirmedByAdmin: true })
  await employeeRepository.deactivateLinkedBioId('25061', '50305', 'Historical ID')
  await employeeRepository.updateEmployee('25061', { excludeFromBiometric: true })
  // Case 5a: No punches -> excluded from Absent and Eligible
  rep = await reportForDate(TEST_DATE)
  assert.strictEqual(rep.kpis.uniqueEligibleEmployees, 0)
  assert.strictEqual(rep.kpis.presentCount, 0)
  assert.strictEqual(rep.kpis.absentCount, 0)
  assert.strictEqual(rep.diagnostics.excludedNoBio, 1)
  // Case 5b: Stray punch on linked historical ID 50305 -> STILL excluded from Present & Absent
  await memTables.biometricPunches.bulkPut([
    manilaPunch('t5-in', '50305', TEST_DATE, '08:00:00'),
    manilaPunch('t5-out', '50305', TEST_DATE, '17:00:00')
  ])
  rep = await reportForDate(TEST_DATE)
  assert.strictEqual(rep.kpis.uniqueEligibleEmployees, 0)
  assert.strictEqual(rep.kpis.presentCount, 0)
  assert.strictEqual(rep.kpis.absentCount, 0)
  assert.strictEqual(rep.diagnostics.excludedNoBio, 1)
  ok('Required Test 5: Active - NB employee excluded from monitoring & counts regardless of linked historical IDs')

  // -------------------------------------------------------------------------
  // Required Test 6: Employee is Resigned -> Excluded according to eligibility rules
  // -------------------------------------------------------------------------
  await resetAll()
  await employeeRepository.registerFromPunch('25061', 'Abelido, Reynald C.', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.linkSecondaryBioId('25061', '50305', { confirmedByAdmin: true })
  await employeeRepository.updateEmployee('25061', { status: 'resigned', resignationDate: '2026-10-01' })
  // Even if a punch arrived on secondary ID after resignation, resigned employee is excluded
  await memTables.biometricPunches.put(manilaPunch('t6-in', '50305', TEST_DATE, '08:00:00'))
  rep = await reportForDate(TEST_DATE)
  assert.strictEqual(rep.kpis.uniqueEligibleEmployees, 0)
  assert.strictEqual(rep.kpis.presentCount, 0)
  assert.strictEqual(rep.kpis.absentCount, 0)
  assert.strictEqual(rep.diagnostics.resignedEmployees, 1)
  ok('Required Test 6: Resigned employee with linked Bio IDs excluded from Present & Absent counts')

  // -------------------------------------------------------------------------
  // Required Test 7: Two different employees with similar names -> Remain separate unless linked
  // -------------------------------------------------------------------------
  await resetAll()
  await employeeRepository.registerFromPunch('25061', 'Abelido, Reynald C.', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.registerFromPunch('50305', 'Abelido, Reynald', 'DBB CEBU', 'wg-group-c')
  await memTables.biometricPunches.bulkPut([
    manilaPunch('t7-in', '25061', TEST_DATE, '07:55:00'),
    manilaPunch('t7-out', '25061', TEST_DATE, '17:02:00')
  ])
  rep = await reportForDate(TEST_DATE)
  assert.strictEqual(rep.diagnostics.deduplicatedEmployees, 2)
  assert.strictEqual(rep.diagnostics.duplicateRecordsMerged, 0)
  assert.strictEqual(rep.kpis.uniqueEligibleEmployees, 2)
  assert.strictEqual(rep.kpis.presentCount, 1)
  assert.strictEqual(rep.kpis.absentCount, 1)
  assert.strictEqual(rep.absentRecords[0].bioId, '50305')
  ok('Required Test 7: Similar-named employees (25061 & 50305) remain separate (1 Present, 1 Absent)')

  // -------------------------------------------------------------------------
  // Additional Test 8: Inactive/Suspended, Not-Yet-Employed, Approved Leave on Secondary ID, Raw Orphan Punch
  // -------------------------------------------------------------------------
  await resetAll()
  // Emp A: Active with secondary ID 50305, punches on 50305 -> Present
  await employeeRepository.registerFromPunch('25061', 'Abelido, Reynald C.', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.linkSecondaryBioId('25061', '50305', { confirmedByAdmin: true })
  await employeeRepository.updateEmployee('25061', { salaryType: 'Daily', dailyRate: 600, basicSalary: 15600, hireDate: '2026-01-01' })
  // Emp B: Active with secondary ID 50405, NO punches on Oct 12, but Approved Leave keyed under secondary ID 50405 -> Excluded from Absent
  await employeeRepository.registerFromPunch('25062', 'Bautista, Elena', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.linkSecondaryBioId('25062', '50405', { confirmedByAdmin: true })
  await employeeRepository.updateEmployee('25062', { salaryType: 'Monthly', basicSalary: 20000, hireDate: '2026-01-01' })
  // Emp C: Inactive / Suspended -> Excluded
  await employeeRepository.registerFromPunch('25063', 'Cruz, Pedro', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.updateEmployee('25063', { status: 'suspended', salaryType: 'Daily', dailyRate: 540 })
  // Emp D: Not yet employed on Oct 12 (hireDate Oct 14) -> Excluded on Oct 12, eligible on Oct 14
  await employeeRepository.registerFromPunch('25064', 'Dizon, Carla', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.updateEmployee('25064', { salaryType: 'Monthly', basicSalary: 15600, dailyRate: 600, hireDate: '2026-10-14' })
  // Emp E: Active - NB with Monthly salary -> Excluded from biometric monitoring/Absent, keeps full pay in payroll
  await employeeRepository.registerFromPunch('25065', 'Estrada, Marco', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.updateEmployee('25065', { excludeFromBiometric: true, salaryType: 'Monthly', basicSalary: 30000, dailyRate: 1153.85 })

  await memTables.leaveRecords.put({
    id: 'lv-50405',
    bioId: '50405',
    employeeName: 'Bautista, Elena',
    leaveType: 'Sick Leave',
    startDate: '2026-10-12',
    endDate: '2026-10-12',
    status: 'Approved',
    reason: 'Medical',
    createdAt: nowIso
  })

  await memTables.biometricPunches.bulkPut([
    // Reynald works Oct 12 (via 50305), Oct 13 (via 25061 IN + 50305 OUT), Oct 14 (via both 25061 & 50305)
    manilaPunch('m-a-12-in', '50305', '2026-10-12', '07:58:00'),
    manilaPunch('m-a-12-out', '50305', '2026-10-12', '17:02:00'),
    manilaPunch('m-a-13-in', '25061', '2026-10-13', '07:55:00'),
    manilaPunch('m-a-13-out', '50305', '2026-10-13', '17:05:00'),
    manilaPunch('m-a-14-in', '25061', '2026-10-14', '08:00:00'),
    manilaPunch('m-a-14-out', '50305', '2026-10-14', '17:00:00'),
    // Elena works Oct 13 & Oct 14 (absent on neither because Oct 12 is Approved Leave under secondary 50405)
    manilaPunch('m-b-13-in', '25062', '2026-10-13', '07:59:00'),
    manilaPunch('m-b-13-out', '50405', '2026-10-13', '17:01:00'),
    manilaPunch('m-b-14-in', '50405', '2026-10-14', '07:59:00'),
    manilaPunch('m-b-14-out', '25062', '2026-10-14', '17:01:00'),
    // Orphan unlinked raw biometric ID 99999 (must NOT be counted as an employee)
    manilaPunch('m-raw-12-in', '99999', '2026-10-12', '08:00:00'),
    manilaPunch('m-raw-12-out', '99999', '2026-10-12', '17:00:00')
  ])

  const oct12Rep = await reportForDate('2026-10-12')
  assert.strictEqual(oct12Rep.kpis.uniqueEligibleEmployees, 1, 'Only Reynald eligible on Oct 12')
  assert.strictEqual(oct12Rep.kpis.presentCount, 1, 'Raw unlinked ID 99999 must NOT be counted as Present')
  assert.strictEqual(oct12Rep.kpis.absentCount, 0, 'Leave on secondary 50405, NB, Suspended, and Not-Yet-Employed all excluded')
  assert.strictEqual(oct12Rep.diagnostics.excludedApprovedLeave, 1)
  assert.strictEqual(oct12Rep.diagnostics.excludedNoBio, 1)
  assert.strictEqual(oct12Rep.diagnostics.excludedNotYetEmployed, 1)
  assert.strictEqual(oct12Rep.diagnostics.inactiveOrOtherStatusEmployees, 1)
  assert.deepStrictEqual(oct12Rep.diagnostics.unmatchedPunchBioIds, ['99999'])
  ok('Additional Test 8a: Approved leave on secondary ID, Suspended, Not-Yet-Employed, Active-NB, and raw 99999 handled accurately')

  // Historical multi-day report (Oct 12 - Oct 14):
  // Oct 12: 1 eligible (Reynald present)
  // Oct 13: 2 eligible (Reynald present, Elena present)
  // Oct 14: 3 eligible (Reynald present, Elena present, Carla hired Oct 14 -> 1 absent!)
  const rangeRep = await reportsService.getReportSummary(
    { preset: 'custom', startDate: '2026-10-12', endDate: '2026-10-14' },
    true
  )
  assert.strictEqual(rangeRep.kpis.presentCount, 5)
  assert.strictEqual(rangeRep.kpis.absentCount, 1)
  assert.strictEqual(rangeRep.kpis.uniqueAbsentEmployees, 1)
  assert.strictEqual(rangeRep.absentRecords.length, 1)
  assert.strictEqual(rangeRep.absentRecords[0].bioId, '25064')
  assert.strictEqual(rangeRep.absentRecords[0].date, '2026-10-14')
  assert.strictEqual(rangeRep.kpis.totalEligibleWorkdays, 6)
  assert.strictEqual(await employeeRepository.countActive(), 3, 'countActive counts Active non-NB employees (Reynald, Elena, Carla)')
  ok('Additional Test 8b: Historical multi-day report matches day-by-day hire-date & leave eligibility accurately')

  // -------------------------------------------------------------------------
  // Additional Test 9: Payroll Calculation consistency across Multi-Bio-ID & Eligibility exclusions
  // -------------------------------------------------------------------------
  const partialCutoff = {
    ...payrollCalculationService.getCutoffPeriod(2026, 10, 1),
    dates: ['2026-10-12', '2026-10-13', '2026-10-14']
  }
  const allEmps = await employeeRepository.getEmployees()
  const payrollRecords = await payrollCalculationService.computePayroll(partialCutoff, allEmps)

  // Suspended employee 25063 must accumulate 0 scheduledDays, 0 absentDays, and 0 earnings
  const pSuspended = payrollRecords.find((r) => r.bioId === '25063')
  assert.strictEqual(pSuspended?.scheduledDays, 0, 'Suspended employee must have 0 scheduledDays')
  assert.strictEqual(pSuspended?.absentDays, 0, 'Suspended employee must have 0 absentDays')
  assert.strictEqual(pSuspended?.initialEarnings, 0, 'Suspended employee with 0 worked days has 0 earnings')
  // Reynald (25061): 3 present days across primary/secondary IDs, 0 absent
  const pReynald = payrollRecords.find((r) => r.bioId === '25061')
  assert.strictEqual(pReynald?.presentDays, 3)
  assert.strictEqual(pReynald?.absentDays, 0)
  assert.strictEqual(pReynald?.initialEarnings, 1800)
  // Elena (25062): 2 present days + 1 approved leave under 50405, 0 absent
  const pElena = payrollRecords.find((r) => r.bioId === '25062')
  assert.strictEqual(pElena?.presentDays, 2)
  assert.strictEqual(pElena?.absentDays, 0)
  // Carla (25064): hired Oct 14 -> scheduledDays = 1, absentDays = 1 (NOT 3!)
  const pCarla = payrollRecords.find((r) => r.bioId === '25064')
  assert.strictEqual(pCarla?.scheduledDays, 1)
  assert.strictEqual(pCarla?.absentDays, 1)
  // Marco (25065): Active - NB Monthly -> 0 absentDays, full semi-monthly basic (15,000)
  const pMarco = payrollRecords.find((r) => r.bioId === '25065')
  assert.strictEqual(pMarco?.absentDays, 0)
  assert.strictEqual(pMarco?.earningsBreakdown.basePay, 15000)
  ok('Additional Test 9: Payroll applies identical Multi-Bio-ID resolution & eligibility exclusions (Leave, Suspended, Hire Date, Active - NB)')

  // -------------------------------------------------------------------------
  // Additional Test 10: Two-PC Determinism regardless of IndexedDB insertion order
  // -------------------------------------------------------------------------
  const pc1Snapshot = JSON.stringify({
    kpis: rangeRep.kpis,
    absentRecords: rangeRep.absentRecords,
    topAbsentEmployees: rangeRep.topAbsentEmployees,
    diagnostics: rangeRep.diagnostics
  })

  // Simulate PC 2 inserting employees, punches, and leaves in reverse/shuffled order
  const savedEmps = (await memTables.employees.toArray()).reverse()
  const savedPunches = (await memTables.biometricPunches.toArray()).reverse()
  const savedLeaves = (await memTables.leaveRecords.toArray()).reverse()
  await resetAll()
  await memTables.employees.bulkPut(savedEmps)
  await memTables.biometricPunches.bulkPut(savedPunches)
  await memTables.leaveRecords.bulkPut(savedLeaves)
  await employeeRepository.reloadFromDb()

  const pc2Rep = await reportsService.getReportSummary(
    { preset: 'custom', startDate: '2026-10-12', endDate: '2026-10-14' },
    true
  )
  const pc2Snapshot = JSON.stringify({
    kpis: pc2Rep.kpis,
    absentRecords: pc2Rep.absentRecords,
    topAbsentEmployees: pc2Rep.topAbsentEmployees,
    diagnostics: pc2Rep.diagnostics
  })
  assert.strictEqual(pc2Snapshot, pc1Snapshot, 'Two PCs with reversed DB insertion order must compute identical reports & diagnostics')
  ok('Additional Test 10: Two-PC determinism verified (identical KPIs, absentRecords, and diagnostics across reversed DB order)')

  // -------------------------------------------------------------------------
  // Additional Test 11: Weekly & Monthly Absence Frequency Date Ranges & Grouping
  // -------------------------------------------------------------------------
  const attEngMod = await server.ssrLoadModule('/src/services/attendanceEngine.ts')
  const holMod = await server.ssrLoadModule('/src/services/holidays/holidayService.ts')
  const { getManilaDateString } = attEngMod
  const { holidayService } = holMod

  const todayStr = getManilaDateString(new Date())
  const [ty, tm, td] = todayStr.split('-').map(Number)
  const todayUtc = new Date(Date.UTC(ty, tm - 1, td))

  const fmtUtc = (dObj) =>
    `${dObj.getUTCFullYear()}-${String(dObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dObj.getUTCDate()).padStart(2, '0')}`
  const isoWeekKey = (dObj) => {
    const d = new Date(Date.UTC(dObj.getUTCFullYear(), dObj.getUTCMonth(), dObj.getUTCDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
  }

  // Collect official holiday dates so test dates are guaranteed regular working days
  const holidaySet = new Set()
  for (const yr of new Set([ty - 1, ty, ty + 1])) {
    const res = await holidayService.getHolidays(yr).catch(() => ({ holidays: [] }))
    for (const h of res.holidays) {
      if (h.type !== 'Special Working') holidaySet.add(h.date)
    }
  }
  const pickWorkday = (year, monthIndex0, startDay = 10) => {
    const d = new Date(Date.UTC(year, monthIndex0, startDay))
    while (d.getUTCMonth() === ((monthIndex0 % 12) + 12) % 12) {
      const ds = fmtUtc(d)
      if (d.getUTCDay() !== 0 && !holidaySet.has(ds) && ds <= todayStr) return { dateStr: ds, dateObj: d }
      d.setUTCDate(d.getUTCDate() + 1)
    }
    throw new Error(`No workday found for ${year}-${monthIndex0 + 1}`)
  }

  const mMinus2Start = new Date(Date.UTC(ty, tm - 3, 1))
  const mMinus1Start = new Date(Date.UTC(ty, tm - 2, 1))
  const mCurrStart = new Date(Date.UTC(ty, tm - 1, 1))

  const twoMonthsAgoDay = pickWorkday(mMinus2Start.getUTCFullYear(), mMinus2Start.getUTCMonth(), 10)
  const prevMonthDay = pickWorkday(mMinus1Start.getUTCFullYear(), mMinus1Start.getUTCMonth(), 10)
  // Pick a workday in the current week (or most recent workday <= today)
  const currWeekWorkdayObj = new Date(todayUtc)
  while (currWeekWorkdayObj.getUTCDay() === 0 || holidaySet.has(fmtUtc(currWeekWorkdayObj))) {
    currWeekWorkdayObj.setUTCDate(currWeekWorkdayObj.getUTCDate() - 1)
  }
  const currWeekWorkdayStr = fmtUtc(currWeekWorkdayObj)

  await resetAll()
  await employeeRepository.registerFromPunch('25061', 'Reynald Abelido', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.updateEmployee('25061', {
    department: 'Operations',
    position: 'Technician',
    hire_date: fmtUtc(mMinus2Start)
  })
  await employeeRepository.linkSecondaryBioId('25061', '50305', { confirmedByAdmin: true })

  await employeeRepository.registerFromPunch('25062', 'Elena Santos', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.updateEmployee('25062', {
    department: 'Finance',
    position: 'Accountant',
    hire_date: fmtUtc(mMinus2Start)
  })

  // Reynald punches via secondary Bio ID 50305 on all 3 test workdays; Elena has NO punches on those 3 days
  await memTables.biometricPunches.bulkPut([
    manilaPunch('t11-r1', '50305', twoMonthsAgoDay.dateStr, '08:00:00'),
    manilaPunch('t11-r2', '50305', prevMonthDay.dateStr, '08:00:00'),
    manilaPunch('t11-r3', '50305', currWeekWorkdayStr, '08:00:00')
  ])

  const test11AsOf = new Date(`${todayStr}T10:00:00+08:00`)

  // Even when report preset is 'today', weeklyTrend and monthlyTrend must span their fixed windows
  const todayReport = await reportsService.getReportSummary({ preset: 'today', asOf: test11AsOf }, true)

  // Monthly view: exact 3 months [tm-2, tm-1, tm] including current month
  const expectedMonthKeys = [mMinus2Start, mMinus1Start, mCurrStart].map(
    (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  )
  assert.deepStrictEqual(
    todayReport.monthlyTrend.map((m) => m.monthKey),
    expectedMonthKeys,
    'Monthly view must contain the last 3 months including current month'
  )

  // Weekly view: all weeks from previous month's first week through the current week
  const prevMonthFirstDay = mMinus1Start.getUTCDay()
  const weeklyStart = new Date(mMinus1Start)
  weeklyStart.setUTCDate(weeklyStart.getUTCDate() + (prevMonthFirstDay === 0 ? -6 : 1 - prevMonthFirstDay))
  const expectedWeekKeys = []
  const wCur = new Date(weeklyStart)
  while (wCur <= todayUtc) {
    const wk = isoWeekKey(wCur)
    if (!expectedWeekKeys.includes(wk)) expectedWeekKeys.push(wk)
    wCur.setUTCDate(wCur.getUTCDate() + 7)
  }
  const currWeekKey = isoWeekKey(todayUtc)
  if (!expectedWeekKeys.includes(currWeekKey)) expectedWeekKeys.push(currWeekKey)

  assert.deepStrictEqual(
    todayReport.weeklyTrend.map((w) => w.weekKey),
    expectedWeekKeys,
    'Weekly view must contain all weeks from previous month through current week'
  )

  // Reynald (Operations) punched on secondary Bio ID 50305 on those days -> 0 absences for Reynald on those buckets
  const opsReport = await reportsService.getReportSummary(
    { preset: 'today', department: 'Operations', asOf: test11AsOf },
    true
  )
  const opsPrevWeek = opsReport.weeklyTrend.find((w) => w.weekKey === isoWeekKey(prevMonthDay.dateObj))
  const opsCurrWeek = opsReport.weeklyTrend.find((w) => w.weekKey === currWeekKey)
  assert.ok(opsPrevWeek && opsCurrWeek, 'Previous-month and current-week buckets must exist under department filter')

  // Finance (Elena, 0 punches) must show exact absence contribution on prevMonthDay & currWeekWorkday, plus twoMonthsAgoDay in Monthly[0]
  const finReport = await reportsService.getReportSummary(
    { preset: 'today', department: 'Finance', asOf: test11AsOf },
    true
  )
  assert.ok(
    finReport.monthlyTrend[0].absentCount >= 1,
    '2-months-ago absence must be counted in Monthly view first bucket'
  )
  assert.ok(
    finReport.monthlyTrend[1].absentCount >= 1,
    'Previous-month absence must be counted in Monthly view second bucket'
  )
  assert.ok(
    finReport.monthlyTrend[2].absentCount >= 1,
    'Current-month absence must be counted in Monthly view current month bucket'
  )
  const finPrevWeek = finReport.weeklyTrend.find((w) => w.weekKey === isoWeekKey(prevMonthDay.dateObj))
  const finCurrWeek = finReport.weeklyTrend.find((w) => w.weekKey === currWeekKey)
  assert.ok(finPrevWeek && finPrevWeek.absentCount >= 1, 'Previous-month absence must appear in its corresponding Weekly bucket')
  assert.ok(finCurrWeek && finCurrWeek.absentCount >= 1, 'Current-week absence must appear in current week Weekly bucket')
  assert.strictEqual(
    finReport.weeklyTrend.some((w) => w.weekKey === isoWeekKey(twoMonthsAgoDay.dateObj) && !expectedWeekKeys.includes(w.weekKey)),
    false,
    'Weekly view must not include weeks from 2 months ago outside previous month..current week'
  )

  // Verify 7-day Sunday-Saturday weeklyDailyWindows and selectedWeekStart
  const expectedSun = new Date(todayUtc)
  expectedSun.setUTCDate(expectedSun.getUTCDate() - expectedSun.getUTCDay())
  const expectedSunStr = fmtUtc(expectedSun)
  assert.strictEqual(finReport.selectedWeekStart, expectedSunStr, 'Today preset selects Sunday of current calendar week')
  const finSelectedWeek = finReport.weeklyDailyWindows.find((w) => w.weekStart === finReport.selectedWeekStart)
  assert.ok(finSelectedWeek, 'Selected week window must exist in weeklyDailyWindows')
  assert.strictEqual(finSelectedWeek.days.length, 7, 'Selected week window must have all 7 days (Sun-Sat)')
  assert.strictEqual(finSelectedWeek.days[0].dayName, 'Sun', 'Selected week starts on Sunday')
  assert.strictEqual(finSelectedWeek.days[0].absentCount, 0, 'Sunday must have 0 absences')
  assert.strictEqual(finSelectedWeek.days[6].dayName, 'Sat', 'Selected week ends on Saturday')
  const finCurrWorkdayPoint = finSelectedWeek.days.find((d) => d.date === currWeekWorkdayStr)
  assert.strictEqual(finCurrWorkdayPoint?.absentCount, 1, 'Current-week workday must show 1 absent for Finance Elena')
  for (const d of finSelectedWeek.days) {
    if (d.date > todayStr) {
      assert.strictEqual(d.absentCount, 0, `Future date ${d.date} must have 0 absentCount`)
      assert.strictEqual(d.isFuture, true)
    }
  }

  // Operations (Reynald punched on secondary 50305) must show 0 on currWeekWorkdayStr in 7-day weekly view
  const opsSelectedWeek = opsReport.weeklyDailyWindows.find((w) => w.weekStart === opsReport.selectedWeekStart)
  const opsCurrWorkdayPoint = opsSelectedWeek?.days.find((d) => d.date === currWeekWorkdayStr)
  assert.strictEqual(opsCurrWorkdayPoint?.absentCount, 0, 'Secondary Bio ID 50305 punch prevents absence on 7-day weekly line chart')

  // Last Week preset anchors selectedWeekStart to previous Sunday-Saturday week
  const lastWeekReport = await reportsService.getReportSummary({ preset: 'last_week', department: 'Finance', asOf: test11AsOf }, true)
  const expectedPrevSun = new Date(expectedSun)
  expectedPrevSun.setUTCDate(expectedPrevSun.getUTCDate() - 7)
  assert.strictEqual(lastWeekReport.selectedWeekStart, fmtUtc(expectedPrevSun), 'Last Week preset selects prior Sunday-Saturday week')
  ok('Additional Test 11: Weekly 7-day windows, selectedWeekStart, Monthly 3-month trends & filters verified accurately')

  // ------------------------------------------------------------------
  // ADDITIONAL TEST 12: 9:00 AM Absent Reporting Cutoff & Late Valid IN Rule
  // ------------------------------------------------------------------
  assert.strictEqual(ABSENCE_CUTOFF_HOUR, 9, 'Cutoff hour must be 9 (9:00 AM)')
  assert.strictEqual(isAbsenceCutoffReached('2026-11-17', { hour: 8, minute: 59, dateStr: '2026-11-17' }), false, '08:59 AM on Today must be before cutoff')
  assert.strictEqual(isAbsenceCutoffReached('2026-11-17', { hour: 9, minute: 0, dateStr: '2026-11-17' }), true, '09:00 AM on Today must reach cutoff')
  assert.strictEqual(isAbsenceCutoffReached('2026-11-16', { hour: 8, minute: 30, dateStr: '2026-11-17' }), true, 'Yesterday must always be past cutoff even at 8:30 AM today')
  assert.strictEqual(isAbsenceCutoffReached('2026-11-18', { hour: 10, minute: 0, dateStr: '2026-11-17' }), false, 'Future date must never reach cutoff')

  await resetAll()
  const SIM_YESTERDAY = '2026-11-16' // Monday
  const SIM_TODAY = '2026-11-17'     // Tuesday

  // Register test employees:
  // - 90001: Early/on-time employee (punched IN 08:15 AM on SIM_TODAY, punched Yesterday)
  // - 90002: Truly absent employee on both SIM_YESTERDAY & SIM_TODAY (0 punches)
  // - 90003: Late employee punching IN at 09:15 AM on SIM_TODAY (single punch, no OUT yet)
  // - 90004: Very late employee punching IN at 11:30 AM + 17:05 OUT on SIM_TODAY
  // - 90005: Multi-Bio-ID employee (primary 90005, secondary 90505) punching IN at 09:45 AM via 90505 on SIM_TODAY
  // - 90006: Active - NB (must remain excluded)
  // - 90007: Resigned (must remain excluded)
  await employeeRepository.registerFromPunch('90001', 'Early Arrival Emp', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.registerFromPunch('90002', 'Unpunched Absent Emp', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.registerFromPunch('90003', 'Late 915AM Emp', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.registerFromPunch('90004', 'Late 1130AM Emp', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.registerFromPunch('90005', 'Multi Bio Late Emp', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.linkSecondaryBioId('90005', '90505', { confirmedByAdmin: true })
  await employeeRepository.registerFromPunch('90006', 'No Bio Excluded Emp', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.updateEmployee('90006', { exclude_from_biometric: true })
  await employeeRepository.registerFromPunch('90007', 'Resigned Excluded Emp', 'DBB CEBU', 'wg-group-c')
  await employeeRepository.updateEmployee('90007', { status: 'resigned', resignation_date: '2026-10-01' })

  for (const bid of ['90001', '90002', '90003', '90004', '90005', '90006']) {
    await employeeRepository.updateEmployee(bid, { hire_date: '2026-01-01', department: 'Operations' })
  }

  // Yesterday punches: 90001, 90003, 90004, 90005 punched; 90002 did not
  await memTables.biometricPunches.bulkPut([
    manilaPunch('c-y-1', '90001', SIM_YESTERDAY, '07:55:00'),
    manilaPunch('c-y-3', '90003', SIM_YESTERDAY, '07:58:00'),
    manilaPunch('c-y-4', '90004', SIM_YESTERDAY, '08:00:00'),
    manilaPunch('c-y-5', '90005', SIM_YESTERDAY, '07:50:00')
  ])

  // Today punches before 9:00 AM: only 90001 has punched IN at 08:15 AM
  await memTables.biometricPunches.put(manilaPunch('c-t-1', '90001', SIM_TODAY, '08:15:00'))

  const asOf859 = new Date(`${SIM_TODAY}T08:59:00+08:00`)

  // 12a. Today at 8:59 AM -> 0 Absent (90002, 90003, 90004, 90005 have not punched yet, before 9:00 AM)
  const repToday859 = await reportsService.getReportSummary({ preset: 'today', asOf: asOf859 }, true)
  assert.strictEqual(repToday859.kpis.absentCount, 0, 'Before 9:00 AM on Today: absentCount must be 0')
  assert.strictEqual(repToday859.kpis.uniqueAbsentEmployees, 0, 'Before 9:00 AM on Today: uniqueAbsentEmployees must be 0')
  assert.strictEqual(repToday859.absentRecords.length, 0, 'Before 9:00 AM on Today: absentRecords must be empty')
  assert.strictEqual(repToday859.kpis.presentCount, 1, 'Before 9:00 AM on Today: punched employee 90001 must still be Present')
  const today859Week = repToday859.weeklyDailyWindows.find((w) => w.weekStart === repToday859.selectedWeekStart)
  const today859TrendPt = today859Week?.days.find((d) => d.date === SIM_TODAY)
  assert.strictEqual(today859TrendPt?.absentCount, 0, 'Before 9:00 AM on Today: Weekly trend point for Today must be 0')

  // 12b. Yesterday evaluated at Today 8:59 AM -> Yesterday IS past 9:00 AM cutoff, so 90002 IS counted Absent
  const repYestAt859 = await reportsService.getReportSummary({ preset: 'yesterday', asOf: asOf859 }, true)
  assert.strictEqual(repYestAt859.kpis.absentCount, 1, 'Yesterday at 8:59 AM Today: un-punched 90002 must be counted Absent')
  assert.deepStrictEqual(repYestAt859.absentRecords.map((r) => r.bioId), ['90002'])
  // Check Today bucket in weeklyDailyWindows even when preset is 'yesterday'
  const yestWeekWindow = repYestAt859.weeklyDailyWindows.find((w) => w.days.some((d) => d.date === SIM_TODAY))
  assert.strictEqual(yestWeekWindow?.days.find((d) => d.date === SIM_YESTERDAY)?.absentCount, 1, 'Yesterday point in Weekly trend shows 1 absent')
  assert.strictEqual(yestWeekWindow?.days.find((d) => d.date === SIM_TODAY)?.absentCount, 0, 'Today point in Weekly trend still shows 0 before 9:00 AM when preset is yesterday')

  // 12c. Custom Date Range [Yesterday, Today] at Today 8:59 AM -> only Yesterday absence counted
  const repCustomSpan859 = await reportsService.getReportSummary(
    { preset: 'custom', startDate: SIM_YESTERDAY, endDate: SIM_TODAY, asOf: asOf859 },
    true
  )
  assert.strictEqual(repCustomSpan859.kpis.absentCount, 1, 'Custom range [Yesterday..Today] before 9:00 AM counts Yesterday absent only')
  assert.strictEqual(repCustomSpan859.absentRecords[0].date, SIM_YESTERDAY)

  // 12d. At 9:00 AM onwards with late punches at 9:15 AM, 11:30 AM, and secondary Bio ID 90505 at 9:45 AM
  await memTables.biometricPunches.bulkPut([
    manilaPunch('c-t-3', '90003', SIM_TODAY, '09:15:00'),
    manilaPunch('c-t-4a', '90004', SIM_TODAY, '11:30:00'),
    manilaPunch('c-t-4b', '90004', SIM_TODAY, '17:05:00'),
    manilaPunch('c-t-5', '90505', SIM_TODAY, '09:45:00')
  ])

  const asOf900 = new Date(`${SIM_TODAY}T09:00:00+08:00`)
  const repToday900 = await reportsService.getReportSummary({ preset: 'today', asOf: asOf900 }, true)
  // 90001, 90003, 90004, 90005 all have valid IN punches -> Present/Late, NEVER Absent!
  // Only 90002 has no valid IN punch (90006 is Active-NB, 90007 is Resigned)
  assert.strictEqual(repToday900.kpis.presentCount, 4, 'At/after 9:00 AM: all 4 employees with valid IN punches (incl. 9:15, 11:30, and secondary ID 9:45) must be Present')
  assert.strictEqual(repToday900.kpis.absentCount, 1, 'At 9:00 AM onwards: only eligible employee without valid IN punch (90002) is Absent')
  assert.deepStrictEqual(repToday900.absentRecords.map((r) => r.bioId), ['90002'])
  const today900Week = repToday900.weeklyDailyWindows.find((w) => w.weekStart === repToday900.selectedWeekStart)
  assert.strictEqual(today900Week?.days.find((d) => d.date === SIM_TODAY)?.absentCount, 1, 'At 9:00 AM onwards: Weekly trend point for Today shows 1 absent')

  // 12e. Custom Date Range for SIM_TODAY at 10:30 AM -> identical Absent classification & exclusions
  const asOf1030 = new Date(`${SIM_TODAY}T10:30:00+08:00`)
  const repCustomToday1030 = await reportsService.getReportSummary(
    { preset: 'custom', startDate: SIM_TODAY, endDate: SIM_TODAY, asOf: asOf1030 },
    true
  )
  assert.strictEqual(repCustomToday1030.kpis.absentCount, 1)
  assert.deepStrictEqual(repCustomToday1030.absentRecords.map((r) => r.bioId), ['90002'])

  // Custom Date Range [Yesterday, Today] at 10:30 AM -> 2 absent occurrences across 1 unique employee (90002)
  const repCustomSpan1030 = await reportsService.getReportSummary(
    { preset: 'custom', startDate: SIM_YESTERDAY, endDate: SIM_TODAY, asOf: asOf1030 },
    true
  )
  assert.strictEqual(repCustomSpan1030.kpis.absentCount, 2, 'Custom range [Yesterday..Today] after 9:00 AM counts both days for un-punched 90002')
  assert.strictEqual(repCustomSpan1030.kpis.uniqueAbsentEmployees, 1)

  ok('Additional Test 12: 9:00 AM absent cutoff, late valid IN punches (never absent), Yesterday & Custom Date Range consistency verified')

  console.log('\n======================================================================')
  console.log(`ALL ${passed} ABSENCE ACCURACY & ELIGIBILITY TESTS PASSED SUCCESSFULLY!`)
  console.log('======================================================================')
} finally {
  await server.close()
}
