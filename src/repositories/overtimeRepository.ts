import { db, type OvertimeAuthorizationRecord } from '@/db'

export const overtimeRepository = {
  /**
   * Retrieves an overtime authorization record by ID
   */
  async getOvertime(id: string): Promise<OvertimeAuthorizationRecord | undefined> {
    return db.overtimeAuthorizations.get(id)
  },

  /**
   * Retrieves approved overtime authorization for a specific employee and date.
   * Strictly returns undefined if status is NOT 'Approved'.
   */
  async getApprovedOvertime(bioId: string, date: string): Promise<OvertimeAuthorizationRecord | undefined> {
    const records = await db.overtimeAuthorizations
      .where('[bioId+date]')
      .equals([bioId, date])
      .toArray()
    return records.find(r => r.status === 'Approved')
  },

  /**
   * Retrieves all approved overtime authorizations for an employee within a date range
   */
  async getApprovedOvertimeForEmployeeAndPeriod(
    bioId: string,
    startDate: string,
    endDate: string
  ): Promise<OvertimeAuthorizationRecord[]> {
    const list = await db.overtimeAuthorizations
      .where('bioId')
      .equals(bioId)
      .filter(r => r.status === 'Approved' && r.date >= startDate && r.date <= endDate)
      .toArray()
    return list.sort((a, b) => a.date.localeCompare(b.date))
  },

  /**
   * Builds an O(1) lookup map of approved overtime authorizations for a list of dates.
   * Key: `${bioId.toLowerCase()}_${date}`
   */
  async getApprovedOvertimeMapForDates(dates: string[]): Promise<Map<string, OvertimeAuthorizationRecord>> {
    const dateSet = new Set(dates)
    const records = await db.overtimeAuthorizations
      .filter(r => r.status === 'Approved' && dateSet.has(r.date))
      .toArray()

    const map = new Map<string, OvertimeAuthorizationRecord>()
    for (const r of records) {
      const key = `${r.bioId.trim().toLowerCase()}_${r.date}`
      map.set(key, r)
    }
    return map
  },

  /**
   * Retrieves all overtime authorization records with optional filtering
   */
  async getAll(statusFilter: string = 'all'): Promise<OvertimeAuthorizationRecord[]> {
    let list: OvertimeAuthorizationRecord[] = []
    if (statusFilter && statusFilter !== 'all') {
      list = await db.overtimeAuthorizations.where('status').equals(statusFilter).toArray()
    } else {
      list = await db.overtimeAuthorizations.toArray()
    }
    return list.sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime())
  },

  /**
   * Saves or updates an overtime authorization record
   */
  async saveAuthorization(record: OvertimeAuthorizationRecord): Promise<void> {
    const now = new Date().toISOString()
    const cleanRecord: OvertimeAuthorizationRecord = {
      ...record,
      id: record.id || `ot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      bioId: String(record.bioId).trim(),
      date: record.date.trim(),
      status: record.status || 'Pending',
      authorizedHours: Number(record.authorizedHours) || 0,
      createdAt: record.createdAt || now,
      updatedAt: now
    }
    await db.overtimeAuthorizations.put(cleanRecord)
  },

  /**
   * Updates authorization status (e.g. Approved or Rejected by HR Admin)
   */
  async updateStatus(
    id: string,
    status: 'Approved' | 'Rejected',
    approvedBy: string = 'HR Admin',
    remarks?: string
  ): Promise<void> {
    const existing = await db.overtimeAuthorizations.get(id)
    if (!existing) return

    const now = new Date().toISOString()
    existing.status = status
    existing.updatedAt = now
    if (status === 'Approved') {
      existing.approvedBy = approvedBy
      existing.approvedAt = now
    }
    if (remarks) {
      existing.remarks = remarks
    }
    await db.overtimeAuthorizations.put(existing)
  },

  /**
   * Deletes an overtime authorization record
   */
  async deleteAuthorization(id: string): Promise<void> {
    await db.overtimeAuthorizations.delete(id)
  }
}
