/**
 * Attendance Data Layer & Service
 *
 * Implements:
 * - Direct delegation to PunchRepository, AttendanceRepository, and WorkGroupRepository
 * - Persistent storage in IndexedDB via Dexie
 * - Fast single-date O(log N) indexed queries for Daily Attendance
 * - Paginated queries for Attendance Logs without loading 100k+ records into Vue reactivity
 * - Dynamic Work Group schedule evaluation (GROUP A: 6am-3pm, GROUP B: 7am-4pm, GROUP C: 8am-5pm)
 * - Clean status, late minutes, and early out processing
 */

import type { AttendanceLog, AttendanceFilterParams, PaginationMeta } from '@/types'
import {
  getManilaDateString,
  formatManilaTime,
  type DailyAttendanceRecord,
  type AttendanceEngineConfig
} from './attendanceEngine'
import {
  punchRepository,
  attendanceRepository,
  workGroupRepository,
  manualAttendanceRepository
} from '@/repositories'

export { getManilaDateString, formatManilaTime, type DailyAttendanceRecord, type AttendanceEngineConfig }

export const attendanceService = {
  /**
   * Fetches paginated raw attendance logs from persistent IndexedDB.
   */
  async getLogs(params: AttendanceFilterParams = {}): Promise<{ logs: AttendanceLog[]; meta: PaginationMeta }> {
    return punchRepository.getLogs(params)
  },

  /**
   * Generates Daily Attendance for a given date with Location & Work Group filters.
   */
  async getDailyAttendance(
    targetDate?: string,
    locationFilter: string = 'all',
    workGroupFilter: string = 'all',
    customConfig: Partial<AttendanceEngineConfig> = {}
  ): Promise<DailyAttendanceRecord[]> {
    return attendanceRepository.getDailyAttendance(targetDate, locationFilter, workGroupFilter, customConfig)
  },

  /**
   * Saves an approved manual / paper request adjustment
   */
  async saveManualAdjustment(data: {
    bioId: string
    date: string
    manualIn?: string
    manualOut?: string
    reason: string
    approvedBy?: string
  }) {
    return manualAttendanceRepository.saveAdjustment(data)
  },

  /**
   * Deletes a manual adjustment
   */
  async deleteManualAdjustment(bioId: string, date: string) {
    return manualAttendanceRepository.deleteAdjustment(bioId, date)
  },

  /**
   * Replaces or merges real logs from biometric sync or Excel into persistent IndexedDB.
   */
  async setDeviceLogs(deviceLogs: AttendanceLog[]): Promise<void> {
    if (!Array.isArray(deviceLogs) || deviceLogs.length === 0) return
    await punchRepository.bulkImport(deviceLogs, 'biometric_sync')
  },

  /**
   * Adds a newly arrived live biometric scan into persistent IndexedDB.
   */
  async addRealScan(newLog: AttendanceLog): Promise<boolean> {
    return punchRepository.addPunch(newLog)
  },

  /**
   * Returns count of total stored punches in IndexedDB.
   */
  async getStoredCount(): Promise<number> {
    return punchRepository.count()
  },

  /**
   * Fetches all matching logs for spreadsheet export.
   */
  async getAllFilteredLogsForExport(params: AttendanceFilterParams = {}): Promise<AttendanceLog[]> {
    const res = await punchRepository.getLogs({ ...params, page: 1, pageSize: 999999 })
    return res.logs
  },

  /**
   * Chunked Excel/CSV import with progress reporting and duplicate detection.
   */
  async importLogsChunked(
    rawRecords: Partial<AttendanceLog>[],
    filename: string = 'biometric_import.xlsx',
    onProgress?: (processed: number, total: number) => void
  ): Promise<{ importedCount: number; duplicateCount: number; invalidCount: number; chunkCount: number }> {
    const res = await punchRepository.bulkImport(rawRecords, filename, onProgress)
    return {
      importedCount: res.importedCount,
      duplicateCount: res.duplicateCount,
      invalidCount: res.invalidCount,
      chunkCount: res.batchCount
    }
  },

  /**
   * Gets available Work Groups for filtering & schedules
   */
  async getWorkGroups() {
    return workGroupRepository.getAll()
  },

  /**
   * Clears all stored attendance punches with confirmation
   */
  async clearAllLogs(): Promise<void> {
    await punchRepository.clearAll()
  }
}
