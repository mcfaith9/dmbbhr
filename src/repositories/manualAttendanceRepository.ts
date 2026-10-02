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
   * Fast lookup map for ONLY APPROVED manual adjustments on a given date for Daily Attendance calculation
   */
  async getAdjustmentsMapForDate(date: string): Promise<Map<string, ManualAttendanceRecord>> {
    const records = await db.manualAdjustments.where('date').equals(date).toArray()
    const map = new Map<string, ManualAttendanceRecord>()
    for (const r of records) {
      if (r.status === 'Approved') {
        map.set(r.bioId, r)
      }
    }
    return map
  },

  /**
   * Retrieves all manual time adjustments with optional status filtering
   */
  async getAll(statusFilter: string = 'all'): Promise<ManualAttendanceRecord[]> {
    let list: ManualAttendanceRecord[] = []
    if (statusFilter && statusFilter !== 'all') {
      list = await db.manualAdjustments.where('status').equals(statusFilter).toArray()
    } else {
      list = await db.manualAdjustments.toArray()
    }

    // Sort newest request first
    return list.sort((a, b) => new Date(b.requestedAt || b.createdAt).getTime() - new Date(a.requestedAt || a.createdAt).getTime())
  },

  /**
   * Retrieves all adjustments with 'Pending' status across dates
   */
  async getPendingAdjustments(): Promise<ManualAttendanceRecord[]> {
    const list = await db.manualAdjustments.where('status').equals('Pending').toArray()
    return list.sort((a, b) => new Date(b.requestedAt || b.createdAt).getTime() - new Date(a.requestedAt || a.createdAt).getTime())
  },

  /**
   * Submits a new or updated manual time adjustment request (defaults to 'Pending' workflow state)
   */
  async submitRequest(data: {
    bioId: string
    employeeName?: string
    date: string
    scheduleContext?: string
    originalIn?: string
    originalOut?: string
    manualIn?: string
    manualOut?: string
    reason?: string
    notes?: string
    requestedBy?: string
  }): Promise<ManualAttendanceRecord> {
    const id = `${data.bioId}_${data.date}`
    const existing = await db.manualAdjustments.get(id)
    const now = new Date().toISOString()

    const record: ManualAttendanceRecord = {
      id,
      bioId: data.bioId,
      employeeName: data.employeeName || existing?.employeeName || `User #${data.bioId}`,
      date: data.date,
      scheduleContext: data.scheduleContext || existing?.scheduleContext || '',
      originalIn: data.originalIn ?? existing?.originalIn ?? '—',
      originalOut: data.originalOut ?? existing?.originalOut ?? '—',
      manualIn: data.manualIn ? data.manualIn.trim() : undefined,
      manualOut: data.manualOut ? data.manualOut.trim() : undefined,
      reason: (data.notes || data.reason || 'Manual attendance adjustment request').trim(),
      notes: (data.notes || '').trim(),
      status: 'Pending',
      requestedBy: data.requestedBy || 'Admin',
      requestedAt: now,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }

    await db.manualAdjustments.put(record)
    return record
  },

  /**
   * Legacy / direct save helper
   */
  async saveAdjustment(data: {
    bioId: string
    employeeName?: string
    date: string
    manualIn?: string
    manualOut?: string
    reason: string
    notes?: string
    status?: 'Approved' | 'Pending' | 'Rejected'
    approvedBy?: string
    requestedBy?: string
  }): Promise<ManualAttendanceRecord> {
    const id = `${data.bioId}_${data.date}`
    const existing = await db.manualAdjustments.get(id)
    const now = new Date().toISOString()

    const record: ManualAttendanceRecord = {
      id,
      bioId: data.bioId,
      employeeName: data.employeeName || existing?.employeeName,
      date: data.date,
      manualIn: data.manualIn,
      manualOut: data.manualOut,
      reason: data.reason || 'Paper Slip / Manual Time Request',
      notes: data.notes,
      status: data.status || 'Approved',
      requestedBy: data.requestedBy || existing?.requestedBy || 'Admin',
      requestedAt: existing?.requestedAt || now,
      approvedBy: data.status === 'Approved' ? (data.approvedBy || 'Admin') : undefined,
      approvedAt: data.status === 'Approved' ? now : undefined,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }

    await db.manualAdjustments.put(record)
    return record
  },

  /**
   * Approves a manual time adjustment request
   */
  async approveAdjustment(idOrBioId: string, date?: string, approver = 'Admin'): Promise<ManualAttendanceRecord | undefined> {
    const id = date ? `${idOrBioId}_${date}` : idOrBioId
    const existing = await db.manualAdjustments.get(id)
    if (!existing) return undefined

    const now = new Date().toISOString()
    existing.status = 'Approved'
    existing.approvedBy = approver
    existing.approvedAt = now
    existing.updatedAt = now
    await db.manualAdjustments.put(existing)
    return existing
  },

  /**
   * Rejects a manual time adjustment request
   */
  async rejectAdjustment(idOrBioId: string, date?: string, reviewer = 'Admin', reason = 'Disapproved by HR/Admin'): Promise<ManualAttendanceRecord | undefined> {
    const id = date ? `${idOrBioId}_${date}` : idOrBioId
    const existing = await db.manualAdjustments.get(id)
    if (!existing) return undefined

    const now = new Date().toISOString()
    existing.status = 'Rejected'
    existing.reviewedBy = reviewer
    existing.reviewedAt = now
    existing.rejectionReason = reason
    existing.updatedAt = now
    await db.manualAdjustments.put(existing)
    return existing
  },

  /**
   * Deletes a manual adjustment
   */
  async deleteAdjustment(bioIdOrId: string, date?: string): Promise<void> {
    const id = date ? `${bioIdOrId}_${date}` : bioIdOrId
    await db.manualAdjustments.delete(id)
  }
}
