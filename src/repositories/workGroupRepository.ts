import { db, type WorkGroupRecord } from '@/db'
import type { WorkGroup } from '@/types'

/**
 * Calculates Expected OUT dynamically based on Standard IN, Required Working Minutes,
 * and the configured Lunch Break period.
 *
 * Examples:
 * - Standard IN: 06:00 (360m), 480m req, Lunch 12:00 (720m) to 13:00 (780m)
 *   Before lunch: 720 - 360 = 360m (6 hrs)
 *   Remaining: 480 - 360 = 120m (2 hrs)
 *   Resume at 13:00 (780m) + 120m = 900m -> 15:00 (3:00 PM)
 *
 * - Standard IN: 07:00 (420m), 480m req, Lunch 12:00 (720m) to 13:00 (780m)
 *   Before lunch: 720 - 420 = 300m (5 hrs)
 *   Remaining: 480 - 300 = 180m (3 hrs)
 *   Resume at 13:00 (780m) + 180m = 960m -> 16:00 (4:00 PM)
 *
 * - Standard IN: 08:00 (480m), 480m req, Lunch 12:00 (720m) to 13:00 (780m)
 *   Before lunch: 720 - 480 = 240m (4 hrs)
 *   Remaining: 480 - 240 = 240m (4 hrs)
 *   Resume at 13:00 (780m) + 240m = 1020m -> 17:00 (5:00 PM)
 */
export function calculateExpectedOutMinutes(
  standardInHHMM: string,
  requiredWorkMinutes: number = 480,
  lunchStartHHMM: string = '12:00',
  lunchEndHHMM: string = '13:00'
): { outMinutesFromMidnight: number; outHHMM: string; outFormatted12h: string } {
  const [inH, inM] = (standardInHHMM || '08:00').split(':').map(Number)
  const [lStartH, lStartM] = (lunchStartHHMM || '12:00').split(':').map(Number)
  const [lEndH, lEndM] = (lunchEndHHMM || '13:00').split(':').map(Number)

  const inMins = (inH || 0) * 60 + (inM || 0)
  const lunchStartMins = (lStartH || 12) * 60 + (lStartM || 0)
  const lunchEndMins = (lEndH || 13) * 60 + (lEndM || 0)

  let outMins = 0

  if (inMins < lunchStartMins) {
    const morningWorkMins = Math.max(0, lunchStartMins - inMins)
    if (requiredWorkMinutes <= morningWorkMins) {
      outMins = inMins + requiredWorkMinutes
    } else {
      const remainingWorkMins = requiredWorkMinutes - morningWorkMins
      outMins = lunchEndMins + remainingWorkMins
    }
  } else if (inMins >= lunchEndMins) {
    // Shift starts after lunch
    outMins = inMins + requiredWorkMinutes
  } else {
    // Shift starts during lunch window
    outMins = lunchEndMins + requiredWorkMinutes
  }

  const outH = Math.floor(outMins / 60) % 24
  const outM = outMins % 60
  const outHHMM = `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`

  const hour12 = outH % 12 || 12
  const ampm = outH >= 12 ? 'PM' : 'AM'
  const outFormatted12h = `${hour12}:${String(outM).padStart(2, '0')} ${ampm}`

  return {
    outMinutesFromMidnight: outMins,
    outHHMM,
    outFormatted12h
  }
}

export function formatTime12h(hhmm: string): string {
  if (!hhmm) return '8:00 AM'
  const [hStr, mStr] = hhmm.split(':')
  const h = parseInt(hStr, 10) || 0
  const m = parseInt(mStr, 10) || 0
  const hour12 = h % 12 || 12
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`
}

export const DEFAULT_WORK_GROUPS: WorkGroupRecord[] = [
  {
    id: 'wg-group-a',
    name: 'Group A',
    code: 'A',
    standardIn: '06:00',
    requiredWorkMinutes: 480, // 8 hours
    lunchStart: '12:00',
    lunchEnd: '13:00',
    expectedOut: calculateExpectedOutMinutes('06:00', 480, '12:00', '13:00').outHHMM, // "15:00"
    gracePeriodMinutes: 15,
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'wg-group-b',
    name: 'Group B',
    code: 'B',
    standardIn: '07:00',
    requiredWorkMinutes: 480, // 8 hours
    lunchStart: '12:00',
    lunchEnd: '13:00',
    expectedOut: calculateExpectedOutMinutes('07:00', 480, '12:00', '13:00').outHHMM, // "16:00"
    gracePeriodMinutes: 15,
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'wg-group-c',
    name: 'Group C',
    code: 'C',
    standardIn: '08:00',
    requiredWorkMinutes: 480, // 8 hours
    lunchStart: '12:00',
    lunchEnd: '13:00',
    expectedOut: calculateExpectedOutMinutes('08:00', 480, '12:00', '13:00').outHHMM, // "17:00"
    gracePeriodMinutes: 15,
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]

let workGroupCache: Map<string, WorkGroupRecord> | null = null

async function ensureWorkGroupsInitialized() {
  if (workGroupCache !== null) return

  const count = await db.workGroups.count()
  if (count === 0) {
    await db.workGroups.bulkPut(DEFAULT_WORK_GROUPS)
  }

  const all = await db.workGroups.toArray()
  workGroupCache = new Map<string, WorkGroupRecord>()
  for (const wg of all) {
    // Ensure code field exists on legacy cached records
    if (!wg.code) {
      if (wg.id.includes('group-a') || wg.name.toLowerCase().includes('a')) wg.code = 'A'
      else if (wg.id.includes('group-b') || wg.name.toLowerCase().includes('b')) wg.code = 'B'
      else if (wg.id.includes('group-c') || wg.name.toLowerCase().includes('c')) wg.code = 'C'
      else wg.code = wg.name.trim().slice(0, 3).toUpperCase()
    }
    workGroupCache.set(wg.id, wg)
  }
}

export const workGroupRepository = {
  toWorkGroup(rec: WorkGroupRecord): WorkGroup {
    return {
      id: rec.id,
      name: rec.name,
      code: rec.code || rec.name.replace(/^Group\s+/i, '').trim().toUpperCase(),
      standard_in: rec.standardIn,
      required_work_minutes: rec.requiredWorkMinutes,
      lunch_start: rec.lunchStart,
      lunch_end: rec.lunchEnd,
      expected_out: rec.expectedOut,
      grace_period_minutes: rec.gracePeriodMinutes,
      is_default: rec.isDefault,
      created_at: rec.createdAt,
      updated_at: rec.updatedAt
    }
  },

  getRecordByIdSync(id: string): WorkGroupRecord | undefined {
    if (!workGroupCache) return undefined
    return workGroupCache.get(id) || workGroupCache.get('wg-group-c')
  },

  getByIdSync(id: string): WorkGroup | undefined {
    const rec = this.getRecordByIdSync(id)
    return rec ? this.toWorkGroup(rec) : undefined
  },

  async getAll(): Promise<WorkGroup[]> {
    await ensureWorkGroupsInitialized()
    return Array.from(workGroupCache!.values()).map(this.toWorkGroup)
  },

  async getMap(): Promise<Map<string, WorkGroupRecord>> {
    await ensureWorkGroupsInitialized()
    return workGroupCache!
  },

  async getById(id: string): Promise<WorkGroup | undefined> {
    await ensureWorkGroupsInitialized()
    const rec = workGroupCache!.get(id) || workGroupCache!.get('wg-group-c')
    return rec ? this.toWorkGroup(rec) : undefined
  },

  async getByCode(code: string): Promise<WorkGroup | undefined> {
    await ensureWorkGroupsInitialized()
    const clean = code.trim().toUpperCase()
    for (const wg of workGroupCache!.values()) {
      if ((wg.code && wg.code.toUpperCase() === clean) || wg.name.toUpperCase() === clean) {
        return this.toWorkGroup(wg)
      }
    }
    return undefined
  },

  /**
   * Matches an Excel group string (e.g. "A", "Group A", "group b", "B", "wg-group-c")
   * against the canonical Work Group settings.
   */
  async findMatchingGroup(input: string | undefined | null): Promise<WorkGroup | undefined> {
    if (!input || !String(input).trim()) return undefined
    await ensureWorkGroupsInitialized()

    const raw = String(input).trim()
    const cleanUpper = raw.toUpperCase()
    const stripped = cleanUpper.replace(/^GROUP\s*/i, '').trim()

    // 1. Exact match by code (e.g. "A" === "A")
    for (const wg of workGroupCache!.values()) {
      if (wg.code && wg.code.toUpperCase() === cleanUpper) {
        return this.toWorkGroup(wg)
      }
    }

    // 2. Match by stripped code (e.g. "Group A" -> "A" === wg.code "A")
    for (const wg of workGroupCache!.values()) {
      if (wg.code && wg.code.toUpperCase() === stripped) {
        return this.toWorkGroup(wg)
      }
    }

    // 3. Exact match by name (e.g. "GROUP A" === "GROUP A" or "Group A")
    for (const wg of workGroupCache!.values()) {
      if (wg.name && (wg.name.toUpperCase() === cleanUpper || wg.name.toUpperCase() === `GROUP ${stripped}`)) {
        return this.toWorkGroup(wg)
      }
    }

    // 4. Match by ID (e.g. "wg-group-a")
    for (const wg of workGroupCache!.values()) {
      if (wg.id.toLowerCase() === raw.toLowerCase()) {
        return this.toWorkGroup(wg)
      }
    }

    return undefined
  },

  async getDefault(): Promise<WorkGroup> {
    await ensureWorkGroupsInitialized()
    const def = Array.from(workGroupCache!.values()).find(w => w.isDefault) || DEFAULT_WORK_GROUPS[2]
    return this.toWorkGroup(def)
  },

  /**
   * Counts how many employees are currently assigned to a given work group
   */
  async getAssignedEmployeeCount(workGroupId: string): Promise<number> {
    return await db.employees.where('workGroupId').equals(workGroupId).count()
  },

  /**
   * Fast batch count of assigned employees across all work groups
   */
  async getAllAssignedEmployeeCounts(): Promise<Record<string, number>> {
    const employees = await db.employees.toArray()
    const counts: Record<string, number> = {}
    for (let i = 0; i < employees.length; i++) {
      const wgId = employees[i].workGroupId || 'wg-group-c'
      counts[wgId] = (counts[wgId] || 0) + 1
    }
    return counts
  },

  /**
   * Saves or creates a Work Group with strict code uniqueness and automatic expected OUT calculation.
   */
  async saveWorkGroup(wg: Partial<WorkGroup> & { name: string; code: string }): Promise<WorkGroup> {
    await ensureWorkGroupsInitialized()

    const cleanCode = (wg.code || '').trim().toUpperCase()
    const cleanName = (wg.name || '').trim()

    if (!cleanName) {
      throw new Error('Group Name is required.')
    }
    if (!cleanCode) {
      throw new Error('Group Code is required.')
    }

    const id = wg.id || `wg-${cleanCode.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`

    // Validate code uniqueness (case-insensitive)
    for (const [existingId, existing] of workGroupCache!.entries()) {
      if (existingId !== id && existing.code && existing.code.toUpperCase() === cleanCode) {
        throw new Error(`Group Code "${cleanCode}" is already in use by "${existing.name}". Group Code must be unique.`)
      }
    }

    const standardIn = wg.standard_in || '08:00'
    const reqMins = wg.required_work_minutes !== undefined ? Number(wg.required_work_minutes) : 480
    const lunchStart = wg.lunch_start || '12:00'
    const lunchEnd = wg.lunch_end || '13:00'

    const calculatedOut = calculateExpectedOutMinutes(standardIn, reqMins, lunchStart, lunchEnd).outHHMM

    // If marked as default, unset other defaults
    if (wg.is_default) {
      for (const item of workGroupCache!.values()) {
        if (item.id !== id && item.isDefault) {
          item.isDefault = false
          await db.workGroups.put(item)
        }
      }
    }

    const record: WorkGroupRecord = {
      id,
      name: cleanName,
      code: cleanCode,
      standardIn,
      requiredWorkMinutes: reqMins,
      lunchStart,
      lunchEnd,
      expectedOut: calculatedOut,
      gracePeriodMinutes: wg.grace_period_minutes ?? 15,
      isDefault: Boolean(wg.is_default),
      createdAt: wg.created_at || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    await db.workGroups.put(record)
    workGroupCache!.set(record.id, record)
    return this.toWorkGroup(record)
  },

  /**
   * Deletes a work group, protecting it if employees are currently assigned.
   */
  async deleteWorkGroup(id: string): Promise<void> {
    await ensureWorkGroupsInitialized()
    const wg = workGroupCache!.get(id)
    if (!wg) return

    // Check if employees are assigned
    const assignedCount = await this.getAssignedEmployeeCount(id)
    if (assignedCount > 0) {
      throw new Error(
        `Group "${wg.name}" (Code: ${wg.code}) is currently assigned to ${assignedCount} employee(s). You cannot delete this group until those employees are reassigned to another Work Group.`
      )
    }

    await db.workGroups.delete(id)
    workGroupCache!.delete(id)
  },

  /**
   * Reassigns all employees from one group to another and then deletes the old group
   */
  async reassignAndDeleteWorkGroup(fromId: string, toId: string): Promise<{ reassignedCount: number }> {
    await ensureWorkGroupsInitialized()
    if (fromId === toId) {
      throw new Error('Target reassignment group cannot be the same as the group to delete.')
    }

    const targetGroup = workGroupCache!.get(toId)
    if (!targetGroup) {
      throw new Error('Target reassignment Work Group not found.')
    }

    const employees = await db.employees.where('workGroupId').equals(fromId).toArray()
    for (const emp of employees) {
      emp.workGroupId = toId
      emp.updatedAt = new Date().toISOString()
      await db.employees.put(emp)
    }

    await db.workGroups.delete(fromId)
    workGroupCache!.delete(fromId)

    return { reassignedCount: employees.length }
  }
}
