<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Clock,
  Coffee,
  CheckCircle2,
  Layers,
  Sparkles,
  Users,
  Search,
  ExternalLink
} from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog'
import { attendanceRepository } from '@/repositories/attendanceRepository'
import { scheduleRepository } from '@/repositories/scheduleRepository'
import { workGroupRepository } from '@/repositories/workGroupRepository'
import { employeeRepository } from '@/repositories/employeeRepository'
import type { DailySummaryRecord, HolidayRecord, LeaveRecord } from '@/db'
import type { WorkGroup } from '@/types'
import type { DailyAttendanceRecord } from '@/services/attendanceEngine'
import { getManilaDateString } from '@/services/attendanceEngine'

const router = useRouter()

const activeTab = ref<'calendar' | 'workgroups'>('calendar')

// Calendar State
const now = new Date()
const currentYear = ref(now.getFullYear())
const currentMonth = ref(now.getMonth() + 1) // 1-12
const loadingCalendar = ref(false)

const monthSummaries = ref<Map<string, DailySummaryRecord>>(new Map())
const holidays = ref<HolidayRecord[]>([])
const workGroups = ref<WorkGroup[]>([])

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const currentMonthLabel = computed(() => {
  return `${MONTH_NAMES[currentMonth.value - 1]} ${currentYear.value}`
})

async function loadCalendarData() {
  loadingCalendar.value = true
  try {
    const [summaries, holidayList, wgList] = await Promise.all([
      attendanceRepository.getMonthSummaries(currentYear.value, currentMonth.value),
      scheduleRepository.getHolidays(currentYear.value),
      workGroupRepository.getAll()
    ])
    monthSummaries.value = summaries
    holidays.value = holidayList
    workGroups.value = wgList
  } finally {
    loadingCalendar.value = false
  }
}

function prevMonth() {
  if (currentMonth.value === 1) {
    currentMonth.value = 12
    currentYear.value -= 1
  } else {
    currentMonth.value -= 1
  }
  loadCalendarData()
}

function nextMonth() {
  if (currentMonth.value === 12) {
    currentMonth.value = 1
    currentYear.value += 1
  } else {
    currentMonth.value += 1
  }
  loadCalendarData()
}

function goToToday() {
  const d = new Date()
  currentYear.value = d.getFullYear()
  currentMonth.value = d.getMonth() + 1
  loadCalendarData()
}

interface CalendarDay {
  dayNumber: number
  dateStr: string
  isCurrentMonth: boolean
  isToday: boolean
  isWeekend: boolean
  summary?: DailySummaryRecord
  holiday?: HolidayRecord
}

const calendarGrid = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value // 1-12
  const firstDayIndex = new Date(year, month - 1, 1).getDay() // 0 = Sun
  const daysInMonth = new Date(year, month, 0).getDate()
  const daysInPrevMonth = new Date(year, month - 1, 0).getDate()

  const todayStr = getManilaDateString(new Date())
  const holidayMap = new Map<string, HolidayRecord>()
  for (const h of holidays.value) {
    holidayMap.set(h.date, h)
  }

  const days: CalendarDay[] = []

  // Leading days from previous month
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dNum = daysInPrevMonth - i
    const prevM = month === 1 ? 12 : month - 1
    const prevY = month === 1 ? year - 1 : year
    const dStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`
    days.push({
      dayNumber: dNum,
      dateStr: dStr,
      isCurrentMonth: false,
      isToday: dStr === todayStr,
      isWeekend: new Date(prevY, prevM - 1, dNum).getDay() === 0 || new Date(prevY, prevM - 1, dNum).getDay() === 6,
      summary: monthSummaries.value.get(dStr),
      holiday: holidayMap.get(dStr)
    })
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dayOfWeek = new Date(year, month - 1, d).getDay()
    days.push({
      dayNumber: d,
      dateStr: dStr,
      isCurrentMonth: true,
      isToday: dStr === todayStr,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      summary: monthSummaries.value.get(dStr),
      holiday: holidayMap.get(dStr)
    })
  }

  // Trailing days
  const remaining = 42 - days.length
  if (remaining < 7 && days.length === 35) {
    // 35 cells
  } else {
    for (let d = 1; d <= remaining; d++) {
      const nextM = month === 12 ? 1 : month + 1
      const nextY = month === 12 ? year + 1 : year
      const dStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      days.push({
        dayNumber: d,
        dateStr: dStr,
        isCurrentMonth: false,
        isToday: dStr === todayStr,
        isWeekend: new Date(nextY, nextM - 1, d).getDay() === 0 || new Date(nextY, nextM - 1, d).getDay() === 6,
        summary: monthSummaries.value.get(dStr),
        holiday: holidayMap.get(dStr)
      })
    }
  }

  return days
})

// Monthly aggregated statistics
const monthStats = computed(() => {
  let totalPresent = 0
  let totalLate = 0
  let totalOnTime = 0
  let activeDays = 0

  for (const [date, s] of monthSummaries.value.entries()) {
    const m = parseInt(date.split('-')[1], 10)
    const y = parseInt(date.split('-')[0], 10)
    if (m === currentMonth.value && y === currentYear.value) {
      totalPresent += s.presentCount
      totalLate += s.lateCount
      totalOnTime += s.onTimeCount
      if (s.presentCount > 0) activeDays++
    }
  }

  const punctualityRate = totalPresent > 0 ? Math.round((totalOnTime / totalPresent) * 100) : 100
  return { totalPresent, totalLate, totalOnTime, activeDays, punctualityRate }
})

// Daily Attendance Dialog state
const showDayDialog = ref(false)
const dialogLoading = ref(false)
const selectedDayDate = ref('')
const selectedDayHoliday = ref<HolidayRecord | null>(null)
const selectedDayIsWeekend = ref(false)
const selectedDayRecords = ref<DailyAttendanceRecord[]>([])
const selectedDayLeaves = ref<LeaveRecord[]>([])
const selectedDayAbsents = ref<{
  bioId: string
  name: string
  workGroupId: string
  workGroupName: string
  schedule: string
}[]>([])
const activeDetailTab = ref<'all' | 'present' | 'late' | 'pending' | 'leave' | 'absent'>('all')
const dialogSearch = ref('')

const selectedDayFormatted = computed(() => {
  if (!selectedDayDate.value) return ''
  try {
    const [y, m, d] = selectedDayDate.value.split('-').map(Number)
    const dateObj = new Date(y, m - 1, d)
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'long',
      timeZone: 'Asia/Manila'
    }).format(dateObj)
  } catch {
    return selectedDayDate.value
  }
})

const dialogStats = computed(() => {
  const records = selectedDayRecords.value
  const present = records.length
  const late = records.filter(r => r.late_minutes > 0).length
  const onTime = records.filter(r => r.late_minutes === 0 && r.has_valid_out).length
  const awaitingOut = records.filter(r => r.status === 'Awaiting OUT').length
  const singlePunch = records.filter(r => r.status === 'Single Punch (No OUT)').length
  const onLeave = selectedDayLeaves.value.length
  const absent = selectedDayAbsents.value.length
  return {
    present,
    late,
    onTime,
    awaitingOut,
    singlePunch,
    onLeave,
    absent
  }
})

const filteredPresent = computed(() => {
  let list = selectedDayRecords.value
  if (dialogSearch.value.trim()) {
    const q = dialogSearch.value.trim().toLowerCase()
    list = list.filter(r =>
      r.employee_name.toLowerCase().includes(q) ||
      r.biometric_user_id.toLowerCase().includes(q) ||
      (r.work_group_name && r.work_group_name.toLowerCase().includes(q))
    )
  }
  return list
})

const filteredLate = computed(() => {
  let list = selectedDayRecords.value.filter(r => r.late_minutes > 0)
  if (dialogSearch.value.trim()) {
    const q = dialogSearch.value.trim().toLowerCase()
    list = list.filter(r =>
      r.employee_name.toLowerCase().includes(q) ||
      r.biometric_user_id.toLowerCase().includes(q)
    )
  }
  return list
})

const filteredPendingOut = computed(() => {
  let list = selectedDayRecords.value.filter(r => r.status === 'Awaiting OUT' || r.status === 'Single Punch (No OUT)')
  if (dialogSearch.value.trim()) {
    const q = dialogSearch.value.trim().toLowerCase()
    list = list.filter(r =>
      r.employee_name.toLowerCase().includes(q) ||
      r.biometric_user_id.toLowerCase().includes(q)
    )
  }
  return list
})

const filteredLeaves = computed(() => {
  let list = selectedDayLeaves.value
  if (dialogSearch.value.trim()) {
    const q = dialogSearch.value.trim().toLowerCase()
    list = list.filter(l =>
      l.employeeName.toLowerCase().includes(q) ||
      l.bioId.toLowerCase().includes(q) ||
      l.leaveType.toLowerCase().includes(q)
    )
  }
  return list
})

const filteredAbsents = computed(() => {
  let list = selectedDayAbsents.value
  if (dialogSearch.value.trim()) {
    const q = dialogSearch.value.trim().toLowerCase()
    list = list.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.bioId.toLowerCase().includes(q) ||
      a.workGroupName.toLowerCase().includes(q)
    )
  }
  return list
})

async function openDayDetails(cell: CalendarDay) {
  selectedDayDate.value = cell.dateStr
  selectedDayHoliday.value = cell.holiday || null
  selectedDayIsWeekend.value = cell.isWeekend
  activeDetailTab.value = 'all'
  dialogSearch.value = ''
  showDayDialog.value = true
  dialogLoading.value = true

  try {
    const [records, employees, leaves, workGroupsList] = await Promise.all([
      attendanceRepository.getDailyAttendance(cell.dateStr),
      employeeRepository.getEmployees(),
      scheduleRepository.getLeaves(),
      workGroupRepository.getAll()
    ])

    selectedDayRecords.value = records

    // Leaves on this date
    const leavesOnDate = leaves.filter(
      l => l.startDate <= cell.dateStr && l.endDate >= cell.dateStr && l.status === 'Approved'
    )
    selectedDayLeaves.value = leavesOnDate

    // Absent employees
    const presentBioIds = new Set(records.map(r => r.biometric_user_id))
    const onLeaveBioIds = new Set(leavesOnDate.map(l => l.bioId))

    const wgMap = new Map<string, WorkGroup>()
    for (const wg of workGroupsList) {
      wgMap.set(wg.id, wg)
    }

    const absents: { bioId: string; name: string; workGroupId: string; workGroupName: string; schedule: string }[] = []
    
    // Only flag absences on regular workdays (not weekend, not holiday)
    if (!cell.isWeekend && !cell.holiday) {
      for (const emp of employees) {
        if (
          emp.status === 'active' &&
          !presentBioIds.has(emp.biometric_user_id) &&
          !onLeaveBioIds.has(emp.biometric_user_id)
        ) {
          const wg = wgMap.get(emp.work_group_id || 'wg-group-c')
          const sched = wg ? `${wg.standard_in} – ${wg.expected_out}` : '08:00 – 17:00'
          absents.push({
            bioId: emp.biometric_user_id,
            name: emp.full_name,
            workGroupId: emp.work_group_id || 'wg-group-c',
            workGroupName: wg?.name || 'Group C',
            schedule: sched
          })
        }
      }
    }
    selectedDayAbsents.value = absents
  } finally {
    dialogLoading.value = false
  }
}

function navigateToDailyAttendance(dateStr: string) {
  showDayDialog.value = false
  router.push({
    path: '/attendance/daily',
    query: { date: dateStr }
  })
}

onMounted(() => {
  loadCalendarData()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <CalendarDays class="size-5 text-primary" />
          <span>Time Management</span>
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Work Group schedules (6am–3pm, 7am–4pm, 8am–5pm) with automatic lunch break exclusion and monthly attendance calendar.
        </p>
      </div>

      <!-- Tab Switcher -->
      <div class="flex items-center gap-1.5 p-1 rounded-lg border bg-muted/30">
        <button
          type="button"
          :class="[
            'px-3 py-1 text-xs font-medium rounded-md transition-colors',
            activeTab === 'calendar'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          ]"
          @click="activeTab = 'calendar'"
        >
          Attendance Calendar
        </button>
        <button
          type="button"
          :class="[
            'px-3 py-1 text-xs font-medium rounded-md transition-colors',
            activeTab === 'workgroups'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          ]"
          @click="activeTab = 'workgroups'"
        >
          Work Groups & Schedules
        </button>
      </div>
    </div>

    <!-- TAB 1: ATTENDANCE CALENDAR -->
    <div v-if="activeTab === 'calendar'" class="space-y-4">
      <!-- Calendar Controls & Month Stats -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <!-- Month Navigator -->
        <div class="rounded-xl border bg-card p-3.5 shadow-xs flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" class="h-8 w-8 p-0" @click="prevMonth">
              <ChevronLeft class="size-4" />
            </Button>
            <div class="font-bold text-sm text-foreground min-w-[140px] text-center">
              {{ currentMonthLabel }}
            </div>
            <Button variant="outline" size="sm" class="h-8 w-8 p-0" @click="nextMonth">
              <ChevronRight class="size-4" />
            </Button>
          </div>

          <Button variant="outline" size="sm" class="h-8 text-xs px-2.5" @click="goToToday">
            Today
          </Button>
        </div>

        <!-- Monthly Summary Highlights -->
        <div class="rounded-xl border bg-card p-3.5 shadow-xs flex items-center justify-around md:col-span-2 text-xs">
          <div class="text-center">
            <span class="text-[11px] text-muted-foreground">Active Workdays</span>
            <div class="text-base font-bold text-foreground font-mono mt-0.5">
              {{ monthStats.activeDays }} days
            </div>
          </div>
          <div class="h-8 w-px bg-border" />
          <div class="text-center">
            <span class="text-[11px] text-muted-foreground">Total Present Scans</span>
            <div class="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
              {{ monthStats.totalPresent.toLocaleString() }}
            </div>
          </div>
          <div class="h-8 w-px bg-border" />
          <div class="text-center">
            <span class="text-[11px] text-muted-foreground">Total Late Entries</span>
            <div class="text-base font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5">
              {{ monthStats.totalLate.toLocaleString() }}
            </div>
          </div>
          <div class="h-8 w-px bg-border" />
          <div class="text-center">
            <span class="text-[11px] text-muted-foreground">Punctuality Rate</span>
            <div class="text-base font-bold text-primary font-mono mt-0.5">
              {{ monthStats.punctualityRate }}%
            </div>
          </div>
        </div>
      </div>

      <!-- Month Calendar Grid -->
      <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
        <!-- Weekday Headers -->
        <div class="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-semibold py-2">
          <div class="text-rose-600 dark:text-rose-400">Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div class="text-sky-600 dark:text-sky-400">Sat</div>
        </div>

        <!-- Day Cells -->
        <div class="grid grid-cols-7 divide-x divide-y border-b last:border-b-0">
          <div
            v-for="cell in calendarGrid"
            :key="cell.dateStr"
            :class="[
              'min-h-[110px] p-2 flex flex-col justify-between transition-colors cursor-pointer group',
              cell.isCurrentMonth ? 'bg-card hover:bg-muted/30' : 'bg-muted/10 opacity-50 hover:opacity-80',
              cell.isToday ? 'ring-2 ring-primary ring-inset' : ''
            ]"
            @click="openDayDetails(cell)"
          >
            <!-- Day header -->
            <div class="flex items-center justify-between">
              <span
                :class="[
                  'text-xs font-bold size-6 flex items-center justify-center rounded-full',
                  cell.isToday
                    ? 'bg-primary text-primary-foreground'
                    : (cell.isWeekend ? 'text-muted-foreground' : 'text-foreground')
                ]"
              >
                {{ cell.dayNumber }}
              </span>

              <!-- Holiday indicator -->
              <span
                v-if="cell.holiday"
                class="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-medium truncate max-w-[90px]"
                :title="cell.holiday.name"
              >
                {{ cell.holiday.name }}
              </span>
            </div>

            <!-- Attendance stats badges -->
            <div class="space-y-1 my-1">
              <template v-if="cell.summary && cell.summary.presentCount > 0">
                <!-- Present -->
                <div class="flex items-center justify-between text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium font-mono">
                  <span>Present:</span>
                  <span class="font-bold">{{ cell.summary.presentCount }}</span>
                </div>

                <!-- Late if any -->
                <div
                  v-if="cell.summary.lateCount > 0"
                  class="flex items-center justify-between text-[11px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium font-mono"
                >
                  <span>Late:</span>
                  <span class="font-bold">{{ cell.summary.lateCount }}</span>
                </div>

                <!-- Single Punch / Awaiting OUT -->
                <div
                  v-if="cell.summary.singlePunchCount > 0 || cell.summary.awaitingOutCount > 0"
                  class="flex items-center justify-between text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 font-medium font-mono"
                >
                  <span>Pending:</span>
                  <span>{{ (cell.summary.singlePunchCount || 0) + (cell.summary.awaitingOutCount || 0) }}</span>
                </div>
              </template>

              <template v-else-if="cell.isCurrentMonth && !cell.isWeekend">
                <div class="text-[10px] text-muted-foreground italic py-1 text-center">
                  No records
                </div>
              </template>
            </div>

            <!-- Jump to Daily Attendance hint on hover -->
            <div class="text-[10px] text-primary font-medium opacity-0 group-hover:opacity-100 flex items-center justify-end gap-0.5 transition-opacity">
              <span>View Details</span>
              <ArrowRight class="size-2.5" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: WORK GROUPS & SCHEDULE LOGIC -->
    <div v-if="activeTab === 'workgroups'" class="space-y-4">
      <div class="rounded-xl border bg-card p-4 shadow-xs space-y-2">
        <div class="flex items-center gap-2">
          <Sparkles class="size-4 text-primary" />
          <h2 class="font-semibold text-sm text-foreground">Dynamic Work Group Schedule Rules</h2>
        </div>
        <p class="text-xs text-muted-foreground leading-relaxed">
          Expected OUT is <strong>automatically calculated</strong> based on Standard IN + 8 Required Working Hours, while <strong>strictly excluding</strong> the configured 1-hour unpaid lunch break (<code class="font-mono font-semibold">12:00 PM – 1:00 PM</code>).
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          v-for="wg in workGroups"
          :key="wg.id"
          class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-4 flex flex-col justify-between"
        >
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Layers class="size-4 text-primary" />
                <h3 class="font-bold text-base text-foreground">{{ wg.name }}</h3>
              </div>
              <Badge variant="outline" class="font-mono text-xs">8.0 hrs Work</Badge>
            </div>

            <div class="grid grid-cols-2 gap-2.5 text-xs border-t pt-3">
              <div>
                <span class="text-muted-foreground text-[10px] uppercase font-semibold">STANDARD IN</span>
                <div class="font-bold text-foreground mt-0.5 text-sm flex items-center gap-1">
                  <Clock class="size-3.5 text-emerald-600" />
                  {{ wg.standard_in }}
                </div>
              </div>
              <div>
                <span class="text-muted-foreground text-[10px] uppercase font-semibold">CALCULATED OUT</span>
                <div class="font-bold text-primary mt-0.5 text-sm flex items-center gap-1">
                  <Clock class="size-3.5 text-blue-600" />
                  {{ wg.expected_out }}
                </div>
              </div>
              <div>
                <span class="text-muted-foreground text-[10px] uppercase font-semibold">UNPAID LUNCH</span>
                <div class="font-medium text-foreground mt-0.5 flex items-center gap-1">
                  <Coffee class="size-3 text-amber-600" />
                  {{ wg.lunch_start }} – {{ wg.lunch_end }}
                </div>
              </div>
              <div>
                <span class="text-muted-foreground text-[10px] uppercase font-semibold">GRACE PERIOD</span>
                <div class="font-medium text-foreground mt-0.5">
                  {{ wg.grace_period_minutes }} minutes
                </div>
              </div>
            </div>

            <!-- Mathematical Breakdown of the 8 Working Hours -->
            <div class="p-2.5 rounded-lg bg-muted/40 text-[11px] text-muted-foreground space-y-1 font-mono">
              <div class="font-sans font-semibold text-foreground text-[10px] uppercase">Working Hours Breakdown:</div>
              <div>• Morning: {{ wg.standard_in }} → {{ wg.lunch_start }} = {{ wg.standard_in === '06:00' ? '6.0' : (wg.standard_in === '07:00' ? '5.0' : '4.0') }} hrs</div>
              <div>• Lunch: {{ wg.lunch_start }} → {{ wg.lunch_end }} = 1.0 hr (Unpaid)</div>
              <div>• Afternoon: {{ wg.lunch_end }} → {{ wg.expected_out }} = {{ wg.standard_in === '06:00' ? '2.0' : (wg.standard_in === '07:00' ? '3.0' : '4.0') }} hrs</div>
              <div class="text-emerald-600 dark:text-emerald-400 font-bold font-sans pt-0.5">
                Total Rendered Work: 8.0 Hours
              </div>
            </div>
          </div>

          <div class="text-[11px] text-muted-foreground pt-2 flex items-center justify-between border-t">
            <span class="inline-flex items-center gap-1 text-emerald-600 font-medium">
              <CheckCircle2 class="size-3.5" />
              Active System Schedule
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- SHADCN DIALOG: DAILY ATTENDANCE AUDIT & DETAILS -->
    <Dialog v-model:open="showDayDialog">
      <DialogContent class="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <!-- Dialog Header -->
        <DialogHeader class="p-4 sm:p-5 border-b bg-muted/20">
          <div class="flex items-start justify-between gap-3">
            <div>
              <DialogTitle class="text-base sm:text-lg flex items-center gap-2 font-bold text-foreground flex-wrap">
                <CalendarDays class="size-5 text-primary" />
                <span>{{ selectedDayFormatted }}</span>
                <Badge v-if="selectedDayHoliday" variant="destructive" class="text-[11px] font-normal">
                  {{ selectedDayHoliday.name }} ({{ selectedDayHoliday.type }})
                </Badge>
                <Badge v-else-if="selectedDayIsWeekend" variant="secondary" class="text-[11px] font-normal">
                  Weekend / Rest Day
                </Badge>
              </DialogTitle>
              <DialogDescription class="text-xs text-muted-foreground mt-1">
                Biometric attendance verification, tardiness breakdown, leave, and absence audit • Philippine Standard Time
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <!-- Dialog Scrollable Body -->
        <div class="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <!-- Loading State -->
          <div v-if="dialogLoading" class="py-12 text-center text-xs text-muted-foreground space-y-2">
            <div class="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Querying attendance logs for {{ selectedDayDate }}...</p>
          </div>

          <template v-else>
            <!-- Attendance Summary Header & Metric Cards -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <span>Attendance Summary</span>
                </h3>
                <span class="text-[11px] text-muted-foreground font-mono">
                  Total Tracked: {{ selectedDayRecords.length + selectedDayAbsents.length + selectedDayLeaves.length }}
                </span>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                <!-- 1. Present -->
                <div
                  class="p-2.5 rounded-lg border bg-card flex flex-col justify-between cursor-pointer hover:border-emerald-500/50 transition-colors"
                  :class="activeDetailTab === 'present' ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30' : ''"
                  @click="activeDetailTab = (activeDetailTab === 'present' ? 'all' : 'present')"
                >
                  <span class="text-[11px] text-muted-foreground font-medium">Present</span>
                  <div class="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">
                    {{ dialogStats.present }}
                  </div>
                  <span class="text-[10px] text-muted-foreground">{{ dialogStats.onTime }} on time</span>
                </div>

                <!-- 2. Absent -->
                <div
                  class="p-2.5 rounded-lg border bg-card flex flex-col justify-between cursor-pointer hover:border-rose-500/50 transition-colors"
                  :class="activeDetailTab === 'absent' ? 'border-rose-500 bg-rose-500/10 ring-1 ring-rose-500/30' : ''"
                  @click="activeDetailTab = (activeDetailTab === 'absent' ? 'all' : 'absent')"
                >
                  <span class="text-[11px] text-muted-foreground font-medium">Absent</span>
                  <div class="text-xl font-bold text-rose-600 dark:text-rose-400 mt-0.5 font-mono">
                    {{ dialogStats.absent }}
                  </div>
                  <span class="text-[10px] text-muted-foreground">No punches</span>
                </div>

                <!-- 3. On Leave -->
                <div
                  class="p-2.5 rounded-lg border bg-card flex flex-col justify-between cursor-pointer hover:border-sky-500/50 transition-colors"
                  :class="activeDetailTab === 'leave' ? 'border-sky-500 bg-sky-500/10 ring-1 ring-sky-500/30' : ''"
                  @click="activeDetailTab = (activeDetailTab === 'leave' ? 'all' : 'leave')"
                >
                  <span class="text-[11px] text-muted-foreground font-medium">On Leave</span>
                  <div class="text-xl font-bold text-sky-600 dark:text-sky-400 mt-0.5 font-mono">
                    {{ dialogStats.onLeave }}
                  </div>
                  <span class="text-[10px] text-muted-foreground">Approved</span>
                </div>

                <!-- 4. Late -->
                <div
                  class="p-2.5 rounded-lg border bg-card flex flex-col justify-between cursor-pointer hover:border-amber-500/50 transition-colors"
                  :class="activeDetailTab === 'late' ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30' : ''"
                  @click="activeDetailTab = (activeDetailTab === 'late' ? 'all' : 'late')"
                >
                  <span class="text-[11px] text-muted-foreground font-medium">Late</span>
                  <div class="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5 font-mono">
                    {{ dialogStats.late }}
                  </div>
                  <span class="text-[10px] text-muted-foreground">Tardy entries</span>
                </div>

                <!-- 5. Single Punch -->
                <div
                  class="p-2.5 rounded-lg border bg-card flex flex-col justify-between col-span-2 sm:col-span-1 cursor-pointer hover:border-purple-500/50 transition-colors"
                  :class="activeDetailTab === 'pending' ? 'border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/30' : ''"
                  @click="activeDetailTab = (activeDetailTab === 'pending' ? 'all' : 'pending')"
                >
                  <span class="text-[11px] text-muted-foreground font-medium">Single Punch</span>
                  <div class="text-xl font-bold text-purple-600 dark:text-purple-400 mt-0.5 font-mono">
                    {{ dialogStats.singlePunch + dialogStats.awaitingOut }}
                  </div>
                  <span class="text-[10px] text-muted-foreground">
                    {{ dialogStats.awaitingOut > 0 ? `${dialogStats.awaitingOut} awaiting OUT` : 'No OUT recorded' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Toolbar & Filter Pills in Dialog -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
              <div class="flex items-center gap-1.5 flex-wrap text-xs">
                <button
                  type="button"
                  :class="[
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    activeDetailTab === 'all'
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                  ]"
                  @click="activeDetailTab = 'all'"
                >
                  All ({{ selectedDayRecords.length + selectedDayLeaves.length + selectedDayAbsents.length }})
                </button>
                <button
                  type="button"
                  :class="[
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    activeDetailTab === 'present'
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                  ]"
                  @click="activeDetailTab = 'present'"
                >
                  Present ({{ dialogStats.present }})
                </button>
                <button
                  type="button"
                  :class="[
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    activeDetailTab === 'absent'
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                  ]"
                  @click="activeDetailTab = 'absent'"
                >
                  Absent ({{ dialogStats.absent }})
                </button>
                <button
                  type="button"
                  :class="[
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    activeDetailTab === 'leave'
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                  ]"
                  @click="activeDetailTab = 'leave'"
                >
                  On Leave ({{ dialogStats.onLeave }})
                </button>
                <button
                  type="button"
                  :class="[
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    activeDetailTab === 'late'
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                  ]"
                  @click="activeDetailTab = 'late'"
                >
                  Late ({{ dialogStats.late }})
                </button>
                <button
                  v-if="dialogStats.singlePunch + dialogStats.awaitingOut > 0"
                  type="button"
                  :class="[
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    activeDetailTab === 'pending'
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                  ]"
                  @click="activeDetailTab = 'pending'"
                >
                  Single Punch ({{ dialogStats.singlePunch + dialogStats.awaitingOut }})
                </button>
              </div>

              <div class="relative w-full sm:w-[190px]">
                <Search class="absolute left-2.5 top-2 size-3 text-muted-foreground" />
                <Input
                  v-model="dialogSearch"
                  placeholder="Search name or ID..."
                  class="h-7 text-xs pl-7"
                />
              </div>
            </div>

            <!-- Empty Date Banner when 0 punches recorded -->
            <div
              v-if="selectedDayRecords.length === 0"
              class="p-4 rounded-xl border bg-muted/20 text-center space-y-1.5"
            >
              <CalendarDays class="size-7 mx-auto text-muted-foreground/60" />
              <div class="font-semibold text-xs text-foreground">
                No attendance punches recorded for this date.
              </div>
              <p class="text-[11px] text-muted-foreground max-w-sm mx-auto">
                {{ selectedDayIsWeekend ? 'Weekend / scheduled rest day for general employees.' : (selectedDayHoliday ? `${selectedDayHoliday.name} - official Philippine holiday.` : 'No biometric punch logs or device sync recorded on this day.') }}
              </p>
              <div class="flex items-center justify-center gap-2 text-[11px] font-mono text-muted-foreground pt-1">
                <span>Present: 0</span>
                <span>•</span>
                <span>Late: 0</span>
                <span>•</span>
                <span>Single Punch: 0</span>
              </div>
            </div>

            <!-- 1. PRESENT EMPLOYEES SECTION -->
            <div
              v-if="(activeDetailTab === 'all' || activeDetailTab === 'present') && filteredPresent.length > 0"
              class="space-y-2"
            >
              <div class="flex items-center justify-between text-xs font-semibold text-foreground">
                <span class="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 class="size-3.5" />
                  <span>Present Employees ({{ filteredPresent.length }})</span>
                </span>
                <span class="text-[11px] text-muted-foreground font-normal">Actual IN & OUT</span>
              </div>

              <div class="divide-y rounded-lg border bg-card text-xs">
                <div
                  v-for="record in filteredPresent"
                  :key="record.id"
                  class="p-2.5 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[11px] shrink-0 font-mono">
                      {{ record.biometric_user_id.slice(-2) }}
                    </div>
                    <div class="min-w-0">
                      <div class="font-medium text-foreground truncate">
                        {{ record.employee_name }}
                      </div>
                      <div class="text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <span class="font-mono">ID: {{ record.biometric_user_id }}</span>
                        <span>•</span>
                        <span>{{ record.work_group_name || 'Group C' }}</span>
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-3 shrink-0 text-right">
                    <div class="text-right">
                      <div class="font-mono font-medium text-foreground">
                        {{ record.actual_in }}
                        <span v-if="record.actual_out"> → {{ record.actual_out }}</span>
                      </div>
                      <div class="text-[10px] text-muted-foreground">
                        <span v-if="record.total_hours">{{ record.total_hours }}</span>
                        <span v-else-if="record.is_awaiting_out">Awaiting shift end</span>
                        <span v-else>Single punch</span>
                      </div>
                    </div>

                    <Badge
                      :variant="record.status === 'On Time' ? 'success' : (record.late_minutes > 0 ? 'warning' : 'outline')"
                      class="text-[10px] shrink-0"
                    >
                      {{ record.status }}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <!-- 2. LATE EMPLOYEES SECTION -->
            <div
              v-if="(activeDetailTab === 'all' || activeDetailTab === 'late') && filteredLate.length > 0"
              class="space-y-2"
            >
              <div class="flex items-center justify-between text-xs font-semibold text-foreground">
                <span class="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <Clock class="size-3.5" />
                  <span>Late Employees ({{ filteredLate.length }})</span>
                </span>
                <span class="text-[11px] text-muted-foreground font-normal">Exceeded Grace Period</span>
              </div>

              <div class="divide-y rounded-lg border bg-card text-xs">
                <div
                  v-for="record in filteredLate"
                  :key="`late-${record.id}`"
                  class="p-2.5 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div class="min-w-0">
                    <div class="font-medium text-foreground truncate">
                      {{ record.employee_name }}
                    </div>
                    <div class="text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <span class="font-mono">ID: {{ record.biometric_user_id }}</span>
                      <span>•</span>
                      <span>{{ record.work_group_name }} (Std IN: {{ record.expected_in }})</span>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 shrink-0">
                    <div class="font-mono text-right text-[11px]">
                      <span class="text-muted-foreground">Actual: </span>
                      <span class="font-medium text-foreground">{{ record.actual_in }}</span>
                    </div>
                    <Badge variant="warning" class="text-[10px] font-mono">
                      +{{ record.late_minutes }} min late
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <!-- 3. EMPLOYEES ON LEAVE SECTION -->
            <div
              v-if="(activeDetailTab === 'all' || activeDetailTab === 'leave') && filteredLeaves.length > 0"
              class="space-y-2"
            >
              <div class="flex items-center justify-between text-xs font-semibold text-foreground">
                <span class="flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
                  <CalendarDays class="size-3.5" />
                  <span>Employees On Leave ({{ filteredLeaves.length }})</span>
                </span>
                <span class="text-[11px] text-muted-foreground font-normal">Authorized Absence</span>
              </div>

              <div class="divide-y rounded-lg border bg-card text-xs">
                <div
                  v-for="leave in filteredLeaves"
                  :key="leave.id"
                  class="p-2.5 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div>
                    <div class="font-medium text-foreground">
                      {{ leave.employeeName }}
                    </div>
                    <div class="text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <span class="font-mono">ID: {{ leave.bioId }}</span>
                      <span v-if="leave.reason">• {{ leave.reason }}</span>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 shrink-0">
                    <span class="font-medium text-sky-600 dark:text-sky-400 text-xs">
                      {{ leave.leaveType }} Leave
                    </span>
                    <Badge variant="outline" class="text-[10px]">
                      {{ leave.status }}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <!-- 4. ABSENT EMPLOYEES SECTION -->
            <div
              v-if="(activeDetailTab === 'all' || activeDetailTab === 'absent') && filteredAbsents.length > 0"
              class="space-y-2"
            >
              <div class="flex items-center justify-between text-xs font-semibold text-foreground">
                <span class="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                  <Users class="size-3.5" />
                  <span>Absent Employees ({{ filteredAbsents.length }})</span>
                </span>
                <span class="text-[11px] text-muted-foreground font-normal">Scheduled Without Punches</span>
              </div>

              <div class="divide-y rounded-lg border bg-card text-xs">
                <div
                  v-for="absent in filteredAbsents"
                  :key="`absent-${absent.bioId}`"
                  class="p-2.5 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div>
                    <div class="font-medium text-foreground">
                      {{ absent.name }}
                    </div>
                    <div class="text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <span class="font-mono">ID: {{ absent.bioId }}</span>
                      <span>•</span>
                      <span>{{ absent.workGroupName }} ({{ absent.schedule }})</span>
                    </div>
                  </div>

                  <Badge variant="destructive" class="text-[10px] shrink-0 text-white">
                    Absent
                  </Badge>
                </div>
              </div>
            </div>

            <!-- 5. PENDING OUT / SINGLE PUNCH SECTION -->
            <div
              v-if="(activeDetailTab === 'all' || activeDetailTab === 'pending') && filteredPendingOut.length > 0"
              class="space-y-2"
            >
              <div class="flex items-center justify-between text-xs font-semibold text-foreground">
                <span class="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                  <Clock class="size-3.5" />
                  <span>Single Punch / Awaiting OUT ({{ filteredPendingOut.length }})</span>
                </span>
                <span class="text-[11px] text-muted-foreground font-normal">Incomplete Shift Punches</span>
              </div>

              <div class="divide-y rounded-lg border bg-card text-xs">
                <div
                  v-for="record in filteredPendingOut"
                  :key="`pending-${record.id}`"
                  class="p-2.5 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div>
                    <div class="font-medium text-foreground">
                      {{ record.employee_name }}
                    </div>
                    <div class="text-[10px] text-muted-foreground">
                      <span class="font-mono">ID: {{ record.biometric_user_id }}</span>
                      <span> • {{ record.work_group_name }}</span>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <span class="text-[11px] font-mono text-muted-foreground">
                      IN: {{ record.actual_in }}
                    </span>
                    <Badge variant="secondary" class="text-[10px]">
                      {{ record.status }}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <!-- Tab-specific Empty States when filtered list is empty -->
            <div
              v-if="activeDetailTab === 'present' && filteredPresent.length === 0"
              class="py-10 text-center text-xs text-muted-foreground border rounded-lg bg-card/50"
            >
              No present employees recorded for this date.
            </div>
            <div
              v-if="activeDetailTab === 'late' && filteredLate.length === 0"
              class="py-10 text-center text-xs text-muted-foreground border rounded-lg bg-card/50"
            >
              No late employees on this date (100% on time).
            </div>
            <div
              v-if="activeDetailTab === 'leave' && filteredLeaves.length === 0"
              class="py-10 text-center text-xs text-muted-foreground border rounded-lg bg-card/50"
            >
              No employees on leave on this date.
            </div>
            <div
              v-if="activeDetailTab === 'absent' && filteredAbsents.length === 0"
              class="py-10 text-center text-xs text-muted-foreground border rounded-lg bg-card/50"
            >
              No unexcused absences on this date.
            </div>
            <div
              v-if="activeDetailTab === 'pending' && filteredPendingOut.length === 0"
              class="py-10 text-center text-xs text-muted-foreground border rounded-lg bg-card/50"
            >
              No single punches or pending OUT records for this date.
            </div>
          </template>
        </div>

        <!-- Dialog Footer -->
        <DialogFooter class="p-3 border-t bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            class="h-8 text-xs gap-1.5 w-full sm:w-auto"
            @click="navigateToDailyAttendance(selectedDayDate)"
          >
            <ExternalLink class="size-3.5" />
            <span>Open in Daily Attendance</span>
          </Button>

          <DialogClose as-child>
            <Button variant="default" size="sm" class="h-8 text-xs w-full sm:w-auto">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
