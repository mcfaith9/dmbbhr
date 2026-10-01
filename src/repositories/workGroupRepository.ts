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
  const [inH, inM] = standardInHHMM.split(':').map(Number)
  const [lStartH, lStartM] = lunchStartHHMM.split(':').map(Number)
  const [lEndH, lEndM] = lunchEndHHMM.split(':').map(Number)

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
    name: 'GROUP A',
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
    name: 'GROUP B',
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
    name: 'GROUP C',
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
    workGroupCache.set(wg.id, wg)
  }
}

export const workGroupRepository = {
  toWorkGroup(rec: WorkGroupRecord): WorkGroup {
    return {
      id: rec.id,
      name: rec.name,
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

  async getDefault(): Promise<WorkGroup> {
    await ensureWorkGroupsInitialized()
    const def = Array.from(workGroupCache!.values()).find(w => w.isDefault) || DEFAULT_WORK_GROUPS[2]
    return this.toWorkGroup(def)
  },

  async saveWorkGroup(wg: Partial<WorkGroup> & { id: string; name: string }): Promise<WorkGroup> {
    await ensureWorkGroupsInitialized()
    const standardIn = wg.standard_in || '08:00'
    const reqMins = wg.required_work_minutes || 480
    const lunchStart = wg.lunch_start || '12:00'
    const lunchEnd = wg.lunch_end || '13:00'

    const calculatedOut = calculateExpectedOutMinutes(standardIn, reqMins, lunchStart, lunchEnd).outHHMM

    const record: WorkGroupRecord = {
      id: wg.id,
      name: wg.name,
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
  }
}
