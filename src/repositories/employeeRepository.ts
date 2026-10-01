import { db, type EmployeeRecord } from '@/db'
import type { Employee, EmployeeLocation } from '@/types'
import { workGroupRepository } from './workGroupRepository'

export const VALID_LOCATIONS: EmployeeLocation[] = [
  'DMBB CEBU',
  'DBB CEBU',
  'DBB NEGROS',
  'DBB ILOILO'
]

// Seed employees with assigned Work Groups
const DEFAULT_INITIAL_EMPLOYEES: EmployeeRecord[] = [
  {
    bioId: '50044',
    employeeNumber: 'EMP-50044',
    fullName: 'B Basalo, Randy',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-a', // GROUP A: 6:00 AM - 3:00 PM
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '5007',
    employeeNumber: 'EMP-5007',
    fullName: 'A Abella, Jebjeb',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-b', // GROUP B: 7:00 AM - 4:00 PM
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50113',
    employeeNumber: 'EMP-50113',
    fullName: 'A Aligway, Nicasio',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c', // GROUP C: 8:00 AM - 5:00 PM
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50062',
    employeeNumber: 'EMP-50062',
    fullName: 'B Baricuatro, Tonton',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-a',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50059',
    employeeNumber: 'EMP-50059',
    fullName: 'C Repompo, Raffy',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-b',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50039',
    employeeNumber: 'EMP-50039',
    fullName: 'D Baclaan Jr, Victoriano',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50052',
    employeeNumber: 'EMP-50052',
    fullName: 'D Canceran, Eduard',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-a',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50071',
    employeeNumber: 'EMP-50071',
    fullName: 'D Catampatan, Edgardo',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-b',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '10001',
    employeeNumber: 'EMP-10001',
    fullName: 'D Cuizon, Roberto',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50065',
    employeeNumber: 'EMP-50065',
    fullName: 'D Villarta Melquiades',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-a',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50060',
    employeeNumber: 'EMP-50060',
    fullName: 'E Basalo, Juniemar',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-b',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50041',
    employeeNumber: 'EMP-50041',
    fullName: 'E Cantila, Eduardo Jr.',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50058',
    employeeNumber: 'EMP-50058',
    fullName: 'E Cuizon, Mark Lester',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-a',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50036',
    employeeNumber: 'EMP-50036',
    fullName: 'E Rosal, Joven',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-b',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50049',
    employeeNumber: 'EMP-50049',
    fullName: 'G Villacarlos, Jonathan',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '5009',
    employeeNumber: 'EMP-5009',
    fullName: 'K Pasana, Dothy Marie',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-a',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50064',
    employeeNumber: 'EMP-50064',
    fullName: 'L Rosal, Jayson',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-b',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50054',
    employeeNumber: 'EMP-50054',
    fullName: 'L Tangente, Ryan',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50063',
    employeeNumber: 'EMP-50063',
    fullName: 'M Baydal, Reynald',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-a',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50066',
    employeeNumber: 'EMP-50066',
    fullName: 'M Dunque, Glenn',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-b',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50050',
    employeeNumber: 'EMP-50050',
    fullName: 'N Fernandez, Ronie',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50056',
    employeeNumber: 'EMP-50056',
    fullName: 'O Baydal, Reneboy',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-a',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50038',
    employeeNumber: 'EMP-50038',
    fullName: 'P Rosal, Junjie',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-b',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50067',
    employeeNumber: 'EMP-50067',
    fullName: 'R Labalan, Dennis',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50035',
    employeeNumber: 'EMP-50035',
    fullName: 'R Rosales, Larry',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-a',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50051',
    employeeNumber: 'EMP-50051',
    fullName: 'R Rosell, Ricky',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-b',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50070',
    employeeNumber: 'EMP-50070',
    fullName: 'R Valiente, Ronnie',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50045',
    employeeNumber: 'EMP-50045',
    fullName: 'S Dela Cruz, Ronil',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-a',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50037',
    employeeNumber: 'EMP-50037',
    fullName: 'S Rosal, Jessie',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-b',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50069',
    employeeNumber: 'EMP-50069',
    fullName: 'T Rosal, Ronilo',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50055',
    employeeNumber: 'EMP-50055',
    fullName: 'T Velasquez, Mark',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-a',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50068',
    employeeNumber: 'EMP-50068',
    fullName: 'V Rosal, Alvin',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-b',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50048',
    employeeNumber: 'EMP-50048',
    fullName: 'Y Fernandez, Jonathan',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]

let employeeCache: Map<string, EmployeeRecord> | null = null
const changeListeners = new Set<() => void>()

async function ensureInitialized() {
  if (employeeCache !== null) return

  const count = await db.employees.count()
  if (count === 0) {
    await db.employees.bulkPut(DEFAULT_INITIAL_EMPLOYEES)
  }

  const all = await db.employees.toArray()
  employeeCache = new Map<string, EmployeeRecord>()
  for (const emp of all) {
    if (!emp.workGroupId) {
      emp.workGroupId = 'wg-group-c'
    }
    employeeCache.set(emp.bioId, emp)
  }
}

export interface PeopleImportMatchedRow {
  bioId: string
  existingName: string
  newName: string
  existingGroup: string
  newGroup: string
  isNameUpdated: boolean
  isGroupUpdated: boolean
  targetRecord: EmployeeRecord
}

export interface PeopleImportNewRow {
  bioId: string
  name: string
  group: string
  location: EmployeeLocation
  targetRecord: EmployeeRecord
}

export interface PeopleImportUnknownGroupRow {
  bioId: string
  name: string
  rawGroup: string
  rowNumber: number
}

export interface PeopleImportInvalidRow {
  rowNumber: number
  reason: string
  raw: any
}

export interface PeopleImportPreviewResult {
  totalRows: number
  matchedUpdatedCount: number
  newPeopleCount: number
  unknownGroupsCount: number
  invalidCount: number
  matchedUpdated: PeopleImportMatchedRow[]
  newPeople: PeopleImportNewRow[]
  unknownGroups: PeopleImportUnknownGroupRow[]
  invalidRows: PeopleImportInvalidRow[]
  recordsToApply: EmployeeRecord[]
}

export const employeeRepository = {
  async toEmployee(rec: EmployeeRecord): Promise<Employee> {
    const wg = await workGroupRepository.getById(rec.workGroupId || 'wg-group-c')
    return {
      id: `emp-${rec.bioId}`,
      employee_number: rec.employeeNumber,
      biometric_user_id: rec.bioId,
      full_name: rec.fullName,
      location: rec.location,
      work_group_id: rec.workGroupId || 'wg-group-c',
      work_group_name: wg?.name || 'Group C',
      work_group_code: wg?.code || 'C',
      department: rec.department,
      position: rec.position,
      status: rec.status,
      created_at: rec.createdAt,
      updated_at: rec.updatedAt
    }
  },

  /**
   * Retrieves all employees with optional location, work group, & search filters
   */
  async getEmployees(params: { location?: string; workGroupId?: string; search?: string } = {}): Promise<Employee[]> {
    await ensureInitialized()
    let records = Array.from(employeeCache!.values())

    if (params.location && params.location !== 'all') {
      const targetLoc = params.location.trim().toLowerCase()
      records = records.filter(e => {
        const curLoc = (e.location || '').toLowerCase()
        return (
          curLoc === targetLoc ||
          (targetLoc === 'loc-dmbb-cebu' && curLoc === 'dmbb cebu') ||
          (targetLoc === 'loc-dbb-cebu' && curLoc === 'dbb cebu') ||
          (targetLoc === 'loc-dbb-negros' && curLoc === 'dbb negros') ||
          (targetLoc === 'loc-dbb-iloilo' && curLoc === 'dbb iloilo')
        )
      })
    }

    if (params.workGroupId && params.workGroupId !== 'all') {
      records = records.filter(e => (e.workGroupId || 'wg-group-c') === params.workGroupId)
    }

    if (params.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase()
      records = records.filter(e =>
        e.fullName.toLowerCase().includes(q) ||
        e.bioId.toLowerCase().includes(q) ||
        e.employeeNumber.toLowerCase().includes(q) ||
        (e.department && e.department.toLowerCase().includes(q))
      )
    }

    records.sort((a, b) => a.fullName.localeCompare(b.fullName))
    return Promise.all(records.map(r => this.toEmployee(r)))
  },

  /**
   * Fast O(1) lookup map for batch attendance calculations
   */
  async getEmployeeMap(): Promise<Map<string, EmployeeRecord>> {
    await ensureInitialized()
    return employeeCache!
  },

  /**
   * Get single employee by Bio ID
   */
  async getByBioId(bioId: string): Promise<Employee | undefined> {
    await ensureInitialized()
    const rec = employeeCache!.get(String(bioId).trim())
    return rec ? this.toEmployee(rec) : undefined
  },

  /**
   * Edits an employee. Bio ID is strictly permanent and read-only.
   * Updates Employee Name, Location, and Work Group.
   */
  async updateEmployee(
    bioId: string,
    updates: { fullName: string; location: EmployeeLocation; workGroupId?: string; department?: string; position?: string }
  ): Promise<Employee> {
    await ensureInitialized()
    const cleanBioId = String(bioId).trim()
    let record = employeeCache!.get(cleanBioId)

    if (!record) {
      record = {
        bioId: cleanBioId,
        employeeNumber: `EMP-${cleanBioId}`,
        fullName: updates.fullName.trim() || `User ${cleanBioId}`,
        location: updates.location || 'DBB CEBU',
        workGroupId: updates.workGroupId || 'wg-group-c',
        department: updates.department?.trim() || 'Operations',
        position: updates.position?.trim() || 'Staff',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    } else {
      record = {
        ...record,
        fullName: updates.fullName.trim() || record.fullName,
        location: updates.location || record.location,
        workGroupId: updates.workGroupId || record.workGroupId || 'wg-group-c',
        department: updates.department !== undefined ? updates.department.trim() : record.department,
        position: updates.position !== undefined ? updates.position.trim() : record.position,
        updatedAt: new Date().toISOString()
      }
    }

    await db.employees.put(record)
    employeeCache!.set(cleanBioId, record)
    this.notifyChange()

    return this.toEmployee(record)
  },

  /**
   * Registers or updates an employee discovered during biometric import/scan
   */
  async registerFromPunch(
    bioId: string,
    name?: string,
    location: EmployeeLocation = 'DBB CEBU',
    workGroupId: string = 'wg-group-c'
  ): Promise<EmployeeRecord> {
    await ensureInitialized()
    const cleanBioId = String(bioId).trim()
    let record = employeeCache!.get(cleanBioId)

    if (!record) {
      record = {
        bioId: cleanBioId,
        employeeNumber: `EMP-${cleanBioId}`,
        fullName: name && name.trim() ? name.trim() : `User ${cleanBioId}`,
        location,
        workGroupId,
        department: 'Operations',
        position: 'Staff',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await db.employees.put(record)
      employeeCache!.set(cleanBioId, record)
      this.notifyChange()
    } else if (name && name.trim() && record.fullName.startsWith('User ')) {
      record.fullName = name.trim()
      record.updatedAt = new Date().toISOString()
      await db.employees.put(record)
      employeeCache!.set(cleanBioId, record)
      this.notifyChange()
    }

    return record
  },

  /**
   * Bulk register or update employees discovered during punch imports
   */
  async bulkRegisterEmployees(
    employees: { bioId: string; name: string; location?: EmployeeLocation; workGroupId?: string }[]
  ): Promise<void> {
    await ensureInitialized()
    const recordsToPut: EmployeeRecord[] = []

    for (const emp of employees) {
      const cleanBioId = String(emp.bioId).trim()
      let existing = employeeCache!.get(cleanBioId)

      if (!existing) {
        const newRec: EmployeeRecord = {
          bioId: cleanBioId,
          employeeNumber: `EMP-${cleanBioId}`,
          fullName: emp.name && emp.name.trim() ? emp.name.trim() : `User ${cleanBioId}`,
          location: emp.location || 'DBB CEBU',
          workGroupId: emp.workGroupId || 'wg-group-c',
          department: 'Operations',
          position: 'Staff',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        recordsToPut.push(newRec)
        employeeCache!.set(cleanBioId, newRec)
      } else if (emp.name && emp.name.trim() && existing.fullName.startsWith('User ')) {
        existing.fullName = emp.name.trim()
        existing.updatedAt = new Date().toISOString()
        recordsToPut.push(existing)
        employeeCache!.set(cleanBioId, existing)
      }
    }

    if (recordsToPut.length > 0) {
      await db.employees.bulkPut(recordsToPut)
      this.notifyChange()
    }
  },

  /**
   * Generates a full preview and validation for bulk importing employee names & groups from Excel.
   *
   * Rules:
   * - Excel ID maps to permanent Bio ID.
   * - Bio ID cannot be duplicated.
   * - If Bio ID exists: updates Name (if provided) and Work Group (if matched).
   * - If Bio ID does not exist: creates new employee with Bio ID, Name, and Work Group.
   * - Does NOT erase existing fields if Excel value is blank.
   * - Group matches case-insensitively against Work Group Code ("A") or Name ("Group A").
   * - Unknown groups flagged in preview warnings.
   */
  async previewImportEmployeesFromExcel(rows: any[]): Promise<PeopleImportPreviewResult> {
    await ensureInitialized()
    const workGroups = await workGroupRepository.getAll()
    const defaultGroup = await workGroupRepository.getDefault()

    const matchedUpdated: PeopleImportMatchedRow[] = []
    const newPeople: PeopleImportNewRow[] = []
    const unknownGroups: PeopleImportUnknownGroupRow[] = []
    const invalidRows: PeopleImportInvalidRow[] = []
    const recordsToApplyMap = new Map<string, EmployeeRecord>()

    const seenBioIdsInImport = new Set<string>()

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 1

      // Extract ID (Bio ID)
      const rawId =
        row.ID ??
        row.id ??
        row['Bio ID'] ??
        row['BioId'] ??
        row['User ID'] ??
        row['UserId'] ??
        row['user_id'] ??
        row['ID/Bio ID']

      if (rawId === undefined || rawId === null || String(rawId).trim() === '') {
        invalidRows.push({
          rowNumber: rowNum,
          reason: 'Missing ID / Bio ID',
          raw: row
        })
        continue
      }

      const bioId = String(rawId).trim()

      // Guard against duplicate rows in the same Excel file
      if (seenBioIdsInImport.has(bioId)) {
        invalidRows.push({
          rowNumber: rowNum,
          reason: `Duplicate Bio ID "${bioId}" in import file`,
          raw: row
        })
        continue
      }
      seenBioIdsInImport.add(bioId)

      // Extract Name
      const rawName =
        row.Name ??
        row.name ??
        row['Employee Name'] ??
        row['employee_name'] ??
        row['Full Name'] ??
        row.fullName

      const cleanName = rawName !== undefined && rawName !== null ? String(rawName).trim() : ''

      // Extract Group
      const rawGroup =
        row.Group ??
        row.group ??
        row['Work Group'] ??
        row['WorkGroup'] ??
        row['Group Code'] ??
        row['Group Name'] ??
        row.workGroupId ??
        row.work_group

      const cleanGroupStr = rawGroup !== undefined && rawGroup !== null ? String(rawGroup).trim() : ''

      let matchedWg = cleanGroupStr ? await workGroupRepository.findMatchingGroup(cleanGroupStr) : undefined

      if (cleanGroupStr && !matchedWg) {
        unknownGroups.push({
          bioId,
          name: cleanName || `User ${bioId}`,
          rawGroup: cleanGroupStr,
          rowNumber: rowNum
        })
      }

      const existingRecord = employeeCache!.get(bioId)

      if (existingRecord) {
        const existingWg = workGroups.find(w => w.id === (existingRecord.workGroupId || 'wg-group-c'))
        const targetName = cleanName !== '' ? cleanName : existingRecord.fullName
        const targetWgId = matchedWg ? matchedWg.id : (existingRecord.workGroupId || 'wg-group-c')
        const targetWg = workGroups.find(w => w.id === targetWgId) || existingWg || defaultGroup

        const isNameUpdated = cleanName !== '' && cleanName !== existingRecord.fullName
        const isGroupUpdated = Boolean(matchedWg && matchedWg.id !== existingRecord.workGroupId)

        const targetRecord: EmployeeRecord = {
          ...existingRecord,
          fullName: targetName,
          workGroupId: targetWgId,
          updatedAt: new Date().toISOString()
        }

        matchedUpdated.push({
          bioId,
          existingName: existingRecord.fullName,
          newName: targetName,
          existingGroup: existingWg?.name || existingRecord.workGroupId,
          newGroup: targetWg?.name || targetWgId,
          isNameUpdated,
          isGroupUpdated,
          targetRecord
        })

        recordsToApplyMap.set(bioId, targetRecord)
      } else {
        // New Employee
        const targetName = cleanName !== '' ? cleanName : `User ${bioId}`
        const targetWg = matchedWg || defaultGroup
        const targetWgId = targetWg.id

        const targetRecord: EmployeeRecord = {
          bioId,
          employeeNumber: `EMP-${bioId}`,
          fullName: targetName,
          location: 'DBB CEBU',
          workGroupId: targetWgId,
          department: 'Operations',
          position: 'Staff',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        newPeople.push({
          bioId,
          name: targetName,
          group: targetWg.name,
          location: 'DBB CEBU',
          targetRecord
        })

        recordsToApplyMap.set(bioId, targetRecord)
      }
    }

    return {
      totalRows: rows.length,
      matchedUpdatedCount: matchedUpdated.length,
      newPeopleCount: newPeople.length,
      unknownGroupsCount: unknownGroups.length,
      invalidCount: invalidRows.length,
      matchedUpdated,
      newPeople,
      unknownGroups,
      invalidRows,
      recordsToApply: Array.from(recordsToApplyMap.values())
    }
  },

  /**
   * Applies validated import changes directly to IndexedDB
   */
  async applyBulkEmployeeImport(records: EmployeeRecord[]): Promise<{ updatedCount: number; createdCount: number; totalProcessed: number }> {
    await ensureInitialized()
    if (!records || records.length === 0) {
      return { updatedCount: 0, createdCount: 0, totalProcessed: 0 }
    }

    let createdCount = 0
    let updatedCount = 0

    for (const rec of records) {
      if (employeeCache!.has(rec.bioId)) {
        updatedCount++
      } else {
        createdCount++
      }
      employeeCache!.set(rec.bioId, rec)
    }

    await db.employees.bulkPut(records)
    this.notifyChange()

    return {
      updatedCount,
      createdCount,
      totalProcessed: records.length
    }
  },

  /**
   * Generates formatted data for Excel/CSV export of People Directory
   */
  async getAllForExport(): Promise<any[]> {
    const employees = await this.getEmployees()
    return employees.map(emp => ({
      'ID': emp.biometric_user_id,
      'Name': emp.full_name,
      'Group': emp.work_group_code || (emp.work_group_name?.replace(/^Group\s*/i, '') || 'C'),
      'Group Name': emp.work_group_name || 'Group C',
      'Location': emp.location,
      'Department': emp.department || 'Operations',
      'Position': emp.position || 'Staff',
      'Status': emp.status === 'active' ? 'Active' : (emp.status === 'on_leave' ? 'On Leave' : 'Inactive')
    }))
  },

  onChange(cb: () => void): () => void {
    changeListeners.add(cb)
    return () => changeListeners.delete(cb)
  },

  notifyChange() {
    for (const cb of changeListeners) {
      try {
        cb()
      } catch {
        // ignore
      }
    }
  },

  async count(): Promise<number> {
    await ensureInitialized()
    return employeeCache!.size
  }
}
