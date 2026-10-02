/**
 * Master Employee Directory & Work Group Service
 *
 * Implements:
 * - Bio ID (biometric_user_id) as permanent, immutable identifier
 * - Bulk Excel import of Employee names and Work Groups with full interactive preview
 * - Editable Employee Name, Location, and Work Group
 * - Full canonical Work Group management (Add/Edit/Delete with deletion protection)
 * - Persistent storage in IndexedDB
 */

import type { Employee, EmployeeLocation, WorkGroup } from '@/types'
import {
  employeeRepository,
  VALID_LOCATIONS,
  type PeopleImportPreviewResult,
  type PeopleImportRowItem,
  type PeopleImportApplyResult
} from '@/repositories/employeeRepository'
import { workGroupRepository } from '@/repositories/workGroupRepository'

export { VALID_LOCATIONS }
export type { PeopleImportPreviewResult, PeopleImportRowItem, PeopleImportApplyResult }

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
  async getWorkGroups(): Promise<WorkGroup[]> {
    return workGroupRepository.getAll()
  },

  /**
   * Gets single Work Group by ID
   */
  async getWorkGroupById(id: string): Promise<WorkGroup | undefined> {
    return workGroupRepository.getById(id)
  },

  /**
   * Saves or updates a Work Group with validation
   */
  async saveWorkGroup(data: Partial<WorkGroup> & { name: string; code: string }): Promise<WorkGroup> {
    const wg = await workGroupRepository.saveWorkGroup(data)
    employeeRepository.notifyChange()
    return wg
  },

  /**
   * Deletes a Work Group with protection against in-use groups
   */
  async deleteWorkGroup(id: string): Promise<void> {
    await workGroupRepository.deleteWorkGroup(id)
    employeeRepository.notifyChange()
  },

  /**
   * Reassigns employees to a target group and deletes the old group
   */
  async reassignAndDeleteWorkGroup(fromId: string, toId: string) {
    const res = await workGroupRepository.reassignAndDeleteWorkGroup(fromId, toId)
    employeeRepository.notifyChange()
    return res
  },

  /**
   * Gets the number of employees assigned to a Work Group
   */
  async getAssignedEmployeeCount(workGroupId: string): Promise<number> {
    return workGroupRepository.getAssignedEmployeeCount(workGroupId)
  },

  /**
   * Fast batch lookup of assigned employee counts across all Work Groups
   */
  async getAllAssignedEmployeeCounts(): Promise<Record<string, number>> {
    return workGroupRepository.getAllAssignedEmployeeCounts()
  },

  /**
   * Edits an employee. Bio ID is strictly permanent and read-only.
   * Updates Employee Profile details and persists to IndexedDB.
   */
  async updateEmployee(
    bioId: string,
    updates: Partial<Employee> & {
      fullName?: string
      workGroupId?: string
      preferredName?: string
      dateOfBirth?: string
      civilStatus?: string
      mobileNumber?: string
      alternateNumber?: string
      homeAddress?: string
      emergencyContactName?: string
      emergencyContactRelationship?: string
      emergencyContactNumber?: string
      hireDate?: string
      regularizationDate?: string
      payrollStatus?: 'configured' | 'pending' | 'exempt'
      salaryType?: 'Monthly' | 'Daily' | 'Hourly'
    }
  ): Promise<Employee> {
    return employeeRepository.updateEmployee(bioId, {
      fullName: updates.full_name ?? updates.fullName,
      preferredName: updates.preferred_name ?? updates.preferredName,
      dateOfBirth: updates.date_of_birth ?? updates.dateOfBirth,
      gender: updates.gender,
      civilStatus: updates.civil_status ?? updates.civilStatus,
      mobileNumber: updates.mobile_number ?? updates.mobileNumber,
      email: updates.email,
      alternateNumber: updates.alternate_number ?? updates.alternateNumber,
      homeAddress: updates.home_address ?? updates.homeAddress,
      emergencyContactName: updates.emergency_contact_name ?? updates.emergencyContactName,
      emergencyContactRelationship: updates.emergency_contact_relationship ?? updates.emergencyContactRelationship,
      emergencyContactNumber: updates.emergency_contact_number ?? updates.emergencyContactNumber,
      location: updates.location,
      workGroupId: updates.work_group_id ?? updates.workGroupId,
      department: updates.department,
      position: updates.position,
      hireDate: updates.hire_date ?? updates.hireDate,
      regularizationDate: updates.regularization_date ?? updates.regularizationDate,
      status: updates.status,
      payrollStatus: updates.payroll_status ?? updates.payrollStatus,
      salaryType: updates.salary_type ?? updates.salaryType
    })
  },

  /**
   * Generates preview and validation for bulk Excel employee import
   */
  async previewImportFromExcel(rows: any[]): Promise<PeopleImportPreviewResult> {
    return employeeRepository.previewImportEmployeesFromExcel(rows)
  },

  /**
   * Applies validated Excel import records to the database
   */
  async applyImport(preview: PeopleImportPreviewResult): Promise<PeopleImportApplyResult> {
    return employeeRepository.applyBulkEmployeeImport(preview.recordsToApply, preview)
  },

  /**
   * Gets formatted data for People Directory Excel export
   */
  async getExportData(): Promise<any[]> {
    return employeeRepository.getAllForExport()
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
