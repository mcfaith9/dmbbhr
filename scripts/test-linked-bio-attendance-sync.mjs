/**
 * DMBBHR Linked Biometric ID Attendance Synchronization Test Suite
 *
 * Exercises actual TypeScript modules via Vite SSR Loader:
 * - src/lib/employeeIdentity.ts
 * - src/repositories/employeeRepository.ts
 * - src/repositories/attendanceRepository.ts
 * - src/repositories/punchRepository.ts
 * - src/services/attendanceEngine.ts
 * - src/services/reportsService.ts
 * - src/services/payrollCalculation.ts
 *
 * Run: node scripts/test-linked-bio-attendance-sync.mjs
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
    overtimeAuthorizations: createMemoryTable('id'),
    consolidationAudits: createMemoryTable('id')
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

  const { employeeService } = await server.ssrLoadModule('/src/services/employees.ts')
  const { employeeRepository } = await server.ssrLoadModule('/src/repositories/employeeRepository.ts')
  const { attendanceRepository } = await server.ssrLoadModule('/src/repositories/attendanceRepository.ts')
  const { reportsService } = await server.ssrLoadModule('/src/services/reportsService.ts')
  const { payrollCalculationService } = await server.ssrLoadModule('/src/services/payrollCalculation.ts')

  console.log('='.repeat(72))
  console.log('DMBBHR LINKED BIOMETRIC ID ATTENDANCE SYNCHRONIZATION SUITE')
  console.log('='.repeat(72))

  // Seed two unconsolidated records for Abelido, Reynald C. plus another employee with Approved Leave
  await memTables.employees.bulkPut([
    {
      bioId: '25061',
      employeeNumber: '25061',
      fullName: 'Abelido, Reynald C.',
      location: 'DBB CEBU',
      workGroupId: 'wg-group-c',
      department: 'Operations',
      position: 'Technician',
      status: 'active',
      salaryType: 'Daily',
      dailyRate: 600,
      hireDate: '2025-01-10',
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      bioId: '50305',
      employeeNumber: '50305',
      fullName: 'Abelido, Reynald',
      location: 'DBB CEBU',
      workGroupId: 'wg-group-c',
      department: 'Operations',
      position: 'Technician',
      status: 'active',
      salaryType: 'Daily',
      dailyRate: 600,
      hireDate: '2025-01-10',
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      bioId: '50366',
      employeeNumber: '50366',
      fullName: 'Santos, Roberto',
      location: 'DBB CEBU',
      workGroupId: 'wg-group-c',
      department: 'Operations',
      position: 'Driver',
      status: 'active',
      salaryType: 'Daily',
      dailyRate: 600,
      hireDate: '2025-01-10',
      createdAt: nowIso,
      updatedAt: nowIso
    }
  ])

  // Clear any non-seeded employees added by DEFAULT_INITIAL_EMPLOYEES so we only inspect our 3 test records cleanly
  await employeeRepository.reloadFromDb()
  for (const row of await memTables.employees.toArray()) {
    if (!['25061', '50305', '50366'].includes(row.bioId)) {
      await memTables.employees.delete(row.bioId)
    }
  }
  await employeeRepository.reloadFromDb()

  // Unrelated Approved Leave for 50366 on 2026-10-08
  await memTables.leaveRecords.bulkPut([
    {
      id: 'lv-50366-oct8',
      bioId: '50366',
      employeeName: 'Santos, Roberto',
      leaveType: 'Sick',
      startDate: '2026-10-08',
      endDate: '2026-10-08',
      days: 1,
      status: 'Approved',
      reason: 'Checkup',
      createdAt: nowIso
    },
    {
      id: 'lv-50305-multiday',
      bioId: '50305',
      employeeName: 'Abelido, Reynald',
      leaveType: 'Vacation',
      startDate: '2026-10-12',
      endDate: '2026-10-14',
      days: 3,
      status: 'Approved',
      reason: 'Family trip',
      createdAt: nowIso
    }
  ])

  const makePunch = (id, bioId, date, hhmm, name = 'Abelido, Reynald C.') => {
    const ts = `${date}T${hhmm}:00+08:00`
    return {
      id,
      bioId,
      date,
      timestamp: ts,
      timestampMs: new Date(ts).getTime(),
      type: 1,
      state: 1,
      serialNumber: 1,
      deviceId: 'dev-1',
      deviceIp: '192.168.1.201',
      deviceName: 'BISBIO B-29b',
      locationId: 'loc-dbb-cebu',
      locationName: 'DBB CEBU',
      employeeName: name,
      workGroupId: 'wg-group-c',
      isDuplicate: false,
      importedAt: nowIso
    }
  }

  // Test Week: 2026-10-05 (Mon) .. 2026-10-10 (Sat)
  // Mon 2026-10-05: Primary (25061) only punches IN+OUT
  // Tue 2026-10-06: Linked (50305) only punches IN+OUT
  // Wed 2026-10-07: Primary (25061) IN + Linked (50305) OUT
  // Thu 2026-10-08: Neither punches (50366 has Approved Leave on this date!)
  // Fri 2026-10-09: Both 25061 and 50305 punch on same day
  // Sat 2026-10-10: Linked (50305) IN + Primary (25061) OUT
  await memTables.biometricPunches.bulkPut([
    // Mon Oct 05 - Primary only
    makePunch('p-mon-1', '25061', '2026-10-05', '08:00'),
    makePunch('p-mon-2', '25061', '2026-10-05', '17:00'),
    // Tue Oct 06 - Linked only
    makePunch('p-tue-1', '50305', '2026-10-06', '08:00'),
    makePunch('p-tue-2', '50305', '2026-10-06', '17:00'),
    // Wed Oct 07 - Primary IN + Linked OUT
    makePunch('p-wed-1', '25061', '2026-10-07', '08:00'),
    makePunch('p-wed-2', '50305', '2026-10-07', '17:00'),
    // Fri Oct 09 - Both punch
    makePunch('p-fri-1', '25061', '2026-10-09', '07:55'),
    makePunch('p-fri-2', '50305', '2026-10-09', '17:05'),
    // Sat Oct 10 - Linked IN + Primary OUT
    makePunch('p-sat-1', '50305', '2026-10-10', '08:00'),
    makePunch('p-sat-2', '25061', '2026-10-10', '17:00'),
    // 50366 punches on Mon..Wed, Fri..Sat so only Thu Oct 08 is absent/leave
    makePunch('p-s-1', '50366', '2026-10-05', '08:00', 'Santos, Roberto'),
    makePunch('p-s-2', '50366', '2026-10-05', '17:00', 'Santos, Roberto'),
    makePunch('p-s-3', '50366', '2026-10-06', '08:00', 'Santos, Roberto'),
    makePunch('p-s-4', '50366', '2026-10-06', '17:00', 'Santos, Roberto'),
    makePunch('p-s-5', '50366', '2026-10-07', '08:00', 'Santos, Roberto'),
    makePunch('p-s-6', '50366', '2026-10-07', '17:00', 'Santos, Roberto'),
    makePunch('p-s-7', '50366', '2026-10-09', '08:00', 'Santos, Roberto'),
    makePunch('p-s-8', '50366', '2026-10-09', '17:00', 'Santos, Roberto'),
    makePunch('p-s-9', '50366', '2026-10-10', '08:00', 'Santos, Roberto'),
    makePunch('p-s-10', '50366', '2026-10-10', '17:00', 'Santos, Roberto')
  ])

  // 1. BEFORE consolidation: report shows duplicate absences (25061 absent Tue, 50305 absent Mon, both absent Thu -> 5 absences total for Abelido)
  const preReport = await reportsService.getReportSummary(
    { preset: 'custom', startDate: '2026-10-05', endDate: '2026-10-10' },
    false
  )
  // Populate dailySummaries cache BEFORE consolidation so we also test stale summary self-healing!
  const preSummaries = await attendanceRepository.getMonthSummaries(2026, 10)
  assert.strictEqual(preSummaries.get('2026-10-09')?.presentCount, 3, 'Pre-consolidation Oct 09 counted both 25061 and 50305 + 50366 = 3')

  // Deliberately write a stale overcounted dailySummary on Oct 05 just to ensure self-healing works even when cache existed
  await memTables.dailySummaries.put({
    date: '2026-10-05',
    presentCount: 3,
    onTimeCount: 3,
    lateCount: 0,
    singlePunchCount: 0,
    awaitingOutCount: 0,
    leaveCount: 0,
    holidayCount: 0,
    totalEmployees: 3,
    updatedAt: '2099-01-01T00:00:00.000Z'
  })

  // 2. Execute consolidation of 50305 -> 25061
  const preview = await employeeService.previewConsolidateEmployees('25061', '50305')
  const resolutions = {}
  for (const cf of preview.conflictFields) {
    resolutions[cf.field] = cf.recommendedChoice
  }
  await employeeService.consolidateEmployees({
    canonicalBioId: '25061',
    sourceBioId: '50305',
    confirmedByAdmin: true,
    performedBy: 'Test Admin',
    resolutions
  })

  // IMMEDIATELY call getReportSummary WITHOUT forceRefresh=true (tests synchronous cache invalidation!)
  const postReportImmediate = await reportsService.getReportSummary(
    { preset: 'custom', startDate: '2026-10-05', endDate: '2026-10-10' },
    false
  )
  assert.ok(preReport.kpis.absentCount > postReportImmediate.kpis.absentCount, 'Post-consolidation absent count must drop immediately')
  assert.strictEqual(postReportImmediate.kpis.absentCount, 1, 'Only Thu 2026-10-08 should be absent (Abelido counted ONCE)')
  assert.strictEqual(postReportImmediate.kpis.uniqueAbsentEmployees, 1, 'Unique absent employees must be 1')
  assert.strictEqual(postReportImmediate.kpis.presentCount, 10, '5 Abelido days + 5 Santos days = 10 present days')
  console.log('✔ Check 1: Immediate post-consolidation report recalculates synchronously (1 absent instead of duplicate absences)')

  // 3. Verify all 5 punch scenarios + reverse split via DailyAttendance filtering on BOTH 25061 AND 50305
  for (const dateStr of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09', '2026-10-10']) {
    const byPrimary = await attendanceRepository.getDailyAttendance(dateStr, 'all', 'all', {}, '25061')
    const byLinked = await attendanceRepository.getDailyAttendance(dateStr, 'all', 'all', {}, '50305')
    assert.strictEqual(byPrimary.length, 1, `${dateStr}: primary 25061 must return 1 combined record`)
    assert.strictEqual(byLinked.length, 1, `${dateStr}: linked 50305 must return 1 identical combined record`)
    assert.strictEqual(byPrimary[0].biometric_user_id, '25061', `${dateStr}: canonical bio ID`)
    assert.strictEqual(byLinked[0].biometric_user_id, '25061', `${dateStr}: linked lookup resolves to canonical bio ID`)
    assert.strictEqual(byPrimary[0].has_valid_out, true, `${dateStr}: combined IN+OUT valid`)
    assert.strictEqual(byLinked[0].has_valid_out, true, `${dateStr}: combined IN+OUT valid via linked ID`)
    assert.strictEqual(byPrimary[0].actual_in, byLinked[0].actual_in, `${dateStr}: identical actual_in`)
    assert.strictEqual(byPrimary[0].actual_out, byLinked[0].actual_out, `${dateStr}: identical actual_out`)
    assert.strictEqual(byPrimary[0].worked_minutes, byLinked[0].worked_minutes, `${dateStr}: identical worked_minutes`)
  }
  console.log('✔ Check 2: Primary punch, Linked punch, Split IN+OUT (both directions), and Dual punch synchronize identically for 25061 & 50305')

  // 4. Critical Matrix Bug Check: Thu 2026-10-08 (neither 25061 nor 50305 punched, while 50366 has Approved Leave)
  const thuPrimary = await attendanceRepository.getDailyAttendance('2026-10-08', 'all', 'all', {}, '25061')
  const thuLinked = await attendanceRepository.getDailyAttendance('2026-10-08', 'all', 'all', {}, '50305')
  const thuLeaveOwner = await attendanceRepository.getDailyAttendance('2026-10-08', 'all', 'all', {}, '50366')
  assert.strictEqual(thuPrimary.length, 0, '25061 must NOT receive 50366 Approved Leave record on Thu 2026-10-08')
  assert.strictEqual(thuLinked.length, 0, '50305 must NOT receive 50366 Approved Leave record on Thu 2026-10-08')
  assert.strictEqual(thuLeaveOwner.length, 1, '50366 should receive its own Approved Leave record')
  assert.strictEqual(thuLeaveOwner[0].status, 'Leave', '50366 status must be Leave')
  console.log('✔ Check 3: Filtered bioIdFilter daily attendance excludes unrelated 0-punch Approved Leaves')

  // 5. Filtered Report Summary (filtering by 25061 vs filtering by archived/linked 50305)
  const reportBy25061 = await reportsService.getReportSummary(
    { preset: 'custom', startDate: '2026-10-05', endDate: '2026-10-10', employeeBioId: '25061' },
    true
  )
  const reportBy50305 = await reportsService.getReportSummary(
    { preset: 'custom', startDate: '2026-10-05', endDate: '2026-10-10', employeeBioId: '50305' },
    true
  )
  assert.strictEqual(reportBy25061.kpis.presentCount, 5, 'Report for 25061 shows 5 present days')
  assert.strictEqual(reportBy25061.kpis.absentCount, 1, 'Report for 25061 shows 1 absent day (Thu)')
  assert.strictEqual(reportBy50305.kpis.presentCount, 5, 'Report for linked/archived 50305 shows 5 present days')
  assert.strictEqual(reportBy50305.kpis.absentCount, 1, 'Report for linked/archived 50305 shows 1 absent day (Thu)')
  assert.deepStrictEqual(
    reportBy25061.absentRecords.map(r => r.date),
    ['2026-10-08'],
    'Absent date is strictly Thu 2026-10-08'
  )
  assert.deepStrictEqual(
    reportBy50305.absentRecords.map(r => r.date),
    ['2026-10-08'],
    'Linked 50305 absent date matches canonical 25061 strictly'
  )
  console.log('✔ Check 4: Reports filtered by 25061 or linked/archived 50305 produce identical Present (5) & Absent (1) metrics')

  // 6. Month summaries stale overcount self-healing (Oct 05 and Oct 09 must self-heal from 3 down to 2)
  const postSummaries = await attendanceRepository.getMonthSummaries(2026, 10)
  assert.strictEqual(postSummaries.get('2026-10-05')?.presentCount, 2, 'Stale overcount on Oct 05 self-healed to 2 (Abelido + Santos)')
  assert.strictEqual(postSummaries.get('2026-10-09')?.presentCount, 2, 'Pre-consolidation Oct 09 overcount self-healed from 3 down to 2')
  console.log('✔ Check 5: Month summaries detect and heal pre-consolidation overcounts cleanly')

  // 7. Employee Daily Attendance History + multi-day leave expansion across 50305 -> 25061
  const histByPrimary = await attendanceRepository.getEmployeeDailyAttendanceHistory('25061')
  const histByLinked = await attendanceRepository.getEmployeeDailyAttendanceHistory('50305')
  assert.strictEqual(histByPrimary.length, histByLinked.length, 'History count matches across primary & linked Bio ID')
  const histDates = new Set(histByPrimary.map(r => r.raw_date))
  assert.ok(histDates.has('2026-10-06'), 'History includes linked-only punch day 2026-10-06')
  assert.ok(histDates.has('2026-10-12') && histDates.has('2026-10-13') && histDates.has('2026-10-14'), 'History expands 3-day approved leave transferred from 50305 across all 3 dates')
  console.log('✔ Check 6: Historical attendance + multi-day leave expansion match across primary and linked Bio IDs')

  // 8. Payroll calculation: only 1 payroll record for Abelido, 5 days present, 1 day absent (Thu)
  const cutoffPeriod = {
    id: '2026-10-01_2026-10-15',
    label: 'Oct 1-15, 2026',
    startDate: '2026-10-01',
    endDate: '2026-10-15',
    dates: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10']
  }
  const activeEmployees = await employeeService.getEmployees()
  assert.strictEqual(activeEmployees.length, 2, 'Directory excludes archived source 50305 (2 canonical employees remain)')
  const payrollRows = await payrollCalculationService.computePayroll(cutoffPeriod, activeEmployees, [])
  assert.strictEqual(payrollRows.length, 2, 'Payroll produces 1 record per canonical employee (not duplicate)')
  const abelidoPayroll = payrollRows.find(r => r.bioId === '25061')
  assert.ok(abelidoPayroll, 'Abelido payroll row exists under canonical 25061')
  assert.strictEqual(abelidoPayroll.presentDays, 5, 'Abelido present days = 5 (Primary, Linked, Split, Reverse Split, Both)')
  assert.strictEqual(abelidoPayroll.absentDays, 1, 'Abelido absent days = 1 (Thu 2026-10-08 counted once)')
  console.log('✔ Check 7: Payroll calculation yields 5 worked days and 1 absent day with zero duplicate employee records')

  console.log('='.repeat(72))
  console.log('ALL 7 LINKED BIO ID SYNCHRONIZATION CHECKS PASSED!')
  console.log('='.repeat(72))
} finally {
  await server.close()
}
