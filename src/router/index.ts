import { createRouter, createWebHashHistory } from 'vue-router'
import { authService } from '@/services/auth'

// Lazy loaded views
const DashboardView = () => import('@/views/DashboardView.vue')
const AttendanceLogsView = () => import('@/views/AttendanceLogsView.vue')
const DailyAttendanceView = () => import('@/views/DailyAttendanceView.vue')
const ManualTimeView = () => import('@/views/ManualTimeView.vue')
const EmployeesView = () => import('@/views/EmployeesView.vue')
const DevicesView = () => import('@/views/DevicesView.vue')
const SchedulesView = () => import('@/views/SchedulesView.vue')
const LeaveView = () => import('@/views/LeaveView.vue')
const OvertimeView = () => import('@/views/OvertimeView.vue')
const HolidaysView = () => import('@/views/HolidaysView.vue')
const PayrollPeriodsView = () => import('@/views/PayrollPeriodsView.vue')
const PayrollRecordsView = () => import('@/views/PayrollRecordsView.vue')
const ReportsView = () => import('@/views/ReportsView.vue')
const UserAccountsView = () => import('@/views/settings/UserAccountsView.vue')
const SettingsView = () => import('@/views/settings/SettingsView.vue')
const AttendanceConfigurationView = () => import('@/views/settings/AttendanceConfigurationView.vue')
const SystemIntegrationsView = () => import('@/views/settings/SystemIntegrationsView.vue')
const LoginView = () => import('@/views/LoginView.vue')
const PunchDisplayView = () => import('@/views/PunchDisplayView.vue')
const AppLayout = () => import('@/layouts/AppLayout.vue')

export const router = createRouter({
  history: createWebHashHistory(), // Hash history for reliable preview / local network
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { requiresAuth: false, title: 'Login' }
    },
    {
      path: '/punch-display',
      name: 'punch-display',
      component: PunchDisplayView,
      meta: { requiresAuth: false, title: 'Real-Time Biometric Punch Display' }
    },
    {
      path: '/',
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: '/dashboard'
        },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: DashboardView,
          meta: { title: 'Dashboard', breadcrumb: ['DMBBHR', 'Dashboard'] }
        },
        {
          path: 'attendance',
          redirect: '/attendance/daily'
        },
        {
          path: 'attendance/daily',
          name: 'attendance-daily',
          component: DailyAttendanceView,
          meta: { title: 'Daily Attendance', breadcrumb: ['Attendance', 'Daily Attendance'] }
        },
        {
          path: 'attendance/logs',
          name: 'attendance-logs',
          component: AttendanceLogsView,
          meta: { title: 'Attendance Logs', breadcrumb: ['Attendance', 'Attendance Logs'] }
        },
        {
          path: 'attendance/manual',
          name: 'attendance-manual',
          component: ManualTimeView,
          meta: { title: 'Manual Time', breadcrumb: ['Attendance', 'Manual Time'] }
        },
        {
          path: 'employees',
          name: 'employees',
          component: EmployeesView,
          meta: { title: 'Employees', breadcrumb: ['Employees', 'Directory'] }
        },
        {
          path: 'devices',
          name: 'devices',
          component: DevicesView,
          meta: { title: 'Biometric Devices', breadcrumb: ['Biometric Devices', 'Device List'] }
        },
        {
          path: 'schedules',
          name: 'schedules',
          component: SchedulesView,
          meta: { title: 'Schedules', breadcrumb: ['Schedules', 'Shift Schedules'] }
        },
        {
          path: 'leave',
          name: 'leave',
          component: LeaveView,
          meta: { title: 'Leave Management', breadcrumb: ['Leave', 'Requests & Balances'] }
        },
        {
          path: 'overtime',
          name: 'overtime',
          component: OvertimeView,
          meta: { title: 'Overtime', breadcrumb: ['Overtime', 'Requests & Authorizations'] }
        },
        {
          path: 'holidays',
          name: 'holidays',
          component: HolidaysView,
          meta: { title: 'Holidays', breadcrumb: ['Holidays', 'Calendar'] }
        },
        {
          path: 'payroll',
          redirect: '/payroll/periods'
        },
        {
          path: 'payroll/periods',
          name: 'payroll-periods',
          component: PayrollPeriodsView,
          meta: { title: 'Payroll Periods', breadcrumb: ['Payroll', 'Periods'] }
        },
        {
          path: 'payroll/records',
          name: 'payroll-records',
          component: PayrollRecordsView,
          meta: { title: 'Payroll Records', breadcrumb: ['Payroll', 'Records'] }
        },
        {
          path: 'reports',
          name: 'reports',
          component: ReportsView,
          meta: { title: 'Reports', breadcrumb: ['Reports', 'Summary'] }
        },
        {
          path: 'users',
          redirect: '/settings/users'
        },
        {
          path: 'settings',
          name: 'settings',
          component: SettingsView,
          meta: { title: 'Settings', breadcrumb: ['Settings', 'Overview'] }
        },
        {
          path: 'settings/users',
          name: 'settings-users',
          component: UserAccountsView,
          alias: ['settings/accounts'],
          meta: { title: 'User Accounts', breadcrumb: ['Settings', 'User Accounts'] }
        },
        {
          path: 'settings/attendance',
          name: 'settings-attendance',
          component: AttendanceConfigurationView,
          alias: ['settings/attendance-configuration', 'settings/attendance_configuration'],
          meta: { title: 'Attendance Configuration', breadcrumb: ['Settings', 'Attendance Configuration'] }
        },
        {
          path: 'settings/system',
          name: 'settings-system',
          component: SystemIntegrationsView,
          alias: ['settings/system-integrations', 'settings/system_integrations'],
          meta: { title: 'System & Integrations', breadcrumb: ['Settings', 'System & Integrations'] }
        }
      ]
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/dashboard'
    }
  ]
})

// Authentication Route Guard (Return-based pattern per Vue Router modern API)
router.beforeEach((to) => {
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth !== false)
  const isAuth = authService.isAuthenticated()

  if (requiresAuth && !isAuth) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  
  if (to.name === 'login' && isAuth) {
    return { name: 'dashboard' }
  }

  return
})
