import { createRouter, createWebHashHistory } from 'vue-router'
import { authService } from '@/services/auth'

// Lazy loaded views
const DashboardView = () => import('@/views/DashboardView.vue')
const AttendanceLogsView = () => import('@/views/AttendanceLogsView.vue')
const DailyAttendanceView = () => import('@/views/DailyAttendanceView.vue')
const EmployeesView = () => import('@/views/EmployeesView.vue')
const DevicesView = () => import('@/views/DevicesView.vue')
const SchedulesView = () => import('@/views/SchedulesView.vue')
const LeaveView = () => import('@/views/LeaveView.vue')
const OvertimeView = () => import('@/views/OvertimeView.vue')
const HolidaysView = () => import('@/views/HolidaysView.vue')
const PayrollPeriodsView = () => import('@/views/PayrollPeriodsView.vue')
const PayrollRecordsView = () => import('@/views/PayrollRecordsView.vue')
const ReportsView = () => import('@/views/ReportsView.vue')
const UsersView = () => import('@/views/UsersView.vue')
const SettingsView = () => import('@/views/SettingsView.vue')
const LoginPage = () => import('@/components/pages/login/index.vue')
const AppLayout = () => import('@/layouts/AppLayout.vue')

export const router = createRouter({
  history: createWebHashHistory(), // Hash history for reliable preview / local network
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginPage,
      meta: { requiresAuth: false, title: 'Login' }
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
          redirect: '/attendance/logs'
        },
        {
          path: 'attendance/logs',
          name: 'attendance-logs',
          component: AttendanceLogsView,
          meta: { title: 'Attendance Logs', breadcrumb: ['Attendance', 'Attendance Logs'] }
        },
        {
          path: 'attendance/daily',
          name: 'attendance-daily',
          component: DailyAttendanceView,
          meta: { title: 'Daily Attendance', breadcrumb: ['Attendance', 'Daily Attendance'] }
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
          name: 'users',
          component: UsersView,
          meta: { title: 'User Management', breadcrumb: ['Administration', 'Users'] }
        },
        {
          path: 'settings',
          name: 'settings',
          component: SettingsView,
          meta: { title: 'Settings', breadcrumb: ['Administration', 'Settings'] }
        }
      ]
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/dashboard'
    }
  ]
})

// Authentication Route Guard
router.beforeEach((to, _from, next) => {
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth !== false)
  const isAuth = authService.isAuthenticated()

  if (requiresAuth && !isAuth) {
    next({ name: 'login', query: { redirect: to.fullPath } })
  } else if (to.name === 'login' && isAuth) {
    next({ name: 'dashboard' })
  } else {
    next()
  }
})
