/**
 * Master Employee Directory Service
 *
 * Implements:
 * - Bio ID (biometric_user_id) as permanent, immutable identifier
 * - Editable Employee Name and Location (DMBB CEBU, DBB CEBU, DBB NEGROS, DBB ILOILO)
 * - Single source of truth for employee names & locations across all attendance views
 * - High-speed lookups (Map indexed by Bio ID)
 * - Local persistence (dmbbhr_master_employees_v2)
 */

import type { Employee, EmployeeLocation } from '@/types'

export const VALID_LOCATIONS: EmployeeLocation[] = [
  'DMBB CEBU',
  'DBB CEBU',
  'DBB NEGROS',
  'DBB ILOILO'
]

const STORAGE_KEY = 'dmbbhr_master_employees_v2'

// Initial seed profiles (synced from known B-29b users)
const DEFAULT_EMPLOYEES: Employee[] = [
  {
    id: 'emp-50044',
    employee_number: 'EMP-50044',
    biometric_user_id: '50044',
    full_name: 'B Basalo, Randy',
    location: 'DBB CEBU',
    department: 'Operations',
    position: 'Staff',
    status: 'active'
  },
  {
    id: 'emp-5007',
    employee_number: 'EMP-5007',
    biometric_user_id: '5007',
    full_name: 'A Abella, Jebjeb',
    location: 'DBB CEBU',
    department: 'Operations',
    position: 'Staff',
    status: 'active'
  },
  {
    id: 'emp-50113',
    employee_number: 'EMP-50113',
    biometric_user_id: '50113',
    full_name: 'A Aligway, Nicasio',
    location: 'DBB CEBU',
    department: 'Operations',
    position: 'Staff',
    status: 'active'
  },
  {
    id: 'emp-50062',
    employee_number: 'EMP-50062',
    biometric_user_id: '50062',
    full_name: 'B Baricuatro, Tonton',
    location: 'DBB CEBU',
    department: 'Operations',
    position: 'Staff',
    status: 'active'
  },
  {
    id: 'emp-50059',
    employee_number: 'EMP-50059',
    biometric_user_id: '50059',
    full_name: 'C Repompo, Raffy',
    location: 'DBB CEBU',
    department: 'Operations',
    position: 'Staff',
    status: 'active'
  },
  {
    id: 'emp-50039',
    employee_number: 'EMP-50039',
    biometric_user_id: '50039',
    full_name: 'D Baclaan Jr, Victoriano',
    location: 'DBB CEBU',
    department: 'Operations',
    position: 'Staff',
    status: 'active'
  },
  {
    id: 'emp-50052',
    employee_number: 'EMP-50052',
    biometric_user_id: '50052',
    full_name: 'D Canceran, Eduard',
    location: 'DBB CEBU',
    department: 'Operations',
    position: 'Staff',
    status: 'active'
  },
  {
    id: 'emp-50071',
    employee_number: 'EMP-50071',
    biometric_user_id: '50071',
    full_name: 'D Catampatan, Edgardo',
    location: 'DBB CEBU',
    department: 'Operations',
    position: 'Staff',
    status: 'active'
  },
  {
    id: 'emp-10001',
    employee_number: 'EMP-10001',
    biometric_user_id: '10001',
    full_name: 'D Cuizon, Roberto',
    location: 'DBB CEBU',
    department: 'Operations',
    position: 'Staff',
    status: 'active'
  },
  {
    id: 'emp-50065',
    employee_number: 'EMP-50065',
    biometric_user_id: '50065',
    full_name: 'D Villarta Melquiades',
    location: 'DBB CEBU',
    department: 'Operations',
    position: 'Staff',
    status: 'active'
  },
  {
    id: 'emp-50060',
    employee_number: 'EMP-50060',
    biometric_user_id: '50060',
    full_name: 'E Basalo, Juniemar',
    location: 'DBB CEBU',
    department: 'Operations',
    position: 'Staff',
    status: 'active'
  }
]

// In-memory cache for O(1) Bio ID lookup
const employeeMap = new Map<string, Employee>()
const changeListeners = new Set<() => void>()

function loadStore(): Employee[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch {
    // fallback
  }
  return [...DEFAULT_EMPLOYEES]
}

function saveStore(employees: Employee[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(employees))
  } catch {
    // ignore
  }
}

// Initialize memory cache
const initialEmployees = loadStore()
for (const emp of initialEmployees) {
  employeeMap.set(emp.biometric_user_id, emp)
}

export const employeeService = {
  /**
   * Returns all employees, with optional location and search filtering
   */
  async getEmployees(params: { location?: string; search?: string } = {}): Promise<Employee[]> {
    let list = Array.from(employeeMap.values())

    if (params.location && params.location !== 'all') {
      list = list.filter(e => e.location === params.location)
    }

    if (params.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase()
      list = list.filter(e =>
        e.full_name.toLowerCase().includes(q) ||
        e.biometric_user_id.toLowerCase().includes(q) ||
        e.employee_number.toLowerCase().includes(q) ||
        (e.department && e.department.toLowerCase().includes(q))
      )
    }

    // Sort alphabetically by full_name
    list.sort((a, b) => a.full_name.localeCompare(b.full_name))
    return list
  },

  /**
   * Fast O(1) lookup by Bio ID
   */
  getEmployeeByBioId(bioId: string): Employee | undefined {
    return employeeMap.get(String(bioId).trim())
  },

  /**
   * Fast lookup map for batch operations
   */
  getEmployeeMap(): Map<string, Employee> {
    return employeeMap
  },

  /**
   * Edits an employee. Bio ID is strictly permanent and read-only.
   * Updates Employee Name and Location.
   */
  async updateEmployee(
    bioId: string,
    updates: { full_name: string; location: EmployeeLocation; department?: string; position?: string }
  ): Promise<Employee> {
    const cleanBioId = String(bioId).trim()
    let emp = employeeMap.get(cleanBioId)

    if (!emp) {
      // Create new if not yet registered
      emp = {
        id: `emp-${cleanBioId}`,
        employee_number: `EMP-${cleanBioId}`,
        biometric_user_id: cleanBioId,
        full_name: updates.full_name.trim() || `User ${cleanBioId}`,
        location: updates.location || 'DBB CEBU',
        department: updates.department || 'Operations',
        position: updates.position || 'Staff',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      employeeMap.set(cleanBioId, emp)
    } else {
      // Update existing. Note: biometric_user_id is NEVER modified!
      emp.full_name = updates.full_name.trim() || emp.full_name
      emp.location = updates.location || emp.location
      if (updates.department) emp.department = updates.department
      if (updates.position) emp.position = updates.position
      emp.updated_at = new Date().toISOString()
    }

    saveStore(Array.from(employeeMap.values()))
    this.notifyChange()

    return emp
  },

  /**
   * Automatically registers or updates a user from biometric sync/registry
   */
  registerFromBiometric(bioId: string, name?: string, location: EmployeeLocation = 'DBB CEBU'): Employee {
    const cleanBioId = String(bioId).trim()
    let emp = employeeMap.get(cleanBioId)

    if (!emp) {
      emp = {
        id: `emp-${cleanBioId}`,
        employee_number: `EMP-${cleanBioId}`,
        biometric_user_id: cleanBioId,
        full_name: name && name.trim() ? name.trim() : `User ${cleanBioId}`,
        location,
        department: 'Operations',
        position: 'Staff',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      employeeMap.set(cleanBioId, emp)
      saveStore(Array.from(employeeMap.values()))
      this.notifyChange()
    } else if (name && name.trim() && emp.full_name.startsWith('User ')) {
      // Upgrade auto-generated placeholder name if real name becomes available from device
      emp.full_name = name.trim()
      emp.updated_at = new Date().toISOString()
      saveStore(Array.from(employeeMap.values()))
      this.notifyChange()
    }

    return emp
  },

  onEmployeesChanged(callback: () => void) {
    changeListeners.add(callback)
    return () => changeListeners.delete(callback)
  },

  notifyChange() {
    for (const listener of changeListeners) {
      try {
        listener()
      } catch {
        // ignore
      }
    }
  }
}
