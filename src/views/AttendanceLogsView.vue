<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import {
  Download,
  Upload,
  RefreshCw,
  Search,
  Calendar as CalendarIcon,
  X,
  CheckCircle2,
  Radio,
  Fingerprint,
  Trash2,
  Layers
} from '@lucide/vue'
import * as XLSX from 'xlsx'
import { attendanceService } from '@/services/attendance'
import { deviceService } from '@/services/devices'
import { liveAttendanceService } from '@/services/liveAttendance'
import type { AttendanceLog, AttendanceFilterParams, PaginationMeta, Location, BiometricDevice, WorkGroup } from '@/types'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
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

const logs = ref<AttendanceLog[]>([])
const loading = ref(false)
const locations = ref<Location[]>([])
const devices = ref<BiometricDevice[]>([])
const workGroups = ref<WorkGroup[]>([])

// Helper to get local date string YYYY-MM-DD in Asia/Manila (Philippine Standard Time)
function getTodayManilaDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
}

// Filter state - DEFAULTS TO ALL DATES SO IMPORTED HISTORICAL EXCEL DATA IS VISIBLE IMMEDIATELY
const filters = ref<AttendanceFilterParams>({
  search: '',
  locationId: 'all',
  workGroupId: 'all',
  deviceId: 'all',
  quickRange: 'all',
  startDate: '',
  endDate: '',
  type: 'all',
  state: 'all',
  page: 1,
  pageSize: 10
})

const meta = ref<PaginationMeta>({
  currentPage: 1,
  pageSize: 10,
  totalItems: 0,
  totalPages: 1
})

// Import dialog & state
const showImportModal = ref(false)
const importFile = ref<File | null>(null)
const importPreviewData = ref<any[]>([])
const importValidation = ref({
  totalRecords: 0,
  validCount: 0,
  duplicateCount: 0,
  errors: [] as string[]
})
const isImporting = ref(false)
const importProgress = ref({ processed: 0, total: 0, percentage: 0 })
const importSuccessMsg = ref('')
const importErrorMsg = ref('')

async function loadData() {
  loading.value = true
  try {
    const res = await attendanceService.getLogs(filters.value)
    logs.value = res.logs
    meta.value = res.meta
  } finally {
    loading.value = false
  }
}

async function loadLookups() {
  const [locs, devs, wgs] = await Promise.all([
    deviceService.getLocations(),
    deviceService.getDevices(),
    attendanceService.getWorkGroups()
  ])
  locations.value = locs
  devices.value = devs
  workGroups.value = wgs
}

function handleSearch() {
  filters.value.page = 1
  loadData()
}

// Watch filters for instant pagination / dropdown updates
watch(
  () => [filters.value.locationId, filters.value.workGroupId, filters.value.deviceId, filters.value.type, filters.value.state],
  () => {
    filters.value.page = 1
    loadData()
  }
)

function setQuickRange(range: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'all') {
  filters.value.quickRange = range
  filters.value.page = 1
  const today = getTodayManilaDateString()
  if (range === 'today') {
    filters.value.startDate = today
    filters.value.endDate = today
  } else if (range === 'yesterday') {
    const y = new Date()
    y.setDate(y.getDate() - 1)
    const yesterday = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(y)
    filters.value.startDate = yesterday
    filters.value.endDate = yesterday
  } else if (range === 'this_week') {
    const w = new Date()
    w.setDate(w.getDate() - 6)
    const weekAgo = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(w)
    filters.value.startDate = weekAgo
    filters.value.endDate = today
  } else if (range === 'this_month') {
    const m = new Date()
    m.setDate(1)
    const monthStart = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(m)
    filters.value.startDate = monthStart
    filters.value.endDate = today
  } else {
    filters.value.startDate = ''
    filters.value.endDate = ''
  }
  loadData()
}

function resetFilters() {
  filters.value = {
    search: '',
    locationId: 'all',
    workGroupId: 'all',
    deviceId: 'all',
    quickRange: 'all',
    startDate: '',
    endDate: '',
    type: 'all',
    state: 'all',
    page: 1,
    pageSize: 10
  }
  loadData()
}

function onPageChange(page: number) {
  filters.value.page = page
  loadData()
}

function onPageSizeChange(size: number) {
  filters.value.pageSize = size
  filters.value.page = 1
  loadData()
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return dateStr
  }
}

function formatTime(dateStr: string) {
  try {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
  } catch {
    return ''
  }
}

async function exportLogs(format: 'xlsx' | 'csv') {
  const allFiltered = await attendanceService.getAllFilteredLogsForExport(filters.value)
  if (!allFiltered || allFiltered.length === 0) {
    alert('No records available to export with current filters.')
    return
  }

  const exportRows = allFiltered.map(log => ({
    'User ID': log.user_id,
    'Employee Name': log.employee_name || 'Unassigned',
    'Work Group': log.work_group_name || 'GROUP C',
    'Date': formatDate(log.attendance_time),
    'Time': formatTime(log.attendance_time),
    'Full Timestamp': log.attendance_time,
    'Type (Raw)': log.type,
    'State (Raw)': log.state,
    'Serial': log.serial_number,
    'Device': log.device_name || 'BISBIO B-29b',
    'Device IP': log.device_ip,
    'Location': log.location_name || 'DBB Cebu',
    'Is Duplicate Scan': log.is_duplicate ? 'Yes' : 'No'
  }))

  const worksheet = XLSX.utils.json_to_sheet(exportRows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance_Logs')

  const filename = `DMBBHR_Attendance_Logs_${new Date().toISOString().slice(0, 10)}.${format}`

  if (format === 'csv') {
    XLSX.writeFile(workbook, filename, { bookType: 'csv' })
  } else {
    XLSX.writeFile(workbook, filename, { bookType: 'xlsx' })
  }
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return

  importFile.value = target.files[0]
  const reader = new FileReader()

  reader.onload = (e: any) => {
    try {
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]
      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet)

      validateImportData(jsonData)
    } catch (err: any) {
      importValidation.value.errors = ['Failed to parse file: ' + err.message]
    }
  }

  reader.readAsArrayBuffer(importFile.value)
}

function validateImportData(rows: any[]) {
  importPreviewData.value = rows.slice(0, 5)
  importValidation.value.totalRecords = rows.length
  importValidation.value.errors = []

  let valid = 0
  let duplicates = 0

  rows.forEach((row, index) => {
    const userId = row['User ID'] || row['userId'] || row['User_ID'] || row['ID'] || row.user_id
    const time = row['Date/Time'] || row['DateTime'] || row['Date'] || row['attTime'] || row['Time'] || row.attendance_time

    if (!userId || !time) {
      if (importValidation.value.errors.length < 3) {
        importValidation.value.errors.push(`Row ${index + 1}: Missing User ID or Date/Time`)
      }
    } else {
      valid++
    }
  })

  importValidation.value.validCount = valid
  importValidation.value.duplicateCount = duplicates
}

async function confirmImport() {
  if (!importFile.value) return
  isImporting.value = true
  importErrorMsg.value = ''
  importSuccessMsg.value = ''
  importProgress.value = { processed: 0, total: importValidation.value.validCount, percentage: 0 }

  const reader = new FileReader()
  reader.onload = async (e: any) => {
    try {
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(sheet)

      const result = await attendanceService.importLogsChunked(
        rows,
        importFile.value?.name || 'biometric.xlsx',
        (processed, total) => {
          importProgress.value = {
            processed,
            total,
            percentage: total > 0 ? Math.round((processed / total) * 100) : 100
          }
        }
      )

      importSuccessMsg.value = `Successfully persisted ${result.importedCount.toLocaleString()} records into local database (${result.duplicateCount.toLocaleString()} duplicates skipped, ${result.invalidCount} invalid).`

      setTimeout(() => {
        showImportModal.value = false
        importFile.value = null
        importPreviewData.value = []
        importSuccessMsg.value = ''
        importProgress.value = { processed: 0, total: 0, percentage: 0 }
        loadData()
      }, 1500)
    } catch (err: any) {
      importErrorMsg.value = 'Import failed: ' + (err?.message || 'Error persisting attendance records.')
    } finally {
      isImporting.value = false
    }
  }

  reader.onerror = () => {
    importErrorMsg.value = 'Failed to read file from disk.'
    isImporting.value = false
  }

  reader.readAsArrayBuffer(importFile.value)
}

async function handleClearAll() {
  if (confirm('Are you sure you want to clear all stored attendance records from local storage? This action cannot be undone.')) {
    await attendanceService.clearAllLogs()
    loadData()
  }
}

const deviceStatus = liveAttendanceService.deviceStatus
const isSyncing = liveAttendanceService.isSyncing

async function handleManualSync() {
  await liveAttendanceService.triggerManualSync()
  loadData()
}

const latestLiveScan = ref<AttendanceLog | null>(null)
let unsubscribeLive: (() => void) | null = null
let unsubscribeLogs: (() => void) | null = null

function handleNewBiometricScan(newLog: AttendanceLog) {
  if (!logs.value.some(l => l.id === newLog.id)) {
    logs.value.unshift(newLog)
    meta.value.totalItems += 1
  }

  latestLiveScan.value = newLog
  setTimeout(() => {
    if (latestLiveScan.value?.id === newLog.id) {
      latestLiveScan.value = null
    }
  }, 8000)
}

onMounted(() => {
  loadLookups()
  loadData()

  liveAttendanceService.connect()
  unsubscribeLive = liveAttendanceService.onScan((scan) => {
    handleNewBiometricScan(scan)
  })
  unsubscribeLogs = liveAttendanceService.onLogs(() => {
    loadData()
  })
})

onUnmounted(() => {
  if (unsubscribeLive) unsubscribeLive()
  if (unsubscribeLogs) unsubscribeLogs()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header with Actions -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>Attendance Logs</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-muted font-normal text-muted-foreground font-mono">
            {{ meta.totalItems.toLocaleString() }} Stored Records
          </span>
          <Badge
            :variant="deviceStatus.status === 'online' ? 'success' : (deviceStatus.status === 'connecting' ? 'warning' : 'outline')"
            class="text-[11px] gap-1 cursor-pointer transition-colors"
            :title="`Status: ${deviceStatus.status.toUpperCase()} - Target: ${deviceStatus.ip}:${deviceStatus.port}`"
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
        <p class="text-xs text-muted-foreground">
          Historical and live biometric attendance records. Persisted locally in IndexedDB across browser refreshes and restarts.
        </p>
      </div>

      <!-- Action buttons -->
      <div class="flex items-center gap-2 flex-wrap">
        <Button
          variant="default"
          size="sm"
          class="h-8 gap-1.5 font-medium shadow-xs"
          :disabled="isSyncing"
          @click="handleManualSync"
        >
          <RefreshCw :class="['size-3.5', isSyncing ? 'animate-spin' : '']" />
          <span class="text-xs">{{ isSyncing ? 'Syncing...' : 'Sync Device' }}</span>
        </Button>
        <Button variant="outline" size="sm" class="h-8 gap-1.5" @click="loadData">
          <RefreshCw :class="['size-3.5', loading ? 'animate-spin' : '']" />
          <span class="text-xs">Reload</span>
        </Button>
        <Button variant="outline" size="sm" class="h-8 gap-1.5" @click="showImportModal = true">
          <Upload class="size-3.5" />
          <span class="text-xs">Import Biometric (Excel)</span>
        </Button>
        <div class="flex items-center rounded-md border bg-card">
          <Button variant="ghost" size="sm" class="h-8 px-2.5 text-xs rounded-r-none border-r" @click="exportLogs('xlsx')">
            <Download class="size-3.5 mr-1.5" />
            Excel
          </Button>
          <Button variant="ghost" size="sm" class="h-8 px-2.5 text-xs rounded-l-none" @click="exportLogs('csv')">
            CSV
          </Button>
        </div>
      </div>
    </div>

    <!-- Live Scan Flash Notification -->
    <div
      v-if="latestLiveScan"
      class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-foreground shadow-xs flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300"
    >
      <div class="flex items-center gap-3">
        <div class="size-8 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold">
          <Fingerprint class="size-4 animate-bounce" />
        </div>
        <div>
          <div class="font-semibold text-sm flex items-center gap-2">
            <span>Real-Time Biometric Scan Detected!</span>
            <Badge variant="success" class="text-[10px] uppercase font-mono">Live</Badge>
          </div>
          <div class="text-xs text-muted-foreground mt-0.5">
            User ID: <strong class="text-foreground font-mono">{{ latestLiveScan.user_id }}</strong>
            <span v-if="latestLiveScan.employee_name"> • {{ latestLiveScan.employee_name }}</span>
            • Time: {{ formatTime(latestLiveScan.attendance_time) }}
          </div>
        </div>
      </div>
      <Button variant="ghost" size="sm" class="h-7 text-xs" @click="latestLiveScan = null">
        <X class="size-3.5" />
      </Button>
    </div>

    <!-- Filter Toolbar with Shadcn Select Dropdowns -->
    <div class="rounded-xl border bg-card p-3 shadow-xs space-y-3">
      <!-- Quick Range Pills -->
      <div class="flex items-center gap-1.5 flex-wrap text-xs">
        <span class="text-muted-foreground mr-1 text-[11px] font-medium flex items-center gap-1">
          <CalendarIcon class="size-3" /> Quick Filter:
        </span>
        <button
          type="button"
          :class="[
            'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
            filters.quickRange === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/60 text-muted-foreground hover:text-foreground'
          ]"
          @click="setQuickRange('all')"
        >
          All Dates
        </button>
        <button
          type="button"
          :class="[
            'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
            filters.quickRange === 'today'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/60 text-muted-foreground hover:text-foreground'
          ]"
          @click="setQuickRange('today')"
        >
          Today
        </button>
        <button
          type="button"
          :class="[
            'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
            filters.quickRange === 'yesterday'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/60 text-muted-foreground hover:text-foreground'
          ]"
          @click="setQuickRange('yesterday')"
        >
          Yesterday
        </button>
        <button
          type="button"
          :class="[
            'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
            filters.quickRange === 'this_week'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/60 text-muted-foreground hover:text-foreground'
          ]"
          @click="setQuickRange('this_week')"
        >
          This Week
        </button>
        <button
          type="button"
          :class="[
            'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
            filters.quickRange === 'this_month'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/60 text-muted-foreground hover:text-foreground'
          ]"
          @click="setQuickRange('this_month')"
        >
          This Month
        </button>
      </div>

      <!-- Main Input Filters with Shadcn Select -->
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <div class="relative lg:col-span-2">
          <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            v-model="filters.search"
            type="text"
            placeholder="Search employee or User ID..."
            class="pl-8 h-8 text-xs"
            @keyup.enter="handleSearch"
          />
        </div>

        <div>
          <!-- Shadcn Location Select -->
          <Select v-model="filters.locationId">
            <SelectTrigger class="h-8 text-xs w-full bg-background">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All Locations</SelectItem>
                <SelectItem v-for="loc in locations" :key="loc.id" :value="loc.name">
                  {{ loc.name }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div>
          <!-- Shadcn Work Group Select -->
          <Select v-model="filters.workGroupId">
            <SelectTrigger class="h-8 text-xs w-full bg-background">
              <SelectValue placeholder="All Groups" />
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

        <div>
          <Input
            v-model="filters.startDate"
            type="date"
            class="h-8 text-xs"
            title="Start Date"
            @change="handleSearch"
          />
        </div>

        <div>
          <Input
            v-model="filters.endDate"
            type="date"
            class="h-8 text-xs"
            title="End Date"
            @change="handleSearch"
          />
        </div>
      </div>

      <!-- Secondary filter bar with Shadcn Select (Type & State) -->
      <div class="flex items-center justify-between pt-1 border-t text-xs text-muted-foreground flex-wrap gap-2">
        <div class="flex items-center gap-3 flex-wrap">
          <div class="flex items-center gap-1.5">
            <span class="text-[11px]">Type:</span>
            <Select v-model="filters.type">
              <SelectTrigger class="h-7 text-xs w-[140px] bg-background">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="1">Type 1 (Fingerprint)</SelectItem>
                  <SelectItem value="2">Type 2 (Face)</SelectItem>
                  <SelectItem value="3">Type 3 (Password/Card)</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div class="flex items-center gap-1.5">
            <span class="text-[11px]">Raw State:</span>
            <Select v-model="filters.state">
              <SelectTrigger class="h-7 text-xs w-[120px] bg-background">
                <SelectValue placeholder="All States" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All States</SelectItem>
                  <SelectItem value="1">State 1</SelectItem>
                  <SelectItem value="2">State 2</SelectItem>
                  <SelectItem value="3">State 3</SelectItem>
                  <SelectItem value="4">State 4</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="text-xs text-primary hover:underline font-medium"
            @click="resetFilters"
          >
            Reset Filters
          </button>
          <span class="text-muted-foreground">•</span>
          <button
            type="button"
            class="text-xs text-destructive hover:underline font-medium flex items-center gap-1"
            @click="handleClearAll"
          >
            <Trash2 class="size-3" />
            Clear Storage
          </button>
        </div>
      </div>
    </div>

    <!-- Attendance Table Card with Server/IndexedDB Pagination -->
    <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow class="bg-muted/40">
            <TableHead class="w-[100px] font-semibold">User ID</TableHead>
            <TableHead class="font-semibold">Employee</TableHead>
            <TableHead class="font-semibold">Work Group</TableHead>
            <TableHead class="font-semibold">Date</TableHead>
            <TableHead class="font-semibold">Time</TableHead>
            <TableHead class="font-semibold text-center w-[70px]">Type</TableHead>
            <TableHead class="font-semibold text-center w-[70px]">State</TableHead>
            <TableHead class="font-semibold text-center w-[80px]">Serial</TableHead>
            <TableHead class="font-semibold">Location</TableHead>
            <TableHead class="font-semibold text-right">Audit</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <template v-if="loading">
            <TableRow>
              <TableCell colspan="10" class="h-32 text-center text-muted-foreground">
                <div class="flex items-center justify-center gap-2">
                  <RefreshCw class="size-4 animate-spin" />
                  <span>Loading records from local database...</span>
                </div>
              </TableCell>
            </TableRow>
          </template>

          <template v-else-if="logs.length === 0">
            <TableRow>
              <TableCell colspan="10" class="h-40 text-center text-muted-foreground">
                <div class="flex flex-col items-center justify-center gap-2 max-w-md mx-auto py-6">
                  <div class="size-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                    <Fingerprint class="size-5 text-muted-foreground/60" />
                  </div>
                  <div class="space-y-1">
                    <span class="font-medium text-foreground text-sm block">
                      No attendance logs found.
                    </span>
                    <p class="text-xs text-muted-foreground">
                      Click <strong>Import Biometric (Excel)</strong> to load historical data, or click <strong>Sync Device</strong> when connected.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-8 gap-1.5 font-medium shadow-xs mt-1"
                    @click="showImportModal = true"
                  >
                    <Upload class="size-3.5" />
                    <span>Upload Excel File</span>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </template>

          <template v-else>
            <TableRow
              v-for="log in logs"
              :key="log.id"
              :class="log.is_duplicate ? 'bg-amber-500/5' : ''"
            >
              <TableCell class="font-mono font-medium text-foreground">
                {{ log.user_id }}
              </TableCell>

              <TableCell>
                <div class="flex flex-col">
                  <span class="font-medium text-foreground">
                    {{ log.employee_name || 'Unassigned User' }}
                  </span>
                </div>
              </TableCell>

              <TableCell>
                <Badge variant="outline" class="font-mono text-[10px] gap-1 bg-muted/40">
                  <Layers class="size-2.5 text-primary" />
                  {{ log.work_group_name || 'GROUP C' }}
                </Badge>
              </TableCell>

              <TableCell class="whitespace-nowrap text-xs">
                {{ formatDate(log.attendance_time) }}
              </TableCell>

              <TableCell class="whitespace-nowrap font-mono text-xs font-medium">
                {{ formatTime(log.attendance_time) }}
              </TableCell>

              <TableCell class="text-center font-mono text-xs">
                <span class="px-1.5 py-0.5 rounded bg-muted text-[11px] font-medium">
                  {{ log.type }}
                </span>
              </TableCell>

              <TableCell class="text-center font-mono text-xs">
                <span class="px-1.5 py-0.5 rounded bg-muted text-[11px] font-medium">
                  {{ log.state }}
                </span>
              </TableCell>

              <TableCell class="text-center font-mono text-xs text-muted-foreground">
                {{ log.serial_number }}
              </TableCell>

              <TableCell class="text-xs">
                <span class="inline-flex items-center gap-1 font-medium text-foreground">
                  <span class="size-1.5 rounded-full bg-emerald-500" />
                  {{ log.location_name || 'DBB Cebu' }}
                </span>
              </TableCell>

              <TableCell class="text-right">
                <Badge
                  v-if="log.is_duplicate"
                  variant="warning"
                  class="text-[10px] uppercase font-mono"
                >
                  Duplicate
                </Badge>
                <Badge
                  v-else
                  variant="success"
                  class="text-[10px] uppercase font-mono"
                >
                  Verified
                </Badge>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>

      <div class="border-t p-3 bg-card">
        <Pagination
          :current-page="meta.currentPage"
          :total-pages="meta.totalPages"
          :total-items="meta.totalItems"
          :page-size="meta.pageSize"
          @update:page="onPageChange"
          @update:page-size="onPageSizeChange"
        />
      </div>
    </div>

    <!-- Import Biometric Records Modal -->
    <div
      v-if="showImportModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4"
    >
      <div class="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg space-y-4">
        <div class="flex items-center justify-between border-b pb-3">
          <div>
            <h2 class="text-lg font-bold text-foreground flex items-center gap-2">
              <Upload class="size-4" />
              Import Biometric Device Data
            </h2>
            <p class="text-xs text-muted-foreground mt-0.5">
              Upload historical CSV or Excel files. Records will be saved to local persistent database.
            </p>
          </div>
          <button
            type="button"
            class="rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
            @click="showImportModal = false"
          >
            <X class="size-4" />
          </button>
        </div>

        <div v-if="importSuccessMsg" class="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 class="size-4 shrink-0" />
          <span>{{ importSuccessMsg }}</span>
        </div>

        <div v-if="importErrorMsg" class="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive flex items-center gap-2">
          <X class="size-4 shrink-0" />
          <span>{{ importErrorMsg }}</span>
        </div>

        <!-- Real-time chunked import progress bar -->
        <div v-if="isImporting" class="rounded-md border bg-muted/40 p-3 space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="font-medium text-foreground">Importing into IndexedDB in chunks...</span>
            <span class="font-mono text-muted-foreground">{{ importProgress.processed.toLocaleString() }} / {{ importProgress.total.toLocaleString() }} ({{ importProgress.percentage }}%)</span>
          </div>
          <div class="w-full bg-secondary h-2 rounded-full overflow-hidden">
            <div
              class="bg-primary h-full transition-all duration-200"
              :style="{ width: `${importProgress.percentage}%` }"
            />
          </div>
          <p class="text-[11px] text-muted-foreground">
            Processed safely in batches with automatic duplicate key detection.
          </p>
        </div>

        <div class="space-y-3 text-xs">
          <div>
            <label class="block font-medium text-foreground mb-1">Select File (.xlsx or .csv)</label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              class="w-full rounded-md border border-input bg-background p-2 text-xs file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90 cursor-pointer"
              @change="handleFileChange"
            />
          </div>

          <div class="rounded-md bg-muted/40 p-2.5 border text-muted-foreground space-y-1">
            <span class="font-semibold text-foreground">Expected biometric header columns:</span>
            <div class="font-mono text-[11px]">User ID, Name, Date/Time, Type, State, Serial, IP</div>
          </div>

          <div v-if="importFile && importValidation.totalRecords > 0" class="space-y-2 border-t pt-3">
            <div class="flex items-center justify-between text-xs">
              <span class="text-muted-foreground">Detected Records:</span>
              <strong class="text-foreground">{{ importValidation.totalRecords.toLocaleString() }}</strong>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-muted-foreground">Valid for import:</span>
              <strong class="text-emerald-600">{{ importValidation.validCount.toLocaleString() }}</strong>
            </div>

            <div class="border rounded-md overflow-hidden text-[11px]">
              <div class="bg-muted px-2 py-1 font-semibold text-foreground">Preview (First 3 rows)</div>
              <div
                v-for="(row, i) in importPreviewData.slice(0, 3)"
                :key="i"
                class="px-2 py-1 border-t flex items-center justify-between text-muted-foreground font-mono"
              >
                <span>ID: {{ row['User ID'] || row['userId'] }}</span>
                <span>{{ row['Date/Time'] || row['DateTime'] }}</span>
                <span>State: {{ row['State'] ?? 1 }}</span>
              </div>
            </div>
          </div>

          <div v-if="importValidation.errors.length > 0" class="rounded-md bg-destructive/10 border border-destructive/20 p-2 text-destructive text-[11px] space-y-0.5">
            <div v-for="err in importValidation.errors" :key="err">⚠ {{ err }}</div>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 border-t pt-3">
          <Button variant="outline" size="sm" @click="showImportModal = false">
            Cancel
          </Button>
          <Button
            size="sm"
            :disabled="!importFile || importValidation.validCount === 0 || isImporting"
            @click="confirmImport"
          >
            <span v-if="isImporting">Importing...</span>
            <span v-else>Confirm Import ({{ importValidation.validCount.toLocaleString() }})</span>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
