export interface Location {
  id: string
  code: string
  name: string
  is_active: boolean
  created_at?: string
}

export interface BiometricDevice {
  id: string
  name: string
  model: string
  ip_address: string
  port: number
  subnet?: string
  gateway?: string
  serial_number: string
  mac_address?: string
  firmware_version?: string
  location_id: string
  location?: Location
  status: 'online' | 'offline' | 'connecting' | 'error'
  last_seen: string | null
  last_sync?: string | null
  description?: string
}

export type EmployeeLocation = 'DMBB CEBU' | 'DBB CEBU' | 'DBB NEGROS' | 'DBB ILOILO'

export interface WorkGroup {
  id: string // e.g. "wg-group-a", "wg-group-b", "wg-group-c"
  name: string // "Group A", "Group B", "Group C"
  code: string // "A", "B", "C" (unique short code)
  standard_in: string // "06:00", "07:00", "08:00" (24h format HH:mm)
  required_work_minutes: number // 480 (8 hours)
  lunch_start: string // "12:00"
  lunch_end: string // "13:00" (1 hour unpaid lunch)
  expected_out: string // Calculated automatically (e.g. "15:00" / "3:00 PM")
  grace_period_minutes: number // 15
  is_default: boolean
  description?: string
  created_at?: string
  updated_at?: string
}

export type EmploymentStatus = 'active' | 'inactive' | 'on_leave' | 'resigned' | 'suspended' | 'csr'

export type BiometricIdRole = 'primary' | 'secondary'
export type BiometricIdStatus = 'active' | 'inactive'

export interface BiometricIdEntry {
  bioId: string
  role: BiometricIdRole
  status: BiometricIdStatus
  addedAt: string
  deactivatedAt?: string
  reactivatedAt?: string
  notes?: string
}

export interface Employee {
  id: string
  employee_number: string // Canonical Employee ID (= primary/canonical Bio ID)
  biometric_user_id: string // Canonical primary Bio ID
  canonical_bio_id?: string // Permanent underlying canonical profile key (EmployeeRecord.bioId)
  primary_bio_id?: string // Active primary biometric ID for attendance & display
  biometric_ids?: BiometricIdEntry[] // Full list of primary, secondary, and inactive biometric IDs
  linked_bio_ids?: string[] // Convenience array of all linked Bio IDs
  full_name: string
  preferred_name?: string
  photo?: string | null // Photo path e.g. /employee-photos/25065.jpg or data URL
  date_of_birth?: string // YYYY-MM-DD
  gender?: 'Male' | 'Female' | 'Other' | 'not_specified' | string
  civil_status?: 'Single' | 'Married' | 'Widowed' | 'Separated' | 'not_specified' | string
  // Contact Information
  mobile_number?: string
  email?: string
  alternate_number?: string
  home_address?: string
  // Emergency Contact
  emergency_contact_name?: string
  emergency_contact_relationship?: string
  emergency_contact_number?: string
  // Employment Information
  location: EmployeeLocation
  work_group_id: string // References WorkGroup.id
  work_group_name?: string
  work_group_code?: string
  first_name?: string
  last_name?: string
  middle_name?: string
  department?: string
  position?: string
  location_id?: string
  hire_date?: string // Date Hired
  contract_date?: string // Contract Date
  regularization_date?: string // Date Regularized
  resignation_date?: string // Date Resigned / Effective Date
  status: EmploymentStatus
  exclude_from_biometric?: boolean // Excluded from biometric attendance monitoring & absence calculation
  // Payroll Profile Information
  payroll_status?: 'configured' | 'pending' | 'exempt'
  salary_type?: 'Monthly' | 'Daily' | 'Hourly'
  basic_salary?: number
  daily_rate?: number
  hourly_rate?: number
  pay_frequency?: 'Semi-Monthly' | 'Monthly' | 'Weekly' | string
  payment_method?: 'Bank Transfer' | 'Cash' | 'Cheque' | string
  bank_name?: string
  bank_account_number?: string
  allowances?: number
  de_minimis?: number
  salary_effective_date?: string
  sss_number?: string
  philhealth_number?: string
  pagibig_number?: string
  tin?: string
  tax_status?: string
  sss_deduction?: number
  philhealth_deduction?: number
  pagibig_deduction?: number
  other_deductions?: number
  created_at?: string
  updated_at?: string
}

export interface AttendanceLog {
  id: string
  user_id: string // Biometric User ID, e.g. 5009, 25013
  employee_id?: string
  employee_name?: string
  department?: string
  work_group_id?: string
  work_group_name?: string
  attendance_time: string // ISO string or format "Jun 18, 2026, 2:26 PM"
  raw_time?: string
  type: number // raw biometric type value
  state: number // raw biometric state value
  serial_number: number | string // raw biometric record serial/counter
  device_id: string
  device_name?: string
  device_ip: string
  location_id: string
  location_name?: string
  source_bio_id?: string // Original device biometric ID when resolved via a secondary/linked Bio ID
  linked_employee_bio_id?: string // Canonical employee primary Bio ID if resolved across multiple Bio IDs
  is_duplicate?: boolean
  created_at: string
}

export interface User {
  id: string
  username: string
  name: string
  email: string
  role: 'admin' | 'hr' | 'viewer'
  avatar?: string
  accessible_location_ids: string[]
}

export interface AttendanceFilterParams {
  search?: string
  userId?: string
  locationId?: string
  workGroupId?: string
  deviceId?: string
  date?: string
  startDate?: string
  endDate?: string
  state?: number | string
  type?: number | string
  quickRange?: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom' | 'all'
  page?: number
  pageSize?: number
}

export interface PaginationMeta {
  currentPage: number
  pageSize: number
  totalItems: number
  totalPages: number
}
