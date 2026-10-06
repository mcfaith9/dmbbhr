import { db, type EmployeeRecord, type WorkGroupRecord } from '@/db'
import type { Employee, EmployeeLocation, WorkGroup, EmploymentStatus } from '@/types'
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
    bioId: '25065',
    employeeNumber: '25065',
    fullName: 'Cabigas, Marc Louie',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'IT ADMIN',
    position: 'Staff',
    status: 'resigned',
    resignationDate: '2026-06-30',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '25069',
    employeeNumber: '25069',
    fullName: 'Cantillas, Ronald',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'MECHANIC',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '25041',
    employeeNumber: '25041',
    fullName: 'Bendulo, Meraflor',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'DBB ADMIN',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50350',
    employeeNumber: '50350',
    fullName: 'Villanueva, Jesier',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'DIGGER',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '58337',
    employeeNumber: '58337',
    fullName: 'Rivera, Mae Ive',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'DBB ADMIN',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    bioId: '50291',
    employeeNumber: '50291',
    fullName: 'Alfanta, Cristine',
    location: 'DBB CEBU',
    workGroupId: 'wg-group-c',
    department: 'Operations',
    position: 'Staff',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
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
    await db.employees.bulkPut(DEFAULT_INITIAL_EMPLOYEES.map(e => ({ ...e, employeeNumber: e.bioId })))
  }

  const all = await db.employees.toArray()
  employeeCache = new Map<string, EmployeeRecord>()
  for (const emp of all) {
    if (!emp.workGroupId) {
      emp.workGroupId = 'wg-group-c'
    }
    // Core Identifier Rule: Employee ID = Bio ID
    if (emp.employeeNumber !== emp.bioId) {
      emp.employeeNumber = emp.bioId
    }
    employeeCache.set(emp.bioId, emp)
  }

  // Ensure default seeds like Cantillas, Ronald (25065) and Alfanta, Cristine (50291) are always present
  for (const seed of DEFAULT_INITIAL_EMPLOYEES) {
    if (!employeeCache.has(seed.bioId)) {
      const cleanSeed = { ...seed, employeeNumber: seed.bioId }
      employeeCache.set(seed.bioId, cleanSeed)
      db.employees.put(cleanSeed).catch(() => {})
    }
  }
}

export interface EmploymentStatusParseResult {
  status?: EmploymentStatus
  isValid: boolean
  display: string
  raw: string
  isUnsupported?: boolean
}

export function parseEmploymentStatus(val: any): EmploymentStatusParseResult | null {
  if (val === undefined || val === null) return null
  const str = String(val).trim()
  if (str === '' || str === '-' || str === '—') return null

  const upper = str.toUpperCase()
  if (upper === 'A' || upper === 'ACTIVE') {
    return { status: 'active', isValid: true, display: 'Active', raw: str }
  }
  if (upper === 'R' || upper === 'RESIGNED') {
    return { status: 'resigned', isValid: true, display: 'Resigned', raw: str }
  }
  if (upper === 'SUSPENSION' || upper === 'SUSPENDED') {
    return { status: 'suspended', isValid: true, display: 'Suspension', raw: str }
  }
  if (upper === 'CSR') {
    return { status: 'csr', isValid: true, display: 'CSR', raw: str }
  }
  if (upper === 'ON LEAVE' || upper === 'ON_LEAVE' || upper === 'LEAVE') {
    return { status: 'on_leave', isValid: true, display: 'On Leave', raw: str }
  }
  if (upper === 'INACTIVE') {
    return { status: 'inactive', isValid: true, display: 'Inactive', raw: str }
  }

  return { isValid: false, isUnsupported: true, display: str, raw: str }
}

export function getStatusDisplayName(status?: string): string {
  if (!status) return '—'
  const s = status.toLowerCase().trim()
  if (s === 'active' || s === 'a') return 'Active'
  if (s === 'resigned' || s === 'r') return 'Resigned'
  if (s === 'suspended' || s === 'suspension') return 'Suspension'
  if (s === 'csr') return 'CSR'
  if (s === 'on_leave' || s === 'on leave') return 'On Leave'
  if (s === 'inactive') return 'Inactive'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export interface ContractDateParseResult {
  isValid: boolean
  formatted?: string
  raw: string
  isInvalid?: boolean
}

export function parseContractDate(val: any): ContractDateParseResult | null {
  if (val === undefined || val === null) return null
  const str = String(val).trim()
  if (str === '' || str === '-' || str === '—' || str.toLowerCase() === 'n/a') return null

  // 1. Numeric Excel serial date (e.g. 45321)
  if (typeof val === 'number') {
    if (val > 1000 && val < 100000) {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000))
      if (!isNaN(date.getTime())) {
        const y = date.getUTCFullYear()
        const m = String(date.getUTCMonth() + 1).padStart(2, '0')
        const d = String(date.getUTCDate()).padStart(2, '0')
        return { isValid: true, formatted: `${y}-${m}-${d}`, raw: str }
      }
    }
  }

  // 2. Reject short status-like codes in date column (e.g. 'R', 'A', 'CSR', 'SUSPENSION')
  const upper = str.toUpperCase()
  if (['R', 'A', 'CSR', 'SUSPENSION', 'SUSPENDED', 'ACTIVE', 'RESIGNED', 'LEAVE', 'ON LEAVE'].includes(upper)) {
    return { isValid: false, isInvalid: true, raw: str }
  }

  // 3. Date string parse (e.g. 'March 17,2017', 'January 09,2025', '2025-01-09')
  const timestamp = Date.parse(str)
  if (!isNaN(timestamp)) {
    const d = new Date(timestamp)
    const year = d.getFullYear()
    if (year >= 1950 && year <= 2100) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return { isValid: true, formatted: `${y}-${m}-${day}`, raw: str }
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return { isValid: true, formatted: str, raw: str }
  }

  return { isValid: false, isInvalid: true, raw: str }
}

export interface PeopleImportRowItem {
  rowNumber: number
  id: string // Bio ID
  name: string
  group: string
  department: string
  contractDate?: string
  rawStatus?: string
  displayStatus: string // e.g. "Active → Resigned", "Active", "Resigned"
  previousStatus?: string
  newStatus?: string
  isStatusChanged: boolean
  action: 'UPDATE' | 'CREATE' | 'UNCHANGED' | 'SKIP'
  status: string
  isWarning: boolean
  isError: boolean
  warningReason?: string
  errorReason?: string
  targetRecord?: EmployeeRecord
}

export interface PeopleImportMatchedRow {
  bioId: string
  existingName: string
  newName: string
  existingGroup: string
  newGroup: string
  existingDept: string
  newDept: string
  existingStatus: string
  newStatus: string
  isNameUpdated: boolean
  isGroupUpdated: boolean
  isDeptUpdated: boolean
  isStatusUpdated: boolean
  existingContractDate?: string
  newContractDate?: string
  isContractDateUpdated?: boolean
  targetRecord: EmployeeRecord
}

export interface PeopleImportNewRow {
  bioId: string
  name: string
  group: string
  department: string
  status?: string
  contractDate?: string
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
  updatedCount: number
  newCount: number
  statusUpdatedCount: number
  statusActiveCount: number
  statusResignedCount: number
  statusSuspendedCount: number
  statusCsrCount: number
  unchangedCount: number
  unknownGroupsCount: number
  invalidCount: number
  skippedCount: number
  warningsCount: number
  errorsCount: number
  allRows: PeopleImportRowItem[]
  recordsToApply: EmployeeRecord[]
  // Compatibility fields
  matchedUpdatedCount: number
  newPeopleCount: number
  matchedUpdated: PeopleImportMatchedRow[]
  newPeople: PeopleImportNewRow[]
  unknownGroups: PeopleImportUnknownGroupRow[]
  invalidRows: PeopleImportInvalidRow[]
}

export interface PeopleImportApplyResult {
  updatedCount: number
  createdCount: number
  statusUpdatedCount: number
  statusActiveCount: number
  statusResignedCount: number
  statusSuspendedCount: number
  statusCsrCount: number
  unchangedCount: number
  skippedCount: number
  warningsCount: number
  errorsCount: number
  totalProcessed: number
}

/**
 * Serialization Boundary Helper:
 * Ensures the given employee object is converted into a strictly plain, serializable,
 * structured-clone-safe EmployeeRecord before any IndexedDB / Dexie operations.
 *
 * Strips Vue reactive proxies, functions, prototype links, non-cloneable symbols,
 * DateValue instances, and DOM/component refs.
 */
export function toPersistableEmployeeRecord(input: any): EmployeeRecord {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid employee input: expected an object record.')
  }

  // Extract raw Bio ID (must be a valid non-empty string)
  const rawBioId = input.bioId ?? input.biometric_user_id ?? input.id ?? input.ID
  const cleanBioId = String(rawBioId !== undefined && rawBioId !== null ? rawBioId : '').trim()
  if (!cleanBioId || cleanBioId === '-' || cleanBioId === 'undefined' || cleanBioId === 'null') {
    throw new Error('Missing or invalid permanent Bio ID.')
  }

  // Core Rule: Employee ID = Bio ID (no separate employee ID)
  const cleanEmpNum = cleanBioId

  // Extract Name (string only)
  const rawName = input.fullName ?? input.full_name ?? input.name ?? input.NAME
  const cleanName = rawName !== undefined && rawName !== null ? String(rawName).trim() : `User ${cleanBioId}`

  // Extract Work Group ID (primitive string only)
  let cleanWgId = 'wg-group-c'
  if (input.workGroupId && typeof input.workGroupId === 'object') {
    cleanWgId = String(input.workGroupId.id || 'wg-group-c').trim()
  } else if (input.workGroupId !== undefined && input.workGroupId !== null && String(input.workGroupId).trim() !== '') {
    cleanWgId = String(input.workGroupId).trim()
  } else if (input.work_group_id !== undefined && input.work_group_id !== null && String(input.work_group_id).trim() !== '') {
    cleanWgId = String(input.work_group_id).trim()
  }

  // Extract Department (primitive string only)
  const rawDept = input.department ?? input.DEPARTMENT ?? input.dept ?? input.DEPT
  const cleanDept = rawDept !== undefined && rawDept !== null ? String(rawDept).trim() : 'Operations'

  // Extract Location (primitive string only)
  const rawLoc = input.location ?? input.LOCATION
  let cleanLoc: EmployeeLocation = 'DBB CEBU'
  if (rawLoc && typeof rawLoc === 'string') {
    const trimmedLoc = rawLoc.trim()
    if (VALID_LOCATIONS.includes(trimmedLoc as EmployeeLocation)) {
      cleanLoc = trimmedLoc as EmployeeLocation
    }
  }

  // Extract Position (primitive string only)
  const rawPos = input.position ?? input.POSITION
  const cleanPos = rawPos !== undefined && rawPos !== null ? String(rawPos).trim() : 'Staff'

  // Extract Status (primitive string only)
  const rawStatus = typeof input.status === 'string' ? input.status.trim().toLowerCase() : ''
  let cleanStatus: EmploymentStatus = 'active'
  if (rawStatus === 'inactive' || rawStatus === 'on_leave' || rawStatus === 'resigned' || rawStatus === 'suspended' || rawStatus === 'csr') {
    cleanStatus = rawStatus as EmploymentStatus
  } else if (rawStatus === 'suspension') {
    cleanStatus = 'suspended'
  } else if (rawStatus === 'a' || rawStatus === 'active') {
    cleanStatus = 'active'
  } else if (rawStatus === 'r' || rawStatus === 'resigned') {
    cleanStatus = 'resigned'
  }

  // Helper for optional string fields (returns trimmed string or undefined, never dummy values)
  const getOptString = (...vals: any[]): string | undefined => {
    for (const v of vals) {
      if (v !== undefined && v !== null && typeof v === 'string') {
        const trimmed = v.trim()
        if (trimmed && trimmed !== 'not_specified' && trimmed !== 'none' && trimmed !== 'unassigned') {
          return trimmed
        }
      }
    }
    return undefined
  }

  // Helper for optional number fields (returns valid positive number or undefined)
  const getOptNumber = (...vals: any[]): number | undefined => {
    for (const v of vals) {
      if (v !== undefined && v !== null && v !== '') {
        const num = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.-]+/g, ''))
        if (!isNaN(num) && isFinite(num)) {
          return num
        }
      }
    }
    return undefined
  }

  const cleanPreferredName = getOptString(input.preferredName, input.preferred_name)
  const cleanDob = getOptString(input.dateOfBirth, input.date_of_birth, input.birthday, input.dob)
  const cleanGender = getOptString(input.gender)
  const cleanCivilStatus = getOptString(input.civilStatus, input.civil_status)

  const cleanMobile = getOptString(input.mobileNumber, input.mobile_number, input.contactNumber, input.contact_number, input.mobile)
  const cleanEmail = getOptString(input.email, input.email_address)
  const cleanAltNumber = getOptString(input.alternateNumber, input.alternate_number, input.alternateContact, input.alternate_contact)
  const cleanAddress = getOptString(input.homeAddress, input.home_address, input.address)

  const cleanEmergencyName = getOptString(input.emergencyContactName, input.emergency_contact_name, input.emergencyName)
  const cleanEmergencyRel = getOptString(input.emergencyContactRelationship, input.emergency_contact_relationship, input.emergencyRelationship)
  const cleanEmergencyNumber = getOptString(input.emergencyContactNumber, input.emergency_contact_number, input.emergencyNumber)

  const cleanHireDate = getOptString(input.hireDate, input.hire_date, input.dateHired, input.date_hired)
  const cleanContractDate = getOptString(input.contractDate, input.contract_date, input.contract)
  const cleanRegDate = getOptString(input.regularizationDate, input.regularization_date, input.dateRegularized, input.date_regularized)
  const cleanResignationDate = getOptString(input.resignationDate, input.resignation_date, input.dateResigned, input.date_resigned, input.resignedDate, input.resigned_date)

  const rawPayrollStatus = getOptString(input.payrollStatus, input.payroll_status)
  let cleanPayrollStatus: 'configured' | 'pending' | 'exempt' | undefined = undefined
  if (rawPayrollStatus === 'configured' || rawPayrollStatus === 'pending' || rawPayrollStatus === 'exempt') {
    cleanPayrollStatus = rawPayrollStatus
  }

  const rawSalaryType = getOptString(input.salaryType, input.salary_type)
  let cleanSalaryType: 'Monthly' | 'Daily' | 'Hourly' | undefined = undefined
  if (rawSalaryType === 'Monthly' || rawSalaryType === 'Daily' || rawSalaryType === 'Hourly') {
    cleanSalaryType = rawSalaryType
  }

  const cleanBasicSalary = getOptNumber(input.basicSalary, input.basic_salary, input.salaryRate, input.salary_rate)
  const cleanDailyRate = getOptNumber(input.dailyRate, input.daily_rate)
  const cleanHourlyRate = getOptNumber(input.hourlyRate, input.hourly_rate)
  const rawPayFrequency = getOptString(input.payFrequency, input.pay_frequency, input.payrollSchedule, input.payroll_schedule)
  let cleanPayFrequency: 'Semi-Monthly' | 'Monthly' | 'Weekly' | undefined = undefined
  if (rawPayFrequency === 'Semi-Monthly' || rawPayFrequency === 'Monthly' || rawPayFrequency === 'Weekly') {
    cleanPayFrequency = rawPayFrequency
  }
  const rawPaymentMethod = getOptString(input.paymentMethod, input.payment_method)
  let cleanPaymentMethod: 'Bank Transfer' | 'Cash' | 'Cheque' | undefined = undefined
  if (rawPaymentMethod === 'Bank Transfer' || rawPaymentMethod === 'Cash' || rawPaymentMethod === 'Cheque') {
    cleanPaymentMethod = rawPaymentMethod
  }
  const cleanBankName = getOptString(input.bankName, input.bank_name)
  const cleanBankAccountNumber = getOptString(input.bankAccountNumber, input.bank_account_number, input.bankAccount, input.bank_account)
  const cleanAllowances = getOptNumber(input.allowances, input.allowance)
  const cleanDeMinimis = getOptNumber(input.deMinimis, input.de_minimis)

  const cleanSalaryEffectiveDate = getOptString(input.salaryEffectiveDate, input.salary_effective_date, input.effectiveDate, input.effective_date)
  const cleanSssNumber = getOptString(input.sssNumber, input.sss_number, input.sss)
  const cleanPhilhealthNumber = getOptString(input.philhealthNumber, input.philhealth_number, input.philhealth)
  const cleanPagibigNumber = getOptString(input.pagibigNumber, input.pagibig_number, input.pagibig)
  const cleanTin = getOptString(input.tin, input.tinNumber, input.tin_number)
  const cleanTaxStatus = getOptString(input.taxStatus, input.tax_status)

  // Extract Created / Updated Dates (primitive ISO strings only)
  let cleanCreatedAt = new Date().toISOString()
  if (typeof input.createdAt === 'string' && input.createdAt) {
    cleanCreatedAt = input.createdAt
  } else if (typeof input.created_at === 'string' && input.created_at) {
    cleanCreatedAt = input.created_at
  }

  const cleanUpdatedAt = new Date().toISOString()

  const cleanPhoto = getOptString(input.photo)

  // Construct a fresh, strictly plain object literal (Object.prototype, no Vue proxies, no functions)
  const plainRecord: EmployeeRecord = {
    bioId: cleanBioId,
    employeeNumber: cleanEmpNum,
    fullName: cleanName || `User ${cleanBioId}`,
    preferredName: cleanPreferredName,
    photo: cleanPhoto,
    dateOfBirth: cleanDob,
    gender: cleanGender,
    civilStatus: cleanCivilStatus,
    mobileNumber: cleanMobile,
    email: cleanEmail,
    alternateNumber: cleanAltNumber,
    homeAddress: cleanAddress,
    emergencyContactName: cleanEmergencyName,
    emergencyContactRelationship: cleanEmergencyRel,
    emergencyContactNumber: cleanEmergencyNumber,
    location: cleanLoc,
    workGroupId: cleanWgId,
    department: cleanDept || 'Operations',
    position: cleanPos || 'Staff',
    hireDate: cleanHireDate,
    contractDate: cleanContractDate,
    regularizationDate: cleanRegDate,
    resignationDate: cleanResignationDate,
    status: cleanStatus,
    payrollStatus: cleanPayrollStatus,
    salaryType: cleanSalaryType,
    basicSalary: cleanBasicSalary,
    dailyRate: cleanDailyRate,
    hourlyRate: cleanHourlyRate,
    payFrequency: cleanPayFrequency,
    paymentMethod: cleanPaymentMethod,
    bankName: cleanBankName,
    bankAccountNumber: cleanBankAccountNumber,
    allowances: cleanAllowances,
    deMinimis: cleanDeMinimis,
    salaryEffectiveDate: cleanSalaryEffectiveDate,
    sssNumber: cleanSssNumber,
    philhealthNumber: cleanPhilhealthNumber,
    pagibigNumber: cleanPagibigNumber,
    tin: cleanTin,
    taxStatus: cleanTaxStatus,
    createdAt: cleanCreatedAt,
    updatedAt: cleanUpdatedAt
  }

  // Pre-validate structured-clone safety
  if (typeof structuredClone === 'function') {
    try {
      structuredClone(plainRecord)
    } catch (cloneErr: any) {
      throw new Error(
        `Employee record serialization validation failed for Bio ID "${cleanBioId}" (${cleanName}): ${cloneErr.message}`
      )
    }
  }

  return plainRecord
}

let notifyChangeTimer: any = null

export const employeeRepository = {
  toEmployee(rec: EmployeeRecord, wgMap?: Map<string, WorkGroupRecord>): Employee {
    const wgId = rec.workGroupId || 'wg-group-c'
    const wg = wgMap ? (wgMap.get(wgId) || wgMap.get('wg-group-c')) : workGroupRepository.getRecordByIdSync(wgId)
    return {
      id: `emp-${rec.bioId}`,
      employee_number: rec.bioId, // Core Rule: Employee ID = Bio ID
      biometric_user_id: rec.bioId,
      full_name: rec.fullName,
      preferred_name: rec.preferredName,
      photo: rec.photo !== undefined ? rec.photo : `/employee-photos/${rec.bioId}.jpg`,
      date_of_birth: rec.dateOfBirth,
      gender: rec.gender as any,
      civil_status: rec.civilStatus as any,
      mobile_number: rec.mobileNumber,
      email: rec.email,
      alternate_number: rec.alternateNumber,
      home_address: rec.homeAddress,
      emergency_contact_name: rec.emergencyContactName,
      emergency_contact_relationship: rec.emergencyContactRelationship,
      emergency_contact_number: rec.emergencyContactNumber,
      location: rec.location,
      work_group_id: wgId,
      work_group_name: wg?.name || 'Group C',
      work_group_code: wg?.code || 'C',
      department: rec.department,
      position: rec.position,
      hire_date: rec.hireDate,
      contract_date: rec.contractDate,
      regularization_date: rec.regularizationDate,
      resignation_date: rec.resignationDate,
      status: rec.status,
      payroll_status: rec.payrollStatus,
      salary_type: rec.salaryType,
      basic_salary: rec.basicSalary,
      daily_rate: rec.dailyRate,
      hourly_rate: rec.hourlyRate,
      pay_frequency: rec.payFrequency || 'Semi-Monthly',
      payment_method: rec.paymentMethod || 'Bank Transfer',
      bank_name: rec.bankName,
      bank_account_number: rec.bankAccountNumber,
      allowances: rec.allowances,
      de_minimis: rec.deMinimis,
      salary_effective_date: rec.salaryEffectiveDate,
      sss_number: rec.sssNumber,
      philhealth_number: rec.philhealthNumber,
      pagibig_number: rec.pagibigNumber,
      tin: rec.tin,
      tax_status: rec.taxStatus,
      created_at: rec.createdAt,
      updated_at: rec.updatedAt
    }
  },

  /**
   * Retrieves all employees with optional location, work group, search, & status filters
   */
  async getEmployees(params: { location?: string; workGroupId?: string; search?: string; status?: string } = {}): Promise<Employee[]> {
    await ensureInitialized()
    const wgMap = await workGroupRepository.getMap()
    let records = Array.from(employeeCache!.values())

    if (params.status && params.status !== 'all') {
      records = records.filter(e => e.status === params.status)
    }

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
    return records.map(r => this.toEmployee(r, wgMap))
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
    await workGroupRepository.getMap()
    const rec = employeeCache!.get(String(bioId).trim())
    return rec ? this.toEmployee(rec) : undefined
  },

  /**
   * Edits an employee. Bio ID is strictly permanent and read-only.
   * Updates employee profile details and persists safely to IndexedDB.
   */
  async updateEmployee(
    bioId: string,
    updates: Partial<EmployeeRecord> & {
      full_name?: string
      preferred_name?: string
      date_of_birth?: string
      civil_status?: string
      mobile_number?: string
      alternate_number?: string
      home_address?: string
      emergency_contact_name?: string
      emergency_contact_relationship?: string
      emergency_contact_number?: string
      work_group_id?: string
      hire_date?: string
      regularization_date?: string
      payroll_status?: 'configured' | 'pending' | 'exempt'
      salary_type?: 'Monthly' | 'Daily' | 'Hourly'
      basic_salary?: number
      basicSalary?: number
      daily_rate?: number
      dailyRate?: number
      hourly_rate?: number
      hourlyRate?: number
      salary_effective_date?: string
      salaryEffectiveDate?: string
      effectiveDate?: string
      effective_date?: string
      sss_number?: string
      sssNumber?: string
      philhealth_number?: string
      philhealthNumber?: string
      pagibig_number?: string
      pagibigNumber?: string
      tin?: string
      tinNumber?: string
      tin_number?: string
      tax_status?: string
      taxStatus?: string
    }
  ): Promise<Employee> {
    await ensureInitialized()
    const cleanBioId = String(bioId).trim()
    const existing = employeeCache!.get(cleanBioId)

    const record = toPersistableEmployeeRecord({
      ...existing,
      ...updates,
      bioId: cleanBioId, // Strictly permanent and read-only
      employeeNumber: cleanBioId, // Core Rule: Employee ID = Bio ID
      updatedAt: new Date().toISOString()
    })

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
    const existing = employeeCache!.get(cleanBioId)

    if (!existing) {
      const record = toPersistableEmployeeRecord({
        bioId: cleanBioId,
        employeeNumber: cleanBioId,
        fullName: name && name.trim() ? name.trim() : `User ${cleanBioId}`,
        location,
        workGroupId,
        department: 'Operations',
        position: 'Staff',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      await db.employees.put(record)
      employeeCache!.set(cleanBioId, record)
      this.notifyChange()
      return record
    } else if (name && name.trim() && existing.fullName.startsWith('User ')) {
      const record = toPersistableEmployeeRecord({
        ...existing,
        fullName: name.trim(),
        updatedAt: new Date().toISOString()
      })
      await db.employees.put(record)
      employeeCache!.set(cleanBioId, record)
      this.notifyChange()
      return record
    }

    return existing
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
      const existing = employeeCache!.get(cleanBioId)

      if (!existing) {
        const newRec = toPersistableEmployeeRecord({
          bioId: cleanBioId,
          employeeNumber: cleanBioId,
          fullName: emp.name && emp.name.trim() ? emp.name.trim() : `User ${cleanBioId}`,
          location: emp.location || 'DBB CEBU',
          workGroupId: emp.workGroupId || 'wg-group-c',
          department: 'Operations',
          position: 'Staff',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        recordsToPut.push(newRec)
        employeeCache!.set(cleanBioId, newRec)
      } else if (emp.name && emp.name.trim() && existing.fullName.startsWith('User ')) {
        const updatedRec = toPersistableEmployeeRecord({
          ...existing,
          fullName: emp.name.trim(),
          updatedAt: new Date().toISOString()
        })
        recordsToPut.push(updatedRec)
        employeeCache!.set(cleanBioId, updatedRec)
      }
    }

    if (recordsToPut.length > 0) {
      await db.employees.bulkPut(recordsToPut)
      this.notifyChange()
    }
  },

  /**
   * Generates a full preview and validation for bulk importing employee names, departments, groups, contract dates & status from Excel.
   *
   * Rules:
   * - Excel ID maps to permanent Bio ID (primary key).
   * - Bio ID cannot be duplicated.
   * - Columns are mapped strictly by header names, never by assumed position:
   *     ID -> Bio ID
   *     NAME -> Name
   *     GROUP -> Group
   *     DEPARTMENT -> Department
   *     CONTRACT DATE -> Contract Date
   *     STATUS -> Employment Status
   * - Do not shift values between columns when a field is empty.
   * - Empty Excel fields preserve existing employee values (Group, Department, Contract Date, Status).
   * - STATUS is included in change detection: if only STATUS changed, employee is reported as updated.
   * - Normalize STATUS: A -> Active, R -> Resigned, SUSPENSION -> Suspension, CSR -> CSR. Unsupported values flagged as warning.
   * - Misaligned/invalid Contract Date (e.g. 'R' in Contract Date column) flagged as warning, preserved existing.
   * - Bio ID remains immutable.
   */
  async previewImportEmployeesFromExcel(rows: any[]): Promise<PeopleImportPreviewResult> {
    await ensureInitialized()
    const workGroups = await workGroupRepository.getAll()
    const defaultGroup = await workGroupRepository.getDefault()

    const allRows: PeopleImportRowItem[] = []
    const matchedUpdated: PeopleImportMatchedRow[] = []
    const newPeople: PeopleImportNewRow[] = []
    const unknownGroups: PeopleImportUnknownGroupRow[] = []
    const invalidRows: PeopleImportInvalidRow[] = []
    const recordsToApplyMap = new Map<string, EmployeeRecord>()

    const seenBioIdsInImport = new Set<string>()

    const ID_ALIASES = ['ID', 'Bio ID', 'BioId', 'User ID', 'UserId', 'user_id', 'ID/Bio ID', 'id']
    const NAME_ALIASES = ['NAME', 'Name', 'Employee Name', 'Full Name', 'fullName', 'employee_name', 'name']
    const GROUP_ALIASES = ['GROUP', 'Group', 'Work Group', 'WorkGroup', 'Group Name', 'Group Code', 'workGroupId', 'work_group', 'group']
    const DEPT_ALIASES = ['DEPARTMENT', 'Department', 'Dept', 'DEPT', 'department', 'dept']
    const CONTRACT_DATE_ALIASES = ['CONTRACT DATE', 'Contract Date', 'ContractDate', 'CONTRACT_DATE', 'contract_date', 'contractDate', 'Contract', 'Date Hired', 'Hire Date']
    const STATUS_ALIASES = ['STATUS', 'Status', 'Employment Status', 'EMPLOYMENT STATUS', 'employment_status', 'employmentStatus', 'status']

    const matchesAlias = (header: string, aliases: string[]): boolean => {
      const cleanHeader = String(header || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
      if (!cleanHeader) return false
      return aliases.some(alias => alias.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanHeader)
    }

    const getRowField = (row: any, aliases: string[]): any => {
      if (!row || typeof row !== 'object') return undefined
      for (const alias of aliases) {
        if (alias in row && row[alias] !== undefined && row[alias] !== null) {
          return row[alias]
        }
      }
      const rowKeys = Object.keys(row)
      for (const alias of aliases) {
        const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '')
        for (const key of rowKeys) {
          const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '')
          if (cleanKey === cleanAlias) {
            if (row[key] !== undefined && row[key] !== null) {
              return row[key]
            }
          }
        }
      }
      return undefined
    }

    // Support both array of row objects and 2D array of headers + data rows
    let parsedRows: any[] = rows
    if (rows.length > 0 && Array.isArray(rows[0])) {
      const headers = (rows[0] as any[]).map(h => String(h ?? '').trim())
      const idCol = headers.findIndex(h => matchesAlias(h, ID_ALIASES))
      const nameCol = headers.findIndex(h => matchesAlias(h, NAME_ALIASES))
      const groupCol = headers.findIndex(h => matchesAlias(h, GROUP_ALIASES))
      const deptCol = headers.findIndex(h => matchesAlias(h, DEPT_ALIASES))
      const contractDateCol = headers.findIndex(h => matchesAlias(h, CONTRACT_DATE_ALIASES))
      const statusCol = headers.findIndex(h => matchesAlias(h, STATUS_ALIASES))

      parsedRows = []
      for (let r = 1; r < rows.length; r++) {
        const rowArr = rows[r]
        if (!Array.isArray(rowArr) || rowArr.length === 0) continue
        parsedRows.push({
          ID: idCol >= 0 ? rowArr[idCol] : undefined,
          NAME: nameCol >= 0 ? rowArr[nameCol] : undefined,
          GROUP: groupCol >= 0 ? rowArr[groupCol] : undefined,
          DEPARTMENT: deptCol >= 0 ? rowArr[deptCol] : undefined,
          'CONTRACT DATE': contractDateCol >= 0 ? rowArr[contractDateCol] : undefined,
          STATUS: statusCol >= 0 ? rowArr[statusCol] : undefined
        })
      }
    }

    let updatedCount = 0
    let newCount = 0
    let unchangedCount = 0
    let statusUpdatedCount = 0
    let statusActiveCount = 0
    let statusResignedCount = 0
    let statusSuspendedCount = 0
    let statusCsrCount = 0
    let unknownGroupsCount = 0
    let invalidCount = 0
    let skippedCount = 0
    let warningsCount = 0
    let errorsCount = 0

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i]
      const rowNum = i + 1

      // 1. Extract ID (Bio ID)
      const rawId = getRowField(row, ID_ALIASES)

      // 2. Extract Name
      const rawName = getRowField(row, NAME_ALIASES)
      const cleanName = rawName !== undefined && rawName !== null ? String(rawName).trim() : ''

      // 3. Extract Group
      const rawGroup = getRowField(row, GROUP_ALIASES)
      const cleanGroupStr = rawGroup !== undefined && rawGroup !== null ? String(rawGroup).trim() : ''

      // 4. Extract Department
      const rawDept = getRowField(row, DEPT_ALIASES)
      const cleanDept = rawDept !== undefined && rawDept !== null ? String(rawDept).trim() : ''

      // 5. Extract Contract Date
      const rawContractDate = getRowField(row, CONTRACT_DATE_ALIASES)
      const parsedContractDate = parseContractDate(rawContractDate)

      // 6. Extract Status
      const rawStatus = getRowField(row, STATUS_ALIASES)
      const parsedStatus = parseEmploymentStatus(rawStatus)

      const rowWarnings: string[] = []
      if (parsedContractDate && parsedContractDate.isInvalid) {
        warningsCount++
        rowWarnings.push(`Invalid/misaligned Contract Date "${parsedContractDate.raw}" - kept existing contract date`)
      }
      if (parsedStatus && parsedStatus.isUnsupported) {
        warningsCount++
        rowWarnings.push(`Unsupported Employment Status "${parsedStatus.raw}" - kept existing status`)
      }

      // Validate Bio ID existence
      if (rawId === undefined || rawId === null || String(rawId).trim() === '') {
        const item: PeopleImportRowItem = {
          rowNumber: rowNum,
          id: '-',
          name: cleanName || 'Unknown',
          group: cleanGroupStr || '-',
          department: cleanDept || '-',
          displayStatus: '—',
          isStatusChanged: false,
          action: 'SKIP',
          status: 'Invalid: Missing ID / Bio ID',
          isWarning: false,
          isError: true,
          errorReason: 'Missing ID / Bio ID'
        }
        allRows.push(item)
        invalidRows.push({
          rowNumber: rowNum,
          reason: 'Missing ID / Bio ID',
          raw: row
        })
        invalidCount++
        skippedCount++
        errorsCount++
        continue
      }

      const bioId = String(rawId).trim()

      // Guard against duplicate Bio IDs in the same import file
      if (seenBioIdsInImport.has(bioId)) {
        const item: PeopleImportRowItem = {
          rowNumber: rowNum,
          id: bioId,
          name: cleanName || `User ${bioId}`,
          group: cleanGroupStr || '-',
          department: cleanDept || '-',
          displayStatus: '—',
          isStatusChanged: false,
          action: 'SKIP',
          status: `Duplicate Bio ID "${bioId}" in import file`,
          isWarning: true,
          isError: true,
          errorReason: `Duplicate Bio ID "${bioId}" in import file`
        }
        allRows.push(item)
        invalidRows.push({
          rowNumber: rowNum,
          reason: `Duplicate Bio ID "${bioId}" in import file`,
          raw: row
        })
        invalidCount++
        skippedCount++
        errorsCount++
        continue
      }
      seenBioIdsInImport.add(bioId)

      // Resolve Work Group if provided
      let matchedWg: WorkGroup | undefined = undefined
      let hasUnknownGroup = false

      if (cleanGroupStr) {
        matchedWg = await workGroupRepository.findMatchingGroup(cleanGroupStr)
        if (!matchedWg) {
          hasUnknownGroup = true
          unknownGroupsCount++
          warningsCount++
          rowWarnings.push(`Unknown Group "${cleanGroupStr}" - kept current/default group`)
          unknownGroups.push({
            bioId,
            name: cleanName || `User ${bioId}`,
            rawGroup: cleanGroupStr,
            rowNumber: rowNum
          })
        }
      }

      const existingRecord = employeeCache!.get(bioId)

      if (existingRecord) {
        // CASE A: Existing Employee Match
        const existingWg = workGroups.find(w => w.id === (existingRecord.workGroupId || 'wg-group-c'))
        
        // Rules: If blank, do NOT erase existing values (Rule 4)
        const targetName = cleanName !== '' ? cleanName : existingRecord.fullName
        const targetDept = cleanDept !== '' ? cleanDept : (existingRecord.department || 'Operations')
        const targetWgId = matchedWg ? matchedWg.id : (existingRecord.workGroupId || 'wg-group-c')
        const targetWg = workGroups.find(w => w.id === targetWgId) || existingWg || defaultGroup

        const targetContractDate = (parsedContractDate && parsedContractDate.isValid)
          ? parsedContractDate.formatted
          : existingRecord.contractDate

        const targetStatus: EmploymentStatus = (parsedStatus && parsedStatus.isValid)
          ? parsedStatus.status!
          : existingRecord.status

        const isNameUpdated = cleanName !== '' && cleanName !== existingRecord.fullName
        const isDeptUpdated = cleanDept !== '' && cleanDept !== (existingRecord.department || '')
        const isGroupUpdated = Boolean(matchedWg && matchedWg.id !== existingRecord.workGroupId)
        const isContractDateUpdated = Boolean(
          parsedContractDate && parsedContractDate.isValid && parsedContractDate.formatted !== (existingRecord.contractDate || '')
        )
        const isStatusUpdated = Boolean(
          parsedStatus && parsedStatus.isValid && parsedStatus.status !== existingRecord.status
        )

        const hasChanges = isNameUpdated || isDeptUpdated || isGroupUpdated || isContractDateUpdated || isStatusUpdated

        if (targetStatus === 'active') statusActiveCount++
        else if (targetStatus === 'resigned') statusResignedCount++
        else if (targetStatus === 'suspended') statusSuspendedCount++
        else if (targetStatus === 'csr') statusCsrCount++

        let resignationDate = existingRecord.resignationDate
        if (targetStatus === 'resigned' && !resignationDate) {
          resignationDate = new Date().toISOString().split('T')[0]
        } else if (targetStatus === 'active' && existingRecord.status === 'resigned') {
          resignationDate = undefined
        }

        const targetRecord = toPersistableEmployeeRecord({
          ...existingRecord,
          bioId: existingRecord.bioId,
          employeeNumber: existingRecord.bioId,
          fullName: targetName,
          location: existingRecord.location,
          workGroupId: targetWgId,
          department: targetDept,
          position: existingRecord.position,
          contractDate: targetContractDate,
          status: targetStatus,
          resignationDate,
          createdAt: existingRecord.createdAt,
          updatedAt: new Date().toISOString()
        })

        if (hasChanges) {
          updatedCount++
          if (isStatusUpdated) {
            statusUpdatedCount++
          }
          recordsToApplyMap.set(bioId, targetRecord)

          const changeNotes: string[] = []
          if (isStatusUpdated) {
            changeNotes.push(`Employment Status changed: ${getStatusDisplayName(existingRecord.status)} → ${getStatusDisplayName(targetStatus)}`)
          }
          if (isNameUpdated) changeNotes.push(`Name: ${cleanName}`)
          if (isDeptUpdated) changeNotes.push(`Dept: ${cleanDept}`)
          if (isGroupUpdated) changeNotes.push(`Group: ${targetWg.name}`)
          if (isContractDateUpdated) changeNotes.push(`Contract Date: ${targetContractDate}`)

          let statusText = changeNotes.join(' • ')
          if (rowWarnings.length > 0) {
            statusText += ` (Warning: ${rowWarnings.join('; ')})`
          }

          const displayStatus = isStatusUpdated
            ? `${getStatusDisplayName(existingRecord.status)} → ${getStatusDisplayName(targetStatus)}`
            : getStatusDisplayName(existingRecord.status)

          const rowItem: PeopleImportRowItem = {
            rowNumber: rowNum,
            id: bioId,
            name: targetName,
            group: cleanGroupStr || '',
            department: targetDept,
            contractDate: targetContractDate,
            rawStatus: rawStatus !== undefined && rawStatus !== null ? String(rawStatus).trim() : undefined,
            displayStatus,
            previousStatus: existingRecord.status,
            newStatus: targetStatus,
            isStatusChanged: isStatusUpdated,
            action: 'UPDATE',
            status: statusText,
            isWarning: hasUnknownGroup || rowWarnings.length > 0,
            isError: false,
            warningReason: rowWarnings.length > 0 ? rowWarnings.join('; ') : (hasUnknownGroup ? `Unknown Group "${cleanGroupStr}" - kept current group` : undefined),
            targetRecord
          }
          allRows.push(rowItem)

          matchedUpdated.push({
            bioId,
            existingName: existingRecord.fullName,
            newName: targetName,
            existingGroup: existingWg?.name || existingRecord.workGroupId,
            newGroup: targetWg.name,
            existingDept: existingRecord.department || '',
            newDept: targetDept,
            existingStatus: existingRecord.status,
            newStatus: targetStatus,
            isNameUpdated,
            isGroupUpdated,
            isDeptUpdated,
            isStatusUpdated,
            existingContractDate: existingRecord.contractDate,
            newContractDate: targetContractDate,
            isContractDateUpdated,
            targetRecord
          })
        } else {
          unchangedCount++
          const rawStatusStr = rawStatus !== undefined && rawStatus !== null ? String(rawStatus).trim() : ''
          const displayStatus = (rawStatusStr !== '' && parsedStatus && parsedStatus.isValid)
            ? `${rawStatusStr.toUpperCase()} → ${getStatusDisplayName(existingRecord.status)}`
            : getStatusDisplayName(existingRecord.status)
          let statusText = 'No changes'
          if (rowWarnings.length > 0) {
            statusText = `No changes (Warning: ${rowWarnings.join('; ')})`
          } else if (hasUnknownGroup) {
            statusText = `No changes (Warning: Unknown group "${cleanGroupStr}")`
          }

          const rowItem: PeopleImportRowItem = {
            rowNumber: rowNum,
            id: bioId,
            name: existingRecord.fullName,
            group: cleanGroupStr || '',
            department: existingRecord.department || 'Operations',
            contractDate: existingRecord.contractDate,
            rawStatus: rawStatus !== undefined && rawStatus !== null ? String(rawStatus).trim() : undefined,
            displayStatus,
            previousStatus: existingRecord.status,
            newStatus: existingRecord.status,
            isStatusChanged: false,
            action: 'UNCHANGED',
            status: statusText,
            isWarning: hasUnknownGroup || rowWarnings.length > 0,
            isError: false,
            warningReason: rowWarnings.length > 0 ? rowWarnings.join('; ') : (hasUnknownGroup ? `Unknown Group "${cleanGroupStr}"` : undefined)
          }
          allRows.push(rowItem)
        }
      } else {
        // CASE B: New Employee Record
        newCount++
        const targetName = cleanName !== '' ? cleanName : `User ${bioId}`
        const targetDept = cleanDept !== '' ? cleanDept : 'Operations'
        const targetWg = matchedWg || defaultGroup
        const targetWgId = targetWg.id
        const targetContractDate = (parsedContractDate && parsedContractDate.isValid)
          ? parsedContractDate.formatted
          : undefined
        const targetStatus: EmploymentStatus = (parsedStatus && parsedStatus.isValid)
          ? parsedStatus.status!
          : 'active'

        if (targetStatus === 'active') statusActiveCount++
        else if (targetStatus === 'resigned') statusResignedCount++
        else if (targetStatus === 'suspended') statusSuspendedCount++
        else if (targetStatus === 'csr') statusCsrCount++

        let resignationDate: string | undefined = undefined
        if (targetStatus === 'resigned') {
          resignationDate = new Date().toISOString().split('T')[0]
        }

        const targetRecord = toPersistableEmployeeRecord({
          bioId,
          employeeNumber: bioId,
          fullName: targetName,
          location: 'DBB CEBU',
          workGroupId: targetWgId,
          department: targetDept,
          position: 'Staff',
          contractDate: targetContractDate,
          status: targetStatus,
          resignationDate,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })

        recordsToApplyMap.set(bioId, targetRecord)

        let statusText = 'New employee'
        if (hasUnknownGroup) {
          statusText += ` (Warning: Unknown group "${cleanGroupStr}" - assigned ${defaultGroup.name})`
        }
        if (rowWarnings.length > 0) {
          statusText += ` (Warning: ${rowWarnings.join('; ')})`
        }

        const displayStatus = (parsedStatus && parsedStatus.raw && parsedStatus.isValid)
          ? `${parsedStatus.raw.toUpperCase()} → ${getStatusDisplayName(targetStatus)}`
          : getStatusDisplayName(targetStatus)

        const rowItem: PeopleImportRowItem = {
          rowNumber: rowNum,
          id: bioId,
          name: targetName,
          group: cleanGroupStr || '',
          department: targetDept,
          contractDate: targetContractDate,
          rawStatus: rawStatus !== undefined && rawStatus !== null ? String(rawStatus).trim() : undefined,
          displayStatus,
          previousStatus: undefined,
          newStatus: targetStatus,
          isStatusChanged: false,
          action: 'CREATE',
          status: statusText,
          isWarning: hasUnknownGroup || rowWarnings.length > 0,
          isError: false,
          warningReason: rowWarnings.length > 0 ? rowWarnings.join('; ') : (hasUnknownGroup ? `Unknown Group "${cleanGroupStr}" - assigned ${defaultGroup.name}` : undefined),
          targetRecord
        }
        allRows.push(rowItem)

        newPeople.push({
          bioId,
          name: targetName,
          group: targetWg.name,
          department: targetDept,
          contractDate: targetContractDate,
          status: targetStatus,
          location: 'DBB CEBU',
          targetRecord
        })
      }
    }

    return {
      totalRows: parsedRows.length,
      updatedCount,
      newCount,
      statusUpdatedCount,
      statusActiveCount,
      statusResignedCount,
      statusSuspendedCount,
      statusCsrCount,
      unchangedCount,
      unknownGroupsCount,
      invalidCount,
      skippedCount,
      warningsCount,
      errorsCount,
      allRows,
      recordsToApply: Array.from(recordsToApplyMap.values()),
      matchedUpdatedCount: updatedCount,
      newPeopleCount: newCount,
      matchedUpdated,
      newPeople,
      unknownGroups,
      invalidRows
    }
  },

  /**
   * Applies validated import changes directly to IndexedDB
   */
  async applyBulkEmployeeImport(
    records: EmployeeRecord[],
    preview?: PeopleImportPreviewResult
  ): Promise<PeopleImportApplyResult> {
    await ensureInitialized()
    if (!records || records.length === 0) {
      return {
        updatedCount: 0,
        createdCount: 0,
        statusUpdatedCount: 0,
        statusActiveCount: preview?.statusActiveCount || 0,
        statusResignedCount: preview?.statusResignedCount || 0,
        statusSuspendedCount: preview?.statusSuspendedCount || 0,
        statusCsrCount: preview?.statusCsrCount || 0,
        unchangedCount: preview?.unchangedCount || 0,
        skippedCount: preview?.skippedCount || 0,
        warningsCount: preview?.warningsCount || 0,
        errorsCount: preview?.errorsCount || 0,
        totalProcessed: 0
      }
    }

    // Step 1: Explicit Serialization Boundary
    // Guarantee that every record is converted to a plain, structured-clone-safe object
    const sanitizedRecords: EmployeeRecord[] = []
    for (let i = 0; i < records.length; i++) {
      const rec = records[i]
      try {
        const plainRec = toPersistableEmployeeRecord(rec)
        sanitizedRecords.push(plainRec)
      } catch (err: any) {
        throw new Error(
          `Failed to serialize employee at row ${i + 1}:\nBio ID: ${rec?.bioId ?? 'unknown'}\nName: ${rec?.fullName ?? (rec as any)?.name ?? 'unknown'}\nIssue: ${err.message}`
        )
      }
    }

    // Step 2: Persist into IndexedDB with diagnostic itemized verification if put fails
    try {
      await db.employees.bulkPut(sanitizedRecords)
    } catch (bulkError: any) {
      for (const rec of sanitizedRecords) {
        try {
          await db.employees.put(rec)
        } catch (singleErr: any) {
          throw new Error(
            `Failed to save employee:\nBio ID: ${rec.bioId}\nName: ${rec.fullName}\nField details: Dept=${rec.department}, Group=${rec.workGroupId}\nUnderlying error: ${singleErr.message || singleErr}`
          )
        }
      }
      throw bulkError
    }

    // Step 3: Update local memory cache with the sanitized plain records
    let createdCount = 0
    let updatedCount = 0

    for (const rec of sanitizedRecords) {
      if (employeeCache!.has(rec.bioId)) {
        updatedCount++
      } else {
        createdCount++
      }
      employeeCache!.set(rec.bioId, rec)
    }

    this.notifyChange()

    return {
      updatedCount: preview ? preview.updatedCount : updatedCount,
      createdCount: preview ? preview.newCount : createdCount,
      statusUpdatedCount: preview ? preview.statusUpdatedCount : 0,
      statusActiveCount: preview ? preview.statusActiveCount : 0,
      statusResignedCount: preview ? preview.statusResignedCount : 0,
      statusSuspendedCount: preview ? preview.statusSuspendedCount : 0,
      statusCsrCount: preview ? preview.statusCsrCount : 0,
      unchangedCount: preview ? preview.unchangedCount : 0,
      skippedCount: preview ? preview.skippedCount : 0,
      warningsCount: preview ? preview.warningsCount : 0,
      errorsCount: preview ? preview.errorsCount : 0,
      totalProcessed: sanitizedRecords.length
    }
  },

  /**
   * Generates formatted data for Excel/CSV export of People Directory
   */
  async getAllForExport(): Promise<any[]> {
    const employees = await this.getEmployees()
    return employees.map(emp => ({
      'ID': emp.biometric_user_id,
      'NAME': emp.full_name,
      'GROUP': emp.work_group_code || (emp.work_group_name?.replace(/^Group\s*/i, '') || 'C'),
      'DEPARTMENT': emp.department || 'Operations',
      'LOCATION': emp.location,
      'POSITION': emp.position || 'Staff',
      'STATUS': getStatusDisplayName(emp.status),
      'CONTRACT DATE': emp.contract_date || '',
      'MOBILE': emp.mobile_number || '',
      'EMAIL': emp.email || '',
      'BIRTHDAY': emp.date_of_birth || '',
      'DATE_HIRED': emp.hire_date || '',
      'DATE_RESIGNED': emp.resignation_date || ''
    }))
  },

  onChange(cb: () => void): () => void {
    changeListeners.add(cb)
    return () => changeListeners.delete(cb)
  },

  notifyChange() {
    if (notifyChangeTimer) {
      clearTimeout(notifyChangeTimer)
    }
    notifyChangeTimer = setTimeout(() => {
      notifyChangeTimer = null
      for (const cb of changeListeners) {
        try {
          cb()
        } catch {
          // ignore
        }
      }
    }, 60)
  },

  async count(): Promise<number> {
    await ensureInitialized()
    return employeeCache!.size
  },

  async countActive(): Promise<number> {
    await ensureInitialized()
    let count = 0
    for (const emp of employeeCache!.values()) {
      if (emp.status !== 'resigned') count++
    }
    return count
  }
}
