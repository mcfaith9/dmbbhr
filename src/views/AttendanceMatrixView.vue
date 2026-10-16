<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Coffee,
  Sparkles,
  RefreshCw,
  Building2,
  ExternalLink,
  ChevronsUpDown,
  Check,
  Users,
  Fingerprint
} from '@lucide/vue'
import { employeeService } from '@/services/employees'
import { attendanceService, type DailyAttendanceRecord } from '@/services/attendance'
import { holidayService } from '@/services/holidays/holidayService'
import type { Employee, WorkGroup } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'

const route = useRoute()

// Employee directory state
const employees = ref<Employee[]>([])
const selectedBioId = ref<string>('')
const employeeSearchQuery = ref('')
const isEmployeeSelectorOpen = ref(false)
const isLoadingEmployees = ref(true)
const workGroups = ref<WorkGroup[]>([])

function selectEmployee(bioId: string) {
  selectedBioId.value = bioId
  isEmployeeSelectorOpen.value = false
  employeeSearchQuery.value = ''
}

// Duty period state: 15-day sliding window or semi-monthly anchor
// Default period: Current 15-day period (1st to 15th, or 16th to end of month)
const periodAnchorDate = ref<Date>(new Date())
const isLoadingAttendance = ref(false)

// Cached attendance records for selected employee across the current period
const attendanceRecordsMap = ref<Map<string, DailyAttendanceRecord>>(new Map())
const holidaysMap = ref<Map<string, { name: string; type: string }>>(new Map())

// Filtered selectable employees list (excluding resigned employees by default)
const selectableEmployees = computed(() => {
  const activeOnly = employees.value.filter(e => e.status !== 'resigned')
  if (!employeeSearchQuery.value.trim()) {
    return activeOnly
  }
  const q = employeeSearchQuery.value.toLowerCase().trim()
  return activeOnly.filter(e =>
    e.full_name.toLowerCase().includes(q) ||
    String(e.biometric_user_id).includes(q) ||
    String(e.employee_number || '').toLowerCase().includes(q) ||
    String(e.department || '').toLowerCase().includes(q)
  )
})

// The currently selected employee record
const selectedEmployee = computed(() => {
  if (!selectedBioId.value) return null
  return employees.value.find(
    e => e.biometric_user_id === selectedBioId.value || e.employee_number === selectedBioId.value
  ) || null
})

/**
 * Computes the 15-day period based on the periodAnchorDate.
 * Semi-monthly cut-offs (standard Philippine payroll pattern):
 * - If anchor day <= 15: Day 1 through Day 15 (15 days)
 * - If anchor day >= 16: Day 16 through Day 30 (or last day of month)
 */
interface DutyPeriodInfo {
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
  startDisplay: string // e.g. "Jun 1, 2026"
  endDisplay: string   // e.g. "Jun 15, 2026"
  periodLabel: string  // e.g. "First Half (1–15)" or "Second Half (16–30)"
  dates: string[]      // 15 date strings
}

const currentPeriod = computed<DutyPeriodInfo>(() => {
  const anchor = new Date(periodAnchorDate.value)
  const year = anchor.getFullYear()
  const month = anchor.getMonth() // 0-indexed
  const day = anchor.getDate()

  const dates: string[] = []
  let startDateStr = ''
  let endDateStr = ''
  let periodLabel = ''

  if (day <= 15) {
    // 1st half: 1 to 15 (exactly 15 days)
    for (let d = 1; d <= 15; d++) {
      const mm = String(month + 1).padStart(2, '0')
      const dd = String(d).padStart(2, '0')
      const dStr = `${year}-${mm}-${dd}`
      dates.push(dStr)
    }
    startDateStr = dates[0]
    endDateStr = dates[dates.length - 1]
    periodLabel = '1st Half (Days 1–15)'
  } else {
    // 2nd half: 16 to end of month (e.g. 16-30 = 15 days, 16-31 = 16 days, Feb = 13/14 days)
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate()
    for (let d = 16; d <= lastDayOfMonth; d++) {
      const mm = String(month + 1).padStart(2, '0')
      const dd = String(d).padStart(2, '0')
      dates.push(`${year}-${mm}-${dd}`)
    }
    startDateStr = dates[0]
    endDateStr = dates[dates.length - 1]
    periodLabel = `2nd Half (Days 16–${lastDayOfMonth})`
  }

  const [sY, sM, sD] = startDateStr.split('-').map(Number)
  const [eY, eM, eD] = endDateStr.split('-').map(Number)

  const startDisplay = new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(sY, sM - 1, sD))

  const endDisplay = new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(eY, eM - 1, eD))

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    startDisplay,
    endDisplay,
    periodLabel,
    dates
  }
})

// Navigation: Previous period
function goToPreviousPeriod() {
  const current = new Date(periodAnchorDate.value)
  const day = current.getDate()
  if (day > 15) {
    // Move from 2nd half to 1st half of current month
    current.setDate(1)
  } else {
    // Move from 1st half to 2nd half of previous month
    current.setDate(0) // Last day of previous month
  }
  periodAnchorDate.value = current
}

// Navigation: Next period
function goToNextPeriod() {
  const current = new Date(periodAnchorDate.value)
  const day = current.getDate()
  if (day <= 15) {
    // Move from 1st half to 2nd half of current month
    current.setDate(16)
  } else {
    // Move from 2nd half to 1st half of next month
    current.setDate(1)
    current.setMonth(current.getMonth() + 1)
  }
  periodAnchorDate.value = current
}

function goToTodayPeriod() {
  periodAnchorDate.value = new Date()
}

/**
 * Duty cell evaluation for an individual date.
 */
export interface DutyCellData {
  date: string
  dayOfMonth: number
  dayOfWeek: string // "Mon", "Tue", etc.
  isSunday: boolean
  isToday: boolean
  isFuture: boolean
  statusCategory: 'present' | 'absent' | 'rest_day' | 'holiday' | 'unverified' | 'leave'
  statusLabel: string
  statusBadgeVariant: 'success' | 'destructive' | 'secondary' | 'outline' | 'warning'
  timeIn?: string
  timeOut?: string
  workHours?: string
  lateMinutes?: number
  notes?: string
}

const dutyCells = computed<DutyCellData[]>(() => {
  const dates = currentPeriod.value.dates
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  return dates.map(dStr => {
    const [y, m, d] = dStr.split('-').map(Number)
    const dateObj = new Date(Date.UTC(y, m - 1, d))
    const dayOfWeek = dateObj.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' })
    const dayNum = dateObj.getUTCDate()
    const isSunday = dateObj.getUTCDay() === 0
    const isToday = dStr === todayStr
    const isFuture = dStr > todayStr

    // Check holiday data
    const hol = holidaysMap.value.get(dStr)

    // Check actual attendance record
    const record = attendanceRecordsMap.value.get(dStr)

    // Has verified attendance punch (IN)
    const hasValidIn = Boolean(record?.actual_in && !record.actual_in.startsWith('Missing') && record.actual_in !== '—')
    const hasValidOut = Boolean(record?.has_valid_out && record.actual_out && record.actual_out !== '—')

    let statusCategory: DutyCellData['statusCategory'] = 'unverified'
    let statusLabel = 'Unverified'
    let statusBadgeVariant: DutyCellData['statusBadgeVariant'] = 'outline'
    let notes = ''

    if (record?.status === 'On Leave') {
      statusCategory = 'leave'
      statusLabel = 'On Leave'
      statusBadgeVariant = 'warning'
      notes = record.notes || 'Approved Leave'
    } else if (isSunday) {
      statusCategory = 'rest_day'

      if (hasValidIn) {
        statusLabel = 'Rest Duty'
        statusBadgeVariant = 'success'
      } else {
        statusLabel = 'Rest Day'
        statusBadgeVariant = 'secondary'
      }

      notes = hasValidIn ? 'Worked on rest day' : 'Sunday Rest Day'
    } else if (hasValidIn) {
      statusCategory = 'present'

      if (record?.late_minutes && record.late_minutes > 0) {
        statusLabel = `Present (Late ${record.late_minutes}m)`
        statusBadgeVariant = 'warning'
      } else {
        statusLabel = 'Present / Duty'
        statusBadgeVariant = 'success'
      }
    } else if (hol) {
      // Official calendar holiday
      statusCategory = 'holiday'
      statusLabel = hol.name || 'Holiday'
      statusBadgeVariant = 'secondary'
      notes = hol.type
    } else if (isSunday) {
      // Standard rest day according to company regular shift (Mon-Sat work, Sun rest)
      statusCategory = 'rest_day'
      statusLabel = 'Rest Day'
      statusBadgeVariant = 'secondary'
      notes = 'Sunday Rest Day'
    } else if (isFuture) {
      // Date has not yet arrived
      statusCategory = 'unverified'
      statusLabel = 'Scheduled'
      statusBadgeVariant = 'outline'
      notes = 'Future date'
    } else {
      // Date has passed, employee has an active working schedule, not a Sunday, not a holiday, no punch
      // Determine absence only when existing schedule and attendance data confirm no duty
      statusCategory = 'absent'
      statusLabel = 'Absent'
      statusBadgeVariant = 'destructive'
      notes = 'No attendance recorded'
    }

    return {
      date: dStr,
      dayOfMonth: dayNum,
      dayOfWeek,
      isSunday,
      isToday,
      isFuture,
      statusCategory,
      statusLabel,
      statusBadgeVariant,
      timeIn: hasValidIn ? record?.actual_in : undefined,
      timeOut: hasValidOut ? record?.actual_out : undefined,
      workHours: record?.total_hours,
      lateMinutes: record?.late_minutes,
      notes
    }
  })
})

// Summary counts for the selected 15-day period
const periodSummary = computed(() => {
  const cells = dutyCells.value
  const presentDays = cells.filter(c => c.statusCategory === 'present').length
  const lateDays = cells.filter(c => c.statusCategory === 'present' && Boolean(c.lateMinutes && c.lateMinutes > 0)).length
  const absentDays = cells.filter(c => c.statusCategory === 'absent').length
  const restDays = cells.filter(c => c.statusCategory === 'rest_day').length
  const holidays = cells.filter(c => c.statusCategory === 'holiday').length
  const leaveDays = cells.filter(c => c.statusCategory === 'leave').length
  const unverifiedDays = cells.filter(c => c.statusCategory === 'unverified').length

  const totalDutyDays = presentDays
  const requiredWorkingDays = cells.filter(c => !c.isSunday && c.statusCategory !== 'holiday').length

  return {
    totalDays: cells.length,
    presentDays,
    lateDays,
    absentDays,
    restDays,
    holidays,
    leaveDays,
    unverifiedDays,
    totalDutyDays,
    requiredWorkingDays
  }
})

/**
 * Loads attendance data for the selected employee across all dates in the period.
 */
async function loadEmployeePeriodAttendance() {
  if (!selectedBioId.value) {
    attendanceRecordsMap.value.clear()
    return
  }

  isLoadingAttendance.value = true
  try {
    const dates = currentPeriod.value.dates
    const map = new Map<string, DailyAttendanceRecord>()

    // Use fast single-date indexed queries across the 15-day period
    await Promise.all(
      dates.map(async (dStr) => {
        try {
          const daily = await attendanceService.getDailyAttendance(
            dStr,
            'all',
            'all',
            {},
            selectedBioId.value
          )
          if (daily && daily.length > 0) {
            map.set(dStr, daily[0])
          }
        } catch {
          // ignore date lookup error
        }
      })
    )

    attendanceRecordsMap.value = map
  } finally {
    isLoadingAttendance.value = false
  }
}

/**
 * Loads holidays for the current period's year.
 */
async function loadHolidays() {
  const year = periodAnchorDate.value.getFullYear()
  try {
    const res = await holidayService.getHolidays(year)
    const map = new Map<string, { name: string; type: string }>()
    for (const h of res.holidays) {
      map.set(h.date, { name: h.name, type: h.type })
    }
    holidaysMap.value = map
  } catch {
    // ignore
  }
}

// Watchers
watch(
  () => [selectedBioId.value, currentPeriod.value.startDate, currentPeriod.value.endDate],
  () => {
    loadEmployeePeriodAttendance()
  }
)

watch(
  () => periodAnchorDate.value.getFullYear(),
  () => {
    loadHolidays()
  }
)

onMounted(async () => {
  isLoadingEmployees.value = true
  try {
    const [empList, wgList] = await Promise.all([
      employeeService.getEmployees(),
      employeeService.getWorkGroups()
    ])
    employees.value = empList
    workGroups.value = wgList

    // Pre-select employee from query params if supplied
    const queryBioId = (route.query.bioId || route.query.id || route.query.userId) as string | undefined
    if (queryBioId && empList.some(e => e.biometric_user_id === queryBioId || e.employee_number === queryBioId)) {
      selectedBioId.value = queryBioId
    } else {
      // Default to first active non-resigned employee
      const firstActive = empList.find(e => e.status !== 'resigned')
      if (firstActive) {
        selectedBioId.value = firstActive.biometric_user_id
      }
    }
  } catch (err) {
    console.error('Failed to initialize attendance matrix data:', err)
  } finally {
    isLoadingEmployees.value = false
  }

  await loadHolidays()
  await loadEmployeePeriodAttendance()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header: Title and Controls -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <CalendarDays class="size-5 text-primary shrink-0" />
          <h1 class="text-xl font-bold tracking-tight text-foreground">
            Employee Attendance Matrix
          </h1>
        </div>
        <p class="text-xs text-muted-foreground mt-0.5">
          Fifteen-day semi-monthly attendance matrix, shift compliance, and rest day calendar for payroll verification.
        </p>
      </div>

      <!-- Quick Actions -->
      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          class="h-8 gap-1.5 text-xs cursor-pointer shadow-xs"
          :disabled="isLoadingAttendance"
          @click="loadEmployeePeriodAttendance"
        >
          <RefreshCw :class="['size-3.5', isLoadingAttendance ? 'animate-spin' : '']" />
          <span>Refresh Attendance</span>
        </Button>
      </div>
    </div>

    <!-- Section A: Employee Selector Card -->
    <div class="rounded-xl border bg-card p-3.5 sm:p-4 shadow-xs space-y-3">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <!-- Single Searchable Employee Selector -->
        <div class="flex-1 min-w-0 max-w-xl space-y-1.5">
          <label class="text-xs font-semibold text-foreground flex items-center justify-between">
            <span>Select Employee (Excludes Resigned)</span>
            <span class="text-[11px] text-muted-foreground font-normal">
              {{ employees.filter(e => e.status !== 'resigned').length }} active employees
            </span>
          </label>

          <Popover v-model:open="isEmployeeSelectorOpen">
            <PopoverTrigger as-child>
              <button
                type="button"
                role="combobox"
                :aria-expanded="isEmployeeSelectorOpen"
                class="flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-1.5 text-xs shadow-2xs transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                :class="selectedEmployee ? 'border-primary/40 font-medium' : 'text-muted-foreground'"
              >
                <div class="flex items-center gap-2 truncate mr-2">
                  <Fingerprint v-if="selectedEmployee" class="size-4 text-primary shrink-0" />
                  <Users v-else class="size-4 text-muted-foreground shrink-0" />
                  <span v-if="selectedEmployee" class="truncate text-foreground font-semibold">
                    {{ selectedEmployee.full_name }}
                    <span class="text-[11px] font-mono text-muted-foreground font-normal">
                      (#{{ selectedEmployee.biometric_user_id }}<template v-if="selectedEmployee.department"> • {{ selectedEmployee.department }}</template>)
                    </span>
                  </span>
                  <span v-else class="text-muted-foreground">
                    Search and choose employee...
                  </span>
                </div>
                <ChevronsUpDown class="size-3.5 text-muted-foreground opacity-60 shrink-0" />
              </button>
            </PopoverTrigger>

            <PopoverContent class="w-80 sm:w-96 p-2 shadow-lg rounded-xl text-xs space-y-2" align="start">
              <!-- Search within Selector -->
              <div class="relative">
                <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  v-model="employeeSearchQuery"
                  type="text"
                  placeholder="Search by name, Bio ID, or department..."
                  class="pl-8 h-8 text-xs w-full bg-background"
                  autofocus
                />
              </div>

              <!-- Options List -->
              <div class="max-h-60 overflow-y-auto space-y-0.5 pr-0.5">
                <div v-if="selectableEmployees.length === 0" class="p-3 text-center text-xs text-muted-foreground">
                  No active employee found matching "{{ employeeSearchQuery }}"
                </div>

                <button
                  v-for="emp in selectableEmployees"
                  :key="emp.biometric_user_id"
                  type="button"
                  class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer text-left group"
                  :class="
                    selectedBioId === emp.biometric_user_id
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'hover:bg-muted text-foreground'
                  "
                  @click="selectEmployee(emp.biometric_user_id)"
                >
                  <div class="min-w-0 flex-1 truncate mr-2">
                    <span class="font-medium text-foreground truncate group-hover:text-primary">
                      {{ emp.full_name }}
                    </span>
                    <span v-if="emp.department" class="text-[10px] text-muted-foreground block truncate">
                      {{ emp.department }}
                    </span>
                  </div>

                  <div class="flex items-center gap-1.5 shrink-0">
                    <span class="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium font-mono text-muted-foreground">
                      #{{ emp.biometric_user_id }}
                    </span>
                    <Check
                      v-if="selectedBioId === emp.biometric_user_id"
                      class="size-3.5 text-primary ml-1 shrink-0"
                    />
                  </div>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <!-- Selected Employee Identity Summary Pill -->
        <div
          v-if="selectedEmployee"
          class="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/30 shrink-0 self-start lg:self-auto"
        >
          <Avatar class="size-10 border shadow-2xs">
            <AvatarImage
              v-if="selectedEmployee.photo"
              :src="selectedEmployee.photo"
              :alt="selectedEmployee.full_name"
            />
            <AvatarFallback class="bg-primary/10 text-primary font-bold text-xs">
              {{ selectedEmployee.full_name.charAt(0) }}
            </AvatarFallback>
          </Avatar>
          <div class="flex flex-col text-left leading-tight">
            <span class="font-bold text-foreground text-sm flex items-center gap-1.5">
              {{ selectedEmployee.full_name }}
              <Badge variant="outline" class="text-[10px] py-0 px-1.5 font-mono">
                ID: {{ selectedEmployee.employee_number || selectedEmployee.biometric_user_id }}
              </Badge>
            </span>
            <span class="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
              <span>Bio ID: <strong class="font-mono text-foreground">{{ selectedEmployee.biometric_user_id }}</strong></span>
              <span>•</span>
              <span>{{ selectedEmployee.department || 'Operations' }}</span>
              <span>•</span>
              <span class="uppercase font-semibold text-primary text-[10px]">{{ selectedEmployee.work_group_name || 'Group C' }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Section B: Fifteen-Day Attendance Matrix Navigation & Period Bar -->
    <div class="rounded-xl border bg-card p-3.5 sm:p-4 shadow-xs space-y-3">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <!-- Period Navigation -->
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            class="h-8 size-8 p-0 cursor-pointer"
            title="Previous 15-day period"
            @click="goToPreviousPeriod"
          >
            <ChevronLeft class="size-4" />
          </Button>

          <div class="flex flex-col items-start px-2">
            <div class="flex items-center gap-2">
              <span class="font-bold text-sm text-foreground">
                {{ currentPeriod.startDisplay }} — {{ currentPeriod.endDisplay }}
              </span>
              <Badge variant="secondary" class="text-[10px] font-medium">
                {{ currentPeriod.periodLabel }}
              </Badge>
            </div>
            <span class="text-[11px] text-muted-foreground">
              Official semi-monthly payroll attendance matrix window
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            class="h-8 size-8 p-0 cursor-pointer"
            title="Next 15-day period"
            @click="goToNextPeriod"
          >
            <ChevronRight class="size-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            class="h-8 text-xs cursor-pointer ml-1"
            @click="goToTodayPeriod"
          >
            Current Period
          </Button>
        </div>

        <!-- Metric Summary Chips -->
        <div class="flex items-center gap-2 flex-wrap">
          <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
            <CheckCircle2 class="size-3.5 text-emerald-600" />
            <span>Duty / Present: <strong>{{ periodSummary.presentDays }}</strong> days</span>
          </div>
          <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-medium">
            <Clock class="size-3.5 text-amber-600" />
            <span>Late: <strong>{{ periodSummary.lateDays }}</strong> {{ periodSummary.lateDays === 1 ? 'day' : 'days' }}</span>
          </div>
          <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-destructive/10 border-destructive/20 text-destructive text-xs font-medium">
            <XCircle class="size-3.5 text-destructive" />
            <span>Absent: <strong>{{ periodSummary.absentDays }}</strong> days</span>
          </div>
          <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-muted/60 text-muted-foreground text-xs font-medium">
            <Coffee class="size-3.5 text-muted-foreground" />
            <span>Rest Days: <strong>{{ periodSummary.restDays }}</strong></span>
          </div>
          <div v-if="periodSummary.holidays > 0" class="flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-medium">
            <Sparkles class="size-3.5 text-amber-600" />
            <span>Holidays: <strong>{{ periodSummary.holidays }}</strong></span>
          </div>
        </div>
      </div>

      <!-- Calendar Spreadsheet Grid with Horizontal Scrolling on Small Screens -->
      <div class="w-full overflow-x-auto rounded-lg border bg-background shadow-2xs">
        <div
          class="divide-y divide-border"
          :style="{ minWidth: `${Math.max(960, dutyCells.length * 64)}px` }"
        >
          <!-- Calendar Column Headers: Dates & Days of Week -->
          <div
            class="grid bg-muted/40 divide-x divide-border text-center"
            :style="{ gridTemplateColumns: `repeat(${dutyCells.length}, minmax(0, 1fr))` }"
          >
            <div
              v-for="cell in dutyCells"
              :key="cell.date"
              class="py-2.5 px-1 flex flex-col items-center justify-center transition-colors"
              :class="[
                cell.isToday
                  ? 'bg-primary/10 font-bold'
                  : (cell.isSunday ? 'bg-muted/70 text-muted-foreground' : '')
              ]"
            >
              <span class="text-[10px] uppercase font-mono tracking-wider font-semibold" :class="cell.isSunday ? 'text-rose-500' : 'text-muted-foreground'">
                {{ cell.dayOfWeek }}
              </span>
              <span
                class="text-sm font-black font-mono mt-0.5 rounded-full size-6 flex items-center justify-center"
                :class="cell.isToday ? 'bg-primary text-primary-foreground shadow-2xs' : 'text-foreground'"
              >
                {{ cell.dayOfMonth }}
              </span>
            </div>
          </div>

          <!-- Calendar Cell Content: Duty Status / Punch Times -->
          <div
            class="grid divide-x divide-border text-center min-h-[140px]"
            :style="{ gridTemplateColumns: `repeat(${dutyCells.length}, minmax(0, 1fr))` }"
          >
            <div
              v-for="cell in dutyCells"
              :key="`cell-${cell.date}`"
              class="p-2 flex flex-col justify-between transition-colors hover:bg-muted/10 group relative"
              :class="[
                cell.isToday ? 'bg-primary/5' : '',
                cell.statusCategory === 'present' ? 'bg-emerald-500/[0.03]' : '',
                cell.statusCategory === 'absent' ? 'bg-rose-500/[0.04]' : '',
                cell.statusCategory === 'rest_day' ? 'bg-muted/30' : '',
                cell.statusCategory === 'holiday' ? 'bg-amber-500/[0.04]' : ''
              ]"
            >
              <!-- Top: Status Indicator Pill -->
              <div class="flex justify-center mb-1.5">
                <Badge
                  :variant="cell.statusBadgeVariant"
                  :class="[
                    'text-[9px] px-1.5 py-0 uppercase tracking-tight font-bold shrink-0 truncate max-w-full',
                    cell.statusBadgeVariant === 'destructive' ? 'text-white' : ''
                  ]"
                  :title="cell.statusLabel"
                >
                  <span v-if="cell.statusCategory === 'present' && (cell.lateMinutes ?? 0) > 0">
                    LATE
                  </span>
                  <span v-else-if="cell.statusCategory === 'present'">
                    DUTY
                  </span>
                  <span v-else-if="cell.statusCategory === 'absent'">ABSENT</span>
                  <span v-else-if="cell.statusCategory === 'rest_day'">
                    {{ cell.timeIn ? 'RESTDUTY' : 'REST' }}
                  </span>
                  <span v-else-if="cell.statusCategory === 'holiday'">HOLIDAY</span>
                  <span v-else-if="cell.statusCategory === 'leave'">LEAVE</span>
                  <span v-else>SCHED</span>
                </Badge>
              </div>

              <!-- Middle: Verified Attendance Hours or Context -->
              <div class="flex-1 flex flex-col items-center justify-center py-1 space-y-1">

                <!-- Present Duty or Rest Day with a Punch -->
                <template
                  v-if="
                    cell.statusCategory === 'present' ||
                    (cell.statusCategory === 'rest_day' && cell.timeIn)
                  "
                >
                  <!-- TIME IN -->
                  <div class="text-[10px] font-mono leading-tight">
                    <span class="text-muted-foreground block text-[9px]">IN</span>
                    <span class="font-bold text-emerald-700 dark:text-emerald-400">
                      {{ cell.timeIn }}
                    </span>
                  </div>

                  <!-- TIME OUT -->
                  <div class="text-[10px] font-mono leading-tight">
                    <span class="text-muted-foreground block text-[9px]">OUT</span>
                    <span
                      v-if="cell.timeOut"
                      class="font-bold text-foreground"
                    >
                      {{ cell.timeOut }}
                    </span>
                    <span
                      v-else
                      class="font-semibold text-amber-600 dark:text-amber-400"
                    >
                      No time out
                    </span>
                  </div>

                  <!-- WORK HOURS -->
                  <div
                    v-if="cell.workHours"
                    class="text-[9px] text-muted-foreground font-mono"
                  >
                    {{ cell.workHours }}
                  </div>

                  <!-- LATE MINUTES -->
                  <div
                    v-if="cell.statusCategory === 'present' && (cell.lateMinutes ?? 0) > 0"
                    class="text-[9px] text-rose-600 dark:text-rose-400 font-semibold font-mono"
                  >
                    Late {{ cell.lateMinutes }}m
                  </div>
                </template>

                <!-- Rest Day Without a Punch -->
                <template v-else-if="cell.statusCategory === 'rest_day'">
                  <Coffee class="size-4 text-muted-foreground/60 my-1" />
                  <span class="text-[10px] text-muted-foreground font-medium">
                    Rest Day
                  </span>
                </template>

                <!-- Holiday -->
                <template v-else-if="cell.statusCategory === 'holiday'">
                  <Sparkles class="size-4 text-amber-500 my-1" />
                  <span
                    class="text-[10px] text-amber-800 dark:text-amber-300 font-medium line-clamp-2 px-0.5 leading-tight"
                  >
                    {{ cell.statusLabel }}
                  </span>
                </template>

                <!-- Approved Leave -->
                <template v-else-if="cell.statusCategory === 'leave'">
                  <Clock class="size-4 text-amber-500 my-1" />
                  <span class="text-[10px] text-amber-700 dark:text-amber-300 font-medium">
                    On Leave
                  </span>
                </template>

                <!-- Absent -->
                <template v-else-if="cell.statusCategory === 'absent'">
                  <XCircle class="size-4 text-rose-500/70 my-1" />
                  <span class="text-[10px] text-rose-700 dark:text-rose-300 font-bold">
                    No Punch
                  </span>
                  <span class="text-[9px] text-muted-foreground leading-tight">
                    Scheduled
                  </span>
                </template>

                <!-- Scheduled / Future / Unverified -->
                <template v-else>
                  <Clock class="size-4 text-muted-foreground/40 my-1" />
                  <span class="text-[10px] text-muted-foreground">
                    Upcoming
                  </span>
                </template>

              </div>

              <!-- Bottom: Date indicator -->
              <div class="text-[9px] font-mono text-muted-foreground/60 border-t pt-1 mt-1">
                {{ cell.date.slice(5) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Section C: Summary and Operational Insights -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <!-- Card 1: Period Attendance Breakdown -->
      <div class="rounded-xl border bg-card p-4 shadow-xs space-y-2">
        <h3 class="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
          <CheckCircle2 class="size-3.5 text-emerald-600" />
          <span>Period Attendance Breakdown</span>
        </h3>
        <div class="space-y-1.5 text-xs">
          <div class="flex items-center justify-between py-1 border-b">
            <span class="text-muted-foreground">Required Working Days:</span>
            <span class="font-bold text-foreground">{{ periodSummary.requiredWorkingDays }} days</span>
          </div>
          <div class="flex items-center justify-between py-1 border-b">
            <span class="text-muted-foreground">Days Present / Duty:</span>
            <span class="font-bold text-emerald-600">{{ periodSummary.presentDays }} days</span>
          </div>
          <div class="flex items-center justify-between py-1 border-b">
            <span class="text-muted-foreground">Late Occurrences:</span>
            <span class="font-bold text-amber-600">{{ periodSummary.lateDays }} {{ periodSummary.lateDays === 1 ? 'day' : 'days' }}</span>
          </div>
          <div class="flex items-center justify-between py-1 border-b">
            <span class="text-muted-foreground">Days Absent:</span>
            <span class="font-bold text-destructive">{{ periodSummary.absentDays }} days</span>
          </div>
          <div class="flex items-center justify-between py-1">
            <span class="text-muted-foreground">Rest Days / Holidays:</span>
            <span class="font-bold text-foreground">{{ periodSummary.restDays + periodSummary.holidays }} days</span>
          </div>
        </div>
      </div>

      <!-- Card 2: Schedule & Shift Context -->
      <div class="rounded-xl border bg-card p-4 shadow-xs space-y-2">
        <h3 class="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Clock class="size-3.5 text-primary" />
          <span>Shift Schedule Reference</span>
        </h3>
        <div class="space-y-1.5 text-xs" v-if="selectedEmployee">
          <div class="flex items-center justify-between py-1 border-b">
            <span class="text-muted-foreground">Assigned Group:</span>
            <span class="font-bold text-foreground">{{ selectedEmployee.work_group_name || 'Group C' }}</span>
          </div>
          <div class="flex items-center justify-between py-1 border-b">
            <span class="text-muted-foreground">Standard Morning Shift:</span>
            <span class="font-mono font-semibold text-foreground">8:00 AM — 5:00 PM</span>
          </div>
          <div class="flex items-center justify-between py-1 border-b">
            <span class="text-muted-foreground">Lunch Break:</span>
            <span class="font-mono text-muted-foreground">12:00 PM — 1:00 PM</span>
          </div>
          <div class="flex items-center justify-between py-1">
            <span class="text-muted-foreground">Primary Location:</span>
            <span class="font-medium text-foreground">{{ selectedEmployee.location || 'DBB CEBU' }}</span>
          </div>
        </div>
        <div v-else class="text-xs text-muted-foreground italic py-2">
          Select an employee above to inspect shift parameters.
        </div>
      </div>

      <!-- Card 3: Payroll Link & Cross-Audit -->
      <div class="rounded-xl border bg-card p-4 shadow-xs space-y-2 flex flex-col justify-between">
        <div class="space-y-2">
          <h3 class="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Building2 class="size-3.5 text-primary" />
            <span>Payroll Batch Integration</span>
          </h3>
          <p class="text-xs text-muted-foreground leading-relaxed">
            Attendance duty days in this 15-day window are linked directly to Payroll Periods for semi-monthly computation and audit.
          </p>
        </div>
        <div class="pt-2">
          <router-link
            to="/payroll/periods"
            class="inline-flex items-center gap-1 text-xs text-primary hover:underline font-semibold"
          >
            <span>View Semi-Monthly Cut-Off Periods</span>
            <ExternalLink class="size-3" />
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>
