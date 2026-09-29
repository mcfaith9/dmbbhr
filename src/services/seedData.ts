import type { Location, BiometricDevice, Employee, AttendanceLog, User } from '@/types'

export const SEED_LOCATIONS: Location[] = [
  { id: 'loc-cebu', code: 'CEB', name: 'DBB Cebu', is_active: true },
  { id: 'loc-negros', code: 'NEG', name: 'DBB Negros', is_active: false }, // Future location
  { id: 'loc-iloilo', code: 'ILO', name: 'DBB Iloilo', is_active: false }, // Future location
]

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
    status: 'online',
    last_seen: new Date().toISOString(),
    last_sync: '2026-09-29T14:09:52+08:00',
    description: 'Main lobby attendance reader (DBB Cebu Office)'
  }
]

export const SEED_USERS: User[] = [
  {
    id: 'u-1',
    username: 'dmbbhr',
    name: 'DMBB HR Administrator',
    email: 'hr@dmbb.com',
    role: 'admin',
    avatar: '',
    accessible_location_ids: ['loc-cebu', 'loc-negros', 'loc-iloilo']
  },
  {
    id: 'u-2',
    username: 'admin',
    name: 'System Administrator',
    email: 'admin@dmbb.com',
    role: 'admin',
    avatar: '',
    accessible_location_ids: ['loc-cebu', 'loc-negros', 'loc-iloilo']
  }
]

export const SEED_EMPLOYEES: Employee[] = [
  {
    id: 'emp-1',
    employee_number: 'EMP-05009',
    biometric_user_id: '5009',
    first_name: 'Dothy Marie',
    last_name: 'Pasana',
    middle_name: 'K',
    full_name: 'K Pasana, Dothy Marie',
    department: 'Operations',
    position: 'Operations Officer',
    location_id: 'loc-cebu',
    status: 'active'
  },
  {
    id: 'emp-2',
    employee_number: 'EMP-25013',
    biometric_user_id: '25013',
    first_name: 'Kenneth',
    last_name: 'Alvarez',
    full_name: 'Alvarez, Kenneth',
    department: 'Finance',
    position: 'Accountant',
    location_id: 'loc-cebu',
    status: 'active'
  },
  {
    id: 'emp-3',
    employee_number: 'EMP-50366',
    biometric_user_id: '50366',
    first_name: 'Roberto',
    last_name: 'Santos',
    full_name: 'Santos, Roberto',
    department: 'Human Resources',
    position: 'HR Specialist',
    location_id: 'loc-cebu',
    status: 'active'
  },
  {
    id: 'emp-4',
    employee_number: 'EMP-10244',
    biometric_user_id: '10244',
    first_name: 'Maria Elena',
    last_name: 'Cruz',
    full_name: 'Cruz, Maria Elena',
    department: 'Logistics',
    position: 'Logistics Coordinator',
    location_id: 'loc-cebu',
    status: 'active'
  },
  {
    id: 'emp-5',
    employee_number: 'EMP-31088',
    biometric_user_id: '31088',
    first_name: 'John Paul',
    last_name: 'Villanueva',
    full_name: 'Villanueva, John Paul',
    department: 'Engineering',
    position: 'Technical Specialist',
    location_id: 'loc-cebu',
    status: 'active'
  }
]

export const SEED_LOGS: AttendanceLog[] = [
  {
    id: 'log-1',
    user_id: '5009',
    employee_id: 'emp-1',
    employee_name: 'K Pasana, Dothy Marie',
    attendance_time: '2026-06-18T14:26:18+08:00',
    type: 1,
    state: 1,
    serial_number: 10,
    device_id: 'dev-1',
    device_name: 'BISBIO B-29b',
    device_ip: '192.168.1.201',
    location_id: 'loc-cebu',
    location_name: 'DBB Cebu',
    is_duplicate: false,
    created_at: '2026-06-18T14:26:18+08:00'
  },
  {
    id: 'log-2',
    user_id: '25013',
    employee_id: 'emp-2',
    employee_name: 'Alvarez, Kenneth',
    attendance_time: '2026-06-18T16:57:30+08:00',
    type: 1,
    state: 1,
    serial_number: 391,
    device_id: 'dev-1',
    device_name: 'BISBIO B-29b',
    device_ip: '192.168.1.201',
    location_id: 'loc-cebu',
    location_name: 'DBB Cebu',
    is_duplicate: false,
    created_at: '2026-06-18T16:57:30+08:00'
  },
  {
    id: 'log-3',
    user_id: '25013',
    employee_id: 'emp-2',
    employee_name: 'Alvarez, Kenneth',
    attendance_time: '2026-06-18T16:57:32+08:00',
    type: 1,
    state: 1,
    serial_number: 391,
    device_id: 'dev-1',
    device_name: 'BISBIO B-29b',
    device_ip: '192.168.1.201',
    location_id: 'loc-cebu',
    location_name: 'DBB Cebu',
    is_duplicate: true, // Duplicate scan 2 seconds apart
    created_at: '2026-06-18T16:57:32+08:00'
  },
  {
    id: 'log-4',
    user_id: '50366',
    employee_id: 'emp-3',
    employee_name: 'Santos, Roberto',
    attendance_time: '2026-09-29T07:54:12+08:00',
    type: 1,
    state: 1,
    serial_number: 512,
    device_id: 'dev-1',
    device_name: 'BISBIO B-29b',
    device_ip: '192.168.1.201',
    location_id: 'loc-cebu',
    location_name: 'DBB Cebu',
    is_duplicate: false,
    created_at: '2026-09-29T07:54:12+08:00'
  },
  {
    id: 'log-5',
    user_id: '10244',
    employee_id: 'emp-4',
    employee_name: 'Cruz, Maria Elena',
    attendance_time: '2026-09-29T08:02:40+08:00',
    type: 1,
    state: 1,
    serial_number: 513,
    device_id: 'dev-1',
    device_name: 'BISBIO B-29b',
    device_ip: '192.168.1.201',
    location_id: 'loc-cebu',
    location_name: 'DBB Cebu',
    is_duplicate: false,
    created_at: '2026-09-29T08:02:40+08:00'
  },
  {
    id: 'log-6',
    user_id: '5009',
    employee_id: 'emp-1',
    employee_name: 'K Pasana, Dothy Marie',
    attendance_time: '2026-09-29T08:15:22+08:00',
    type: 1,
    state: 1,
    serial_number: 514,
    device_id: 'dev-1',
    device_name: 'BISBIO B-29b',
    device_ip: '192.168.1.201',
    location_id: 'loc-cebu',
    location_name: 'DBB Cebu',
    is_duplicate: false,
    created_at: '2026-09-29T08:15:22+08:00'
  },
  {
    id: 'log-7',
    user_id: '31088',
    employee_id: 'emp-5',
    employee_name: 'Villanueva, John Paul',
    attendance_time: '2026-09-29T08:29:05+08:00',
    type: 1,
    state: 1,
    serial_number: 515,
    device_id: 'dev-1',
    device_name: 'BISBIO B-29b',
    device_ip: '192.168.1.201',
    location_id: 'loc-cebu',
    location_name: 'DBB Cebu',
    is_duplicate: false,
    created_at: '2026-09-29T08:29:05+08:00'
  },
  {
    id: 'log-8',
    user_id: '5009',
    employee_id: 'emp-1',
    employee_name: 'K Pasana, Dothy Marie',
    attendance_time: '2026-09-29T12:05:44+08:00',
    type: 1,
    state: 2,
    serial_number: 520,
    device_id: 'dev-1',
    device_name: 'BISBIO B-29b',
    device_ip: '192.168.1.201',
    location_id: 'loc-cebu',
    location_name: 'DBB Cebu',
    is_duplicate: false,
    created_at: '2026-09-29T12:05:44+08:00'
  },
  {
    id: 'log-9',
    user_id: '5009',
    employee_id: 'emp-1',
    employee_name: 'K Pasana, Dothy Marie',
    attendance_time: '2026-09-29T12:58:19+08:00',
    type: 1,
    state: 3,
    serial_number: 524,
    device_id: 'dev-1',
    device_name: 'BISBIO B-29b',
    device_ip: '192.168.1.201',
    location_id: 'loc-cebu',
    location_name: 'DBB Cebu',
    is_duplicate: false,
    created_at: '2026-09-29T12:58:19+08:00'
  },
  {
    id: 'log-10',
    user_id: '25013',
    employee_id: 'emp-2',
    employee_name: 'Alvarez, Kenneth',
    attendance_time: '2026-09-29T17:15:30+08:00',
    type: 1,
    state: 4,
    serial_number: 540,
    device_id: 'dev-1',
    device_name: 'BISBIO B-29b',
    device_ip: '192.168.1.201',
    location_id: 'loc-cebu',
    location_name: 'DBB Cebu',
    is_duplicate: false,
    created_at: '2026-09-29T17:15:30+08:00'
  }
]
