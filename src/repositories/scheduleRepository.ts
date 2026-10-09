import { db, type ShiftScheduleRecord, type LeaveRecord, type HolidayRecord } from '@/db'

const DEFAULT_SCHEDULES: ShiftScheduleRecord[] = [
  {
    id: 's-1',
    code: 'SH-STD',
    name: 'Standard Office Shift',
    startTime: '08:00',
    endTime: '17:00',
    gracePeriodMins: 0,
    breakHours: 1,
    location: 'DBB Cebu',
    assignedCount: 150,
    isDefault: true
  },
  {
    id: 's-2',
    code: 'SH-OPS-M',
    name: 'Morning Operations Shift',
    startTime: '06:00',
    endTime: '15:00',
    gracePeriodMins: 0,
    breakHours: 1,
    location: 'DBB Cebu',
    assignedCount: 0,
    isDefault: false
  }
]

const DEFAULT_HOLIDAYS: HolidayRecord[] = [
  { id: 'hol-1', name: "New Year's Day", date: '2026-01-01', type: 'Regular', isNationwide: true },
  { id: 'hol-2', name: 'Araw ng Kagitingan', date: '2026-04-09', type: 'Regular', isNationwide: true },
  { id: 'hol-3', name: 'Maundy Thursday', date: '2026-04-02', type: 'Regular', isNationwide: true },
  { id: 'hol-4', name: 'Good Friday', date: '2026-04-03', type: 'Regular', isNationwide: true },
  { id: 'hol-5', name: 'Labor Day', date: '2026-05-01', type: 'Regular', isNationwide: true },
  { id: 'hol-6', name: 'Independence Day', date: '2026-06-12', type: 'Regular', isNationwide: true },
  { id: 'hol-7', name: 'National Heroes Day', date: '2026-08-31', type: 'Regular', isNationwide: true },
  { id: 'hol-8', name: 'Bonifacio Day', date: '2026-11-30', type: 'Regular', isNationwide: true },
  { id: 'hol-9', name: 'Christmas Day', date: '2026-12-25', type: 'Regular', isNationwide: true },
  { id: 'hol-10', name: 'Rizal Day', date: '2026-12-30', type: 'Regular', isNationwide: true }
]

const DEFAULT_LEAVES: LeaveRecord[] = [
  {
    id: 'lv-1',
    bioId: '50366',
    employeeName: 'Santos, Roberto',
    leaveType: 'Vacation',
    startDate: '2026-07-15',
    endDate: '2026-07-17',
    status: 'Approved',
    days: 3,
    reason: 'Family event'
  },
  {
    id: 'lv-2',
    bioId: '10244',
    employeeName: 'Cruz, Maria Elena',
    leaveType: 'Sick',
    startDate: '2026-06-22',
    endDate: '2026-06-22',
    status: 'Approved',
    days: 1,
    reason: 'Medical checkup'
  },
  {
    id: 'lv-3',
    bioId: '31088',
    employeeName: 'Villanueva, John Paul',
    leaveType: 'Vacation',
    startDate: '2026-09-30',
    endDate: '2026-09-30',
    status: 'Approved',
    days: 1,
    reason: 'Approved annual vacation leave'
  }
]

async function ensureSchedulesInitialized() {
  const count = await db.schedules.count()
  if (count === 0) {
    await db.schedules.bulkPut(DEFAULT_SCHEDULES)
  }
  const holCount = await db.holidays.count()
  if (holCount === 0) {
    await db.holidays.bulkPut(DEFAULT_HOLIDAYS)
  }
  const leaveCount = await db.leaveRecords.count()
  if (leaveCount === 0) {
    await db.leaveRecords.bulkPut(DEFAULT_LEAVES)
  }
}

export const scheduleRepository = {
  async getSchedules(): Promise<ShiftScheduleRecord[]> {
    await ensureSchedulesInitialized()
    return db.schedules.toArray()
  },

  async getHolidays(year?: number): Promise<HolidayRecord[]> {
    await ensureSchedulesInitialized()
    const all = await db.holidays.toArray()
    if (year) {
      const prefix = `${year}-`
      return all.filter(h => h.date.startsWith(prefix))
    }
    return all
  },

  async getLeaves(startDate?: string, endDate?: string): Promise<LeaveRecord[]> {
    await ensureSchedulesInitialized()
    if (startDate && endDate) {
      return db.leaveRecords.where('startDate').between(startDate, endDate, true, true).toArray()
    }
    return db.leaveRecords.toArray()
  }
}
