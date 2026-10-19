import { db, type OvertimeAuthorizationRecord } from '@/db'
import { normalizeDateString } from '@/services/overtimePolicy'

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
   * Matches case-insensitively and normalizes dates.
   */
  async getApprovedOvertime(bioId: string, date: string): Promise<OvertimeAuthorizationRecord | undefined> {
    const cleanBio = String(bioId || '').trim().toLowerCase()
    const cleanBioUnprefixed = cleanBio.replace(/^emp[-_]/i, '')
    const cleanDate = normalizeDateString(date) || String(date || '').trim()
    const all = await db.overtimeAuthorizations.toArray()
    return all.find(r => {
      const rBio = String(r.bioId || '').trim().toLowerCase()
      const rBioUnprefixed = rBio.replace(/^emp[-_]/i, '')
      const rDate = normalizeDateString(r.date) || String(r.date || '').trim()
      const isApproved = (r.status || '').trim().toLowerCase() === 'approved'
      return (rBio === cleanBio || rBioUnprefixed === cleanBioUnprefixed) && rDate === cleanDate && isApproved
    })
  },

  /**
   * Retrieves all approved overtime authorizations for an employee within a date range.
   * Supports single bioId, array of IDs, or Set of targetIds (biometric_user_id, employee_number, id).
   * Supports historical dates, current date, and future dates within the window.
   */
  async getApprovedOvertimeForEmployeeAndPeriod(
    bioIdOrIds: string | string[] | Set<string>,
    startDate: string,
    endDate: string
  ): Promise<OvertimeAuthorizationRecord[]> {
    const ids = new Set<string>()
    const addId = (id: any) => {
      if (!id) return
      const s = String(id).trim().toLowerCase()
      ids.add(s)
      const unprefixed = s.replace(/^emp[-_]/i, '')
      ids.add(unprefixed)
      if (!s.startsWith('emp-')) ids.add(`emp-${s}`)
    }

    if (Array.isArray(bioIdOrIds)) {
      bioIdOrIds.forEach(addId)
    } else if (bioIdOrIds instanceof Set) {
      bioIdOrIds.forEach(addId)
    } else {
      addId(bioIdOrIds)
    }

    const cleanStart = normalizeDateString(startDate) || startDate
    const cleanEnd = normalizeDateString(endDate) || endDate

    const all = await db.overtimeAuthorizations.toArray()
    const list = all.filter(r => {
      if ((r.status || '').trim().toLowerCase() !== 'approved') return false
      const rBio = String(r.bioId || '').trim().toLowerCase()
      const rBioUnprefixed = rBio.replace(/^emp[-_]/i, '')
      if (!ids.has(rBio) && !ids.has(rBioUnprefixed)) return false
      const d = normalizeDateString(r.date) || String(r.date || '').trim()
      return d >= cleanStart && d <= cleanEnd
    })
    return list.sort((a, b) => {
      const da = normalizeDateString(a.date) || a.date
      const dbDate = normalizeDateString(b.date) || b.date
      return da.localeCompare(dbDate)
    })
  },

  /**
   * Builds an O(1) lookup map of approved overtime authorizations for a list of dates.
   * Key: `${bioId.toLowerCase()}_${date}`
   */
  async getApprovedOvertimeMapForDates(dates: string[]): Promise<Map<string, OvertimeAuthorizationRecord>> {
    const dateSet = new Set(dates.map(d => normalizeDateString(d) || d))
    const all = await db.overtimeAuthorizations.toArray()
    const records = all.filter(r => {
      if ((r.status || '').trim().toLowerCase() !== 'approved') return false
      const d = normalizeDateString(r.date) || r.date
      return dateSet.has(d)
    })

    const map = new Map<string, OvertimeAuthorizationRecord>()
    for (const r of records) {
      const d = normalizeDateString(r.date) || r.date
      const key = `${String(r.bioId).trim().toLowerCase()}_${d}`
      map.set(key, r)
      const cleanKey = `${String(r.bioId).replace(/^emp[-_]/i, '').trim().toLowerCase()}_${d}`
      map.set(cleanKey, r)
    }
    return map
  },

  /**
   * Retrieves all overtime authorization records with optional filtering.
   * Sorted by OT date descending, then createdAt descending.
   */
  async getAll(statusFilter: string = 'all'): Promise<OvertimeAuthorizationRecord[]> {
    const all = await db.overtimeAuthorizations.toArray()
    let list: OvertimeAuthorizationRecord[] = all
    if (statusFilter && statusFilter !== 'all') {
      const filterLower = statusFilter.trim().toLowerCase()
      list = all.filter(r => (r.status || '').trim().toLowerCase() === filterLower)
    }
    return list.sort((a, b) => {
      const da = normalizeDateString(a.date) || a.date
      const dbDate = normalizeDateString(b.date) || b.date
      const dateDiff = dbDate.localeCompare(da)
      if (dateDiff !== 0) return dateDiff
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    })
  },

  /**
   * Saves or updates an overtime authorization record.
   * Preserves existing id and createdAt if updating.
   */
  async saveAuthorization(record: OvertimeAuthorizationRecord): Promise<void> {
    const now = new Date().toISOString()
    const normalizedDate = normalizeDateString(record.date) || String(record.date || '').trim()
    const cleanRecord: OvertimeAuthorizationRecord = {
      ...record,
      id: record.id || `ot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      bioId: String(record.bioId || '').trim(),
      date: normalizedDate,
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
