<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ArrowRight
} from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { attendanceRepository } from '@/repositories/attendanceRepository'
import { scheduleRepository } from '@/repositories/scheduleRepository'
import type { DailySummaryRecord, ShiftScheduleRecord, HolidayRecord } from '@/db'
import { getManilaDateString } from '@/services/attendanceEngine'

const router = useRouter()

const activeTab = ref<'calendar' | 'schedules'>('calendar')

// Calendar State
const now = new Date()
const currentYear = ref(now.getFullYear())
const currentMonth = ref(now.getMonth() + 1) // 1-12
const loadingCalendar = ref(false)

const monthSummaries = ref<Map<string, DailySummaryRecord>>(new Map())
const holidays = ref<HolidayRecord[]>([])
const schedules = ref<ShiftScheduleRecord[]>([])

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
    const [summaries, holidayList, scheduleList] = await Promise.all([
      attendanceRepository.getMonthSummaries(currentYear.value, currentMonth.value),
      scheduleRepository.getHolidays(currentYear.value),
      scheduleRepository.getSchedules()
    ])
    monthSummaries.value = summaries
    holidays.value = holidayList
    schedules.value = scheduleList
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

  // Trailing days from next month to complete 35 or 42 cells
  const remaining = 42 - days.length
  if (remaining < 7 && days.length === 35) {
    // 35 is fine
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
          Visual monthly attendance calendar and shift configuration. Click any date to view individual employee punches.
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
            activeTab === 'schedules'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          ]"
          @click="activeTab = 'schedules'"
        >
          Shift Schedules
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

    <!-- TAB 2: SHIFT SCHEDULES -->
    <div v-if="activeTab === 'schedules'" class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          v-for="s in schedules"
          :key="s.id"
          class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3"
        >
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-base text-foreground">{{ s.name }}</h3>
            <Badge variant="outline" class="font-mono text-xs">{{ s.code }}</Badge>
          </div>

          <div class="grid grid-cols-2 gap-3 text-xs border-t pt-3">
            <div>
              <span class="text-muted-foreground text-[11px]">WORKING HOURS</span>
              <div class="font-medium text-foreground mt-0.5">{{ s.startTime }} – {{ s.endTime }}</div>
            </div>
            <div>
              <span class="text-muted-foreground text-[11px]">GRACE PERIOD</span>
              <div class="font-medium text-foreground mt-0.5">{{ s.gracePeriodMins }} minutes</div>
            </div>
            <div>
              <span class="text-muted-foreground text-[11px]">LUNCH BREAK</span>
              <div class="font-medium text-foreground mt-0.5">{{ s.breakHours }} hour (Unpaid)</div>
            </div>
            <div>
              <span class="text-muted-foreground text-[11px]">BRANCH</span>
              <div class="font-medium text-foreground mt-0.5">{{ s.location }}</div>
            </div>
          </div>

          <div class="text-[11px] text-muted-foreground pt-1 flex items-center justify-between border-t">
            <span>Assigned Employees: <strong class="text-foreground">{{ s.assignedCount }}</strong></span>
            <span class="text-emerald-600 font-medium">Active Policy</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
