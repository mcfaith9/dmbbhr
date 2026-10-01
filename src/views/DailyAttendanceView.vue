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
    ArrowDownUp
  } from '@lucide/vue'
  import { attendanceService, getManilaDateString, type DailyAttendanceRecord } from '@/services/attendance'
  import { liveAttendanceService } from '@/services/liveAttendance'
  import { employeeService, VALID_LOCATIONS } from '@/services/employees'
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

  async function loadLookups() {
    workGroups.value = await attendanceService.getWorkGroups()
  }

  async function loadDailyAttendance() {
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
    }
  }

  watch([selectedLocation, selectedWorkGroup], () => {
    loadDailyAttendance()
  })

  async function handleManualSync() {
    await liveAttendanceService.triggerManualSync()
    loadDailyAttendance()
  }

  function setDateQuick(range: 'today' | 'yesterday') {
    if (range === 'today') {
      selectedDate.value = todayDateStr
    } else {
      selectedDate.value = yesterdayDateStr.value
    }

    loadDailyAttendance()
  }

  const filteredRecords = computed(() => {
    let list = dailyRecords.value
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim().toLowerCase()
      list = list.filter(r =>
        r.biometric_user_id.toLowerCase().includes(q) ||
        r.employee_name.toLowerCase().includes(q) ||
        (r.work_group_name && r.work_group_name.toLowerCase().includes(q))
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
    const onTime = filteredRecords.value.filter(r => r.late_minutes === 0 && r.has_valid_out).length
    const awaitingOut = filteredRecords.value.filter(r => r.status === 'Awaiting OUT').length
    const singlePunchNoOut = filteredRecords.value.filter(r => r.status === 'Single Punch (No OUT)').length
    return { total, late, onTime, awaitingOut, singlePunchNoOut }
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
  let unSubEmployees: (() => void) | null = null

  onMounted(async () => {
    await loadLookups()
    await loadDailyAttendance()
    liveAttendanceService.connect()

    unSubLogs = liveAttendanceService.onLogs(() => {
      loadDailyAttendance()
    })
    unSubScan = liveAttendanceService.onScan(() => {
      loadDailyAttendance()
    })
    unSubEmployees = employeeService.onEmployeesChanged(() => {
      loadDailyAttendance()
    })
  })

  onUnmounted(() => {
    if (unSubLogs) unSubLogs()
    if (unSubScan) unSubScan()
    if (unSubEmployees) unSubEmployees()
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
          Dynamic Work Group evaluation (6am-3pm, 7am-4pm, 8am-5pm) with automatic lunch exclusion (12pm-1pm).
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
            class="w-[220px]"
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
            <TableHead class="font-semibold w-[80px]">BIO ID</TableHead>
            <TableHead class="font-semibold">Employee</TableHead>
            <TableHead class="font-semibold">Location</TableHead>
            <TableHead class="font-semibold">Work Group</TableHead>
            <TableHead class="font-semibold">Expected IN / OUT</TableHead>
            <TableHead class="font-semibold">Actual IN</TableHead>
            <TableHead class="font-semibold">Actual OUT</TableHead>
            <TableHead class="font-semibold text-center">Hours</TableHead>
            <TableHead class="font-semibold text-center">Late</TableHead>
            <TableHead class="font-semibold text-center">Early Out</TableHead>
            <TableHead class="font-semibold text-right">Status</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <TableRow v-for="row in filteredRecords" :key="row.id">
            <TableCell class="font-mono font-medium text-foreground">                
              <span class="px-1.5 py-0.5 rounded bg-muted text-[11px] font-medium">
                {{ row.biometric_user_id }}
              </span>
            </TableCell>
            <TableCell class="font-medium text-foreground text-xs">{{ row.employee_name }}</TableCell>
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
            <TableCell class="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {{ row.actual_in }}
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

            <!-- Distinct Clean Status Column -->
            <TableCell class="text-right">
              <Badge
                :variant="
                  row.status === 'Regular Day'
                    ? (row.late_minutes > 0 || row.early_out_minutes > 0 ? 'warning' : 'success')
                    : (row.status === 'Awaiting OUT' ? 'secondary' : 'outline')
                "
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
