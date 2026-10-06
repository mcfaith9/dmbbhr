import Dexie, { type Table } from 'dexie'
import type { EmployeeLocation } from '@/types'

export interface WorkGroupRecord {
  id: string // "wg-group-a", "wg-group-b", "wg-group-c"
  name: string // "Group A", "Group B", "Group C"
  code: string // "A", "B", "C" (unique short code)
  standardIn: string // "06:00", "07:00", "08:00"
  requiredWorkMinutes: number // 480 (8 hours)
  lunchStart: string // "12:00"
  lunchEnd: string // "13:00"
  expectedOut: string // Automatically calculated (e.g. "15:00")
  gracePeriodMinutes: number // 15
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

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
  workGroupId?: string
  isDuplicate: boolean
  importedAt: string
}

export interface EmployeeRecord {
  bioId: string // Primary key (permanent, immutable) — also Employee ID
  employeeNumber: string // Identical to bioId (Employee ID = Bio ID)
  fullName: string
  preferredName?: string
  photo?: string | null // Photo path e.g. /employee-photos/25065.jpg or data URL
  dateOfBirth?: string // YYYY-MM-DD
  gender?: string
  civilStatus?: string
  mobileNumber?: string
  email?: string
  alternateNumber?: string
  homeAddress?: string
  emergencyContactName?: string
  emergencyContactRelationship?: string
  emergencyContactNumber?: string
  location: EmployeeLocation
  workGroupId: string // "wg-group-a" | "wg-group-b" | "wg-group-c"
  department: string
  position: string
  hireDate?: string // Date Hired
  regularizationDate?: string // Date Regularized
  resignationDate?: string // Date Resigned / Effective Date
  status: 'active' | 'inactive' | 'on_leave' | 'resigned'
  payrollStatus?: 'configured' | 'pending' | 'exempt'
  salaryType?: 'Monthly' | 'Daily' | 'Hourly'
  basicSalary?: number
  dailyRate?: number
  hourlyRate?: number
  payFrequency?: 'Semi-Monthly' | 'Monthly' | 'Weekly' | string
  paymentMethod?: 'Bank Transfer' | 'Cash' | 'Cheque' | string
  bankName?: string
  bankAccountNumber?: string
  allowances?: number
  deMinimis?: number
  salaryEffectiveDate?: string
  sssNumber?: string
  philhealthNumber?: string
  pagibigNumber?: string
  tin?: string
  taxStatus?: string
  createdAt: string
  updatedAt: string
}

export interface DailyAttendanceRecordDB {
  id: string // `${bioId}_${date}`
  bioId: string
  employeeName: string
  location: string
  workGroupId: string
  workGroupName: string
  date: string // YYYY-MM-DD
  displayDate: string
  expectedIn: string
  actualIn: string
  expectedOut: string
  actualOut: string
  breakOut: string
  breakIn: string
  totalHours: string
  totalHoursDecimal: number
  workedMinutes: number
  lateMinutes: number
  earlyOutMinutes: number
  undertimeMinutes: number
  status: string
  statusVariant: 'success' | 'warning' | 'outline' | 'destructive' | 'secondary'
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

export interface ManualAttendanceRecord {
  id: string // `${bioId}_${date}`
  bioId: string
  employeeName?: string
  date: string // YYYY-MM-DD
  scheduleContext?: string // e.g. "8:00 AM → 5:00 PM (Group C)"
  originalIn?: string // e.g. "—" or "8:07 AM"
  originalOut?: string // e.g. "5:20 PM" or "—"
  manualIn?: string // e.g. "08:00 AM" or "08:00"
  manualOut?: string
  reason: string
  notes?: string
  status: 'Pending' | 'Approved' | 'Rejected'
  requestedBy: string
  requestedAt: string
  approvedBy?: string
  approvedAt?: string
  reviewedBy?: string
  reviewedAt?: string
  rejectionReason?: string
  createdAt: string
  updatedAt: string
}

export interface ManualAttendanceHistoryRecord {
  id: string
  requestId: string
  employeeId: string
  employeeName: string
  attendanceDate: string
  attendanceTime: string
  attendanceType: string
  status: 'Approved' | 'Rejected'
  remarks: string
  processedBy: string
  processedAt: string
}

export class DMBBHRDatabase extends Dexie {
  workGroups!: Table<WorkGroupRecord, string>
  biometricPunches!: Table<BiometricPunchRecord, string>
  employees!: Table<EmployeeRecord, string>
  dailyAttendance!: Table<DailyAttendanceRecordDB, string>
  dailySummaries!: Table<DailySummaryRecord, string>
  schedules!: Table<ShiftScheduleRecord, string>
  leaveRecords!: Table<LeaveRecord, string>
  holidays!: Table<HolidayRecord, string>
  importJobs!: Table<ImportJobRecord, string>
  manualAdjustments!: Table<ManualAttendanceRecord, string>
  manualAttendanceHistory!: Table<ManualAttendanceHistoryRecord, string>

  constructor() {
    super('DMBBHR_LocalDB')

    // Schema definition with targeted high-performance indices
    this.version(5).stores({
      workGroups: 'id, name, code, isDefault',
      biometricPunches: 'id, bioId, date, timestampMs, deviceId, isDuplicate, [date+bioId], [bioId+timestampMs]',
      employees: 'bioId, fullName, location, workGroupId, status',
      dailyAttendance: 'id, bioId, date, status, location, workGroupId, [date+location]',
      dailySummaries: 'date',
      schedules: 'id, code, location',
      leaveRecords: 'id, bioId, startDate, endDate, status',
      holidays: 'id, date',
      importJobs: 'id, importedAt',
      manualAdjustments: 'id, bioId, date, status, [bioId+date], [status+date]'
    })

    this.version(6).stores({
      manualAttendanceHistory: 'id, requestId, employeeId, attendanceDate, status, processedAt, [status+processedAt]'
    })
  }
}

export const db = new DMBBHRDatabase()
