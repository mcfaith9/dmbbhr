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

export interface Employee {
  id: string
  employee_number: string
  biometric_user_id: string
  first_name: string
  last_name: string
  middle_name?: string
  full_name: string
  department: string
  position: string
  location_id: string
  location?: Location
  hire_date?: string
  status: 'active' | 'inactive' | 'on_leave'
}

export interface AttendanceLog {
  id: string
  user_id: string // Biometric User ID, e.g. 5009, 25013
  employee_id?: string
  employee_name?: string
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
