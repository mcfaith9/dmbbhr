import Dexie, { type Table } from 'dexie'
import type { EmployeeLocation } from '@/types'

export interface BiometricPunchRecord {
  id: string // Unique identifier (or composite key)
  bioId: string // Biometric User ID (e.g. 50044)
  date: string // YYYY-MM-DD (Asia/Manila)
  timestamp: string // ISO string or full datetime
  timestampMs: number
  type: number // raw type
  state: number // raw state
  serialNumber: number | string
  deviceId: string
  deviceIp: string
  deviceName?: string
  locationId: string
  locationName?: string
  employeeName?: string
  isDuplicate: boolean
  importedAt: string
}

export interface EmployeeRecord {
  bioId: string // Primary key (permanent, immutable)
  employeeNumber: string
  fullName: string
  location: EmployeeLocation
  department: string
  position: string
  status: 'active' | 'inactive' | 'on_leave'
  createdAt: string
  updatedAt: string
}

export interface DailyAttendanceRecordDB {
  id: string // `${bioId}_${date}`
  bioId: string
  employeeName: string
  location: string
  date: string // YYYY-MM-DD
  displayDate: string
  timeIn: string
  breakOut: string
  breakIn: string
  timeOut: string
  totalHours: string
  totalHoursDecimal: number
  status: string
  statusVariant: 'success' | 'warning' | 'outline' | 'destructive' | 'secondary'
  lateMinutes: number
  undertimeMinutes: number
  rawPunchesCount: number
  validPunchesCount: number
  hasValidOut: boolean
  isAwaitingOut: boolean
  updatedAt: string
}

export interface DailySummaryRecord {
  date: string // Primary key: YYYY-MM-DD
  presentCount: number
  onTimeCount: number
  lateCount: number
  singlePunchCount: number
  awaitingOutCount: number
  leaveCount: number
  holidayCount: number
  totalEmployees: number
  updatedAt: string
}

export interface ShiftScheduleRecord {
  id: string
  code: string
  name: string
  startTime: string // "08:00"
  endTime: string // "17:00"
  gracePeriodMins: number
  breakHours: number
  location: string
  assignedCount: number
  isDefault: boolean
}

export interface LeaveRecord {
  id: string
  bioId: string
  employeeName: string
  leaveType: 'Vacation' | 'Sick' | 'Emergency' | 'Maternity' | 'Paternity'
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  status: 'Approved' | 'Pending' | 'Rejected'
  days: number
  reason?: string
}

export interface HolidayRecord {
  id: string
  name: string
  date: string // YYYY-MM-DD
  type: 'Regular' | 'Special Non-Working'
  isNationwide: boolean
}

export interface ImportJobRecord {
  id: string
  filename: string
  totalRecords: number
  importedCount: number
  duplicateCount: number
  invalidCount: number
  importedAt: string
  status: 'completed' | 'failed' | 'partial'
}

export class DMBBHRDatabase extends Dexie {
  biometricPunches!: Table<BiometricPunchRecord, string>
  employees!: Table<EmployeeRecord, string>
  dailyAttendance!: Table<DailyAttendanceRecordDB, string>
  dailySummaries!: Table<DailySummaryRecord, string>
  schedules!: Table<ShiftScheduleRecord, string>
  leaveRecords!: Table<LeaveRecord, string>
  holidays!: Table<HolidayRecord, string>
  importJobs!: Table<ImportJobRecord, string>

  constructor() {
    super('DMBBHR_LocalDB')

    // Schema definition with targeted high-performance indices
    this.version(1).stores({
      biometricPunches: 'id, bioId, date, timestampMs, deviceId, isDuplicate, [date+bioId], [bioId+timestampMs]',
      employees: 'bioId, fullName, location, status',
      dailyAttendance: 'id, bioId, date, status, location, [date+location]',
      dailySummaries: 'date',
      schedules: 'id, code, location',
      leaveRecords: 'id, bioId, startDate, endDate, status',
      holidays: 'id, date',
      importJobs: 'id, importedAt'
    })
  }
}

export const db = new DMBBHRDatabase()
