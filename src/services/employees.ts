/**
 * Master Employee Directory Service
 *
 * Implements:
 * - Bio ID (biometric_user_id) as permanent, immutable identifier
 * - Editable Employee Name and Location (DMBB CEBU, DBB CEBU, DBB NEGROS, DBB ILOILO)
 * - Persistent storage in IndexedDB (survives browser refresh and dev restarts)
 * - High-speed lookups and reactivity
 */

import type { Employee, EmployeeLocation } from '@/types'
import { employeeRepository, VALID_LOCATIONS } from '@/repositories/employeeRepository'

export { VALID_LOCATIONS }

export const employeeService = {
  /**
   * Returns all employees, with optional location and search filtering
   */
  async getEmployees(params: { location?: string; search?: string } = {}): Promise<Employee[]> {
    return employeeRepository.getEmployees(params)
  },

  /**
   * Fast lookup by Bio ID
   */
  async getEmployeeByBioId(bioId: string): Promise<Employee | undefined> {
    return employeeRepository.getByBioId(bioId)
  },

  /**
   * Fast lookup map for batch operations
   */
  async getEmployeeMap() {
    return employeeRepository.getEmployeeMap()
  },

  /**
   * Edits an employee. Bio ID is strictly permanent and read-only.
   * Updates Employee Name and Location.
   */
  async updateEmployee(
    bioId: string,
    updates: { full_name: string; location: EmployeeLocation; department?: string; position?: string }
  ): Promise<Employee> {
    return employeeRepository.updateEmployee(bioId, {
      fullName: updates.full_name,
      location: updates.location,
      department: updates.department,
      position: updates.position
    })
  },

  /**
   * Automatically registers or updates a user from biometric sync/registry
   */
  async registerFromBiometric(bioId: string, name?: string, location: EmployeeLocation = 'DBB CEBU') {
    return employeeRepository.registerFromPunch(bioId, name, location)
  },

  onEmployeesChanged(callback: () => void) {
    return employeeRepository.onChange(callback)
  },

  notifyChange() {
    employeeRepository.notifyChange()
  }
}
