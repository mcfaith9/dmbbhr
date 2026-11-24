/**
 * DMBBHR "On Rest" Attendance Status Verification Suite
 *
 * Verifies end-to-end On Rest behavior across actual TypeScript services/repositories via Vite SSR Loader:
 * 1. HR assignment (bounded & ongoing + remarks), end date updates, removal, Active status preservation, auto-resume after endDate.
 * 2. Attendance Engine & Repository: 0-punch On Rest synthesis, summary exclusions, multi-Bio-ID punch preservation & HR review flagging.
 * 3. Reports Service: exclusion from Absent/Present/Late/Absence Rate/Trends/Dept Distribution, separate On Rest count & HR review items.
 * 4. Payroll Calculation: 0 absence deductions for monthly/daily employees, preserved holiday eligibility, punch review warning.
 * 5. Cross-PC Excel Export/Import: full .xlsx binary round-trip sync, legacy-Excel preservation, explicit clearing, and consolidation merge.
 *
 * Run: node scripts/test-on-rest-status.mjs
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

function makePunch(bioId, dateStr, hhmm, seq = 1) {
  const tsMs = new Date(`${dateStr}T${hhmm}:00+08:00`).getTime()
  return {
    id: `${bioId}-${dateStr}-${hhmm.replace(':', '')}-${seq}`,
    bioId: String(bioId),
    deviceUserId: String(bioId),
    date: dateStr,
    timestamp: new Date(tsMs).toISOString(),
    timestampMs: tsMs,
    deviceName: 'BISBIO B-29b',
    deviceIp: '192.168.1.201',
    syncedAt: new Date(tsMs + 5000).toISOString()
  }
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
  const { payrollCalculationService } = await server.ssrLoadModule('/src/services/payrollCalculation.ts')
  const { isEmployeeOnRestOnDate, getActiveOnRestPeriodForDate } = await server.ssrLoadModule('/src/lib/onRest.ts')

  const nowIso = '2026-10-01T00:00:00.000Z'
  const pc1Db = createPcDatabaseState(nowIso)
  const pc2Db = createPcDatabaseState(nowIso)

  let activeTxAllowedTables = null
  function wrapTableWithScopeGuard(name, tbl) {
    const checkScope = () => {
      if (activeTxAllowedTables && !activeTxAllowedTables.has(name)) {
        const err = new Error(`IDBTransaction missing store "${name}"`)
        err.name = 'NotFoundError'
        throw err
      }
    }
    return new Proxy(tbl, {
      get(target, prop, receiver) {
        if (prop === '_store' || prop === 'name') {
          return prop === 'name' ? name : target._store
        }
        const val = Reflect.get(target, prop, receiver)
        if (typeof val === 'function') {
          return (...fnArgs) => {
            checkScope()
            return val.apply(target, fnArgs)
          }
        }
        return val
      }
    })
  }

  async function switchToPc(pcDb) {
    for (const [name, tbl] of Object.entries(pcDb)) {
      db[name] = wrapTableWithScopeGuard(name, tbl)
    }
    db.transaction = async (...args) => {
      const fn = args[args.length - 1]
      const tablesArg = args.length >= 3 ? args[1] : []
      const tableList = Array.isArray(tablesArg) ? tablesArg : [tablesArg]
      const prevScope = activeTxAllowedTables
      activeTxAllowedTables = new Set(tableList.map(t => t?.name).filter(Boolean))
      try {
        return await fn()
      } finally {
        activeTxAllowedTables = prevScope
      }
    }
    await employeeRepository.reloadFromDb()
    reportsService.clearCache()
  }

  console.log('='.repeat(74))
  console.log('ON REST ATTENDANCE STATUS END-TO-END VERIFICATION SUITE')
  console.log('='.repeat(74))

  // -------------------------------------------------------------------------
  // Setup PC 1 employees (Oct 2026 dates, all historical/complete days)
  // -------------------------------------------------------------------------
  await switchToPc(pc1Db)
  await pc1Db.employees.bulkPut([
    {
      bioId: '1001',
      employeeNumber: '1001',
      fullName: 'Santos, Elena M.',
      location: 'DBB CEBU',
      workGroupId: 'wg-group-c',
      department: 'Operations',
      position: 'Clerk',
      status: 'active',
      hireDate: '2025-01-10',
      salaryType: 'Monthly',
      basicSalary: 26000,
      dailyRate: 1000,
      hourlyRate: 125,
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      bioId: '1002',
      employeeNumber: '1002',
      fullName: 'Reyes, Carlo D.',
      location: 'DBB CEBU',
      workGroupId: 'wg-group-c',
      department: 'Warehouse',
      position: 'Staff',
      status: 'active',
      hireDate: '2025-01-10',
      biometricIds: [
        { bioId: '1002', role: 'primary', status: 'active', addedAt: nowIso },
        { bioId: '9002', role: 'secondary', status: 'active', addedAt: nowIso }
      ],
      salaryType: 'Daily',
      basicSalary: 600,
      dailyRate: 600,
      hourlyRate: 75,
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      bioId: '1003',
      employeeNumber: '1003',
      fullName: 'Cruz, Marco P.',
      location: 'DBB CEBU',
      workGroupId: 'wg-group-c',
      department: 'Logistics',
      position: 'Driver',
      status: 'active',
      hireDate: '2025-01-10',
      salaryType: 'Daily',
      basicSalary: 600,
      dailyRate: 600,
      hourlyRate: 75,
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      bioId: '1004',
      employeeNumber: '1004',
      fullName: 'Bautista, Liza T.',
      location: 'DBB CEBU',
      workGroupId: 'wg-group-c',
      department: 'Admin',
      position: 'Coordinator',
      status: 'active',
      hireDate: '2025-01-10',
      salaryType: 'Daily',
      basicSalary: 650,
      dailyRate: 650,
      hourlyRate: 81.25,
      createdAt: nowIso,
      updatedAt: nowIso
    }
  ])

  // Regular Holiday on 2026-10-08 (Thursday) to test preceding-day eligibility while On Rest!
  await pc1Db.holidays.put({
    id: 'hol-2026-10-08',
    name: 'Test Regular Holiday',
    date: '2026-10-08',
    type: 'regular',
    isNationwide: true
  })

  await employeeRepository.reloadFromDb()

  // -------------------------------------------------------------------------
  // 1. HR Assignment & Auto-Resumption Rules
  // -------------------------------------------------------------------------
  const afterAssign1001 = await employeeService.assignOnRestPeriod('1001', {
    startDate: '2026-10-06',
    endDate: '2026-10-07',
    remarks: 'Hospitalization - dengue recovery'
  })
  assert.strictEqual(afterAssign1001.status, 'active', 'Assigning On Rest must NOT change active employment status')
  assert.strictEqual(afterAssign1001.on_rest_periods?.length, 1)
  assert.strictEqual(isEmployeeOnRestOnDate(afterAssign1001, '2026-10-05'), false, 'Before startDate should NOT be On Rest')
  assert.strictEqual(isEmployeeOnRestOnDate(afterAssign1001, '2026-10-06'), true, 'On startDate should be On Rest')
  assert.strictEqual(isEmployeeOnRestOnDate(afterAssign1001, '2026-10-07'), true, 'On endDate should be On Rest')
  assert.strictEqual(isEmployeeOnRestOnDate(afterAssign1001, '2026-10-08'), false, 'After endDate must auto-resume normal monitoring')

  // Ongoing (open-ended) On Rest on 1002
  const afterAssign1002 = await employeeService.assignOnRestPeriod('1002', {
    startDate: '2026-10-06',
    remarks: 'Ongoing post-op rest'
  })
  assert.strictEqual(afterAssign1002.status, 'active')
  assert.strictEqual(isEmployeeOnRestOnDate(afterAssign1002, '2026-10-06'), true)
  assert.strictEqual(isEmployeeOnRestOnDate(afterAssign1002, '2026-10-20'), true, 'Ongoing On Rest covers open future dates')
  const ongoingId = afterAssign1002.on_rest_periods[0].id
  // Update end date to 2026-10-07 -> auto resumes on 2026-10-08
  const updated1002 = await employeeService.endOnRestPeriod('1002', ongoingId, '2026-10-07')
  assert.strictEqual(getActiveOnRestPeriodForDate(updated1002, '2026-10-07')?.endDate, '2026-10-07')
  assert.strictEqual(isEmployeeOnRestOnDate(updated1002, '2026-10-08'), false, 'Setting endDate enables automatic resumption on 2026-10-08')
  console.log('✓ 1. On Rest assignment, Active status preservation, ongoing/bounded endDate, and auto-resumption verified')

  // -------------------------------------------------------------------------
  // 2. Biometric Punches + Attendance Engine & Repository Behavior
  //    Dates under test:
  //      - 2026-10-06 (Tue):
  //          1001 -> On Rest (0 punches)
  //          1002 -> On Rest, BUT punches on primary 1002 (09:15 IN, late!) and linked 9002 (16:00 OUT, undertime!)
  //          1003 -> Absent (0 punches, active)
  //          1004 -> Present Late (08:30 IN, 17:05 OUT)
  //      - 2026-10-07 (Wed):
  //          1001 -> On Rest (0 punches)
  //          1002 -> On Rest (0 punches)
  //          1003 -> Present On-Time (07:55 IN, 17:02 OUT)
  //          1004 -> Present On-Time (07:58 IN, 17:01 OUT)
  //      - 2026-10-09 (Fri, AFTER On Rest ended!):
  //          1001 -> No punches -> MUST auto-resume and count as Absent!
  //          1002 -> Punches 07:50 IN, 17:00 OUT -> MUST count as Present!
  //          1003 -> Punches 07:55 IN, 17:00 OUT -> Present
  //          1004 -> Punches 07:55 IN, 17:00 OUT -> Present
  // -------------------------------------------------------------------------
  await pc1Db.biometricPunches.bulkPut([
    // Oct 5 (Mon) - everyone present before On Rest
    makePunch('1001', '2026-10-05', '07:55', 1), makePunch('1001', '2026-10-05', '17:02', 2),
    makePunch('1002', '2026-10-05', '07:56', 1), makePunch('1002', '2026-10-05', '17:01', 2),
    makePunch('1003', '2026-10-05', '07:58', 1), makePunch('1003', '2026-10-05', '17:03', 2),
    makePunch('1004', '2026-10-05', '07:59', 1), makePunch('1004', '2026-10-05', '17:00', 2),

    // Oct 6 (Tue) - 1002 punches across primary + linked Bio ID while On Rest!
    makePunch('1002', '2026-10-06', '09:15', 1),
    makePunch('9002', '2026-10-06', '16:00', 2),
    makePunch('1004', '2026-10-06', '08:30', 1),
    makePunch('1004', '2026-10-06', '17:05', 2),

    // Oct 7 (Wed)
    makePunch('1003', '2026-10-07', '07:55', 1), makePunch('1003', '2026-10-07', '17:02', 2),
    makePunch('1004', '2026-10-07', '07:58', 1), makePunch('1004', '2026-10-07', '17:01', 2),

    // Oct 9 (Fri - post On Rest auto-resume; 1001 intentionally has NO punches)
    makePunch('1002', '2026-10-09', '07:50', 1), makePunch('1002', '2026-10-09', '17:00', 2),
    makePunch('1003', '2026-10-09', '07:55', 1), makePunch('1003', '2026-10-09', '17:00', 2),
    makePunch('1004', '2026-10-09', '07:55', 1), makePunch('1004', '2026-10-09', '17:00', 2)
  ])

  const oct6Daily = await attendanceRepository.getDailyAttendance('2026-10-06')
  const oct6_1001 = oct6Daily.find(r => r.biometric_user_id === '1001')
  const oct6_1002 = oct6Daily.find(r => r.biometric_user_id === '1002')
  const oct6_1004 = oct6Daily.find(r => r.biometric_user_id === '1004')

  assert.ok(oct6_1001, '1001 must appear with On Rest daily row on 2026-10-06')
  assert.strictEqual(oct6_1001.status, 'On Rest')
  assert.strictEqual(oct6_1001.is_on_rest, true)
  assert.strictEqual(oct6_1001.has_punches_during_on_rest, false)
  assert.strictEqual(oct6_1001.requires_admin_review, false)

  assert.ok(oct6_1002, '1002 must appear with On Rest daily row on 2026-10-06')
  assert.strictEqual(oct6_1002.status, 'On Rest')
  assert.strictEqual(oct6_1002.is_on_rest, true)
  assert.strictEqual(oct6_1002.has_punches_during_on_rest, true, 'Must flag punches during On Rest')
  assert.strictEqual(oct6_1002.requires_admin_review, true, 'Must require HR admin review when punches exist during On Rest')
  assert.strictEqual(oct6_1002.raw_punches_count, 2, 'Must preserve both raw punches across primary + linked Bio ID')
  assert.strictEqual(oct6_1002.late_minutes, 0, 'Must exclude late minutes during On Rest')
  assert.strictEqual(oct6_1002.undertime_minutes, 0, 'Must exclude undertime minutes during On Rest')
  assert.strictEqual(oct6_1002.worked_minutes, 0, 'Must exclude On Rest from regular worked hours')
  assert.ok(oct6_1002.actual_in && oct6_1002.actual_out && oct6_1002.actual_out !== '-', 'Preserved IN/OUT times must remain visible for HR audit')

  assert.ok(oct6_1004 && oct6_1004.status === 'Late' && oct6_1004.late_minutes === 30)

  const oct6Summary = await pc1Db.dailySummaries.get('2026-10-06')
  assert.strictEqual(oct6Summary.presentCount, 1, 'Daily summary presentCount must exclude both On Rest employees (only 1004 counted)')
  assert.strictEqual(oct6Summary.lateCount, 1, 'Daily summary lateCount must only count 1004')
  assert.strictEqual(oct6Summary.onRestCount, 2, 'Daily summary onRestCount must report 2 On Rest employees')

  const history1001 = await attendanceRepository.getEmployeeDailyAttendanceHistory('1001')
  assert.ok(history1001.some(r => r.raw_date === '2026-10-06' && r.status === 'On Rest'), 'Employee history must include synthesized On Rest date')
  console.log('✓ 2. Attendance Engine, Daily Attendance, punch preservation, HR review flag, and summary counts verified')

  // -------------------------------------------------------------------------
  // 3. Reports Service Exclusions & Absence Rate Accuracy
  // -------------------------------------------------------------------------
  const reportOct6 = await reportsService.getReportSummary({
    preset: 'custom',
    startDate: '2026-10-06',
    endDate: '2026-10-06',
    location: 'all',
    workGroupId: 'all',
    employeeBioId: 'all',
    department: 'all'
  })

  // On Oct 6: 4 active employees total, 2 On Rest (excluded from eligible workdays!).
  // Eligible = 2 (1003 absent, 1004 late/present) -> presentCount = 1, lateCount = 1, absentCount = 1, absenceRate = 50%
  assert.strictEqual(reportOct6.kpis.onRestCount, 2, 'Separate On Rest KPI count must be 2')
  assert.strictEqual(reportOct6.kpis.uniqueOnRestEmployees, 2)
  assert.strictEqual(reportOct6.kpis.onRestPunchReviewCount, 1, '1002 punch during On Rest must be flagged for HR review')
  assert.strictEqual(reportOct6.onRestPunchReviewItems[0].bioId, '1002')
  assert.strictEqual(reportOct6.kpis.presentCount, 1, 'Present count must exclude On Rest (even with punch)')
  assert.strictEqual(reportOct6.kpis.lateCount, 1, 'Late count must exclude 1002 On Rest punch')
  assert.strictEqual(reportOct6.kpis.absentCount, 1, 'Absent count must only include 1003 (not On Rest 1001/1002)')
  assert.strictEqual(reportOct6.kpis.totalEligibleWorkdays, 2, 'On Rest days must be excluded from absence-rate denominator')
  assert.strictEqual(reportOct6.kpis.absenceRate, 50, 'Absence rate = 1 / 2 = 50%')
  assert.strictEqual(reportOct6.diagnostics.excludedOnRest, 2)
  assert.ok(reportOct6.statusBreakdown.some(s => s.label === 'On Rest' && s.count === 2), 'Status breakdown must include On Rest slice')
  const opsDept = reportOct6.departmentDistribution.find(d => d.department === 'Operations')
  const whDept = reportOct6.departmentDistribution.find(d => d.department === 'Warehouse')
  const logDept = reportOct6.departmentDistribution.find(d => d.department === 'Logistics')
  assert.strictEqual(opsDept?.absentCount ?? 0, 0, 'Operations On Rest must have 0 absentCount')
  assert.strictEqual(whDept?.absentCount ?? 0, 0, 'Warehouse On Rest must have 0 absentCount')
  assert.strictEqual(logDept?.absentCount, 1, 'Logistics must report 1 absentCount')

  // Multi-day report Oct 6..Oct 9 (4 days, Oct 8 is regular holiday):
  // Scheduled non-holiday workdays = Oct 6, Oct 7, Oct 9 (3 days * 4 employees = 12 gross)
  // On Rest days = Oct 6 (1001, 1002) + Oct 7 (1001, 1002) = 4 On Rest days
  // Eligible workdays = 12 - 4 = 8
  // Absences = Oct 6 (1003) + Oct 9 (1001 auto-resumed and missed punch!) = 2
  const reportOct6To9 = await reportsService.getReportSummary({
    preset: 'custom',
    startDate: '2026-10-06',
    endDate: '2026-10-09',
    location: 'all',
    workGroupId: 'all',
    employeeBioId: 'all',
    department: 'all'
  })
  assert.strictEqual(reportOct6To9.kpis.onRestCount, 4)
  assert.strictEqual(reportOct6To9.kpis.absentCount, 2, 'Expected absences: 1003 on Oct 6 + 1001 auto-resumed on Oct 9')
  assert.strictEqual(reportOct6To9.kpis.totalEligibleWorkdays, 8)
  assert.strictEqual(reportOct6To9.kpis.absenceRate, 25, 'Absence rate = 2 / 8 = 25%')
  assert.ok(
    reportOct6To9.absentRecords.some(r => r.bioId === '1001' && r.date === '2026-10-09'),
    '1001 must automatically resume attendance monitoring on Oct 9 after On Rest ended Oct 7'
  )
  assert.ok(
    !reportOct6To9.absentRecords.some(r => r.bioId === '1001' && (r.date === '2026-10-06' || r.date === '2026-10-07')),
    '1001 must NOT be marked absent during On Rest Oct 6-7'
  )
  console.log('✓ 3. Reports Service exclusions, absence-rate denominator, HR review items, and auto-resumption verified')

  // -------------------------------------------------------------------------
  // 4. Payroll Calculation Treatment (Unpaid On Rest, Separate Counts, No Duplicate Deduction, Snapshot Persistence)
  //    Test 1001 (Monthly, 26k -> 13k/cutoff, 1k/day) across Oct 5..Oct 8 (Mon worked, Tue On Rest, Wed On Rest, Thu Regular Holiday)
  //    Should have: 0 absentDays, 2 onRestDays, basePay = 11,000 (13,000 - 2*1,000 unpaid On Rest, no duplicate deduction), 1 unworked holiday!
  //    Also test 1001 across Oct 5..Oct 9 (with Oct 9 absent after On Rest ended): 1 absentDay, 2 onRestDays, basePay = 10,000!
  //    Also test 1002 (Daily, 600/day) across Oct 5..Oct 8 (Tue On Rest WITH late/undertime punch, Wed On Rest)
  //    Should have: 0 absentDays, 2 onRestDays, basePay = 600 (1 worked day; 0 earned on On Rest), 0 late/undertime, reviewStatus === 'needs_review'!
  // -------------------------------------------------------------------------
  const emp1001 = await employeeService.getEmployeeByBioId('1001')
  const emp1002 = await employeeService.getEmployeeByBioId('1002')
  const hols = await pc1Db.holidays.toArray()

  const att1001All = await attendanceRepository.getEmployeeDailyAttendanceHistory('1001')
  const att1001 = att1001All.filter(r => r.raw_date >= '2026-10-05' && r.raw_date <= '2026-10-08')
  const att1001WithOct9 = att1001All.filter(r => r.raw_date >= '2026-10-05' && r.raw_date <= '2026-10-09')
  const att1002 = (await attendanceRepository.getEmployeeDailyAttendanceHistory('1002'))
    .filter(r => r.raw_date >= '2026-10-05' && r.raw_date <= '2026-10-08')

  const testPeriod = {
    id: '2026-10-1-test',
    year: 2026,
    month: 10,
    half: 1,
    label: 'Oct 5 – 8, 2026 (Test)',
    shortLabel: 'Oct 5 – 8, 2026',
    startDate: '2026-10-05',
    endDate: '2026-10-08',
    payday: '2026-10-20',
    paydayDisplay: 'October 20, 2026',
    dates: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']
  }

  const pay1001 = await payrollCalculationService.computeSingleEmployeePayroll(
    testPeriod,
    emp1001,
    hols,
    att1001,
    [],
    { attendancePrefetched: true, datesWithAnyAttendance: new Set(['2026-10-05', '2026-10-06', '2026-10-07']) }
  )
  const pay1002 = await payrollCalculationService.computeSingleEmployeePayroll(
    testPeriod,
    emp1002,
    hols,
    att1002,
    [],
    { attendancePrefetched: true, datesWithAnyAttendance: new Set(['2026-10-05', '2026-10-06', '2026-10-07']) }
  )

  assert.strictEqual(pay1001.absentDays, 0, 'Monthly employee On Rest must have 0 absentDays')
  assert.strictEqual(pay1001.onRestDays, 2, 'Payroll record must track 2 On Rest days')
  assert.strictEqual(pay1001.earningsBreakdown.basePay, 11000, 'Monthly On Rest days must be unpaid (13,000 - 2*1,000 = 11,000) without duplicate absence deduction')
  assert.strictEqual(pay1001.netPay, 11000)
  assert.strictEqual(pay1001.undertimeDeduction, 0, 'On Rest must not generate absence/undertime deductions')
  assert.strictEqual(pay1001.unworkedHolidayDays, 1, 'On Rest preceding a regular holiday preserves unworked holiday pay entitlement')

  // Monthly employee with BOTH On Rest (Oct 6-7) AND real Absent day (Oct 9 after On Rest ended)
  const testPeriodOct5To9 = {
    ...testPeriod,
    id: '2026-10-1-test-absent',
    endDate: '2026-10-09',
    dates: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']
  }
  const pay1001Mixed = await payrollCalculationService.computeSingleEmployeePayroll(
    testPeriodOct5To9,
    emp1001,
    hols,
    att1001WithOct9,
    [],
    { attendancePrefetched: true, datesWithAnyAttendance: new Set(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09']) }
  )
  assert.strictEqual(pay1001Mixed.absentDays, 1, 'Only post-On-Rest missed day (Oct 9) counts as Absent')
  assert.strictEqual(pay1001Mixed.onRestDays, 2, 'Separate On Rest count stays 2')
  assert.strictEqual(pay1001Mixed.earningsBreakdown.basePay, 10000, 'Monthly basePay = 13,000 - 1,000 (absent) - 2,000 (unpaid On Rest) = 10,000')
  assert.strictEqual(pay1001Mixed.netPay, 10000)

  // Save finalized snapshot and verify separate Absent & On Rest counts persist across reload
  await payrollCalculationService.savePayrollSnapshot([pay1001Mixed], 'finalized', 'Admin Tester')
  const pay1001Reloaded = await payrollCalculationService.computeSingleEmployeePayroll(
    testPeriodOct5To9,
    emp1001,
    hols,
    att1001WithOct9
  )
  assert.strictEqual(pay1001Reloaded.batchStatus, 'finalized')
  assert.strictEqual(pay1001Reloaded.absentDays, 1, 'Finalized snapshot must preserve absentDays')
  assert.strictEqual(pay1001Reloaded.onRestDays, 2, 'Finalized snapshot must preserve onRestDays')
  assert.strictEqual(pay1001Reloaded.earningsBreakdown.basePay, 10000, 'Finalized snapshot must preserve unpaid On Rest basePay')

  // Monthly employee On Rest for all workdays in elapsed cutoff -> 0 basePay
  const empAllRestMonthly = {
    ...emp1001,
    on_rest_periods: [{ id: 'rest-full', startDate: '2026-10-05', endDate: '2026-10-07', remarks: 'Full rest', createdAt: nowIso, updatedAt: nowIso }]
  }
  const payAllRestMonthly = await payrollCalculationService.computeSingleEmployeePayroll(
    { ...testPeriod, id: '2026-10-1-all-rest', endDate: '2026-10-07', dates: ['2026-10-05', '2026-10-06', '2026-10-07'] },
    empAllRestMonthly,
    [],
    [],
    [],
    { attendancePrefetched: true, datesWithAnyAttendance: new Set(['2026-10-05', '2026-10-06', '2026-10-07']) }
  )
  assert.strictEqual(payAllRestMonthly.onRestDays, 3)
  assert.strictEqual(payAllRestMonthly.absentDays, 0)
  assert.strictEqual(payAllRestMonthly.earningsBreakdown.basePay, 0, 'All-On-Rest Monthly cutoff earns 0 basePay')

  // Daily employee 1002
  assert.strictEqual(pay1002.absentDays, 0, 'Daily employee On Rest must have 0 absentDays')
  assert.strictEqual(pay1002.onRestDays, 2)
  assert.strictEqual(pay1002.earningsBreakdown.basePay, 600, 'Daily employee earns ₱600 for 1 worked day and ₱0 for 2 On Rest days')
  assert.strictEqual(pay1002.earningsBreakdown.holidayPay, 600, 'Eligible unworked regular holiday pays ₱600 after On Rest ended')
  assert.strictEqual(pay1002.lateMinutes, 0, 'Punches during On Rest must not incur lateMinutes')
  assert.strictEqual(pay1002.undertimeMinutes, 0, 'Punches during On Rest must not incur undertimeMinutes')
  assert.strictEqual(pay1002.undertimeDeduction, 0, 'Punches during On Rest must not incur undertimeDeduction')
  assert.strictEqual(pay1002.reviewStatus, 'needs_review', 'Punches during On Rest must flag payroll record for review')
  assert.ok(
    pay1002.attendanceReviewNotes.some(n => /On Rest/i.test(n)),
    'Payroll attendanceReviewNotes must mention biometric punch recorded during On Rest'
  )

  // Daily employee whose On Rest period spans across the holiday itself (Oct 6-8) -> unpaid On Rest, 0 holidayPay
  const emp1002SpanHol = {
    ...emp1002,
    on_rest_periods: [{ id: 'rest-span', startDate: '2026-10-06', endDate: '2026-10-08', remarks: 'Hospital', createdAt: nowIso, updatedAt: nowIso }]
  }
  const pay1002SpanHol = await payrollCalculationService.computeSingleEmployeePayroll(
    { ...testPeriod, id: '2026-10-1-span-hol' },
    emp1002SpanHol,
    hols,
    att1002,
    [],
    { attendancePrefetched: true, datesWithAnyAttendance: new Set(['2026-10-05', '2026-10-06', '2026-10-07']) }
  )
  assert.strictEqual(pay1002SpanHol.onRestDays, 3, 'Holiday inside On Rest period counts as On Rest')
  assert.strictEqual(pay1002SpanHol.absentDays, 0)
  assert.strictEqual(pay1002SpanHol.unworkedHolidayDays, 0)
  assert.strictEqual(pay1002SpanHol.earningsBreakdown.holidayPay, 0, 'On Rest covering a holiday is unpaid')
  assert.strictEqual(pay1002SpanHol.earningsBreakdown.basePay, 600)

  console.log('✓ 4. Payroll unpaid On Rest treatment, separate Absent/On Rest counts, snapshot persistence, and punch review flag verified')

  // -------------------------------------------------------------------------
  // 5. Cross-PC Export/Import (.xlsx binary round-trip) + Legacy Compatibility + Consolidation Merge
  // -------------------------------------------------------------------------
  // Add a second ongoing period on 1002 so PC 1 -> PC 2 tests both bounded & ongoing + remarks
  await employeeService.assignOnRestPeriod('1002', {
    startDate: '2026-10-20',
    remarks: 'Follow-up procedure'
  })

  const pc1ExportRows = await employeeService.getExportData()
  assert.ok(pc1ExportRows.some(r => r['ID'] === '1001' && r['ON REST STATUS'] === 'Scheduled/Past' && r['ON REST START DATE'] === '2026-10-06'))
  assert.ok(pc1ExportRows.some(r => r['ID'] === '1002' && r['ON REST STATUS'] === 'On Rest' && r['ON REST END DATE'] === 'Ongoing'))
  const xlsxRowsPc1ToPc2 = roundTripXlsxRows(pc1ExportRows)

  await switchToPc(pc2Db)
  const previewPc2First = await employeeService.previewImportFromExcel(xlsxRowsPc1ToPc2)
  assert.strictEqual(previewPc2First.newCount, 4)
  await employeeService.applyImport(previewPc2First)

  const pc2Emp1001 = await employeeService.getEmployeeByBioId('1001')
  const pc2Emp1002 = await employeeService.getEmployeeByBioId('1002')
  assert.strictEqual(pc2Emp1001.status, 'active', 'Imported On Rest must keep employee status Active on PC 2')
  assert.strictEqual(pc2Emp1001.on_rest_periods?.length, 1)
  assert.strictEqual(pc2Emp1001.on_rest_periods[0].startDate, '2026-10-06')
  assert.strictEqual(pc2Emp1001.on_rest_periods[0].endDate, '2026-10-07')
  assert.strictEqual(pc2Emp1001.on_rest_periods[0].remarks, 'Hospitalization - dengue recovery')
  assert.strictEqual(pc2Emp1002.on_rest_periods?.length, 2, 'Both bounded and ongoing On Rest periods must sync to PC 2')
  assert.ok(pc2Emp1002.on_rest_periods.some(p => p.startDate === '2026-10-06' && p.endDate === '2026-10-07'))
  assert.ok(pc2Emp1002.on_rest_periods.some(p => p.startDate === '2026-10-20' && p.endDate === undefined))

  // Re-import same workbook -> UNCHANGED
  const previewPc2Repeat = await employeeService.previewImportFromExcel(xlsxRowsPc1ToPc2)
  assert.strictEqual(previewPc2Repeat.unchangedCount, 4, 'Re-importing unchanged On Rest periods must report UNCHANGED')
  assert.strictEqual(previewPc2Repeat.recordsToApply.length, 0)

  // Legacy Excel WITHOUT any On Rest columns must preserve existing On Rest periods on PC 2!
  const legacyRows = pc1ExportRows.map(row => {
    const copy = { ...row }
    delete copy['ON REST STATUS']
    delete copy['ON REST START DATE']
    delete copy['ON REST END DATE']
    delete copy['ON REST REMARKS']
    delete copy['ON REST PERIODS']
    return copy
  })
  const previewLegacy = await employeeService.previewImportFromExcel(roundTripXlsxRows(legacyRows))
  assert.strictEqual(previewLegacy.recordsToApply.length, 0, 'Legacy Excel without On Rest columns must preserve existing On Rest data (UNCHANGED)')

  // Explicit clearing on PC 1 -> PC 2 removes On Rest periods
  await switchToPc(pc1Db)
  const pc1Emp1001BeforeClear = await employeeService.getEmployeeByBioId('1001')
  await employeeService.removeOnRestPeriod('1001', pc1Emp1001BeforeClear.on_rest_periods[0].id)
  const pc1AfterClearRows = roundTripXlsxRows(await employeeService.getExportData())

  await switchToPc(pc2Db)
  const previewClearSync = await employeeService.previewImportFromExcel(pc1AfterClearRows)
  assert.strictEqual(previewClearSync.updatedCount, 1, 'Explicit On Rest removal on PC 1 must update PC 2')
  await employeeService.applyImport(previewClearSync)
  const pc2Emp1001AfterClear = await employeeService.getEmployeeByBioId('1001')
  assert.strictEqual(pc2Emp1001AfterClear.on_rest_periods?.length || 0, 0, 'On Rest periods must be cleared after explicit sync')

  // Consolidation preserves and merges On Rest periods
  await employeeService.assignOnRestPeriod('1003', {
    startDate: '2026-10-12',
    endDate: '2026-10-14',
    remarks: 'Source profile recovery'
  })
  const consPreview = await employeeService.previewConsolidateEmployees('1004', '1003')
  const consResolutions = Object.fromEntries(consPreview.conflictFields.map(cf => [cf.field, 'canonical']))
  await employeeService.consolidateEmployees({
    canonicalBioId: '1004',
    sourceBioId: '1003',
    confirmedByAdmin: true,
    resolutions: consResolutions,
    performedBy: 'Admin Test'
  })
  const consolidated1004 = await employeeService.getEmployeeByBioId('1004')
  assert.strictEqual(consolidated1004.on_rest_periods?.length, 1, 'Consolidation must preserve On Rest periods onto canonical employee')
  assert.strictEqual(consolidated1004.on_rest_periods[0].startDate, '2026-10-12')

  console.log('✓ 5. Cross-PC .xlsx sync, idempotency, legacy-Excel preservation, explicit removal, and consolidation verified')
  console.log('\nALL ON REST STATUS VERIFICATION CHECKS PASSED SUCCESSFULLY!')
} finally {
  await server.close()
}
