/**
 * Master Employee Directory Service
 *
 * Implements:
 * - Bio ID (biometric_user_id) as permanent, immutable identifier
 * - Editable Employee Name, Location, and Work Group
 * - Persistent storage in IndexedDB (survives browser refresh and dev restarts)
 * - Work Group integration (GROUP A: 6am-3pm, GROUP B: 7am-4pm, GROUP C: 8am-5pm)
 */

import type { Employee, EmployeeLocation } from '@/types'
import { employeeRepository, VALID_LOCATIONS } from '@/repositories/employeeRepository'
import { workGroupRepository } from '@/repositories/workGroupRepository'

export { VALID_LOCATIONS }

export const employeeService = {
  /**
   * Returns all employees, with optional location, work group, and search filtering
   */
  async getEmployees(params: { location?: string; workGroupId?: string; search?: string } = {}): Promise<Employee[]> {
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
   * Gets all available Work Groups
   */
  async getWorkGroups() {
    return workGroupRepository.getAll()
  },

  /**
   * Edits an employee. Bio ID is strictly permanent and read-only.
   * Updates Employee Name, Location, and Work Group.
   */
  async updateEmployee(
    bioId: string,
    updates: { full_name: string; location: EmployeeLocation; work_group_id?: string; department?: string; position?: string }
  ): Promise<Employee> {
    return employeeRepository.updateEmployee(bioId, {
      fullName: updates.full_name,
      location: updates.location,
      workGroupId: updates.work_group_id,
      department: updates.department,
      position: updates.position
    })
  },

  /**
   * Automatically registers or updates a user from biometric sync/registry
   */
  async registerFromBiometric(bioId: string, name?: string, location: EmployeeLocation = 'DBB CEBU', workGroupId: string = 'wg-group-c') {
    return employeeRepository.registerFromPunch(bioId, name, location, workGroupId)
  },

  onEmployeesChanged(callback: () => void) {
    return employeeRepository.onChange(callback)
  },

  notifyChange() {
    employeeRepository.notifyChange()
  }
}
