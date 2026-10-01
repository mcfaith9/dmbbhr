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
  Sparkles
} from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { attendanceRepository } from '@/repositories/attendanceRepository'
import { scheduleRepository } from '@/repositories/scheduleRepository'
import { workGroupRepository } from '@/repositories/workGroupRepository'
import type { DailySummaryRecord, HolidayRecord } from '@/db'
import type { WorkGroup } from '@/types'
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

function navigateToDailyAttendance(dateStr: string) {
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
            @click="navigateToDailyAttendance(cell.dateStr)"
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
              <span>View Day</span>
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
  </div>
</template>
