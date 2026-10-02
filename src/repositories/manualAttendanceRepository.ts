import { db, type ManualAttendanceRecord } from '@/db'

export const manualAttendanceRepository = {
  /**
   * Retrieves a manual attendance adjustment for a specific employee and date
   */
  async getAdjustment(bioId: string, date: string): Promise<ManualAttendanceRecord | undefined> {
    const id = `${bioId}_${date}`
    return db.manualAdjustments.get(id)
  },

  /**
   * Fast lookup map for all manual adjustments on a given date
   */
  async getAdjustmentsMapForDate(date: string): Promise<Map<string, ManualAttendanceRecord>> {
    const records = await db.manualAdjustments.where('date').equals(date).toArray()
    const map = new Map<string, ManualAttendanceRecord>()
    for (const r of records) {
      map.set(r.bioId, r)
    }
    return map
  },

  /**
   * Retrieves all adjustments with 'Pending' status across dates
   */
  async getPendingAdjustments(): Promise<ManualAttendanceRecord[]> {
    return db.manualAdjustments.where('status').equals('Pending').toArray()
  },

  /**
   * Saves or updates a manual adjustment record (e.g. Paper Slip approval or pending request)
   */
  async saveAdjustment(data: {
    bioId: string
    date: string
    manualIn?: string
    manualOut?: string
    reason: string
    status?: 'Approved' | 'Pending'
    approvedBy?: string
  }): Promise<ManualAttendanceRecord> {
    const id = `${data.bioId}_${data.date}`
    const existing = await db.manualAdjustments.get(id)
    const now = new Date().toISOString()

    const record: ManualAttendanceRecord = {
      id,
      bioId: data.bioId,
      date: data.date,
      manualIn: data.manualIn,
      manualOut: data.manualOut,
      reason: data.reason || 'Paper Slip / Manual Time-In Request',
      status: data.status || 'Approved',
      approvedBy: data.status === 'Pending' ? 'Awaiting HR Approval' : (data.approvedBy || 'Admin'),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }

    await db.manualAdjustments.put(record)
    return record
  },

  /**
   * Approves a pending manual adjustment
   */
  async approveAdjustment(bioId: string, date: string, approver = 'Admin'): Promise<ManualAttendanceRecord | undefined> {
    const id = `${bioId}_${date}`
    const existing = await db.manualAdjustments.get(id)
    if (!existing) return undefined

    existing.status = 'Approved'
    existing.approvedBy = approver
    existing.updatedAt = new Date().toISOString()
    await db.manualAdjustments.put(existing)
    return existing
  },

  /**
   * Deletes a manual adjustment
   */
  async deleteAdjustment(bioId: string, date: string): Promise<void> {
    const id = `${bioId}_${date}`
    await db.manualAdjustments.delete(id)
  }
}
