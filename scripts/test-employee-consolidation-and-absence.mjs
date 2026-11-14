/**
 * DMBBHR Employee Consolidation & Absence Accuracy Verification Suite
 *
 * Exercises the real TypeScript modules via Vite SSR Loader:
 * - src/repositories/employeeRepository.ts
 * - src/services/employees.ts
 * - src/repositories/attendanceRepository.ts
 * - src/repositories/workGroupRepository.ts
 * - src/repositories/manualAttendanceRepository.ts
 * - src/services/hrNotices.ts
 * - src/services/reportsService.ts
 * - src/services/payrollCalculation.ts
 *
 * Run: node scripts/test-employee-consolidation-and-absence.mjs
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
      id: 'wg-group-a', name: 'Group A', code: 'A', standardIn: '06:00',
      requiredWorkMinutes: 480, lunchStart: '12:00', lunchEnd: '13:00', expectedOut: '15:00',
      gracePeriodMinutes: 0, isDefault: false, createdAt: nowIso, updatedAt: nowIso
    },
    {
      id: 'wg-group-c', name: 'Group C', code: 'C', standardIn: '08:00',
      requiredWorkMinutes: 480, lunchStart: '12:00', lunchEnd: '13:00', expectedOut: '17:00',
      gracePeriodMinutes: 0, isDefault: true, createdAt: nowIso, updatedAt: nowIso
    }
  ])

  const { employeeService } = await server.ssrLoadModule('/src/services/employees.ts')
  const { employeeRepository } = await server.ssrLoadModule('/src/repositories/employeeRepository.ts')
  const { attendanceRepository } = await server.ssrLoadModule('/src/repositories/attendanceRepository.ts')
  const { workGroupRepository } = await server.ssrLoadModule('/src/repositories/workGroupRepository.ts')
  const { reportsService } = await server.ssrLoadModule('/src/services/reportsService.ts')
  const { payrollCalculationService } = await server.ssrLoadModule('/src/services/payrollCalculation.ts')

  // Complete initial repository seed once, then clear and load deterministic 8-employee test cohort
  await employeeRepository.getEmployees()
  await memTables.employees.clear()

  // Seed duplicate records for same physical person (25061 & 50305), plus test eligibility cohort
  await memTables.employees.bulkPut([
    {
      bioId: '25061',
      employeeNumber: '25061',
      fullName: 'Abelido, Reynald C.',
      location: 'DBB CEBU',
      workGroupId: 'wg-group-a',
      department: 'OPERATIONS',
      position: 'Technician',
      status: 'active',
      salaryType: 'Daily',
      dailyRate: 540,
      hourlyRate: 67.5,
      payrollStatus: 'configured',
      hireDate: '2024-01-01',
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      bioId: '50305',
      employeeNumber: '50305',
      fullName: 'Abelido, Reynald',
      location: 'DBB CEBU',
      workGroupId: 'wg-group-c',
      department: 'OPERATIONS',
      position: 'Staff',
      status: 'active',
      salaryType: 'Daily',
      dailyRate: 500,
      hourlyRate: 62.5,
      payrollStatus: 'configured',
      sssNumber: '06-1111111-1',
      mobileNumber: '09171234567',
      hireDate: '2024-01-01',
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      bioId: '70001',
      employeeNumber: '70001',
      fullName: 'NoBio, Elena',
      location: 'DBB CEBU',
      workGroupId: 'wg-group-c',
      department: 'ADMIN',
      position: 'Executive',
      status: 'active',
      excludeFromBiometric: true,
      salaryType: 'Monthly',
      basicSalary: 26000,
      dailyRate: 1000,
      payrollStatus: 'configured',
      hireDate: '2024-01-01',
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      bioId: '70002',
      employeeNumber: '70002',
      fullName: 'Resigned, Carlo',
      location: 'DBB CEBU',
      workGroupId: 'wg-group-c',
      department: 'OPERATIONS',
      position: 'Staff',
      status: 'resigned',
      resignationDate: '2026-10-04',
      salaryType: 'Daily',
      dailyRate: 540,
      hireDate: '2024-01-01',
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      bioId: '70003',
      employeeNumber: '70003',
      fullName: 'Suspended, Mark',
      location: 'DBB CEBU',
      workGroupId: 'wg-group-c',
      department: 'OPERATIONS',
      position: 'Staff',
      status: 'suspended',
      salaryType: 'Daily',
      dailyRate: 540,
      hireDate: '2024-01-01',
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      bioId: '70004',
      employeeNumber: '70004',
      fullName: 'NewHire, Grace',
      location: 'DBB CEBU',
      workGroupId: 'wg-group-c',
      department: 'OPERATIONS',
      position: 'Staff',
      status: 'active',
      salaryType: 'Daily',
      dailyRate: 540,
      hireDate: '2026-10-10',
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      bioId: '70005',
      employeeNumber: '70005',
      fullName: 'Dela Cruz, Juan',
      location: 'DBB CEBU',
      workGroupId: 'wg-group-c',
      department: 'OPERATIONS',
      position: 'Staff',
      status: 'active',
      salaryType: 'Daily',
      dailyRate: 540,
      hireDate: '2024-01-01',
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      bioId: '70006',
      employeeNumber: '70006',
      fullName: 'Dela Cruz, Juan',
      location: 'DBB CEBU',
      workGroupId: 'wg-group-c',
      department: 'OPERATIONS',
      position: 'Staff',
      status: 'active',
      salaryType: 'Daily',
      dailyRate: 540,
      hireDate: '2024-01-01',
      createdAt: nowIso,
      updatedAt: nowIso
    }
  ])

  // Seed punches on 2026-10-05 (Monday): 25061 morning IN 06:00, 50305 afternoon OUT 15:00
  // Also punch on 70001 (Active - NB) to ensure Active-NB historical punch doesn't break Present counts!
  const makePunch = (id, bioId, date, hhmm, type = 0) => {
    const ts = `${date}T${hhmm}:00+08:00`
    return {
      id,
      bioId,
      employeeName: `User ${bioId}`,
      timestamp: ts,
      date,
      timestampMs: new Date(ts).getTime(),
      type,
      state: type,
      serialNumber: id,
      deviceId: 'dev-1',
      deviceName: 'BISMAC B-29b',
      deviceIp: '192.168.1.201',
      locationId: 'loc-dbb-cebu',
      locationName: 'DBB CEBU',
      importedAt: nowIso
    }
  }

  await memTables.biometricPunches.bulkPut([
    makePunch('p1', '25061', '2026-10-05', '06:00', 0),
    makePunch('p2', '50305', '2026-10-05', '15:00', 1),
    makePunch('p3', '50305', '2026-10-06', '06:00', 0),
    makePunch('p4', '50305', '2026-10-06', '15:00', 1),
    makePunch('p5', '70001', '2026-10-05', '08:00', 0),
    makePunch('p6', '70001', '2026-10-05', '17:00', 1)
  ])

  // Seed secondary records under 50305
  await memTables.leaveRecords.put({
    id: 'leave-50305-1',
    bioId: '50305',
    employeeName: 'Abelido, Reynald',
    leaveType: 'Sick Leave',
    startDate: '2026-10-07',
    endDate: '2026-10-07',
    status: 'Approved',
    reason: 'Fever',
    createdAt: nowIso
  })
  await memTables.overtimeAuthorizations.put({
    id: 'ot-50305-1',
    bioId: '50305',
    employeeName: 'Abelido, Reynald',
    date: '2026-10-06',
    authorizedStart: '15:00',
    authorizedEnd: '17:00',
    authorizedHours: 2,
    status: 'Approved',
    reason: 'Urgent dispatch',
    createdAt: nowIso,
    updatedAt: nowIso
  })
  await memTables.manualAdjustments.put({
    id: '50305_2026-10-08',
    bioId: '50305',
    employeeName: 'Abelido, Reynald',
    date: '2026-10-08',
    adjustedIn: '06:00',
    adjustedOut: '15:00',
    reason: 'Power outage',
    adjustedBy: 'Admin',
    status: 'Approved',
    createdAt: nowIso,
    updatedAt: nowIso
  })
  await memTables.hrNotices.put({
    id: 'notice-50305-1',
    bioId: '50305',
    employeeName: 'Abelido, Reynald',
    title: 'Submit Medical Cert',
    message: 'Please visit HR',
    isActive: true,
    createdAt: nowIso,
    updatedAt: nowIso
  })
  await memTables.payrollSnapshots.bulkPut([
    {
      id: '2026-09-16_to_2026-09-30_50305',
      periodId: '2026-09-16_to_2026-09-30',
      bioId: '50305',
      employeeNumber: '50305',
      employeeName: 'Abelido, Reynald',
      department: 'OPERATIONS',
      position: 'Staff',
      status: 'active',
      workGroupId: 'wg-group-c',
      cutoffStart: '2026-09-16',
      cutoffEnd: '2026-09-30',
      payday: '2026-10-05',
      salaryType: 'Daily',
      basicSalary: 0,
      dailyRate: 500,
      hourlyRate: 62.5,
      payableDays: 10,
      presentDays: 10,
      sundayWorkDays: 0,
      holidayDays: 0,
      workedHolidayDays: 0,
      unworkedHolidayDays: 0,
      specialNonWorkingDays: 0,
      specialWorkingDays: 0,
      holidayPay: 0,
      overtimeHours: 0,
      overtimePay: 0,
      lateMinutes: 0,
      undertimeMinutes: 0,
      undertimeDeduction: 0,
      initialEarnings: 5000,
      sss: 0,
      philhealth: 0,
      pagibig: 0,
      sssLoan: 0,
      pagibigLoan: 0,
      otherLoan: 0,
      totalBenefitsAndLoans: 0,
      balanceAfterBenefitsAndLoans: 5000,
      cashAdvance: 0,
      itemizedDeductions: [],
      totalOtherDeductions: 0,
      balanceBeforeTax: 5000,
      withholdingTax: 0,
      netPay: 5000,
      reviewStatus: 'finalized',
      reviewReasons: [],
      batchStatus: 'finalized',
      finalizedAt: nowIso,
      finalizedBy: 'Admin',
      updatedAt: nowIso
    },
    {
      id: '2026-10-01_to_2026-10-15_50305',
      periodId: '2026-10-01_to_2026-10-15',
      bioId: '50305',
      employeeNumber: '50305',
      employeeName: 'Abelido, Reynald',
      department: 'OPERATIONS',
      position: 'Staff',
      status: 'active',
      workGroupId: 'wg-group-c',
      cutoffStart: '2026-10-01',
      cutoffEnd: '2026-10-15',
      payday: '2026-10-20',
      salaryType: 'Daily',
      basicSalary: 0,
      dailyRate: 500,
      hourlyRate: 62.5,
      payableDays: 2,
      presentDays: 2,
      sundayWorkDays: 0,
      holidayDays: 0,
      workedHolidayDays: 0,
      unworkedHolidayDays: 0,
      specialNonWorkingDays: 0,
      specialWorkingDays: 0,
      holidayPay: 0,
      overtimeHours: 0,
      overtimePay: 0,
      lateMinutes: 0,
      undertimeMinutes: 0,
      undertimeDeduction: 0,
      initialEarnings: 1000,
      sss: 0,
      philhealth: 0,
      pagibig: 0,
      sssLoan: 0,
      pagibigLoan: 0,
      otherLoan: 0,
      totalBenefitsAndLoans: 0,
      balanceAfterBenefitsAndLoans: 1000,
      cashAdvance: 0,
      itemizedDeductions: [],
      totalOtherDeductions: 0,
      balanceBeforeTax: 1000,
      withholdingTax: 0,
      netPay: 1000,
      reviewStatus: 'ready',
      reviewReasons: [],
      batchStatus: 'draft',
      updatedAt: nowIso
    }
  ])

  await employeeRepository.reloadFromDb()

  console.log('======================================================================')
  console.log('DMBBHR EMPLOYEE CONSOLIDATION & ABSENCE ACCURACY VERIFICATION')
  console.log('======================================================================')

  // 1. Normal linkSecondaryBioId duplicate protection still blocks linking 50305
  await assert.rejects(
    () => employeeService.linkSecondaryBioId('25061', '50305', { confirmedByAdmin: true }),
    /already assigned to Abelido, Reynald/
  )
  console.log('✔ Check 1: Normal linkSecondaryBioId duplicate-ID protection remains intact')

  // 2. Preview consolidation detects conflicts & finalized snapshots without mutating DB
  const preview = await employeeService.previewConsolidateEmployees('25061', '50305')
  assert.strictEqual(preview.canonicalBioId, '25061')
  assert.strictEqual(preview.sourceBioId, '50305')
  assert.strictEqual(preview.hasConflicts, true)
  const salaryConflict = preview.conflictFields.find(f => f.field === 'salaryConfig')
  assert.ok(salaryConflict && salaryConflict.hadBothValues === true, 'Should detect salary conflict')
  const sssFill = preview.conflictFields.find(f => f.field === 'sssNumber')
  assert.ok(sssFill && sssFill.hadBothValues === false && sssFill.recommendedChoice === 'source')
  assert.strictEqual(preview.impactSummary.punchesPreserved, 3)
  assert.strictEqual(preview.impactSummary.leaveRecords, 1)
  assert.strictEqual(preview.impactSummary.overtimeAuthorizations, 1)
  assert.strictEqual(preview.impactSummary.manualAdjustments, 1)
  assert.strictEqual(preview.impactSummary.hrNotices, 1)
  assert.strictEqual(preview.impactSummary.draftSnapshotsToTransfer, 1)
  assert.strictEqual(preview.impactSummary.finalizedSnapshotsPreserved, 1)
  assert.strictEqual((await employeeService.getEmployees()).length, 8, 'Preview must not mutate employee count')
  console.log('✔ Check 2: previewConsolidateEmployees surfaces conflicts & impact cleanly without DB mutation')

  // 3. Reject unconfirmed or unresolved conflict execution
  await assert.rejects(
    () => employeeService.consolidateEmployees({
      canonicalBioId: '25061',
      sourceBioId: '50305',
      confirmedByAdmin: false,
      resolutions: { fullName: 'canonical', workGroupId: 'canonical', position: 'canonical', salaryConfig: 'canonical' }
    }),
    /confirmation is required/i
  )
  await assert.rejects(
    () => employeeService.consolidateEmployees({
      canonicalBioId: '25061',
      sourceBioId: '50305',
      confirmedByAdmin: true,
      resolutions: {}
    }),
    /resolve conflict/i
  )
  console.log('✔ Check 3: Execution blocks missing admin confirmation or unresolved conflicts')

  // 4. Execute consolidation atomically
  const res = await employeeService.consolidateEmployees({
    canonicalBioId: '25061',
    sourceBioId: '50305',
    confirmedByAdmin: true,
    performedBy: 'Test Admin',
    notes: 'Confirmed duplicate terminal enrollment',
    resolutions: {
      fullName: 'canonical',
      workGroupId: 'canonical',
      position: 'canonical',
      salaryConfig: 'canonical',
      sssNumber: 'source',
      mobileNumber: 'source'
    }
  })

  assert.strictEqual(res.canonicalEmployee.biometric_user_id, '25061')
  assert.strictEqual(res.canonicalEmployee.daily_rate, 540, 'Daily rate must stay 540 (never summed)')
  assert.strictEqual(res.canonicalEmployee.sss_number, '06-1111111-1')
  assert.strictEqual(res.canonicalEmployee.mobile_number, '09171234567')
  assert.ok(res.canonicalEmployee.linked_bio_ids?.includes('50305'))
  assert.ok(res.canonicalEmployee.merged_from_bio_ids?.includes('50305'))
  const transferredEntry = res.canonicalEmployee.biometric_ids?.find(b => b.bioId === '50305')
  assert.strictEqual(transferredEntry?.transferredFromBioId, '50305')
  assert.strictEqual(transferredEntry?.transferredBy, 'Test Admin')

  assert.strictEqual(res.archivedSourceEmployee.is_merged, true)
  assert.strictEqual(res.archivedSourceEmployee.merged_into_bio_id, '25061')

  // Directory & workgroup counts exclude archived 50305
  const activeDir = await employeeService.getEmployees()
  assert.strictEqual(activeDir.length, 7, 'Directory must exclude archived source 50305')
  assert.strictEqual(activeDir.some(e => e.biometric_user_id === '50305'), false)
  const wgCounts = await workGroupRepository.getAllAssignedEmployeeCounts()
  assert.strictEqual(wgCounts['wg-group-a'], 1)
  assert.strictEqual(wgCounts['wg-group-c'], 6, 'Work group count must not count archived 50305')

  // Lookup by archived ID resolves to canonical 25061
  const lookup50305 = await employeeService.getEmployeeByBioId('50305')
  assert.strictEqual(lookup50305?.biometric_user_id, '25061')
  assert.strictEqual(employeeRepository.resolveCanonicalBioIdSync('50305'), '25061')

  // Raw punches untouched, ownership transferred, finalized snapshot untouched
  assert.strictEqual(await memTables.biometricPunches.count(), 6, 'All raw biometric punches must remain intact')
  const leaves = await memTables.leaveRecords.toArray()
  assert.strictEqual(leaves[0].bioId, '25061')
  const ots = await memTables.overtimeAuthorizations.toArray()
  assert.strictEqual(ots[0].bioId, '25061')
  const manuals = await memTables.manualAdjustments.toArray()
  assert.strictEqual(manuals[0].bioId, '25061')
  const notices = await memTables.hrNotices.toArray()
  assert.strictEqual(notices[0].bioId, '25061')
  const finalizedSnap = await memTables.payrollSnapshots.get('2026-09-16_to_2026-09-30_50305')
  assert.strictEqual(finalizedSnap?.bioId, '50305', 'Finalized snapshot must remain untouched')
  assert.strictEqual(finalizedSnap?.dailyRate, 500)
  const transferredDraft = await memTables.payrollSnapshots.get('2026-10-01_to_2026-10-15_25061')
  assert.strictEqual(transferredDraft?.bioId, '25061')
  assert.strictEqual(await memTables.payrollSnapshots.get('2026-10-01_to_2026-10-15_50305'), undefined)

  // Audit persisted
  const audits = await employeeService.getConsolidationAudits('25061')
  assert.strictEqual(audits.length, 1)
  assert.strictEqual(audits[0].sourceBioId, '50305')

  // Re-merge blocked
  await assert.rejects(
    () => employeeService.previewConsolidateEmployees('25061', '50305'),
    /already.*merged/i
  )
  console.log('✔ Check 4: Atomic consolidation, ownership transfer, finalized preservation, lookup & audit verified')

  // 5. Excel export/import preserves merged_from_bio_ids & skips archived rows
  const exported = await employeeService.getExportData()
  const exportReynald = exported.find(r => r.ID === '25061')
  assert.strictEqual(exportReynald['SECONDARY BIO IDS'], '50305')
  assert.strictEqual(exportReynald['MERGED FROM BIO IDS'], '50305')
  const importPreview = await employeeService.previewImportFromExcel([
    ...exported,
    { ID: '50305', NAME: 'Abelido, Reynald', 'IS MERGED': 'YES', 'MERGED INTO BIO ID': '25061' }
  ])
  assert.strictEqual(importPreview.allRows.find(r => r.id === '50305')?.action, 'SKIP')
  console.log('✔ Check 5: Excel export & import preserve consolidation mapping and skip archived rows')

  // 6. Two distinct people with same/similar name NEVER auto-merged (70005 & 70006)
  const allActive = await employeeService.getEmployees()
  assert.ok(allActive.find(e => e.biometric_user_id === '70005'))
  assert.ok(allActive.find(e => e.biometric_user_id === '70006'))
  console.log('✔ Check 6: Distinct employees with identical names are never auto-merged')

  // 7. Attendance combining & Monthly summary canonical count
  const day1005 = await attendanceRepository.getDailyAttendance('2026-10-05')
  const reynaldDay = day1005.find(r => r.biometric_user_id === '25061')
  assert.ok(reynaldDay, 'Reynald should have a daily record on 2026-10-05')
  assert.strictEqual(day1005.filter(r => r.biometric_user_id === '50305').length, 0, '50305 must not form separate daily row')
  assert.strictEqual(reynaldDay.actual_in, '6:00:00 AM')
  assert.strictEqual(reynaldDay.actual_out, '3:00:00 PM')
  assert.strictEqual(reynaldDay.has_valid_out, true)

  const monthMap = await attendanceRepository.getMonthSummaries(2026, 10)
  const summary1005 = monthMap.get('2026-10-05')
  assert.ok(summary1005)
  assert.strictEqual(summary1005.presentCount, 2, '25061+50305 counted once, plus 70001 punch row')
  console.log('✔ Check 7: Multi-Bio-ID punches combine & getMonthSummaries counts canonical employees accurately')

  // 8. ReportsService Absence & Eligibility Accuracy across 2026-10-05 to 2026-10-07 (Mon-Wed)
  const report = await reportsService.getReportSummary({
    preset: 'custom',
    startDate: '2026-10-05',
    endDate: '2026-10-07'
  }, true)

  // Eligible employees on 2026-10-05..2026-10-07:
  // - 25061 (Abelido, Reynald C.): Present 10-05, Present 10-06, Approved Leave 10-07 -> 0 absences!
  // - 70001 (NoBio, Elena): Active - NB -> excluded (0 absences, 0 present in report)!
  // - 70002 (Resigned, Carlo): Resigned 2026-10-04 -> excluded (0 absences)!
  // - 70003 (Suspended, Mark): Suspended -> excluded (0 absences)!
  // - 70004 (NewHire, Grace): Hire date 2026-10-10 -> excluded on Oct 5-7 (0 absences)!
  // - 70005 & 70006 (Dela Cruz, Juan x2): Both active eligible, absent on Oct 5, 6, 7 -> 3 absences each = 6 total!
  assert.strictEqual(report.kpis.uniqueEligibleEmployees, 3, 'Only 25061, 70005, 70006 are eligible (3 employees)')
  assert.strictEqual(report.kpis.presentCount, 2, 'Reynald present Oct 5 & Oct 6 = 2; Active-NB excluded')
  assert.strictEqual(report.kpis.absentCount, 6, 'Only 70005 & 70006 absent across 3 days = 6')
  assert.strictEqual(report.absentRecords.some(a => a.bioId === '25061' || a.bioId === '50305'), false, 'Reynald has 0 absences (leave + combined punches)')
  assert.strictEqual(report.absentRecords.some(a => a.bioId === '70001'), false, 'Active-NB never marked absent')
  assert.strictEqual(report.absentRecords.some(a => a.bioId === '70002'), false, 'Resigned never marked absent')
  assert.strictEqual(report.absentRecords.some(a => a.bioId === '70003'), false, 'Suspended never marked absent')
  assert.strictEqual(report.absentRecords.some(a => a.bioId === '70004'), false, 'Pre-hire never marked absent')
  console.log('✔ Check 8: ReportsService accurately excludes merged, Active-NB, resigned, suspended, pre-hire & approved leave')

  // 9. PayrollCalculationService eligibility & single-employee deduplication
  const periodOct1 = {
    id: '2026-10-01_to_2026-10-15',
    startDate: '2026-10-01',
    endDate: '2026-10-15',
    payday: '2026-10-20',
    label: 'Oct 1-15, 2026',
    dates: [
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
      '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10',
      '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'
    ]
  }
  const payrollRes = await payrollCalculationService.computePayroll(periodOct1, await employeeService.getEmployees())
  assert.strictEqual(payrollRes.filter(p => p.bioId === '50305').length, 0, 'Archived 50305 must not appear in payroll')
  assert.strictEqual(payrollRes.filter(p => p.bioId === '25061').length, 1, 'Canonical 25061 appears once')
  const noBioPayroll = payrollRes.find(p => p.bioId === '70001')
  assert.ok(noBioPayroll)
  assert.strictEqual(noBioPayroll.absentDays, 0, 'Active-NB Monthly must have 0 absentDays')
  assert.strictEqual(noBioPayroll.earningsBreakdown.basePay, 13000, 'Active-NB Monthly receives full semi-monthly basic')
  const suspendedPayroll = payrollRes.find(p => p.bioId === '70003')
  assert.strictEqual(suspendedPayroll?.absentDays, 0, 'Suspended must not accumulate absentDays')
  const newHirePayroll = payrollRes.find(p => p.bioId === '70004')
  assert.ok(newHirePayroll)
  // Oct 10 is Saturday, Oct 11 Sunday, Oct 12-15 Mon-Thu -> eligible scheduledDays = 5 (Oct 10,12,13,14,15) instead of 13!
  assert.strictEqual(newHirePayroll.scheduledDays, 5, 'Pre-hire dates before Oct 10 must not count as scheduled/absent')
  console.log('✔ Check 9: PayrollCalculationService enforces merged, Active-NB, non-active & pre-hire eligibility')

  console.log('======================================================================')
  console.log('ALL 9 CONSOLIDATION & ABSENCE ACCURACY CHECKS PASSED!')
  console.log('======================================================================')
} finally {
  await server.close()
}
