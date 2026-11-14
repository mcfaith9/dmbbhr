<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Clock,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  MapPin,
  Flame,
  FileQuestion,
  Search,
  UsersRound,
  X,
  Check,
  ChevronsUpDown,
  Fingerprint,
  Download,
  Calendar,
  Percent,
  UserRoundX,
  TrendingUp
} from '@lucide/vue'
import {
  reportsService,
  type ReportFilterOptions,
  type ReportSummaryResult,
  type DateRangePreset
} from '@/services/reportsService'
import { getManilaDateString } from '@/services/attendance'
import { liveAttendanceService } from '@/services/liveAttendance'
import { RangeCalendar } from '@/components/ui/range-calendar'
import { DateFormatter, getLocalTimeZone, parseDate, type DateValue } from '@internationalized/date'
import type { DateRange } from 'reka-ui'
import { employeeService } from '@/services/employees'
import { formatDuration } from '@/lib/timeUtils'
import type { WorkGroup, Employee } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Popover,
  PopoverTrigger,
  PopoverContent
} from '@/components/ui/popover'
import AttendanceTrendChart from '@/components/reports/AttendanceTrendChart.vue'
import AttendanceStatusDonut from '@/components/reports/AttendanceStatusDonut.vue'
import AbsencePeriodicChart from '@/components/reports/AbsencePeriodicChart.vue'
import AbsenceDistributionChart from '@/components/reports/AbsenceDistributionChart.vue'
import * as XLSX from 'xlsx'

const router = useRouter()

// Filter State
const selectedPreset = ref<DateRangePreset>('today')
const customStartDate = ref('')
const customEndDate = ref('')
const isCustomRangeOpen = ref(false)
const customRangeValue = ref<DateRange>({ start: undefined, end: undefined })
const selectedLocation = ref('all')
const selectedWorkGroup = ref('all')
const selectedDepartment = ref('all')
const selectedEmployeeBioId = ref('all')

// Active Section Tab
const activeTab = ref<'overview' | 'absent_analytics' | 'absent_table'>('overview')

// Absent Table Search & Filter State
const absentTableSearch = ref('')
const absentTableDept = ref('all')
const absentTableSortBy = ref<'date' | 'name' | 'id'>('date')
const absentTableSortOrder = ref<'asc' | 'desc'>('desc')
const absentTablePage = ref(1)
const absentTablePageSize = ref(15)

// Employee Combobox Dropdown State
const isEmployeeComboboxOpen = ref(false)
const employeeSearchQuery = ref('')

// Data State
const loading = ref(false)
const reportData = ref<ReportSummaryResult | null>(null)
const workGroups = ref<WorkGroup[]>([])
const employees = ref<Employee[]>([])

// Distinct departments list for filter
const availableDepartments = computed(() => {
  const depts = new Set<string>()
  for (const e of employees.value) {
    if (e.department && e.department.trim()) {
      depts.add(e.department.trim())
    }
  }
  return Array.from(depts).sort()
})

// Load metadata lookups (Work Groups, Employees)
async function loadLookups() {
  try {
    const [wgList, empList] = await Promise.all([
      employeeService.getWorkGroups(),
      employeeService.getEmployees()
    ])
    workGroups.value = wgList
    employees.value = empList
  } catch {
    // ignore
  }
}

// Find currently selected employee object for display
const selectedEmployee = computed(() => {
  if (selectedEmployeeBioId.value === 'all') return null
  return employees.value.find(e => e.biometric_user_id === selectedEmployeeBioId.value) || null
})

// Searchable filtered employee list for combobox
const filteredEmployees = computed(() => {
  const q = employeeSearchQuery.value.toLowerCase().trim()
  if (!q) {
    return employees.value
  }
  return employees.value.filter(emp => {
    const matchName = (emp.full_name || '').toLowerCase().includes(q)
    const matchBioId = (emp.biometric_user_id || '').toLowerCase().includes(q)
    const matchEmpNum = (emp.employee_number || '').toLowerCase().includes(q)
    const matchDept = (emp.department || '').toLowerCase().includes(q)
    return matchName || matchBioId || matchEmpNum || matchDept
  })
})

function selectEmployee(bioId: string) {
  selectedEmployeeBioId.value = bioId
  isEmployeeComboboxOpen.value = false
  employeeSearchQuery.value = ''
}

function clearEmployeeFilter() {
  selectedEmployeeBioId.value = 'all'
  employeeSearchQuery.value = ''
  isEmployeeComboboxOpen.value = false
}

// Load aggregated report data with race-condition protection
let activeRequestId = 0

async function loadReport(force = true) {
  const requestId = ++activeRequestId
  loading.value = true
  try {
    const filters: ReportFilterOptions = {
      preset: selectedPreset.value,
      startDate: selectedPreset.value === 'custom' ? customStartDate.value : undefined,
      endDate: selectedPreset.value === 'custom' ? customEndDate.value : undefined,
      location: selectedLocation.value,
      workGroupId: selectedWorkGroup.value,
      employeeBioId: selectedEmployeeBioId.value,
      department: selectedDepartment.value
    }

    const result = await reportsService.getReportSummary(filters, force)
    if (requestId !== activeRequestId) return
    reportData.value = result
    absentTablePage.value = 1
  } finally {
    if (requestId === activeRequestId) {
      loading.value = false
    }
  }
}

const rangeDateFormatter = new DateFormatter('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: getLocalTimeZone()
})

function toIsoDateString(val?: DateValue): string {
  if (!val) return ''
  return `${val.year}-${String(val.month).padStart(2, '0')}-${String(val.day).padStart(2, '0')}`
}

function syncCustomRangeRef(startStr: string, endStr: string) {
  try {
    customRangeValue.value = {
      start: startStr ? (parseDate(startStr) as DateValue) : undefined,
      end: endStr ? (parseDate(endStr) as DateValue) : undefined
    }
  } catch {
    customRangeValue.value = { start: undefined, end: undefined }
  }
}

const formattedCustomRangeLabel = computed(() => {
  if (!customStartDate.value) return 'Select date range'
  try {
    const startDv = parseDate(customStartDate.value)
    const startText = rangeDateFormatter.format(startDv.toDate(getLocalTimeZone()))
    if (!customEndDate.value || customEndDate.value === customStartDate.value) {
      return startText
    }
    const endDv = parseDate(customEndDate.value)
    const endText = rangeDateFormatter.format(endDv.toDate(getLocalTimeZone()))
    return `${startText} – ${endText}`
  } catch {
    return customEndDate.value ? `${customStartDate.value} to ${customEndDate.value}` : customStartDate.value
  }
})

function handleRangeUpdate(newRange: DateRange) {
  customRangeValue.value = newRange
  const startStr = toIsoDateString(newRange?.start as DateValue | undefined)
  const endStr = toIsoDateString(newRange?.end as DateValue | undefined)
  if (startStr && endStr) {
    const [s, e] = startStr <= endStr ? [startStr, endStr] : [endStr, startStr]
    customStartDate.value = s
    customEndDate.value = e
    isCustomRangeOpen.value = false
  }
}

function applyPresetQuickCustom(daysBack: number) {
  const todayStr = getManilaDateString(new Date())
  const [y, m, d] = todayStr.split('-').map(Number)
  const startObj = new Date(Date.UTC(y, m - 1, d))
  startObj.setUTCDate(startObj.getUTCDate() - daysBack)
  const startStr = getManilaDateString(startObj)
  customStartDate.value = startStr
  customEndDate.value = todayStr
  syncCustomRangeRef(startStr, todayStr)
  isCustomRangeOpen.value = false
}

// Watch filters to trigger fresh update immediately whenever period or scope changes
watch(
  [selectedPreset, selectedLocation, selectedWorkGroup, selectedDepartment, selectedEmployeeBioId],
  () => {
    if (selectedPreset.value !== 'custom') {
      loadReport(true)
    } else {
      if (!customStartDate.value || !customEndDate.value) {
        const today = getManilaDateString(new Date())
        const [y, m] = today.split('-')
        if (!customStartDate.value) customStartDate.value = `${y}-${m}-01`
        if (!customEndDate.value) customEndDate.value = today
      }
      syncCustomRangeRef(customStartDate.value, customEndDate.value)
      loadReport(true)
    }
  }
)

watch([customStartDate, customEndDate], ([newStart, newEnd]) => {
  if (selectedPreset.value === 'custom' && newStart && newEnd) {
    loadReport(true)
  }
})

let liveRefreshTimer: ReturnType<typeof setTimeout> | null = null
let unSubLogs: (() => void) | null = null
let unSubEmployees: (() => void) | null = null

function scheduleLiveRefresh(reloadEmployees = false) {
  if (liveRefreshTimer) {
    clearTimeout(liveRefreshTimer)
  }
  liveRefreshTimer = setTimeout(async () => {
    liveRefreshTimer = null
    reportsService.clearCache()
    if (reloadEmployees) {
      await loadLookups()
    }
    await loadReport(true)
  }, 150)
}

onMounted(() => {
  loadLookups()
  loadReport(true)
  unSubLogs = liveAttendanceService.onLogs(() => {
    scheduleLiveRefresh(false)
  })
  unSubEmployees = employeeService.onEmployeesChanged(() => {
    scheduleLiveRefresh(true)
  })
})

onUnmounted(() => {
  if (liveRefreshTimer) {
    clearTimeout(liveRefreshTimer)
    liveRefreshTimer = null
  }
  if (unSubLogs) unSubLogs()
  if (unSubEmployees) unSubEmployees()
})

// Helper navigation functions
function navigateToDaily(filter?: string, bioId?: string, date?: string) {
  const query: Record<string, string> = {}
  if (filter) query.filter = filter
  if (bioId) query.bioId = bioId
  if (date) query.date = date
  router.push({ path: '/attendance/daily', query })
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return dateStr
  const dObj = new Date(Date.UTC(y, m - 1, d))
  return dObj.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
}

// -------------------------------------------------------------
// Absent Table Filtering & Pagination
// -------------------------------------------------------------
const filteredAbsentRecords = computed(() => {
  if (!reportData.value) return []
  let list = [...reportData.value.absentRecords]

  // Search filter
  const q = absentTableSearch.value.trim().toLowerCase()
  if (q) {
    list = list.filter(r =>
      r.employeeName.toLowerCase().includes(q) ||
      r.bioId.toLowerCase().includes(q) ||
      r.department.toLowerCase().includes(q) ||
      r.position.toLowerCase().includes(q)
    )
  }

  // Department filter
  if (absentTableDept.value !== 'all') {
    list = list.filter(r => r.department === absentTableDept.value)
  }

  // Sorting
  list.sort((a, b) => {
    let cmp = 0
    if (absentTableSortBy.value === 'date') {
      cmp = a.date.localeCompare(b.date)
    } else if (absentTableSortBy.value === 'name') {
      cmp = a.employeeName.localeCompare(b.employeeName)
    } else if (absentTableSortBy.value === 'id') {
      cmp = a.bioId.localeCompare(b.bioId)
    }
    return absentTableSortOrder.value === 'asc' ? cmp : -cmp
  })

  return list
})

const totalAbsentPages = computed(() => {
  return Math.max(1, Math.ceil(filteredAbsentRecords.value.length / absentTablePageSize.value))
})

const paginatedAbsentRecords = computed(() => {
  const start = (absentTablePage.value - 1) * absentTablePageSize.value
  return filteredAbsentRecords.value.slice(start, start + absentTablePageSize.value)
})

// Export to Excel / CSV
function exportAbsentRecords(format: 'xlsx' | 'csv') {
  if (!filteredAbsentRecords.value.length) {
    alert('No absent records to export.')
    return
  }

  const rows = filteredAbsentRecords.value.map(r => ({
    'Employee ID': r.bioId,
    'Employee Name': r.employeeName,
    'Department': r.department,
    'Position': r.position,
    'Work Group': r.workGroupName,
    'Date': r.date,
    'Day of Week': r.dayOfWeek,
    'Scheduled Duty': r.scheduledDuty,
    'Attendance Status': r.status,
    'Remarks': r.remarks
  }))

  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Absent_Employees')

  const dateTag = reportData.value?.startDate || 'Export'
  const filename = `DMBBHR_Absent_Employees_${dateTag}.${format}`

  if (format === 'csv') {
    XLSX.writeFile(workbook, filename, { bookType: 'csv' })
  } else {
    XLSX.writeFile(workbook, filename, { bookType: 'xlsx' })
  }
}
</script>

<template>
  <div class="space-y-6 max-w-7xl mx-auto">
    <!-- Header with Controls & Filters -->
    <div class="flex flex-col gap-4 border-b pb-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>Attendance Reports & HR Analytics</span>
            </h1>
            <Badge variant="outline" class="text-xs bg-muted/30 flex items-center gap-1 font-mono">
              <MapPin class="size-3 text-primary" />
              <span>DBB Cebu</span>
            </Badge>
          </div>
          <p class="text-xs text-muted-foreground mt-0.5">
            Authoritative attendance summaries, absence monitoring, and workforce attendance trends with date-based resignation exclusion.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          class="h-8 text-xs gap-1.5 cursor-pointer shadow-xs self-start sm:self-auto"
          :disabled="loading"
          @click="loadReport(true)"
        >
          <RefreshCw class="size-3" :class="loading ? 'animate-spin' : ''" />
          <span>Refresh Analysis</span>
        </Button>
      </div>

      <!-- Filters Row -->
      <div class="flex flex-wrap items-center gap-2.5 bg-card border rounded-xl p-3 shadow-2xs text-xs">
        <!-- Date Range Preset -->
        <div class="flex items-center gap-1.5">
          <span class="font-semibold text-muted-foreground whitespace-nowrap">Period:</span>
          <Select v-model="selectedPreset">
            <SelectTrigger class="w-[130px] h-8 text-xs font-medium bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="last_week">Last Week</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <!-- Custom Date Range Picker (Shadcn-Vue RangeCalendar, shown when 'custom' is selected) -->
        <div v-if="selectedPreset === 'custom'" class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-semibold text-muted-foreground whitespace-nowrap">Range:</span>
          <Popover v-model:open="isCustomRangeOpen">
            <PopoverTrigger as-child>
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="h-8 text-xs font-medium bg-card justify-start gap-2 min-w-[215px] cursor-pointer shadow-2xs"
              >
                <Calendar class="size-3.5 text-primary shrink-0" />
                <span class="truncate">{{ formattedCustomRangeLabel }}</span>
              </Button>
            </PopoverTrigger>

            <PopoverContent class="w-auto p-0 z-[60]" align="start">
              <div class="p-2 border-b bg-muted/20 flex items-center justify-between gap-2 text-[11px]">
                <span class="font-medium text-muted-foreground">Select start and end dates</span>
                <div class="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" class="h-6 px-2 text-[11px] cursor-pointer" @click="applyPresetQuickCustom(6)">
                    Last 7d
                  </Button>
                  <Button type="button" variant="ghost" size="sm" class="h-6 px-2 text-[11px] cursor-pointer" @click="applyPresetQuickCustom(13)">
                    Last 14d
                  </Button>
                  <Button type="button" variant="ghost" size="sm" class="h-6 px-2 text-[11px] cursor-pointer" @click="applyPresetQuickCustom(29)">
                    Last 30d
                  </Button>
                </div>
              </div>
              <RangeCalendar
                :model-value="(customRangeValue as any)"
                :number-of-months="2"
                initial-focus
                @update:model-value="handleRangeUpdate"
              />
            </PopoverContent>
          </Popover>
        </div>

        <!-- Department Filter -->
        <div class="flex items-center gap-1.5">
          <span class="font-semibold text-muted-foreground whitespace-nowrap">Dept:</span>
          <Select v-model="selectedDepartment">
            <SelectTrigger class="w-[135px] h-8 text-xs font-medium bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All Departments</SelectItem>
                <SelectItem
                  v-for="dept in availableDepartments"
                  :key="dept"
                  :value="dept"
                >
                  {{ dept }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <!-- Work Group Filter -->
        <div class="flex items-center gap-1.5">
          <span class="font-semibold text-muted-foreground whitespace-nowrap">Work Group:</span>
          <Select v-model="selectedWorkGroup">
            <SelectTrigger class="w-[140px] h-8 text-xs font-medium bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All Work Groups</SelectItem>
                <SelectItem
                  v-for="wg in workGroups"
                  :key="wg.id"
                  :value="wg.id"
                >
                  {{ wg.name }} ({{ wg.code }})
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <!-- Employee Combobox Filter -->
        <div class="flex items-center gap-1.5">
          <span class="font-semibold text-muted-foreground whitespace-nowrap">Employee:</span>
          
          <Popover v-model:open="isEmployeeComboboxOpen">
            <PopoverTrigger as-child>
              <button
                type="button"
                role="combobox"
                :aria-expanded="isEmployeeComboboxOpen"
                class="flex h-8 items-center justify-between rounded-md border border-input bg-card px-2.5 py-1 text-xs shadow-2xs transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer min-w-[175px] max-w-[240px]"
                :class="selectedEmployeeBioId !== 'all' ? 'border-primary/40 text-foreground font-medium' : 'text-muted-foreground'"
              >
                <div class="flex items-center gap-1.5 truncate mr-1.5">
                  <Fingerprint v-if="selectedEmployeeBioId !== 'all'" class="size-3.5 text-primary shrink-0" />
                  <UsersRound v-else class="size-3.5 text-muted-foreground shrink-0" />

                  <span v-if="selectedEmployeeBioId === 'all'" class="truncate text-foreground font-medium">
                    All Employees
                  </span>
                  <span v-else class="truncate text-foreground font-semibold">
                    {{ selectedEmployee?.full_name || `Employee ${selectedEmployeeBioId}` }}
                    <span class="text-[10px] font-mono text-muted-foreground font-normal">({{ selectedEmployeeBioId }})</span>
                  </span>
                </div>

                <div class="flex items-center gap-1 shrink-0">
                  <span
                    v-if="selectedEmployeeBioId !== 'all'"
                    class="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                    title="Clear filter back to All Employees"
                    @click.stop="clearEmployeeFilter"
                  >
                    <X class="size-3" />
                  </span>
                  <ChevronsUpDown class="size-3 text-muted-foreground opacity-60" />
                </div>
              </button>
            </PopoverTrigger>

            <PopoverContent class="w-72 p-2 shadow-lg rounded-xl text-xs space-y-2" align="start">
              <div class="relative">
                <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  v-model="employeeSearchQuery"
                  placeholder="Search employee by name or Bio ID..."
                  class="pl-8 h-8 text-xs w-full bg-background"
                  autofocus
                />
              </div>

              <div class="max-h-60 overflow-y-auto space-y-0.5 pr-0.5">
                <button
                  type="button"
                  class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer text-left"
                  :class="selectedEmployeeBioId === 'all' ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted text-foreground'"
                  @click="selectEmployee('all')"
                >
                  <div class="flex items-center gap-2">
                    <UsersRound class="size-3.5 text-muted-foreground" />
                    <span>All Employees</span>
                  </div>
                  <Check v-if="selectedEmployeeBioId === 'all'" class="size-3.5 text-primary" />
                </button>

                <div class="h-px bg-border my-1" />

                <div v-if="filteredEmployees.length === 0" class="p-3 text-center text-xs text-muted-foreground">
                  No employee found matching "{{ employeeSearchQuery }}"
                </div>

                <button
                  v-for="emp in filteredEmployees"
                  :key="emp.biometric_user_id"
                  type="button"
                  class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer text-left group"
                  :class="
                    selectedEmployeeBioId === emp.biometric_user_id
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'hover:bg-muted text-foreground'
                  "
                  @click="selectEmployee(emp.biometric_user_id)"
                >
                  <div class="min-w-0 flex-1 truncate">
                    <span class="font-medium text-foreground truncate group-hover:text-primary">
                      {{ emp.full_name }}
                    </span>
                  </div>

                  <div class="flex items-center gap-1.5 shrink-0 ml-3">
                    <span class="text-[10px] text-muted-foreground font-mono">
                      Bio ID:
                    </span>
                    <span class="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium font-mono">
                      {{ emp.biometric_user_id }}
                    </span>
                    <Check
                      v-if="selectedEmployeeBioId === emp.biometric_user_id"
                      class="size-3.5 text-primary ml-1"
                    />
                  </div>
                </button>
              </div>

              <div
                v-if="selectedEmployeeBioId !== 'all'"
                class="border-t pt-1.5 flex justify-end"
              >
                <button
                  type="button"
                  class="text-[11px] text-primary hover:underline font-medium cursor-pointer flex items-center gap-1"
                  @click="clearEmployeeFilter"
                >
                  <X class="size-3" />
                  <span>Reset to All Employees</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <!-- Current Filter Label Badge -->
        <div v-if="reportData" class="ml-auto flex items-center gap-2">
          <span class="text-[11px] font-mono text-muted-foreground hidden lg:inline">
            Active Range: <strong>{{ reportData.dateRangeLabel }}</strong> ({{ reportData.daysCount }} {{ reportData.daysCount === 1 ? 'day' : 'days' }} · {{ reportData.kpis.uniqueEligibleEmployees }} eligible)
          </span>
        </div>
      </div>

      <!-- Navigation Tabs (Overview vs Absenteeism Analytics vs Absent Employee Table) -->
      <div class="flex items-center gap-1.5 border-b border-border text-xs">
        <button
          type="button"
          class="px-3.5 py-2 font-medium text-xs border-b-2 transition-colors cursor-pointer flex items-center gap-2"
          :class="activeTab === 'overview' ? 'border-primary text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'overview'"
        >
          <span>Attendance Overview</span>
        </button>

        <button
          type="button"
          class="px-3.5 py-2 font-medium text-xs border-b-2 transition-colors cursor-pointer flex items-center gap-2"
          :class="activeTab === 'absent_analytics' ? 'border-primary text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'absent_analytics'"
        >
          <span>Absent Analytics</span>
          <Badge v-if="reportData" variant="destructive" class="text-[10px] px-1.5 py-0 text-white">
            {{ reportData.kpis.absentCount }}
          </Badge>
        </button>

        <button
          type="button"
          class="px-3.5 py-2 font-medium text-xs border-b-2 transition-colors cursor-pointer flex items-center gap-2"
          :class="activeTab === 'absent_table' ? 'border-primary text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'absent_table'"
        >
          <span>Absent Employee Table</span>
          <Badge v-if="reportData" variant="outline" class="text-[10px] px-1.5 py-0 font-mono">
            {{ reportData.absentRecords.length }}
          </Badge>
        </button>
      </div>

      <!-- Active Employee Context Banner -->
      <div
        v-if="selectedEmployeeBioId !== 'all' && selectedEmployee"
        class="rounded-xl border border-primary/30 bg-primary/10 p-3 flex items-center justify-between gap-3 shadow-xs animate-in fade-in slide-in-from-top-1 duration-200 text-xs"
      >
        <div class="flex items-center gap-2.5">
          <div class="size-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">
            <Fingerprint class="size-4" />
          </div>
          <div>
            <div class="font-semibold text-foreground flex items-center gap-2 flex-wrap">
              <span class="text-muted-foreground">Filtered for Employee:</span>
              <span class="font-bold text-sm text-foreground">{{ selectedEmployee.full_name }}</span>
              <span class="font-mono text-xs bg-card border border-primary/30 text-primary font-semibold px-2 py-0.5 rounded-md">
                Bio ID / Employee ID: {{ selectedEmployee.biometric_user_id }}
              </span>
            </div>
            <p class="text-[11px] text-muted-foreground mt-0.5">
              All KPIs, absence analytics, and shift metrics are scoped exclusively to this employee.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          class="h-7 text-xs gap-1.5 bg-card hover:bg-muted font-medium border-primary/30 shadow-2xs shrink-0 cursor-pointer"
          @click="clearEmployeeFilter"
        >
          <X class="size-3 text-muted-foreground" />
          <span>Clear Filter</span>
        </Button>
      </div>
    </div>

    <!-- MAIN DASHBOARD CONTENT -->
    <div v-if="reportData" class="space-y-6">
      <!-- ============================================================== -->
      <!-- TAB 1: ATTENDANCE OVERVIEW -->
      <!-- ============================================================== -->
      <div v-if="activeTab === 'overview'" class="space-y-6">
        <!-- 1. KPI CARDS (Responsive Grid: 5 cards) -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          <!-- KPI 1: Present -->
          <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs space-y-2 hover:border-emerald-500/40 transition-colors">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-muted-foreground">
                {{ reportData.daysCount > 1 ? 'Present (Daily Total)' : 'Present' }}
              </span>
              <div class="size-7 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 class="size-4" />
              </div>
            </div>
            <div>
              <div class="text-2xl font-bold font-mono text-foreground">
                {{ reportData.kpis.presentCount }}
              </div>
              <div class="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 mt-0.5">
                <span v-if="reportData.daysCount > 1">
                  {{ reportData.kpis.uniquePresentEmployees }} unique · {{ reportData.kpis.attendanceRate }}% rate
                </span>
                <span v-else>
                  {{ reportData.kpis.attendanceRate }}% rate (of {{ reportData.kpis.uniqueEligibleEmployees }} eligible)
                </span>
              </div>
            </div>
          </div>

          <!-- KPI 2: Late Arrivals -->
          <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs space-y-2 hover:border-amber-500/40 transition-colors">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-muted-foreground">
                {{ reportData.daysCount > 1 ? 'Late (Daily Total)' : 'Late Arrivals' }}
              </span>
              <div class="size-7 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <Clock class="size-4" />
              </div>
            </div>
            <div>
              <div class="text-2xl font-bold font-mono text-foreground">
                {{ reportData.kpis.lateCount }}
              </div>
              <div class="mt-0.5 space-y-0.5">
                <div class="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                  <span v-if="reportData.daysCount > 1">
                    {{ reportData.kpis.uniqueLateEmployees }} unique · {{ formatDuration(reportData.kpis.totalLateMinutes) }}
                  </span>
                  <span v-else>
                    {{ formatDuration(reportData.kpis.totalLateMinutes) }} total late time
                  </span>
                </div>
                <div class="text-[10px] text-muted-foreground font-mono">
                  {{ reportData.kpis.totalLateMinutes.toLocaleString() }} minute{{ reportData.kpis.totalLateMinutes === 1 ? '' : 's' }}
                </div>
              </div>
            </div>
          </div>

          <!-- KPI 3: Absent -->
          <div
            class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs space-y-2 hover:border-red-500/40 transition-colors cursor-pointer"
            @click="activeTab = 'absent_analytics'"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-muted-foreground">
                {{ reportData.daysCount > 1 ? 'Absent (Daily Total)' : 'Absent' }}
              </span>
              <div class="size-7 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center">
                <AlertCircle class="size-4" />
              </div>
            </div>
            <div>
              <div class="text-2xl font-bold font-mono text-red-500">
                {{ reportData.kpis.absentCount }}
              </div>
              <div class="text-[11px] text-muted-foreground font-medium mt-0.5">
                <span v-if="reportData.daysCount > 1">
                  {{ reportData.kpis.uniqueAbsentEmployees }} unique · {{ reportData.kpis.absenceRate }}% rate
                </span>
                <span v-else>
                  {{ reportData.kpis.absenceRate }}% absence rate ({{ reportData.kpis.uniqueEligibleEmployees }} eligible)
                </span>
              </div>
            </div>
          </div>

          <!-- KPI 4: Missing OUT / Active Shifts -->
          <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs space-y-2 hover:border-indigo-500/40 transition-colors">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-muted-foreground">
                {{ selectedPreset === 'today' ? 'Awaiting OUT / In Progress' : (reportData.daysCount > 1 ? 'Missing OUT (Daily Total)' : 'Missing OUT') }}
              </span>
              <div class="size-7 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                <FileQuestion class="size-4" />
              </div>
            </div>
            <div>
              <div class="text-2xl font-bold font-mono text-foreground">
                {{ reportData.kpis.missingOutCount }}
              </div>
              <div class="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">
                <span v-if="reportData.daysCount > 1">
                  {{ reportData.kpis.uniqueMissingOutEmployees }} unique employees
                </span>
                <span v-else>
                  {{ selectedPreset === 'today' ? 'Active shifts awaiting exit' : 'Awaiting / no shift exit' }}
                </span>
              </div>
            </div>
          </div>

          <!-- KPI 5: Total Rendered Hours -->
          <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs space-y-2 col-span-2 md:col-span-1 hover:border-blue-500/40 transition-colors">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-muted-foreground">Rendered Hours</span>
              <div class="size-7 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <TrendingUp class="size-4" />
              </div>
            </div>
            <div>
              <div class="text-2xl font-bold font-mono text-foreground">
                {{ reportData.kpis.totalRenderedHours }}h
              </div>
              <div class="text-[11px] text-muted-foreground font-medium mt-0.5">
                avg {{ reportData.kpis.avgDailyHours }}h / employee-day
              </div>
            </div>
          </div>
        </div>

        <!-- 2. ATTENDANCE TREND CHART -->
        <div class="rounded-xl border bg-card p-5 shadow-xs">
          <AttendanceTrendChart
            :data="reportData.dailyTrend"
            :title="`Daily Attendance Trends (${reportData.dateRangeLabel})`"
          />
        </div>

        <!-- 3. ATTENDANCE STATUS BREAKDOWN & RENDERED HOURS -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div class="rounded-xl border bg-card p-5 shadow-xs space-y-4">
            <div class="flex items-center justify-between border-b pb-3">
              <div>
                <h3 class="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Attendance Status Distribution
                </h3>
                <p class="text-[11px] text-muted-foreground">
                  Proportion of on-time, late, missing OUT, and absent shifts.
                </p>
              </div>
              <Badge variant="outline" class="text-[11px] font-mono">
                {{ reportData.kpis.attendanceRate }}% On Record
              </Badge>
            </div>

            <AttendanceStatusDonut
              :breakdown="reportData.statusBreakdown"
              :attendance-rate="reportData.kpis.attendanceRate"
              :total-count="reportData.kpis.presentCount + reportData.kpis.absentCount"
            />
          </div>

          <div class="rounded-xl border bg-card p-5 shadow-xs space-y-4 flex flex-col justify-between">
            <div class="space-y-1 border-b pb-3">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Rendered Working Hours
                </h3>
                <Badge variant="outline" class="text-[11px] font-mono text-blue-600 border-blue-500/30">
                  Authoritative Scans
                </Badge>
              </div>
              <p class="text-[11px] text-muted-foreground">
                Total regular working hours calculated from physical punch times and lunch exclusions.
              </p>
            </div>

            <div class="space-y-4 py-2">
              <div class="grid grid-cols-2 gap-3 text-xs">
                <div class="p-3 rounded-lg bg-muted/40 border">
                  <span class="text-muted-foreground text-[11px]">Total Rendered:</span>
                  <div class="text-xl font-bold font-mono text-foreground mt-0.5">
                    {{ reportData.renderedHours.total.toLocaleString() }} hrs
                  </div>
                </div>

                <div class="p-3 rounded-lg bg-muted/40 border">
                  <span class="text-muted-foreground text-[11px]">Daily Average:</span>
                  <div class="text-xl font-bold font-mono text-foreground mt-0.5">
                    {{ reportData.renderedHours.average }} hrs
                  </div>
                </div>
              </div>

              <div class="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Flame class="size-4 text-blue-600 shrink-0" />
                  <div>
                    <span class="font-semibold text-foreground text-[11px]">Peak Working Hours Day</span>
                    <div class="text-[10px] text-muted-foreground font-mono">
                      {{ reportData.renderedHours.peakDate }}
                    </div>
                  </div>
                </div>
                <div class="text-right">
                  <span class="text-sm font-bold font-mono text-blue-600">
                    {{ reportData.renderedHours.peakHours }} hrs
                  </span>
                </div>
              </div>
            </div>

            <div class="pt-2 border-t flex items-center justify-between text-xs">
              <span class="text-muted-foreground text-[11px]">Audit hours in Daily Attendance</span>
              <Button
                variant="outline"
                size="sm"
                class="h-7 text-xs gap-1 cursor-pointer"
                @click="navigateToDaily()"
              >
                <span>View Attendance Sheet</span>
                <ChevronRight class="size-3" />
              </Button>
            </div>
          </div>
        </div>

        <!-- 4. REPEATED LATENESS & MISSING OUT MONITORING -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <!-- Top Repeated Lateness Card -->
          <div class="rounded-xl border bg-card p-5 shadow-xs space-y-4">
            <div class="border-b pb-3">
              <h3 class="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Clock class="size-3.5 text-amber-500" />
                <span>Lateness (Top Frequency)</span>
              </h3>
              <p class="text-[11px] text-muted-foreground mt-0.5">
                Employees with the highest number of late arrivals after scheduled shift start.
              </p>
            </div>

            <div v-if="reportData.topLateEmployees.length > 0" class="overflow-x-auto">
              <Table class="text-xs">
                <TableHeader>
                  <TableRow class="bg-muted/40 hover:bg-muted/40">
                    <TableHead class="font-semibold text-foreground min-w-[130px]">Employee</TableHead>
                    <TableHead class="font-semibold text-foreground min-w-[70px]">Bio ID</TableHead>
                    <TableHead class="font-semibold text-foreground min-w-[100px]">Work Group</TableHead>
                    <TableHead class="font-semibold text-foreground min-w-[80px]">Date</TableHead>
                    <TableHead class="font-semibold text-foreground text-right min-w-[80px]">Late</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  <template v-for="emp in reportData.topLateEmployees" :key="emp.bioId">
                    <TableRow
                      v-for="rec in emp.lateRecords"
                      :key="`${emp.bioId}-${rec.date}`"
                      class="hover:bg-muted/30 transition-colors border-b border-border/40"
                    >
                      <TableCell class="py-2 font-medium text-foreground">
                        {{ emp.name }}
                      </TableCell>
                      <TableCell class="py-2 font-mono text-muted-foreground text-[11px]">
                        {{ emp.bioId }}
                      </TableCell>
                      <TableCell class="py-2 text-muted-foreground text-[11px]">
                        {{ emp.workGroupName }}
                      </TableCell>
                      <TableCell class="py-2 font-mono text-[11px] text-foreground whitespace-nowrap">
                        {{ formatShortDate(rec.date) }}
                      </TableCell>
                      <TableCell class="py-2 text-right font-mono font-medium text-amber-600 dark:text-amber-400">
                        {{ formatDuration(rec.lateMinutes) }}
                      </TableCell>
                    </TableRow>

                    <TableRow class="bg-muted/40 hover:bg-muted/40 border-b-2 border-border font-semibold">
                      <TableCell class="py-2 font-bold text-foreground">
                        Total
                      </TableCell>
                      <TableCell class="py-2"></TableCell>
                      <TableCell class="py-2"></TableCell>
                      <TableCell class="py-2 font-mono font-bold text-foreground whitespace-nowrap text-[11px]">
                        {{ emp.lateDays }} late day{{ emp.lateDays > 1 ? 's' : '' }}
                      </TableCell>
                      <TableCell class="py-2 text-right font-mono font-bold text-amber-700 dark:text-amber-300">
                        {{ formatDuration(emp.totalLateMinutes) }}
                      </TableCell>
                    </TableRow>
                  </template>
                </TableBody>
              </Table>
            </div>

            <div v-else class="p-8 text-center text-xs text-muted-foreground border rounded-lg bg-muted/20">
              <CheckCircle2 class="size-6 text-emerald-600 mx-auto mb-1.5 opacity-80" />
              <div class="font-medium text-foreground">Zero Lateness Recorded</div>
              <p class="text-[11px] text-muted-foreground mt-0.5">
                All employees arrived on time for this selection.
              </p>
            </div>
          </div>

          <!-- Missing OUT Monitoring Card -->
          <div class="rounded-xl border bg-card p-5 shadow-xs space-y-4">
            <div class="flex items-center justify-between border-b pb-3">
              <div>
                <h3 class="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <FileQuestion class="size-3.5 text-indigo-500" />
                  <span>{{ selectedPreset === 'today' ? 'Active Shifts & Missing OUT' : 'Missing OUT Monitoring' }}</span>
                </h3>
                <p class="text-[11px] text-muted-foreground">
                  {{ selectedPreset === 'today' ? 'Active shifts awaiting exit punch, or records requiring manual adjustment.' : 'Incomplete shift records requiring employee manual adjustment or HR resolution.' }}
                </p>
              </div>

              <Button
                variant="ghost"
                size="sm"
                class="h-7 text-xs text-primary gap-1 cursor-pointer px-2"
                @click="navigateToDaily('missing_out')"
              >
                <span>View All</span>
                <ChevronRight class="size-3" />
              </Button>
            </div>

            <div v-if="reportData.missingOutItems.length > 0" class="overflow-x-auto">
              <Table class="text-xs">
                <TableHeader>
                  <TableRow class="bg-muted/40 hover:bg-muted/40">
                    <TableHead class="font-semibold text-foreground">Employee</TableHead>
                    <TableHead class="font-semibold text-foreground">Date</TableHead>
                    <TableHead class="font-semibold text-foreground">Time IN</TableHead>
                    <TableHead class="font-semibold text-foreground">Status</TableHead>
                    <TableHead class="font-semibold text-foreground text-right w-[80px]">Action</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  <TableRow
                    v-for="item in reportData.missingOutItems"
                    :key="item.bioId + item.date"
                    class="hover:bg-muted/30 transition-colors"
                  >
                    <TableCell class="py-2.5">
                      <div class="font-semibold text-foreground">{{ item.name }}</div>
                      <div class="text-[10px] text-muted-foreground font-mono">Bio ID: {{ item.bioId }}</div>
                    </TableCell>

                    <TableCell class="py-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                      {{ item.date }}
                    </TableCell>

                    <TableCell class="py-2.5 font-mono font-medium text-foreground whitespace-nowrap">
                      {{ item.timeIn }}
                    </TableCell>

                    <TableCell class="py-2.5">
                      <Badge variant="outline" class="text-[10px] font-mono text-indigo-700 bg-indigo-500/10 border-indigo-500/30">
                        {{ item.status }}
                      </Badge>
                    </TableCell>

                    <TableCell class="py-2.5 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        class="h-6 px-2 text-[10px] cursor-pointer"
                        @click="navigateToDaily(undefined, item.bioId, item.date)"
                      >
                        Resolve
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div v-else class="p-8 text-center text-xs text-muted-foreground border rounded-lg bg-muted/20">
              <CheckCircle2 class="size-6 text-emerald-600 mx-auto mb-1.5 opacity-80" />
              <div class="font-medium text-foreground">No Missing OUT Punches</div>
              <p class="text-[11px] text-muted-foreground mt-0.5">
                All shifts recorded during this period contain valid check-in and check-out punches.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- ============================================================== -->
      <!-- TAB 2: DEDICATED ABSENT ANALYTICS -->
      <!-- ============================================================== -->
      <div v-else-if="activeTab === 'absent_analytics'" class="space-y-6">
        <!-- A. Absent Summary Cards (4 Cards) -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <!-- Card 1: Total Absent Employees -->
          <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs space-y-2 hover:border-red-500/40 transition-colors">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-muted-foreground">Total Absent Employees</span>
              <div class="size-7 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center">
                <UserRoundX class="size-4" />
              </div>
            </div>
            <div>
              <div class="text-2xl font-bold font-mono text-red-500">
                {{ reportData.kpis.uniqueAbsentEmployees }}
              </div>
              <div class="text-[11px] text-muted-foreground mt-0.5">
                Unique individuals with missed shifts
              </div>
            </div>
          </div>

          <!-- Card 2: Total Absence Occurrences -->
          <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs space-y-2 hover:border-red-500/40 transition-colors">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-muted-foreground">Total Absence Occurrences</span>
              <div class="size-7 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center">
                <Calendar class="size-4" />
              </div>
            </div>
            <div>
              <div class="text-2xl font-bold font-mono text-foreground">
                {{ reportData.kpis.absentCount }}
              </div>
              <div class="text-[11px] text-muted-foreground mt-0.5">
                Shift instances without attendance
              </div>
            </div>
          </div>

          <!-- Card 3: Absence Rate (%) -->
          <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs space-y-2 hover:border-red-500/40 transition-colors">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-muted-foreground">Absence Rate</span>
              <div class="size-7 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center">
                <Percent class="size-4" />
              </div>
            </div>
            <div>
              <div class="text-2xl font-bold font-mono text-red-600">
                {{ reportData.kpis.absenceRate }}%
              </div>
              <div class="text-[11px] text-muted-foreground mt-0.5">
                Out of {{ reportData.kpis.totalEligibleWorkdays.toLocaleString() }} scheduled workdays
              </div>
            </div>
          </div>

          <!-- Card 4: Employees with Repeated Absences -->
          <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs space-y-2 hover:border-red-500/40 transition-colors">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-muted-foreground">Repeated Absences</span>
              <div class="size-7 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center">
                <AlertCircle class="size-4" />
              </div>
            </div>
            <div>
              <div class="text-2xl font-bold font-mono text-amber-600">
                {{ reportData.kpis.repeatedAbsenceEmployeesCount }}
              </div>
              <div class="text-[11px] text-muted-foreground mt-0.5">
                Employees with 2+ missed shifts
              </div>
            </div>
          </div>
        </div>

        <!-- B. Daily Absence Trend (High-Resolution Trend) -->
        <div class="rounded-xl border bg-card p-5 shadow-xs space-y-3">
          <div class="flex items-center justify-between border-b pb-2.5">
            <div>
              <h3 class="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp class="size-3.5 text-red-500" />
                <span>Daily Absence Trend ({{ reportData.dateRangeLabel }})</span>
              </h3>
              <p class="text-[11px] text-muted-foreground mt-0.5">
                Daily unexcused absence occurrences across scheduled working shifts. Sundays, official holidays, and post-resignation dates are fully excluded.
              </p>
            </div>
            <Badge variant="outline" class="text-xs font-mono">
              {{ reportData.kpis.absentCount }} Missed Workdays
            </Badge>
          </div>

          <AttendanceTrendChart
            :data="reportData.dailyTrend"
            title="Daily Workforce Absence Frequency"
          />
        </div>

        <!-- C. Weekly / Monthly Trends + Department Distribution (2 Columns) -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <!-- Weekly & Monthly Trend Component -->
          <div class="rounded-xl border bg-card p-5 shadow-xs">
            <AbsencePeriodicChart
              :weekly-data="reportData.weeklyTrend"
              :monthly-data="reportData.monthlyTrend"
            />
          </div>

          <!-- Departmental Absence Distribution Component -->
          <div class="rounded-xl border bg-card p-5 shadow-xs">
            <AbsenceDistributionChart
              :distribution="reportData.departmentDistribution"
            />
          </div>
        </div>

        <!-- D. Top Employees with Absences -->
        <div class="rounded-xl border bg-card p-5 shadow-xs space-y-4">
          <div class="flex items-center justify-between border-b pb-3">
            <div>
              <h3 class="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <UserRoundX class="size-3.5 text-red-500" />
                <span>Top Employees with Absences</span>
              </h3>
              <p class="text-[11px] text-muted-foreground mt-0.5">
                Employees with the highest number of unexcused absences within the selected period.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              class="h-7 text-xs gap-1 cursor-pointer"
              @click="activeTab = 'absent_table'"
            >
              <span>View Full Log</span>
              <ChevronRight class="size-3" />
            </Button>
          </div>

          <div v-if="reportData.topAbsentEmployees.length > 0" class="overflow-x-auto">
            <Table class="text-xs">
              <TableHeader>
                <TableRow class="bg-muted/40 hover:bg-muted/40">
                  <TableHead class="font-semibold text-foreground min-w-[130px]">Employee Name</TableHead>
                  <TableHead class="font-semibold text-foreground min-w-[70px]">Bio ID</TableHead>
                  <TableHead class="font-semibold text-foreground min-w-[100px]">Department</TableHead>
                  <TableHead class="font-semibold text-foreground min-w-[100px]">Position</TableHead>
                  <TableHead class="font-semibold text-foreground min-w-[90px]">Work Group</TableHead>
                  <TableHead class="font-semibold text-foreground text-right min-w-[80px]">Absence Count</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                <TableRow
                  v-for="emp in reportData.topAbsentEmployees.slice(0, 10)"
                  :key="emp.bioId"
                  class="hover:bg-muted/30 transition-colors"
                >
                  <TableCell class="py-2.5 font-medium text-foreground">
                    {{ emp.name }}
                  </TableCell>
                  <TableCell class="py-2.5 font-mono text-[11px] text-muted-foreground">
                    {{ emp.bioId }}
                  </TableCell>
                  <TableCell class="py-2.5 text-muted-foreground text-[11px]">
                    {{ emp.department }}
                  </TableCell>
                  <TableCell class="py-2.5 text-muted-foreground text-[11px]">
                    {{ emp.position }}
                  </TableCell>
                  <TableCell class="py-2.5 text-muted-foreground text-[11px]">
                    {{ emp.workGroupName }}
                  </TableCell>
                  <TableCell class="py-2.5 text-right font-mono font-bold text-red-500">
                    {{ emp.absentCount }} day{{ emp.absentCount > 1 ? 's' : '' }}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div v-else class="p-8 text-center text-xs text-muted-foreground border rounded-lg bg-muted/20">
            <CheckCircle2 class="size-6 text-emerald-600 mx-auto mb-1.5 opacity-80" />
            <div class="font-medium text-foreground">Zero Absences Recorded</div>
            <p class="text-[11px] text-muted-foreground mt-0.5">
              Every eligible employee reported for their scheduled duties.
            </p>
          </div>
        </div>
      </div>

      <!-- ============================================================== -->
      <!-- TAB 3: DETAILED ABSENT EMPLOYEE TABLE -->
      <!-- ============================================================== -->
      <div v-else-if="activeTab === 'absent_table'" class="space-y-4">
        <!-- Table Controls: Search, Dept Filter, Sort, Export -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border rounded-xl p-3 shadow-2xs text-xs">
          <div class="flex flex-wrap items-center gap-2.5">
            <!-- Search -->
            <div class="relative min-w-[200px]">
              <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                v-model="absentTableSearch"
                placeholder="Search name, Bio ID, position..."
                class="pl-8 h-8 text-xs bg-background w-full"
              />
            </div>

            <!-- Department Filter -->
            <div class="flex items-center gap-1.5">
              <span class="text-muted-foreground font-medium">Dept:</span>
              <Select v-model="absentTableDept">
                <SelectTrigger class="w-[140px] h-8 text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All Departments</SelectItem>
                    <SelectItem
                      v-for="dept in availableDepartments"
                      :key="dept"
                      :value="dept"
                    >
                      {{ dept }}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <!-- Sort By -->
            <div class="flex items-center gap-1.5">
              <span class="text-muted-foreground font-medium">Sort:</span>
              <Select v-model="absentTableSortBy">
                <SelectTrigger class="w-[100px] h-8 text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="id">Bio ID</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                class="h-8 px-2 text-xs"
                @click="absentTableSortOrder = absentTableSortOrder === 'asc' ? 'desc' : 'asc'"
              >
                {{ absentTableSortOrder === 'asc' ? '↑ Asc' : '↓ Desc' }}
              </Button>
            </div>
          </div>

          <!-- Export Buttons -->
          <div class="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              class="h-8 text-xs gap-1.5 shadow-2xs cursor-pointer"
              :disabled="!filteredAbsentRecords.length"
              @click="exportAbsentRecords('xlsx')"
            >
              <Download class="size-3 text-emerald-600" />
              <span>Export Excel</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="h-8 text-xs gap-1.5 shadow-2xs cursor-pointer"
              :disabled="!filteredAbsentRecords.length"
              @click="exportAbsentRecords('csv')"
            >
              <Download class="size-3 text-muted-foreground" />
              <span>Export CSV</span>
            </Button>
          </div>
        </div>

        <!-- Table Container -->
        <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
          <div class="overflow-x-auto">
            <Table class="text-xs">
              <TableHeader>
                <TableRow class="bg-muted/40 hover:bg-muted/40">
                  <TableHead class="font-semibold text-foreground min-w-[70px]">Employee ID</TableHead>
                  <TableHead class="font-semibold text-foreground min-w-[140px]">Employee Name</TableHead>
                  <TableHead class="font-semibold text-foreground min-w-[100px]">Department</TableHead>
                  <TableHead class="font-semibold text-foreground min-w-[100px]">Position</TableHead>
                  <TableHead class="font-semibold text-foreground min-w-[90px]">Date</TableHead>
                  <TableHead class="font-semibold text-foreground min-w-[90px]">Attendance Status</TableHead>
                  <TableHead class="font-semibold text-foreground min-w-[140px]">Remarks</TableHead>
                  <TableHead class="font-semibold text-foreground text-right w-[70px]">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                <TableRow
                  v-for="rec in paginatedAbsentRecords"
                  :key="rec.id"
                  class="hover:bg-muted/30 transition-colors"
                >
                  <TableCell class="py-2.5 font-mono text-[11px] font-semibold text-foreground">
                    {{ rec.bioId }}
                  </TableCell>
                  <TableCell class="py-2.5 font-medium text-foreground">
                    {{ rec.employeeName }}
                  </TableCell>
                  <TableCell class="py-2.5 text-muted-foreground text-[11px]">
                    {{ rec.department }}
                  </TableCell>
                  <TableCell class="py-2.5 text-muted-foreground text-[11px]">
                    {{ rec.position }}
                  </TableCell>
                  <TableCell class="py-2.5 font-mono text-[11px] text-foreground whitespace-nowrap">
                    {{ rec.date }}
                    <span class="text-[10px] text-muted-foreground block font-sans">({{ rec.dayOfWeek }})</span>
                  </TableCell>
                  <TableCell class="py-2.5">
                    <Badge variant="destructive" class="text-[10px] font-mono text-white">
                      {{ rec.status }}
                    </Badge>
                  </TableCell>
                  <TableCell class="py-2.5 text-muted-foreground text-[11px]">
                    {{ rec.remarks }}
                  </TableCell>
                  <TableCell class="py-2.5 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      class="h-6 px-2 text-[10px] cursor-pointer"
                      @click="navigateToDaily(undefined, rec.bioId, rec.date)"
                    >
                      Audit
                    </Button>
                  </TableCell>
                </TableRow>

                <TableRow v-if="paginatedAbsentRecords.length === 0">
                  <TableCell colspan="9" class="p-8 text-center text-xs text-muted-foreground">
                    <CheckCircle2 class="size-6 text-emerald-600 mx-auto mb-1.5 opacity-80" />
                    <div class="font-medium text-foreground">No Absent Records Match Query</div>
                    <p class="text-[11px] text-muted-foreground mt-0.5">
                      Either no employees were absent or the filter query eliminated all records.
                    </p>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <!-- Pagination Bar -->
          <div class="px-4 py-3 border-t bg-muted/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <span class="text-muted-foreground">
              Showing {{ filteredAbsentRecords.length > 0 ? (absentTablePage - 1) * absentTablePageSize + 1 : 0 }} to
              {{ Math.min(absentTablePage * absentTablePageSize, filteredAbsentRecords.length) }} of
              {{ filteredAbsentRecords.length }} absent records
            </span>

            <div class="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                class="h-7 text-xs px-2.5 cursor-pointer"
                :disabled="absentTablePage <= 1"
                @click="absentTablePage--"
              >
                Previous
              </Button>
              <span class="px-2 font-mono text-[11px] text-muted-foreground">
                Page {{ absentTablePage }} of {{ totalAbsentPages }}
              </span>
              <Button
                variant="outline"
                size="sm"
                class="h-7 text-xs px-2.5 cursor-pointer"
                :disabled="absentTablePage >= totalAbsentPages"
                @click="absentTablePage++"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- 5. HR ATTENDANCE INSIGHTS -->
      <div class="rounded-xl border bg-card p-5 shadow-xs space-y-3">
        <div class="flex items-center gap-2 border-b pb-2.5">
          <Sparkles class="size-4 text-primary" />
          <h3 class="text-xs font-semibold text-foreground uppercase tracking-wider">
            HR Attendance Insights
          </h3>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <div
            v-for="(insight, idx) in reportData.insights"
            :key="idx"
            class="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/30 border border-muted/50"
          >
            <div class="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
            <span class="text-foreground leading-relaxed text-[11px]">{{ insight }}</span>
          </div>
        </div>
      </div>

      <!-- 6. QUICK LINKS TO ATTENDANCE MODULES -->
      <div class="rounded-xl border bg-muted/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div class="flex items-center gap-2 text-muted-foreground">
          <ShieldCheck class="size-4 text-primary shrink-0" />
          <span>Need raw scans or transaction audit trails? Navigate to dedicated operational tables:</span>
        </div>

        <div class="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <router-link
            to="/attendance/daily"
            class="px-2.5 py-1 rounded-md border bg-card text-foreground font-medium text-[11px] hover:bg-muted transition-colors flex items-center gap-1 shadow-2xs"
          >
            <span>Daily Attendance</span>
            <ArrowRight class="size-3 text-muted-foreground" />
          </router-link>

          <router-link
            to="/attendance/logs"
            class="px-2.5 py-1 rounded-md border bg-card text-foreground font-medium text-[11px] hover:bg-muted transition-colors flex items-center gap-1 shadow-2xs"
          >
            <span>Raw Attendance Logs</span>
            <ArrowRight class="size-3 text-muted-foreground" />
          </router-link>

          <router-link
            to="/attendance/manual"
            class="px-2.5 py-1 rounded-md border bg-card text-foreground font-medium text-[11px] hover:bg-muted transition-colors flex items-center gap-1 shadow-2xs"
          >
            <span>Manual Adjustments</span>
            <ArrowRight class="size-3 text-muted-foreground" />
          </router-link>
        </div>
      </div>
    </div>

    <!-- Loading Skeleton State -->
    <div v-else class="p-12 text-center text-xs text-muted-foreground space-y-2">
      <RefreshCw class="size-6 animate-spin mx-auto text-primary" />
      <p>Aggregating HR attendance metrics...</p>
    </div>
  </div>
</template>
