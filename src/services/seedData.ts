import type { Location, BiometricDevice, Employee, AttendanceLog, User } from '@/types'

/**
 * Minimum static organizational configuration
 */
export const SEED_LOCATIONS: Location[] = [
  { id: 'loc-cebu', code: 'CEB', name: 'DBB Cebu', is_active: true }
]

/**
 * Registered Biometric Device Configuration (Defaults to 'configured' until real agent confirms connection)
 */
export const SEED_DEVICES: BiometricDevice[] = [
  {
    id: 'dev-1',
    name: 'BISBIO B-29b',
    model: 'BISMAC BISBIO B-29b',
    ip_address: '192.168.1.201',
    port: 4370,
    subnet: '255.255.255.0',
    gateway: '0.0.0.0',
    serial_number: '0476141400046',
    mac_address: '00:17:61:10:0c:a3',
    firmware_version: '6.5.4 Build 142',
    location_id: 'loc-cebu',
    status: 'offline', // Default to offline until live agent establishes socket connection
    last_seen: '',
    last_sync: '',
    description: 'Main lobby attendance reader (DBB Cebu Office)'
  }
]

/**
 * System Administration User Accounts for Authentication (REQUIRED FOR LOGIN)
 */
export const SEED_USERS: User[] = [
  {
    id: 'u-1',
    username: 'dmbbhr',
    name: 'DMBB HR Administrator',
    email: 'hr@dmbb.com',
    role: 'admin',
    avatar: '',
    accessible_location_ids: ['loc-cebu']
  },
  {
    id: 'u-2',
    username: 'admin',
    name: 'System Administrator',
    email: 'admin@dmbb.com',
    role: 'admin',
    avatar: '',
    accessible_location_ids: ['loc-cebu']
  }
]

/**
 * Employee Directory (Empty by default until synced or imported from real device)
 */
export const SEED_EMPLOYEES: Employee[] = []

/**
 * Attendance Logs (Clean: Empty by default until real scans arrive)
 */
export const SEED_LOGS: AttendanceLog[] = []
