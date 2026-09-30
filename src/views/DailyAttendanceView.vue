<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  Clock,
  RefreshCw,
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertCircle,
  Radio,
  Users,
  Search,
  X,
} from '@lucide/vue'
import { attendanceService, getManilaDateString, type DailyAttendanceRecord } from '@/services/attendance'
import { liveAttendanceService } from '@/services/liveAttendance'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Real device status and sync state
const deviceStatus = liveAttendanceService.deviceStatus
const isSyncing = liveAttendanceService.isSyncing
const syncProgress = liveAttendanceService.syncProgress

// Default to Today in Philippine Standard Time
const todayDateStr = getManilaDateString(new Date())
const selectedDate = ref<string>(todayDateStr)
const searchQuery = ref<string>('')
const loading = ref<boolean>(false)
const dailyRecords = ref<DailyAttendanceRecord[]>([])

async function loadDailyAttendance() {
  loading.value = true
  try {
    const records = await attendanceService.getDailyAttendance(selectedDate.value)
    dailyRecords.value = records
  } finally {
    loading.value = false
  }
}

async function handleManualSync() {
  await liveAttendanceService.triggerManualSync()
  loadDailyAttendance()
}

function setDateQuick(range: 'today' | 'yesterday') {
  if (range === 'today') {
    selectedDate.value = todayDateStr
  } else if (range === 'yesterday') {
    const y = new Date()
    y.setDate(y.getDate() - 1)
    selectedDate.value = getManilaDateString(y)
  }
  loadDailyAttendance()
}

const filteredRecords = computed(() => {
  if (!searchQuery.value.trim()) return dailyRecords.value
  const q = searchQuery.value.trim().toLowerCase()
  return dailyRecords.value.filter(r =>
    r.biometric_user_id.toLowerCase().includes(q) ||
    r.employee_name.toLowerCase().includes(q)
  )
})

const stats = computed(() => {
  const total = dailyRecords.value.length
  const late = dailyRecords.value.filter(r => r.late_minutes > 0).length
  const regular = dailyRecords.value.filter(r => r.late_minutes === 0 && r.total_punches >= 2).length
  const singlePunch = dailyRecords.value.filter(r => r.total_punches === 1).length
  return { total, late, regular, singlePunch }
})

const displayDateTitle = computed(() => {
  if (selectedDate.value === todayDateStr) {
    return 'Today'
  }
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (selectedDate.value === getManilaDateString(y)) {
    return 'Yesterday'
  }
  return selectedDate.value
})

let unSubLogs: (() => void) | null = null
let unSubScan: (() => void) | null = null

onMounted(() => {
  loadDailyAttendance()
  liveAttendanceService.connect()

  unSubLogs = liveAttendanceService.onLogs(() => {
    loadDailyAttendance()
  })
  unSubScan = liveAttendanceService.onScan(() => {
    loadDailyAttendance()
  })
})

onUnmounted(() => {
  if (unSubLogs) unSubLogs()
  if (unSubScan) unSubScan()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header with Actions -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>Daily Attendance</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-muted font-normal text-muted-foreground">
            {{ displayDateTitle }} ({{ selectedDate }})
          </span>
          <Badge
            :variant="deviceStatus.status === 'online' ? 'success' : (deviceStatus.status === 'connecting' ? 'warning' : 'outline')"
            class="text-[11px] gap-1 cursor-pointer transition-colors"
            @click="liveAttendanceService.connect()"
          >
            <Radio
              class="size-3"
              :class="[
                deviceStatus.status === 'online' ? 'animate-pulse text-emerald-600' : (deviceStatus.status === 'connecting' ? 'animate-spin text-amber-500' : 'text-muted-foreground')
              ]"
            />
            <span class="font-medium">
              Device: {{ deviceStatus.status === 'online' ? 'Online' : (deviceStatus.status === 'connecting' ? 'Connecting...' : 'Offline') }}
            </span>
          </Badge>
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Calculated from real synced BISMAC BISBIO B-29b biometric scans. Zero mock/dummy data.
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2 flex-wrap">
        <Button
          variant="default"
          size="sm"
          class="h-8 gap-1.5 font-medium shadow-xs"
          :disabled="isSyncing"
          @click="handleManualSync"
        >
          <RefreshCw :class="['size-3.5', isSyncing ? 'animate-spin' : '']" />
          <span class="text-xs">{{ isSyncing ? 'Syncing...' : 'Sync Attendance' }}</span>
        </Button>
        <Button variant="outline" size="sm" class="h-8 gap-1.5" @click="loadDailyAttendance">
          <RefreshCw :class="['size-3.5', loading ? 'animate-spin' : '']" />
          <span class="text-xs">Refresh</span>
        </Button>
      </div>
    </div>

    <!-- Biometric Sync Progress Card -->
    <div
      v-if="syncProgress"
      class="rounded-xl border p-4 text-xs transition-all shadow-xs animate-in fade-in duration-200"
      :class="[
        syncProgress.stage === 'error'
          ? 'border-destructive/40 bg-destructive/10 text-destructive-foreground'
          : syncProgress.stage === 'complete'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-foreground'
            : 'border-primary/30 bg-primary/5 text-foreground'
      ]"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="space-y-1.5 flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <Radio v-if="isSyncing" class="size-3.5 text-primary animate-spin" />
            <CheckCircle2 v-else-if="syncProgress.stage === 'complete'" class="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <AlertCircle v-else-if="syncProgress.stage === 'error'" class="size-3.5 text-destructive" />
            <span class="font-semibold text-sm">
              {{ syncProgress.stage === 'complete' ? 'Sync Complete' : (syncProgress.stage === 'error' ? 'Sync Error' : 'Syncing Biometric Records...') }}
            </span>
            <span class="text-[11px] font-mono text-muted-foreground ml-auto pr-2">
              {{ syncProgress.progress }}%
            </span>
          </div>
          <div class="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
            <div
              class="h-full transition-all duration-300 rounded-full"
              :class="[
                syncProgress.stage === 'error' ? 'bg-destructive' : (syncProgress.stage === 'complete' ? 'bg-emerald-600' : 'bg-primary')
              ]"
              :style="{ width: `${syncProgress.progress}%` }"
            />
          </div>
          <div class="text-xs text-muted-foreground">
            {{ syncProgress.message }}
          </div>
        </div>
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground p-1 rounded-md"
          @click="liveAttendanceService.clearSyncProgress()"
        >
          <X class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- Date Filter Bar & Quick Stats -->
    <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
      <div class="rounded-xl border bg-card p-3 shadow-xs sm:col-span-2 flex flex-col justify-between gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <CalendarIcon class="size-3.5 text-primary" />
            Attendance Date
          </span>
          <div class="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              class="h-7 px-2 text-xs"
              :class="selectedDate === todayDateStr ? 'bg-primary/10 border-primary text-primary font-medium' : ''"
              @click="setDateQuick('today')"
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="h-7 px-2 text-xs"
              @click="setDateQuick('yesterday')"
            >
              Yesterday
            </Button>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <input
            type="date"
            v-model="selectedDate"
            class="w-full text-xs h-8 px-2.5 rounded-md border bg-background text-foreground"
            @change="loadDailyAttendance"
          />
        </div>
      </div>

      <div class="rounded-xl border bg-card p-3 shadow-xs flex flex-col justify-center">
        <span class="text-[11px] text-muted-foreground font-medium">Employees Present</span>
        <div class="text-xl font-bold text-foreground mt-0.5 flex items-center gap-1.5">
          <Users class="size-4 text-primary" />
          <span>{{ stats.total }}</span>
        </div>
      </div>

      <div class="rounded-xl border bg-card p-3 shadow-xs flex flex-col justify-center">
        <span class="text-[11px] text-muted-foreground font-medium">Punctuality Summary</span>
        <div class="text-xs text-foreground mt-1 flex items-center gap-2 font-mono">
          <span class="text-emerald-600 font-semibold">{{ stats.regular }} on time</span>
          <span>•</span>
          <span :class="stats.late > 0 ? 'text-amber-600 font-semibold' : 'text-muted-foreground'">
            {{ stats.late }} late
          </span>
        </div>
      </div>
    </div>

    <!-- Search filter -->
    <div class="flex items-center justify-between gap-2">
      <div class="relative flex-1 max-w-sm">
        <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          placeholder="Filter by User ID or Employee Name..."
          class="pl-8 text-xs h-8"
        />
      </div>
    </div>

    <!-- Daily Attendance Records Table -->
    <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
      <!-- Loading State -->
      <div v-if="loading" class="p-8 text-center text-xs text-muted-foreground space-y-2">
        <RefreshCw class="size-5 animate-spin mx-auto text-primary" />
        <p>Loading real attendance records for {{ selectedDate }}...</p>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="filteredRecords.length === 0"
        class="p-12 text-center text-xs space-y-3"
      >
        <div class="size-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
          <Clock class="size-6 text-muted-foreground/60" />
        </div>
        <div class="space-y-1">
          <p class="font-semibold text-foreground text-sm">No attendance records available for {{ displayDateTitle }}.</p>
          <p class="text-muted-foreground max-w-md mx-auto">
            Click <strong>Sync Attendance</strong> to retrieve actual records from the BISMAC BISBIO B-29b biometric device.
          </p>
        </div>
        <Button
          variant="default"
          size="sm"
          class="h-8 gap-1.5 font-medium shadow-xs"
          :disabled="isSyncing"
          @click="handleManualSync"
        >
          <RefreshCw :class="['size-3.5', isSyncing ? 'animate-spin' : '']" />
          <span>{{ isSyncing ? 'Syncing...' : 'Sync Attendance' }}</span>
        </Button>
      </div>

      <!-- Data Table -->
      <Table v-else>
        <TableHeader>
          <TableRow class="bg-muted/40">
            <TableHead class="font-semibold">User ID</TableHead>
            <TableHead class="font-semibold">Employee Name</TableHead>
            <TableHead class="font-semibold">Date</TableHead>
            <TableHead class="font-semibold">First IN</TableHead>
            <TableHead class="font-semibold">Break OUT</TableHead>
            <TableHead class="font-semibold">Break IN</TableHead>
            <TableHead class="font-semibold">Final OUT</TableHead>
            <TableHead class="font-semibold text-center">Total Hours</TableHead>
            <TableHead class="font-semibold text-center">Punches</TableHead>
            <TableHead class="font-semibold text-right">Remarks</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <TableRow v-for="row in filteredRecords" :key="row.id">
            <TableCell class="font-mono font-medium text-xs">{{ row.biometric_user_id }}</TableCell>
            <TableCell class="font-medium text-foreground text-xs">{{ row.employee_name }}</TableCell>
            <TableCell class="text-xs text-muted-foreground">{{ row.date }}</TableCell>
            <TableCell class="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {{ row.time_in }}
            </TableCell>
            <TableCell class="font-mono text-xs text-muted-foreground">{{ row.break_out }}</TableCell>
            <TableCell class="font-mono text-xs text-muted-foreground">{{ row.break_in }}</TableCell>
            <TableCell class="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
              {{ row.time_out }}
            </TableCell>
            <TableCell class="text-center font-mono font-semibold text-xs">{{ row.total_hours }}</TableCell>
            <TableCell class="text-center font-mono text-xs text-muted-foreground">
              <span class="px-1.5 py-0.5 rounded bg-muted text-[11px]">{{ row.total_punches }}</span>
            </TableCell>
            <TableCell class="text-right">
              <Badge
                :variant="row.late_minutes > 0 ? 'warning' : (row.total_punches === 1 ? 'outline' : 'success')"
                class="text-[10px]"
              >
                {{ row.status }}
              </Badge>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
