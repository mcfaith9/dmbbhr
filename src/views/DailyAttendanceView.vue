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
  ArrowDownUp,
  Eye,
  FileText,
  NotebookPen,
  Info,
  Trash2,
  Fingerprint,
  ShieldCheck,
  Send
} from '@lucide/vue'
import { attendanceService, getManilaDateString, type DailyAttendanceRecord } from '@/services/attendance'
import { liveAttendanceService } from '@/services/liveAttendance'
import { authService } from '@/services/auth'
import { VALID_LOCATIONS } from '@/services/employees'
import type { WorkGroup } from '@/types'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
const activeStatusFilter = ref<'all' | 'on_time' | 'late' | 'discrepancy' | 'duplicates'>('all')
const searchQuery = ref<string>('')
const loading = ref<boolean>(false)
const dailyRecords = ref<DailyAttendanceRecord[]>([])
const workGroups = ref<WorkGroup[]>([])

// Unified "Adjust Attendance" Dialog State
const isAdjustmentDialogOpen = ref(false)
const adjustmentRow = ref<DailyAttendanceRecord | null>(null)
const manualInTime = ref('')
const manualOutTime = ref('')
const manualNotes = ref('')
const isSavingAdjustment = ref(false)
const adjustmentError = ref('')
const submitSuccessMsg = ref('')

const currentUser = authService.currentUser

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

const stats = computed(() => {
  const list = dailyRecords.value
  const total = list.length
  const late = list.filter(r => r.late_minutes > 0 || r.status === 'Late').length
  const onTime = list.filter(r => (r.status === 'Regular Day' || (!r.status.includes('Missing') && r.has_valid_out)) && r.late_minutes === 0).length
  const awaitingOut = list.filter(r => r.status === 'Awaiting OUT').length
  const likelyOutMissingIn = list.filter(r => r.status === 'Likely OUT — Missing IN' || r.status === 'Incomplete / Review' || r.is_missing_in).length
  const singlePunchNoOut = list.filter(r => r.status === 'Single Punch — No OUT').length
  const duplicateScans = list.filter(r => (r.duplicate_punches_count || 0) > 0).length
  return { total, late, onTime, awaitingOut, likelyOutMissingIn, singlePunchNoOut, duplicateScans }
})

const filteredRecords = computed(() => {
  let list = dailyRecords.value

  // Status Filter Pill
  if (activeStatusFilter.value === 'on_time') {
    list = list.filter(r => r.late_minutes === 0 && r.has_valid_out && !r.is_missing_in && r.status !== 'Incomplete / Review')
  } else if (activeStatusFilter.value === 'late') {
    list = list.filter(r => r.late_minutes > 0 || r.status === 'Late')
  } else if (activeStatusFilter.value === 'discrepancy') {
    list = list.filter(r => r.is_missing_in || r.status === 'Likely OUT — Missing IN' || r.status === 'Single Punch — No OUT' || r.status === 'Incomplete / Review')
  } else if (activeStatusFilter.value === 'duplicates') {
    list = list.filter(r => (r.duplicate_punches_count || 0) > 0)
  }

  // Search Filter
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

/**
 * Opens unified Adjust Attendance dialog for both IN and OUT
 */
function openAdjustmentModal(row: DailyAttendanceRecord) {
  adjustmentRow.value = row
  adjustmentError.value = ''
  submitSuccessMsg.value = ''

  // Pre-fill valid existing values or leave empty for missing
  if (row.is_missing_in || row.actual_in === '-' || row.actual_in.includes('Missing')) {
    manualInTime.value = row.expected_in || '08:00 AM'
  } else {
    manualInTime.value = row.actual_in.replace(/\s*\(Manual\)/i, '').trim()
  }

  if (row.actual_out === '-' || row.actual_out.includes('Awaiting') || row.actual_out.includes('Missing')) {
    manualOutTime.value = row.expected_out || '05:00 PM'
  } else {
    manualOutTime.value = row.actual_out.replace(/\s*\(Manual\)/i, '').trim()
  }

  manualNotes.value = row.manual_adjustment_reason || ''
  isAdjustmentDialogOpen.value = true
}

/**
 * Validates and submits manual time request for approval
 */
async function handleSubmitForApproval() {
  if (!adjustmentRow.value) return
  adjustmentError.value = ''

  const inVal = manualInTime.value.trim()
  const outVal = manualOutTime.value.trim()
  const notesVal = manualNotes.value.trim()

  if (!inVal && !outVal) {
    adjustmentError.value = 'Please provide at least an authorized Time IN or Time OUT.'
    return
  }

  isSavingAdjustment.value = true
  try {
    const requesterName = currentUser.value?.name || currentUser.value?.username || 'Admin'
    const row = adjustmentRow.value

    await attendanceService.submitManualTimeRequest({
      bioId: row.biometric_user_id,
      employeeName: row.employee_name,
      date: row.raw_date,
      scheduleContext: `${row.expected_in} → ${row.expected_out} (${row.work_group_name})`,
      originalIn: row.actual_in.replace(/\s*\(Manual\)/i, '').trim(),
      originalOut: row.actual_out.replace(/\s*\(Manual\)/i, '').trim(),
      manualIn: inVal || undefined,
      manualOut: outVal || undefined,
      notes: notesVal || 'Manual attendance adjustment request',
      requestedBy: requesterName
    })

    submitSuccessMsg.value = 'Adjustment request submitted for HR approval. Viewable in Manual Time.'
    setTimeout(() => {
      isAdjustmentDialogOpen.value = false
      triggerCoalescedRefresh(true)
    }, 900)
  } catch (err: any) {
    adjustmentError.value = err?.message || 'Failed to submit adjustment request.'
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

// Separate scans in audit into IN window vs OUT window
function getScansForIn(scans: any[]) {
  return scans.filter(s => s.windowRole === 'IN' || (!s.windowRole && scans.indexOf(s) === 0))
}

function getScansForOut(scans: any[]) {
  return scans.filter(s => s.windowRole === 'OUT' || (!s.windowRole && scans.indexOf(s) > 0))
}

function getScansForOther(scans: any[]) {
  return scans.filter(s => s.windowRole !== 'IN' && s.windowRole !== 'OUT')
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
    <!-- Modern SaaS Header & Actions -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
      <div class="space-y-1">
        <div class="flex items-center gap-2.5 flex-wrap">
          <h1 class="text-2xl font-bold tracking-tight text-foreground font-sans">
            Daily Attendance
          </h1>
          <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border bg-muted/50 text-xs font-medium text-foreground">
            <CalendarIcon class="size-3 text-primary" />
            <span>{{ displayDateTitle }}</span>
            <span class="text-muted-foreground font-mono">({{ selectedDate }})</span>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-xs font-medium transition-colors cursor-pointer"
            :class="[
              deviceStatus.status === 'online'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                : (deviceStatus.status === 'connecting'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                  : 'bg-muted border-border text-muted-foreground')
            ]"
            title="Click to verify biometric hardware bridge status"
            @click="liveAttendanceService.connect()"
          >
            <Radio
              class="size-3"
              :class="[
                deviceStatus.status === 'online' ? 'animate-pulse text-emerald-600' : (deviceStatus.status === 'connecting' ? 'animate-spin text-amber-500' : 'text-muted-foreground')
              ]"
            />
            <span>BISBIO B-29b ({{ deviceStatus.status.toUpperCase() }})</span>
          </button>
        </div>
        <p class="text-xs text-muted-foreground">
          Work Group schedule evaluation · Arrival IN & departure OUT window clustering · Preserved raw scans audit
        </p>
      </div>

      <!-- Action Toolbar -->
      <div class="flex items-center gap-2 flex-wrap">
        <Button
          variant="default"
          size="sm"
          class="h-8 gap-1.5 font-medium shadow-xs text-xs"
          :disabled="isSyncing"
          @click="handleManualSync"
        >
          <RefreshCw :class="['size-3.5', isSyncing ? 'animate-spin' : '']" />
          <span>{{ isSyncing ? 'Syncing...' : 'Sync Attendance' }}</span>
        </Button>
      </div>
    </div>

    <!-- Biometric Sync Progress Notification -->
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
              {{ syncProgress.stage === 'complete' ? 'Biometric Sync Complete' : (syncProgress.stage === 'error' ? 'Sync Error' : 'Syncing Hardware Biometric Scans...') }}
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
          class="text-muted-foreground hover:text-foreground p-1 rounded-md cursor-pointer"
          @click="liveAttendanceService.clearSyncProgress()"
        >
          <X class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- Date Control & Top Stats Row -->
    <div class="grid grid-cols-1 md:grid-cols-12 gap-3">
      <!-- Date Selector Card -->
      <div class="md:col-span-4 rounded-xl border bg-card p-3 shadow-xs flex flex-col justify-between gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <CalendarIcon class="size-3.5 text-primary" />
            Target Attendance Date
          </span>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="px-2 py-1 rounded text-xs transition-colors"
              :class="selectedDate === todayDateStr ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'bg-muted/50 text-muted-foreground hover:bg-muted'"
              @click="setDateQuick('today')"
            >
              Today
            </button>
            <button
              type="button"
              class="px-2 py-1 rounded text-xs transition-colors"
              :class="selectedDate === yesterdayDateStr ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'bg-muted/50 text-muted-foreground hover:bg-muted'"
              @click="setDateQuick('yesterday')"
            >
              Yesterday
            </button>
          </div>
        </div>
        <DatePicker v-model="selectedDate" class="w-full text-xs h-8" />
      </div>

      <!-- Quick Metrics Ribbon -->
      <div class="md:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div class="rounded-xl border bg-card p-3 shadow-xs flex flex-col justify-center">
          <span class="text-[11px] text-muted-foreground font-medium">Total Present</span>
          <div class="text-lg font-bold text-foreground mt-0.5 flex items-center gap-1.5 font-mono">
            <Users class="size-4 text-primary" />
            <span>{{ stats.total }}</span>
          </div>
        </div>

        <div class="rounded-xl border bg-card p-3 shadow-xs flex flex-col justify-center">
          <span class="text-[11px] text-muted-foreground font-medium">On-Time Regular</span>
          <div class="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1.5 font-mono">
            <CheckCircle2 class="size-4 text-emerald-600 dark:text-emerald-400" />
            <span>{{ stats.onTime }}</span>
          </div>
        </div>

        <div class="rounded-xl border bg-card p-3 shadow-xs flex flex-col justify-center">
          <span class="text-[11px] text-muted-foreground font-medium">Late In</span>
          <div class="text-lg font-bold mt-0.5 flex items-center gap-1.5 font-mono" :class="stats.late > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'">
            <Clock class="size-4" :class="stats.late > 0 ? 'text-amber-600' : 'text-muted-foreground'" />
            <span>{{ stats.late }}</span>
          </div>
        </div>

        <div class="rounded-xl border bg-card p-3 shadow-xs flex flex-col justify-center">
          <span class="text-[11px] text-muted-foreground font-medium">Missing IN / Discrepant</span>
          <div class="text-lg font-bold mt-0.5 flex items-center gap-1.5 font-mono" :class="stats.likelyOutMissingIn > 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-muted-foreground'">
            <FileText class="size-4" :class="stats.likelyOutMissingIn > 0 ? 'text-rose-600' : 'text-muted-foreground'" />
            <span>{{ stats.likelyOutMissingIn + stats.singlePunchNoOut }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Status Tabs & Filter Toolbar -->
    <div class="space-y-2.5">
      <!-- Modern Status Filter Segment -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap"
          :class="activeStatusFilter === 'all' ? 'bg-primary text-primary-foreground shadow-xs' : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'"
          @click="activeStatusFilter = 'all'"
        >
          All Records ({{ stats.total }})
        </button>

        <button
          type="button"
          class="px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap"
          :class="activeStatusFilter === 'on_time' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'"
          @click="activeStatusFilter = 'on_time'"
        >
          On-Time ({{ stats.onTime }})
        </button>

        <button
          type="button"
          class="px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap"
          :class="activeStatusFilter === 'late' ? 'bg-amber-600 text-white shadow-xs' : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'"
          @click="activeStatusFilter = 'late'"
        >
          Late ({{ stats.late }})
        </button>

        <button
          type="button"
          class="px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap"
          :class="activeStatusFilter === 'discrepancy' ? 'bg-rose-600 text-white shadow-xs' : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'"
          @click="activeStatusFilter = 'discrepancy'"
        >
          Discrepancies / Missing IN ({{ stats.likelyOutMissingIn + stats.singlePunchNoOut }})
        </button>

        <button
          v-if="stats.duplicateScans > 0"
          type="button"
          class="px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap"
          :class="activeStatusFilter === 'duplicates' ? 'bg-purple-600 text-white shadow-xs' : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'"
          @click="activeStatusFilter = 'duplicates'"
        >
          Repeated Scans ({{ stats.duplicateScans }})
        </button>
      </div>

      <!-- Search and Secondary Dropdown Filters -->
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 items-center">
        <div class="relative sm:col-span-2">
          <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            placeholder="Search employee, BIO ID, or group..."
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

        <!-- Sort By Filter -->
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
                <SelectItem value="newest">Latest Punch First</SelectItem>
                <SelectItem value="earliest">Earliest Punch First</SelectItem>
                <SelectItem value="name">Employee Name (A-Z)</SelectItem>
                <SelectItem value="late">Most Late First</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>

    <!-- Daily Attendance Records Table (Compact Flex Top & Bottom) -->
    <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
      <!-- Loading State -->
      <div v-if="loading" class="p-12 text-center text-xs text-muted-foreground space-y-2">
        <RefreshCw class="size-6 animate-spin mx-auto text-primary" />
        <p class="font-medium text-foreground">Processing daily attendance records for {{ selectedDate }}...</p>
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
          <p class="font-semibold text-foreground text-sm">No attendance records found for {{ displayDateTitle }}.</p>
          <p class="text-muted-foreground max-w-md mx-auto">
            Try switching filter tabs, selecting another date, or click <strong>Sync Attendance</strong> to fetch raw records from the device.
          </p>
        </div>
      </div>

      <!-- Data Table with Compact Top & Bottom Architecture -->
      <div v-else class="overflow-x-auto">
        <Table class="text-xs">
          <TableHeader>
            <TableRow class="bg-muted/50 hover:bg-muted/50 border-b">
              <TableHead class="w-[100px] text-foreground font-semibold">BIO ID</TableHead>
              <TableHead class="font-semibold text-foreground min-w-[190px]">Employee</TableHead>
              <TableHead class="font-semibold text-foreground min-w-[140px]">Work Schedule</TableHead>
              <TableHead class="font-semibold text-foreground min-w-[170px]">Actual IN / OUT</TableHead>
              <TableHead class="font-semibold text-foreground text-center min-w-[120px]">Rendered Hours</TableHead>
              <TableHead class="font-semibold text-foreground text-center min-w-[120px]">Late / Undertime</TableHead>
              <TableHead class="font-semibold text-foreground text-right min-w-[140px]">Status</TableHead>
              <TableHead class="font-semibold text-foreground text-right w-[90px]">Action</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <TableRow
              v-for="row in filteredRecords"
              :key="row.id"
              class="hover:bg-muted/30 transition-colors border-b last:border-b-0"
            >
              <!-- 0. BIO ID -->
              <TableCell class="font-mono font-medium text-foreground">                
                <span class="px-1.5 py-0.5 rounded bg-muted text-[11px] font-medium">
                  {{ row.biometric_user_id }}
                </span>
              </TableCell>

              <!-- 1. Employee Name & Duplicate Scans Popover (Top & Bottom) -->
              <TableCell class="py-2.5">
                <div class="flex flex-col gap-1">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-semibold text-foreground text-sm leading-tight">{{ row.employee_name }}</span>
                  </div>

                  <div class="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                    <span class="inline-flex items-center gap-1">
                      <MapPin class="size-2.5 text-emerald-600 dark:text-emerald-400" />
                      {{ row.location }}
                    </span>
                    <span>·</span>
                    <span class="font-medium text-foreground">{{ row.work_group_name }}</span>

                    <!-- Biometric Scans Audit Popover Button -->
                    <Popover v-if="row.raw_punches_count > 0">
                      <PopoverTrigger as-child>
                        <button
                          type="button"
                          class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border transition-colors cursor-pointer"
                          :class="[
                            row.duplicate_punches_count > 0
                              ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-300/40 hover:bg-purple-500/20'
                              : 'bg-muted/60 text-muted-foreground border-border hover:text-foreground hover:bg-muted'
                          ]"
                          :title="`Click to audit all ${row.raw_punches_count} biometric scans`"
                        >
                          <Eye class="size-2.5" />
                          <span>{{ row.raw_punches_count }} scans</span>
                          <span v-if="row.duplicate_punches_count > 0" class="text-[9px] font-bold text-purple-600 dark:text-purple-400">
                            (+{{ row.duplicate_punches_count }} dup)
                          </span>
                        </button>
                      </PopoverTrigger>

                      <PopoverContent class="w-88 p-3.5 text-xs shadow-xl rounded-xl" align="start">
                        <div class="space-y-3">
                          <!-- Audit Header -->
                          <div class="border-b pb-2 flex items-start justify-between gap-2">
                            <div>
                              <div class="font-bold text-foreground text-sm flex items-center gap-1.5">
                                <Fingerprint class="size-4 text-primary" />
                                <span>Biometric Scans Audit</span>
                              </div>
                              <div class="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                <span class="font-semibold text-foreground">{{ row.employee_name }}</span>
                                <span>·</span>
                                <span>{{ row.work_group_name }}</span>
                              </div>
                            </div>
                            <Badge variant="outline" class="font-mono text-[10px] bg-muted/40 shrink-0">
                              {{ row.raw_punches_count }} total scans
                            </Badge>
                          </div>

                          <!-- Scan Breakdown Section (IN Window vs OUT Window) -->
                          <div class="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                            <!-- IN Window Section -->
                            <div class="space-y-1">
                              <div class="flex items-center justify-between text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                                <span>This is for IN (Shift Arrival Window)</span>
                                <span class="text-[10px] font-normal text-muted-foreground">Standard: {{ row.expected_in }}</span>
                              </div>

                              <div v-if="getScansForIn(row.scan_breakdown).length === 0" class="p-1.5 text-[11px] text-amber-600 bg-amber-500/5 rounded border border-dashed border-amber-300/40">
                                No arrival biometric punch recorded (Missing Morning IN).
                              </div>

                              <div
                                v-for="scan in getScansForIn(row.scan_breakdown)"
                                :key="scan.id"
                                class="flex items-center justify-between p-1.5 rounded-md border text-[11px]"
                                :class="scan.isPrimary ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-muted/40 border-muted'"
                              >
                                <div class="flex items-center gap-1.5">
                                  <span class="font-mono font-bold" :class="scan.isPrimary ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'">
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

                            <!-- OUT Window Section -->
                            <div class="space-y-1">
                              <div class="flex items-center justify-between text-[11px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                                <span>This is for OUT (Shift Departure Window)</span>
                                <span class="text-[10px] font-normal text-muted-foreground">Expected: {{ row.expected_out }}</span>
                              </div>

                              <div v-if="getScansForOut(row.scan_breakdown).length === 0" class="p-1.5 text-[11px] text-muted-foreground bg-muted/20 rounded border border-dashed">
                                No departure biometric punch recorded (Awaiting or No OUT).
                              </div>

                              <div
                                v-for="scan in getScansForOut(row.scan_breakdown)"
                                :key="scan.id"
                                class="flex items-center justify-between p-1.5 rounded-md border text-[11px]"
                                :class="scan.isPrimary ? 'bg-blue-500/10 border-blue-500/30' : 'bg-muted/40 border-muted'"
                              >
                                <div class="flex items-center gap-1.5">
                                  <span class="font-mono font-bold" :class="scan.isPrimary ? 'text-blue-700 dark:text-blue-300' : 'text-foreground'">
                                    {{ scan.timeFormatted }}
                                  </span>
                                  <span
                                    v-if="scan.isPrimary"
                                    class="px-1 py-0.2 rounded text-[9px] font-semibold bg-blue-500/20 text-blue-800 dark:text-blue-200"
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

                            <!-- Midday / Other Scans (if any) -->
                            <div v-if="getScansForOther(row.scan_breakdown).length > 0" class="space-y-1">
                              <div class="text-[11px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                Midday / Lunch Scans
                              </div>
                              <div
                                v-for="scan in getScansForOther(row.scan_breakdown)"
                                :key="scan.id"
                                class="flex items-center justify-between p-1.5 rounded-md border text-[11px] bg-muted/40"
                              >
                                <span class="font-mono font-medium">{{ scan.timeFormatted }}</span>
                                <span class="font-mono text-[9px] text-muted-foreground">{{ scan.deviceName || 'BISBIO B-29b' }}</span>
                              </div>
                            </div>
                          </div>

                          <!-- Explainer Notice -->
                          <div class="pt-2 text-[10px] text-muted-foreground border-t flex items-start gap-1.5 leading-snug">
                            <Info class="size-3.5 shrink-0 text-primary mt-0.5" />
                            <span>First valid punch in each window is primary. Raw records are preserved in logs.</span>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </TableCell>

              <!-- 2. Work Schedule Context (Top & Bottom) -->
              <TableCell class="py-2.5">
                <div class="flex flex-col gap-0.5 font-mono text-[11px]">
                  <div class="flex items-center gap-1 font-semibold text-foreground">
                    <span>{{ row.expected_in }}</span>
                    <span class="text-muted-foreground font-normal">→</span>
                    <span>{{ row.expected_out }}</span>
                  </div>
                  <span class="text-[10px] text-muted-foreground font-sans">
                    Lunch: 12:00 PM - 1:00 PM (1h)
                  </span>
                </div>
              </TableCell>

              <!-- 3. Actual IN & OUT Combined (Top & Bottom) -->
              <TableCell class="py-2.5">
                <div class="flex flex-col gap-1 text-[11px]">
                  <!-- Actual IN (Top) -->
                  <div class="flex items-center gap-1.5">
                    <span class="text-[10px] font-bold uppercase tracking-wider px-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">IN</span>
                    
                    <span v-if="row.is_missing_in" class="font-sans font-medium text-amber-600 dark:text-amber-400">
                      Missing (Manual Request)
                    </span>
                    <span v-else-if="row.is_manual_adjustment && row.actual_in.includes('(Manual)')" class="font-mono font-semibold text-sky-600 dark:text-sky-400 inline-flex items-center gap-1" :title="row.manual_adjustment_reason">
                      <FileText class="size-3 text-sky-500" />
                      {{ row.actual_in }}
                    </span>
                    <span v-else class="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {{ row.actual_in }}
                    </span>
                  </div>

                  <!-- Actual OUT (Bottom) -->
                  <div class="flex items-center gap-1.5">
                    <span class="text-[10px] font-bold uppercase tracking-wider px-1 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300">OUT</span>
                    
                    <span v-if="row.actual_out !== '-'" class="font-mono font-bold text-blue-700 dark:text-blue-400">
                      {{ row.actual_out }}
                    </span>
                    <span v-else-if="row.is_awaiting_out" class="font-sans text-sky-600 font-medium">
                      Awaiting OUT
                    </span>
                    <span v-else class="font-sans text-muted-foreground">
                      No OUT recorded
                    </span>
                  </div>
                </div>
              </TableCell>

              <!-- 4. Rendered Hours (Top & Bottom) -->
              <TableCell class="py-2.5 text-center">
                <div class="flex flex-col gap-0.5">
                  <span class="font-mono font-bold text-xs text-foreground">{{ row.total_hours }}</span>
                  <span class="font-mono text-[10px] text-muted-foreground">
                    {{ row.worked_minutes > 0 ? `${row.worked_minutes}m net` : '-' }}
                  </span>
                </div>
              </TableCell>

              <!-- 5. Late & Early Out Combined (Top & Bottom) -->
              <TableCell class="py-2.5 text-center">
                <div class="flex flex-col gap-1 items-center">
                  <!-- Late (Top) -->
                  <div class="flex items-center gap-1">
                    <span class="text-[10px] text-muted-foreground">Late:</span>
                    <span
                      v-if="row.late_minutes > 0"
                      class="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono font-bold text-[11px]"
                      :title="`Late by ${row.late_minutes}m against standard ${row.expected_in}`"
                    >
                      {{ row.late_minutes }}m
                    </span>
                    <span v-else class="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      0m
                    </span>
                  </div>

                  <!-- Early Out (Bottom) -->
                  <div class="flex items-center gap-1">
                    <span class="text-[10px] text-muted-foreground">Early:</span>
                    <span
                      v-if="row.early_out_minutes > 0"
                      class="px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 font-mono font-bold text-[11px]"
                      :title="`Left ${row.early_out_minutes}m before expected ${row.expected_out}`"
                    >
                      {{ row.early_out_minutes }}m
                    </span>
                    <span v-else class="font-mono text-[11px] text-muted-foreground">
                      0m
                    </span>
                  </div>
                </div>
              </TableCell>

              <!-- 6. Status & Explanatory Subtext (Top & Bottom) -->
              <TableCell class="py-2.5 text-right">
                <div class="flex flex-col gap-1 items-end">
                  <div
                    class="flex items-center justify-end text-[10px] font-semibold whitespace-nowrap text-right"
                    :class="
                      row.status === 'Likely OUT — Missing IN' || row.status === 'Incomplete / Review'
                        ? 'text-rose-600 dark:text-rose-400'
                        : row.status === 'Late' || row.status === 'Early OUT'
                          ? 'text-amber-600 dark:text-amber-400'
                          : row.status === 'Regular Day'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : row.status === 'Half Day' || row.status === 'Half Day — PM' || row.status === 'Field Work' || row.status === 'Manual Time' || row.status === 'Leave'
                              ? 'text-sky-600 dark:text-sky-400'
                              : row.status === 'Awaiting OUT' || row.status === 'Single Punch — No OUT'
                                ? 'text-muted-foreground'
                                : 'text-foreground'
                    "
                  >
                    <span>{{ row.status }}</span>
                  </div>

                  <!-- Notes / attendance details -->
                  <Popover v-if="row.manual_adjustment_reason || row.notes">
                    <PopoverTrigger as-child>
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border transition-colors cursor-pointer"
                        :class="[
                          row.manual_adjustment_reason || row.notes
                            ? 'bg-muted/60 text-muted-foreground border-border hover:text-foreground hover:bg-muted'
                            : ''
                        ]"
                        :title="`Click to audit all ${row.raw_punches_count} biometric scans`"
                      >
                        <NotebookPen class="size-2.5" />
                        <span>Manual Notes</span>
                      </button>                      
                    </PopoverTrigger>

                    <PopoverContent
                      align="end"
                      class="w-72"
                    >
                      <div class="space-y-2">
                        <div>
                          <p class="text-xs font-medium">
                            Attendance Note
                          </p>
                          <p class="text-xs text-muted-foreground mt-1">
                            {{ row.manual_adjustment_reason || row.notes }}
                          </p>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <!-- Preserved biometric scans -->
                  <Popover v-else-if="row.raw_punches_count > 1">
                    <PopoverTrigger as-child>
                      <button
                        type="button"
                        class="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {{ row.raw_punches_count }} scans
                      </button>
                    </PopoverTrigger>

                    <PopoverContent
                      align="end"
                      class="w-64"
                    >
                      <div class="space-y-2">
                        <p class="text-xs font-medium">
                          Biometric Scans
                        </p>

                        <p class="text-xs text-muted-foreground">
                          {{ row.raw_punches_count }} biometric scans were preserved
                          for this attendance record.
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </TableCell>

              <!-- 7. Action Button -->
              <TableCell class="py-2.5 text-right">
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7 px-2.5 text-[11px] gap-1 shadow-2xs font-medium"
                  :class="row.is_manual_adjustment ? 'bg-sky-500/10 border-sky-300 text-sky-700 dark:text-sky-300' : ''"
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
    </div>

    <!-- Unified "Adjust Attendance" Dialog for Both IN and OUT -->
    <Dialog v-model:open="isAdjustmentDialogOpen">
      <DialogContent class="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 font-bold text-base">
            <ShieldCheck class="size-5 text-primary" />
            <span>Adjust Attendance</span>
          </DialogTitle>
          <DialogDescription class="text-xs">
            Submit an attendance time adjustment request for HR/Admin approval.
          </DialogDescription>
        </DialogHeader>

        <div v-if="adjustmentRow" class="space-y-3.5 py-1 text-xs">
          <!-- Employee & Schedule Context -->
          <div class="p-3 rounded-lg border bg-muted/40 space-y-1.5">
            <div class="flex items-center justify-between font-semibold text-foreground text-sm">
              <span>{{ adjustmentRow.employee_name }}</span>
              <span class="font-mono text-xs text-muted-foreground">#{{ adjustmentRow.biometric_user_id }}</span>
            </div>
            <div class="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Date: <strong class="text-foreground">{{ adjustmentRow.date }}</strong></span>
              <span>Schedule: <strong class="text-foreground">{{ adjustmentRow.expected_in }} → {{ adjustmentRow.expected_out }}</strong></span>
            </div>
            <div class="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-muted/60">
              <span>Current IN: <strong class="text-foreground font-mono">{{ adjustmentRow.actual_in }}</strong></span>
              <span>Current OUT: <strong class="text-foreground font-mono">{{ adjustmentRow.actual_out }}</strong></span>
            </div>
          </div>

          <!-- Alert / Error message -->
          <div v-if="adjustmentError" class="p-2.5 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-xs">
            {{ adjustmentError }}
          </div>

          <!-- Success message -->
          <div v-if="submitSuccessMsg" class="p-2.5 rounded-md border border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-1.5">
            <CheckCircle2 class="size-4 shrink-0 text-emerald-600" />
            <span>{{ submitSuccessMsg }}</span>
          </div>

          <!-- IN and OUT Adjustment Fields in ONE Dialog -->
          <div class="grid grid-cols-2 gap-3">
            <!-- IN Field -->
            <div class="space-y-1.5">
              <label class="font-semibold text-foreground text-xs flex items-center justify-between">
                <span>Time IN</span>
                <span class="text-[10px] font-normal text-muted-foreground">Optional</span>
              </label>
              <Input
                v-model="manualInTime"
                placeholder="e.g. 08:00 AM"
                class="h-8 text-xs font-mono"
              />
            </div>

            <!-- OUT Field -->
            <div class="space-y-1.5">
              <label class="font-semibold text-foreground text-xs flex items-center justify-between">
                <span>Time OUT</span>
                <span class="text-[10px] font-normal text-muted-foreground">Optional</span>
              </label>
              <Input
                v-model="manualOutTime"
                placeholder="e.g. 05:00 PM"
                class="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <!-- Optional Notes using shadcn-vue Textarea -->
          <div class="space-y-1.5">
            <label class="font-semibold text-foreground text-xs flex items-center justify-between">
              <span>Optional Notes</span>
              <span class="text-[10px] font-normal text-muted-foreground">Reason / Slip Ref #</span>
            </label>
            <Textarea
              v-model="manualNotes"
              placeholder="e.g. Forgot to punch IN on arrival / Signed paper slip #104"
              class="h-16 text-xs resize-none"
            />
          </div>
        </div>

        <DialogFooter class="border-t pt-3 flex items-center justify-end">
          <div class="flex flex-wrap items-center justify-end gap-2 w-full">
            <!-- Revert / Delete button if already adjusted -->
            <Button
              v-if="adjustmentRow?.is_manual_adjustment"
              variant="ghost"
              size="sm"
              class="h-8 text-xs text-destructive hover:bg-destructive/10"
              :disabled="isSavingAdjustment"
              @click="handleDeleteAdjustment"
            >
              <Trash2 class="size-3.5 mr-1" />
              <span>Revert to Biometric</span>
            </Button>

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
              class="h-8 text-xs font-semibold gap-1.5 shadow-xs"
              :disabled="isSavingAdjustment || !!submitSuccessMsg"
              @click="handleSubmitForApproval"
            >
              <Send class="size-3.5" />
              <span>{{ isSavingAdjustment ? 'Submitting...' : 'Submit for Approval' }}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
