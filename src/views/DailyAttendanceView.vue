<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
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
  MapPin,
  Boxes,
  ArrowDownUp,
  Layers,
  AlertTriangle,
  FileText,
  Info,
  Trash2
} from '@lucide/vue'
import { attendanceService, getManilaDateString, type DailyAttendanceRecord } from '@/services/attendance'
import { liveAttendanceService } from '@/services/liveAttendance'
import { VALID_LOCATIONS } from '@/services/employees'
import type { WorkGroup } from '@/types'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Popover,
  PopoverTrigger,
  PopoverContent
} from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'

// Real device status and sync state
const deviceStatus = liveAttendanceService.deviceStatus
const isSyncing = liveAttendanceService.isSyncing
const syncProgress = liveAttendanceService.syncProgress

// Default to Today in Philippine Standard Time
const todayDateStr = getManilaDateString(new Date())
const yesterdayDateStr = computed(() => {
  const y = new Date()
  y.setDate(y.getDate() - 1)
  return getManilaDateString(y)
})
const selectedDate = ref<string>(todayDateStr)
const selectedLocation = ref<string>('all')
const selectedWorkGroup = ref<string>('all')
const selectedSort = ref<'newest' | 'earliest' | 'name' | 'late'>('newest')
const searchQuery = ref<string>('')
const loading = ref<boolean>(false)
const dailyRecords = ref<DailyAttendanceRecord[]>([])
const workGroups = ref<WorkGroup[]>([])

// Manual Adjustment Dialog State
const isAdjustmentDialogOpen = ref(false)
const adjustmentRow = ref<DailyAttendanceRecord | null>(null)
const manualInTime = ref('08:00 AM')
const manualReason = ref('')
const isSavingAdjustment = ref(false)

async function loadLookups() {
  workGroups.value = await attendanceService.getWorkGroups()
}

let refreshTimer: any = null
let isExecutingReload = false
let hasPendingReload = false

async function executeDailyAttendance() {
  if (isExecutingReload) {
    hasPendingReload = true
    return
  }
  isExecutingReload = true
  hasPendingReload = false
  loading.value = true
  try {
    const records = await attendanceService.getDailyAttendance(
      selectedDate.value,
      selectedLocation.value,
      selectedWorkGroup.value
    )
    dailyRecords.value = records
  } finally {
    loading.value = false
    isExecutingReload = false
    if (hasPendingReload) {
      hasPendingReload = false
      executeDailyAttendance()
    }
  }
}

function triggerCoalescedRefresh(immediate = false) {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
  if (immediate) {
    executeDailyAttendance()
  } else {
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      executeDailyAttendance()
    }, 120)
  }
}

watch([selectedLocation, selectedWorkGroup], () => {
  triggerCoalescedRefresh(true)
})

watch(selectedDate, () => {
  triggerCoalescedRefresh(true)
})

async function handleManualSync() {
  await liveAttendanceService.triggerManualSync()
  triggerCoalescedRefresh(true)
}

function setDateQuick(range: 'today' | 'yesterday') {
  if (range === 'today') {
    selectedDate.value = todayDateStr
  } else {
    selectedDate.value = yesterdayDateStr.value
  }
}

const filteredRecords = computed(() => {
  let list = dailyRecords.value

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(r =>
      r.biometric_user_id.toLowerCase().includes(q) ||
      r.employee_name.toLowerCase().includes(q) ||
      r.work_group_name.toLowerCase().includes(q) ||
      r.location.toLowerCase().includes(q)
    )
  }

  const sorted = [...list]
  if (selectedSort.value === 'newest') {
    sorted.sort((a, b) => {
      const diff = (b.latest_punch_time_ms || 0) - (a.latest_punch_time_ms || 0)
      if (diff !== 0) return diff
      return a.employee_name.localeCompare(b.employee_name)
    })
  } else if (selectedSort.value === 'earliest') {
    sorted.sort((a, b) => {
      const diff = (a.first_punch_time_ms || 0) - (b.first_punch_time_ms || 0)
      if (diff !== 0) return diff
      return a.employee_name.localeCompare(b.employee_name)
    })
  } else if (selectedSort.value === 'name') {
    sorted.sort((a, b) => a.employee_name.localeCompare(b.employee_name))
  } else if (selectedSort.value === 'late') {
    sorted.sort((a, b) => b.late_minutes - a.late_minutes)
  }
  return sorted
})

const stats = computed(() => {
  const total = filteredRecords.value.length
  const late = filteredRecords.value.filter(r => r.late_minutes > 0).length
  const onTime = filteredRecords.value.filter(r => r.late_minutes === 0 && r.has_valid_out && !r.is_missing_in).length
  const awaitingOut = filteredRecords.value.filter(r => r.status === 'Awaiting OUT').length
  const singlePunchNoOut = filteredRecords.value.filter(r => r.status === 'Single Punch — No OUT').length
  const likelyOutMissingIn = filteredRecords.value.filter(r => r.status === 'Likely OUT — Missing IN' || r.is_missing_in).length
  const duplicateScans = filteredRecords.value.filter(r => (r.duplicate_punches_count || 0) > 0).length
  return { total, late, onTime, awaitingOut, singlePunchNoOut, likelyOutMissingIn, duplicateScans }
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

function openAdjustmentModal(row: DailyAttendanceRecord) {
  adjustmentRow.value = row
  manualInTime.value = row.expected_in || '08:00 AM'
  manualReason.value = row.manual_adjustment_reason || 'Approved Paper Slip / Manual Request'
  isAdjustmentDialogOpen.value = true
}

async function handleSaveAdjustment() {
  if (!adjustmentRow.value) return
  isSavingAdjustment.value = true
  try {
    await attendanceService.saveManualAdjustment({
      bioId: adjustmentRow.value.biometric_user_id,
      date: adjustmentRow.value.raw_date,
      manualIn: manualInTime.value.trim(),
      reason: manualReason.value.trim() || 'Paper Slip / Manual Request',
      approvedBy: 'Admin'
    })
    isAdjustmentDialogOpen.value = false
    triggerCoalescedRefresh(true)
  } finally {
    isSavingAdjustment.value = false
  }
}

async function handleDeleteAdjustment() {
  if (!adjustmentRow.value) return
  isSavingAdjustment.value = true
  try {
    await attendanceService.deleteManualAdjustment(
      adjustmentRow.value.biometric_user_id,
      adjustmentRow.value.raw_date
    )
    isAdjustmentDialogOpen.value = false
    triggerCoalescedRefresh(true)
  } finally {
    isSavingAdjustment.value = false
  }
}

let unSubLogs: (() => void) | null = null
let unSubScan: (() => void) | null = null

onMounted(async () => {
  await loadLookups()
  executeDailyAttendance()
  liveAttendanceService.connect()

  unSubLogs = liveAttendanceService.onLogs(() => {
    triggerCoalescedRefresh(false)
  })

  unSubScan = liveAttendanceService.onScan(() => {
    triggerCoalescedRefresh(false)
  })
})

onUnmounted(() => {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
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
          Dynamic Work Group evaluation with duplicate scan clustering, schedule awareness, and missing punch detection.
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
              :class="selectedDate === todayDateStr
                ? 'bg-primary/10 border-primary text-primary font-medium'
                : ''"
              @click="setDateQuick('today')"
            >
              Today
            </Button>

            <Button
              variant="outline"
              size="sm"
              class="h-7 px-2 text-xs"
              :class="selectedDate === yesterdayDateStr
                ? 'bg-primary/10 border-primary text-primary font-medium'
                : ''"
              @click="setDateQuick('yesterday')"
            >
              Yesterday
            </Button>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <DatePicker
            v-model="selectedDate"
            class="w-full text-xs h-8"
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
        <span class="text-[11px] text-muted-foreground font-medium">Daily Breakdown</span>
        <div class="text-xs text-foreground mt-1 flex items-center gap-1.5 font-mono flex-wrap">
          <span class="text-emerald-600 font-semibold">{{ stats.onTime }} on time</span>
          <span>•</span>
          <span :class="stats.late > 0 ? 'text-amber-600 font-semibold' : 'text-muted-foreground'">
            {{ stats.late }} late
          </span>
          <span>•</span>
          <span v-if="stats.awaitingOut > 0" class="text-sky-600 font-semibold">
            {{ stats.awaitingOut }} awaiting OUT
          </span>
          <span v-else class="text-muted-foreground">
            {{ stats.singlePunchNoOut }} no OUT
          </span>
          <template v-if="stats.likelyOutMissingIn > 0">
            <span>•</span>
            <span class="text-rose-600 dark:text-rose-400 font-semibold">
              {{ stats.likelyOutMissingIn }} missing IN
            </span>
          </template>
          <template v-if="stats.duplicateScans > 0">
            <span>•</span>
            <span class="text-purple-600 dark:text-purple-400 font-semibold">
              {{ stats.duplicateScans }} with repeated scans
            </span>
          </template>
        </div>
      </div>
    </div>

    <!-- Search, Location, Work Group, and Sort By Filters with Shadcn Select -->
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 items-center">
      <div class="relative sm:col-span-2">
        <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          placeholder="Filter by User ID, name, or group..."
          class="pl-8 text-xs h-8"
        />
      </div>

      <!-- Location Filter -->
      <div>
        <Select v-model="selectedLocation">
          <SelectTrigger class="h-8 text-xs w-full bg-card">
            <SelectValue placeholder="All Locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All Locations</SelectItem>
              <SelectItem v-for="loc in VALID_LOCATIONS" :key="loc" :value="loc">
                {{ loc }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <!-- Work Group Filter -->
      <div>
        <Select v-model="selectedWorkGroup">
          <SelectTrigger class="h-8 text-xs w-full bg-card">
            <SelectValue placeholder="All Work Groups" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All Work Groups</SelectItem>
              <SelectItem v-for="wg in workGroups" :key="wg.id" :value="wg.id">
                {{ wg.name }} ({{ wg.standard_in }}–{{ wg.expected_out }})
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <!-- Sort By Filter (Default: Newest Fingerprint First) -->
      <div>
        <Select v-model="selectedSort">
          <SelectTrigger class="h-8 text-xs w-full bg-card">
            <div class="flex items-center gap-1.5 truncate">
              <ArrowDownUp class="size-3 text-muted-foreground shrink-0" />
              <SelectValue placeholder="Sort: Latest Punch" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="newest">Latest Punch First (Default)</SelectItem>
              <SelectItem value="earliest">Earliest Punch First</SelectItem>
              <SelectItem value="name">Employee Name (A-Z)</SelectItem>
              <SelectItem value="late">Most Late First</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>

    <!-- Daily Attendance Records Table with Work Group Schedule Context -->
    <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
      <!-- Loading State -->
      <div v-if="loading" class="p-8 text-center text-xs text-muted-foreground space-y-2">
        <RefreshCw class="size-5 animate-spin mx-auto text-primary" />
        <p>Calculating attendance records for {{ selectedDate }}...</p>
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
            Import Excel scans or click <strong>Sync Attendance</strong> to retrieve records from the biometric device.
          </p>
        </div>
      </div>

      <!-- Data Table -->
      <Table v-else>
        <TableHeader>
          <TableRow class="bg-muted/40">
            <TableHead class="font-semibold w-[90px]">BIO ID</TableHead>
            <TableHead class="font-semibold min-w-[170px]">Employee</TableHead>
            <TableHead class="font-semibold">Location</TableHead>
            <TableHead class="font-semibold">Work Group</TableHead>
            <TableHead class="font-semibold">Expected IN / OUT</TableHead>
            <TableHead class="font-semibold">Actual IN</TableHead>
            <TableHead class="font-semibold">Actual OUT</TableHead>
            <TableHead class="font-semibold text-center">Hours</TableHead>
            <TableHead class="font-semibold text-center">Late</TableHead>
            <TableHead class="font-semibold text-center">Early Out</TableHead>
            <TableHead class="font-semibold text-right">Status</TableHead>
            <TableHead class="font-semibold text-right w-[80px]">Action</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <TableRow v-for="row in filteredRecords" :key="row.id">
            <!-- BIO ID -->
            <TableCell class="font-mono font-medium text-foreground">                
              <span class="px-1.5 py-0.5 rounded bg-muted text-[11px] font-medium">
                {{ row.biometric_user_id }}
              </span>
            </TableCell>

            <!-- Employee Name & Scans Indicator -->
            <TableCell class="text-xs">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-foreground">{{ row.employee_name }}</span>

                <!-- Duplicate / Multi-Scan Popover Indicator -->
                <Popover v-if="row.raw_punches_count > 1">
                  <PopoverTrigger as-child>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-300/40 hover:bg-purple-500/20 transition-colors cursor-pointer"
                      :title="`Click to audit all ${row.raw_punches_count} biometric scans`"
                    >
                      <Layers class="size-2.5" />
                      <span>{{ row.raw_punches_count }} scans</span>
                      <span v-if="row.duplicate_punches_count > 0" class="text-[9px] opacity-75">
                        ({{ row.duplicate_punches_count }} dup)
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent class="w-84 p-3 text-xs shadow-lg" align="start">
                    <div class="space-y-2">
                      <div class="border-b pb-1.5 flex items-center justify-between">
                        <div>
                          <div class="font-semibold text-foreground">Biometric Scans Audit</div>
                          <div class="text-[11px] text-muted-foreground">{{ row.employee_name }}</div>
                        </div>
                        <Badge variant="outline" class="font-mono text-[10px]">
                          {{ row.raw_punches_count }} total scans
                        </Badge>
                      </div>

                      <div class="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                        <div
                          v-for="scan in row.scan_breakdown"
                          :key="scan.id"
                          class="flex items-center justify-between p-1.5 rounded-md border text-[11px]"
                          :class="scan.isPrimary ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-muted/40 border-muted'"
                        >
                          <div class="flex items-center gap-1.5">
                            <span class="font-mono font-semibold" :class="scan.isPrimary ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'">
                              {{ scan.timeFormatted }}
                            </span>
                            <span
                              v-if="scan.isPrimary"
                              class="px-1 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-800 dark:text-emerald-200"
                            >
                              Primary
                            </span>
                            <span
                              v-else
                              class="px-1 py-0.2 rounded text-[9px] bg-muted text-muted-foreground"
                            >
                              Duplicate (+{{ scan.diffSeconds }}s)
                            </span>
                          </div>
                          <span class="font-mono text-[9px] text-muted-foreground truncate max-w-[100px]" :title="scan.deviceName">
                            {{ scan.deviceName || 'BISBIO B-29b' }}
                          </span>
                        </div>
                      </div>

                      <div class="pt-1 text-[10px] text-muted-foreground border-t flex items-center gap-1">
                        <Info class="size-3 shrink-0 text-muted-foreground" />
                        <span>First valid punch in each window is primary. Raw records are preserved in logs.</span>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </TableCell>

            <!-- Location -->
            <TableCell class="text-xs">
              <span class="inline-flex items-center gap-1 font-medium text-foreground">
                <MapPin class="size-3 text-emerald-600 dark:text-emerald-400" />
                {{ row.location }}
              </span>
            </TableCell>

            <!-- Work Group Badge -->
            <TableCell class="text-xs">
              <Badge variant="outline" class="font-mono text-[10px] gap-1 bg-muted/30">
                <Boxes class="size-2.5 text-primary" />
                {{ row.work_group_name }}
              </Badge>
            </TableCell>

            <!-- Expected IN & Expected OUT (Calculated excluding lunch) -->
            <TableCell class="text-xs font-mono text-muted-foreground">
              <span class="font-medium text-foreground">{{ row.expected_in }}</span>
              <span> → </span>
              <span class="font-medium text-foreground">{{ row.expected_out }}</span>
            </TableCell>

            <!-- Actual IN -->
            <TableCell class="text-xs">
              <!-- Case: Missing IN (Likely OUT) -->
              <div v-if="row.is_missing_in" class="flex flex-col gap-0.5">
                <span class="text-amber-600 dark:text-amber-400 font-sans font-medium text-[11px] inline-flex items-center gap-1">
                  <AlertTriangle class="size-3 shrink-0 text-amber-500" />
                  Missing (Manual Request)
                </span>
                <span class="text-[10px] text-muted-foreground">Punch occurred near shift end</span>
              </div>

              <!-- Case: Approved Manual / Paper Adjustment -->
              <div v-else-if="row.is_manual_adjustment" class="flex items-center gap-1 font-mono text-sky-600 dark:text-sky-400 font-semibold" :title="row.manual_adjustment_reason">
                <FileText class="size-3 shrink-0 text-sky-500" />
                <span>{{ row.actual_in }}</span>
              </div>

              <!-- Case: Standard Biometric IN -->
              <span v-else class="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {{ row.actual_in }}
              </span>
            </TableCell>

            <!-- Actual OUT -->
            <TableCell class="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
              {{ row.actual_out }}
            </TableCell>

            <!-- Total Rendered Hours -->
            <TableCell class="text-center font-mono font-semibold text-xs">{{ row.total_hours }}</TableCell>
            
            <!-- Late Minutes against Work Group Standard IN -->
            <TableCell class="text-center font-mono text-xs">
              <span
                v-if="row.late_minutes > 0"
                class="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold"
                :title="`Late by ${row.late_minutes} minutes past ${row.expected_in}`"
              >
                {{ row.late_minutes }}m
              </span>
              <span v-else class="text-muted-foreground text-[11px]">
                0m
              </span>
            </TableCell>

            <!-- Early Out Minutes against Work Group Expected OUT -->
            <TableCell class="text-center font-mono text-xs">
              <span
                v-if="row.early_out_minutes > 0"
                class="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold"
                :title="`Left ${row.early_out_minutes} minutes before expected ${row.expected_out}`"
              >
                {{ row.early_out_minutes }}m
              </span>
              <span v-else class="text-muted-foreground text-[11px]">
                0m
              </span>
            </TableCell>

            <!-- Distinct Status Column -->
            <TableCell class="text-right">
              <Badge
                :variant="
                  row.status === 'Likely OUT — Missing IN'
                    ? 'destructive'
                    : (row.status === 'Manual / Paper IN'
                      ? 'secondary'
                      : (row.status === 'Regular Day'
                        ? (row.late_minutes > 0 || row.early_out_minutes > 0 ? 'warning' : 'success')
                        : (row.status === 'Awaiting OUT' ? 'secondary' : 'outline')))
                "
                class="text-[10px] gap-1"
              >
                <AlertTriangle v-if="row.status === 'Likely OUT — Missing IN'" class="size-2.5" />
                <FileText v-else-if="row.status === 'Manual / Paper IN'" class="size-2.5" />
                <Clock v-else-if="row.status === 'Single Punch — No OUT'" class="size-2.5" />
                <span>{{ row.status }}</span>
              </Badge>
            </TableCell>

            <!-- Action: Manual Adjustment / Paper Slip -->
            <TableCell class="text-right">
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-[11px] gap-1 hover:bg-muted text-muted-foreground hover:text-foreground"
                :title="row.is_manual_adjustment ? 'Edit manual adjustment' : 'Record official paper slip / manual time-in'"
                @click="openAdjustmentModal(row)"
              >
                <FileText class="size-3" />
                <span>{{ row.is_manual_adjustment ? 'Adjusted' : 'Adjust' }}</span>
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Manual Attendance Adjustment Dialog -->
    <Dialog v-model:open="isAdjustmentDialogOpen">
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <FileText class="size-4 text-primary" />
            <span>Manual Attendance Adjustment</span>
          </DialogTitle>
          <DialogDescription>
            Record or update an authorized paper time-in / manual request for
            <strong>{{ adjustmentRow?.employee_name }}</strong> on {{ adjustmentRow?.date }}.
          </DialogDescription>
        </DialogHeader>

        <div class="grid gap-3 py-2 text-xs">
          <!-- Expected Shift Info -->
          <div class="p-2.5 rounded-md border bg-muted/40 space-y-1">
            <div class="text-[11px] text-muted-foreground">Work Group & Expected Hours:</div>
            <div class="font-medium text-foreground">
              {{ adjustmentRow?.work_group_name }} ({{ adjustmentRow?.expected_in }} → {{ adjustmentRow?.expected_out }})
            </div>
            <div v-if="adjustmentRow?.actual_out !== '-'" class="text-[11px] text-blue-600 dark:text-blue-400">
              Biometric OUT Recorded: <strong>{{ adjustmentRow?.actual_out }}</strong>
            </div>
          </div>

          <!-- Time IN -->
          <div class="space-y-1">
            <label class="font-semibold text-foreground">Authorized Time IN</label>
            <Input
              v-model="manualInTime"
              placeholder="e.g. 08:00 AM"
              class="h-8 text-xs font-mono"
            />
            <p class="text-[10px] text-muted-foreground">Standard 12h format (e.g. 08:00 AM, 07:00 AM).</p>
          </div>

          <!-- Reason / Paper Slip Ref -->
          <div class="space-y-1">
            <label class="font-semibold text-foreground">Reference / Authorization Note</label>
            <Input
              v-model="manualReason"
              placeholder="e.g. Supervisor Approved Paper Slip #104"
              class="h-8 text-xs"
            />
          </div>
        </div>

        <DialogFooter class="flex items-center justify-between sm:justify-between gap-2">
          <Button
            v-if="adjustmentRow?.is_manual_adjustment"
            variant="destructive"
            size="sm"
            class="h-8 text-xs gap-1"
            :disabled="isSavingAdjustment"
            @click="handleDeleteAdjustment"
          >
            <Trash2 class="size-3" />
            <span>Remove Adjustment</span>
          </Button>
          <div v-else />

          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              class="h-8 text-xs"
              @click="isAdjustmentDialogOpen = false"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              class="h-8 text-xs font-medium"
              :disabled="isSavingAdjustment"
              @click="handleSaveAdjustment"
            >
              <span>{{ isSavingAdjustment ? 'Saving...' : 'Apply Adjustment' }}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
