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
      work_group_name: wg?.name || 'GROUP C',
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
   * Bulk register employees
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
