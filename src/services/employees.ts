import type { Employee } from '@/types'
import { SEED_EMPLOYEES } from './seedData'

const EMPLOYEES_STORAGE_KEY = 'dmbbhr_employees'

function getStoredEmployees(): Employee[] {
  try {
    const raw = localStorage.getItem(EMPLOYEES_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // fallback
  }
  return [...SEED_EMPLOYEES]
}

export const employeeService = {
  getEmployees(locationId?: string): Promise<Employee[]> {
    return new Promise((resolve) => {
      const all = getStoredEmployees()
      if (locationId && locationId !== 'all') {
        resolve(all.filter(e => e.location_id === locationId))
      } else {
        resolve(all)
      }
    })
  },

  getEmployeeById(id: string): Promise<Employee | null> {
    return new Promise((resolve) => {
      const emp = getStoredEmployees().find(e => e.id === id || e.biometric_user_id === id)
      resolve(emp || null)
    })
  },

  saveEmployees(employees: Employee[]): void {
    localStorage.setItem(EMPLOYEES_STORAGE_KEY, JSON.stringify(employees))
  }
}
