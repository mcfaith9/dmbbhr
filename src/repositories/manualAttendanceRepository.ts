import { db, type ManualAttendanceRecord, type ManualAttendanceHistoryRecord } from '@/db'

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
   * Approves a manual time adjustment request and records a single persistent history transaction
   */
  async approveAdjustment(idOrBioId: string, date?: string, approver = 'Admin'): Promise<ManualAttendanceRecord | undefined> {
    const id = date ? `${idOrBioId}_${date}` : idOrBioId
    const existing = await db.manualAdjustments.get(id)
    if (!existing) return undefined

    // Data integrity check: Do not re-process or re-record already approved requests
    if (existing.status === 'Approved') {
      const existingTx = await db.manualAttendanceHistory
        .where('requestId')
        .equals(existing.id)
        .first()
      if (existingTx) {
        return existing
      }
    }

    const now = new Date().toISOString()
    existing.status = 'Approved'
    existing.approvedBy = approver
    existing.approvedAt = now
    existing.updatedAt = now
    await db.manualAdjustments.put(existing)

    // Build human-readable attendance time and type
    let attendanceTime = ''
    let attendanceType = 'Manual Adjustment'
    if (existing.manualIn && existing.manualOut) {
      attendanceTime = `IN: ${existing.manualIn}, OUT: ${existing.manualOut}`
      attendanceType = 'Time IN & OUT'
    } else if (existing.manualIn) {
      attendanceTime = `IN: ${existing.manualIn}`
      attendanceType = 'Time IN'
    } else if (existing.manualOut) {
      attendanceTime = `OUT: ${existing.manualOut}`
      attendanceType = 'Time OUT'
    } else {
      attendanceTime = existing.originalIn || existing.originalOut || '—'
    }

    // Lookup full name if not set
    let empName = existing.employeeName
    if (!empName || empName.startsWith('User #')) {
      const emp = await db.employees.get(existing.bioId)
      if (emp?.fullName) {
        empName = emp.fullName
      }
    }

    // Duplicate transaction prevention check before insert
    const alreadyLogged = await db.manualAttendanceHistory
      .where('requestId')
      .equals(existing.id)
      .filter(h => h.status === 'Approved')
      .first()

    if (!alreadyLogged) {
      const historyEntry: ManualAttendanceHistoryRecord = {
        id: `tx-appr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        requestId: existing.id,
        employeeId: existing.bioId,
        employeeName: empName || existing.employeeName || `User #${existing.bioId}`,
        attendanceDate: existing.date,
        attendanceTime,
        attendanceType,
        status: 'Approved',
        remarks: (existing.reason || existing.notes || 'Approved manual adjustment').trim(),
        processedBy: approver,
        processedAt: now
      }
      await db.manualAttendanceHistory.put(historyEntry)
    }

    return existing
  },

  /**
   * Rejects a manual time adjustment request and records a single persistent history transaction
   */
  async rejectAdjustment(idOrBioId: string, date?: string, reviewer = 'Admin', reason = 'Disapproved by HR/Admin'): Promise<ManualAttendanceRecord | undefined> {
    const id = date ? `${idOrBioId}_${date}` : idOrBioId
    const existing = await db.manualAdjustments.get(id)
    if (!existing) return undefined

    // Data integrity check: Do not re-process or re-record already rejected requests
    if (existing.status === 'Rejected') {
      const existingTx = await db.manualAttendanceHistory
        .where('requestId')
        .equals(existing.id)
        .first()
      if (existingTx) {
        return existing
      }
    }

    const now = new Date().toISOString()
    existing.status = 'Rejected'
    existing.reviewedBy = reviewer
    existing.reviewedAt = now
    existing.rejectionReason = reason
    existing.updatedAt = now
    await db.manualAdjustments.put(existing)

    // Build human-readable attendance time and type
    let attendanceTime = ''
    let attendanceType = 'Manual Adjustment'
    if (existing.manualIn && existing.manualOut) {
      attendanceTime = `IN: ${existing.manualIn}, OUT: ${existing.manualOut}`
      attendanceType = 'Time IN & OUT'
    } else if (existing.manualIn) {
      attendanceTime = `IN: ${existing.manualIn}`
      attendanceType = 'Time IN'
    } else if (existing.manualOut) {
      attendanceTime = `OUT: ${existing.manualOut}`
      attendanceType = 'Time OUT'
    } else {
      attendanceTime = existing.originalIn || existing.originalOut || '—'
    }

    // Lookup full name if not set
    let empName = existing.employeeName
    if (!empName || empName.startsWith('User #')) {
      const emp = await db.employees.get(existing.bioId)
      if (emp?.fullName) {
        empName = emp.fullName
      }
    }

    // Duplicate transaction prevention check before insert
    const alreadyLogged = await db.manualAttendanceHistory
      .where('requestId')
      .equals(existing.id)
      .filter(h => h.status === 'Rejected')
      .first()

    if (!alreadyLogged) {
      const historyEntry: ManualAttendanceHistoryRecord = {
        id: `tx-rej-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        requestId: existing.id,
        employeeId: existing.bioId,
        employeeName: empName || existing.employeeName || `User #${existing.bioId}`,
        attendanceDate: existing.date,
        attendanceTime,
        attendanceType,
        status: 'Rejected',
        remarks: reason.trim(),
        processedBy: reviewer,
        processedAt: now
      }
      await db.manualAttendanceHistory.put(historyEntry)
    }

    return existing
  },

  /**
   * Retrieves paginated transaction history with filtering
   */
  async getHistory(params: {
    status?: 'all' | 'Approved' | 'Rejected'
    search?: string
    date?: string
    page?: number
    pageSize?: number
  } = {}): Promise<{
    records: ManualAttendanceHistoryRecord[]
    total: number
    approvedCount: number
    rejectedCount: number
    currentPage: number
    totalPages: number
    pageSize: number
  }> {
    const all = await db.manualAttendanceHistory.toArray()

    // Sort newest processed transaction first
    all.sort((a, b) => new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime())

    const approvedCount = all.filter(r => r.status === 'Approved').length
    const rejectedCount = all.filter(r => r.status === 'Rejected').length

    let filtered = all

    if (params.status && params.status !== 'all') {
      filtered = filtered.filter(r => r.status === params.status)
    }

    if (params.date && params.date.trim()) {
      filtered = filtered.filter(r => r.attendanceDate === params.date || r.processedAt.startsWith(params.date!))
    }

    if (params.search && params.search.trim()) {
      const q = params.search.toLowerCase().trim()
      filtered = filtered.filter(r =>
        (r.employeeName && r.employeeName.toLowerCase().includes(q)) ||
        r.employeeId.toLowerCase().includes(q) ||
        (r.remarks && r.remarks.toLowerCase().includes(q)) ||
        (r.processedBy && r.processedBy.toLowerCase().includes(q)) ||
        r.attendanceDate.includes(q) ||
        (r.attendanceTime && r.attendanceTime.toLowerCase().includes(q)) ||
        (r.attendanceType && r.attendanceType.toLowerCase().includes(q))
      )
    }

    const total = filtered.length
    const page = Math.max(1, params.page || 1)
    const pageSize = Math.max(1, params.pageSize || 10)
    const totalPages = Math.ceil(total / pageSize) || 1
    const startIdx = (page - 1) * pageSize
    const records = filtered.slice(startIdx, startIdx + pageSize)

    return {
      records,
      total,
      approvedCount,
      rejectedCount,
      currentPage: page,
      totalPages,
      pageSize
    }
  },

  /**
   * Deletes a manual adjustment
   */
  async deleteAdjustment(bioIdOrId: string, date?: string): Promise<void> {
    const id = date ? `${bioIdOrId}_${date}` : bioIdOrId
    await db.manualAdjustments.delete(id)
  }
}
