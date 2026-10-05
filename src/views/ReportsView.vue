<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Clock,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  MapPin,
  Flame,
  FileQuestion,
  Search,
  Users,
  X,
  Check,
  ChevronsUpDown,
  Fingerprint
} from '@lucide/vue'
import {
  reportsService,
  type ReportFilterOptions,
  type ReportSummaryResult,
  type DateRangePreset
} from '@/services/reportsService'
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

const router = useRouter()

// Filter State
const selectedPreset = ref<DateRangePreset>('today')
const customStartDate = ref('')
const customEndDate = ref('')
const selectedLocation = ref('all')
const selectedWorkGroup = ref('all')
const selectedEmployeeBioId = ref('all')

// Employee Combobox Dropdown State
const isEmployeeComboboxOpen = ref(false)
const employeeSearchQuery = ref('')

// Data State
const loading = ref(false)
const reportData = ref<ReportSummaryResult | null>(null)
const workGroups = ref<WorkGroup[]>([])
const employees = ref<Employee[]>([])

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

// Load aggregated report data
async function loadReport(force = false) {
  loading.value = true
  try {
    const filters: ReportFilterOptions = {
      preset: selectedPreset.value,
      startDate: selectedPreset.value === 'custom' ? customStartDate.value : undefined,
      endDate: selectedPreset.value === 'custom' ? customEndDate.value : undefined,
      location: selectedLocation.value,
      workGroupId: selectedWorkGroup.value,
      employeeBioId: selectedEmployeeBioId.value
    }

    reportData.value = await reportsService.getReportSummary(filters, force)
  } finally {
    loading.value = false
  }
}

// Watch filters to trigger update
watch(
  [selectedPreset, selectedLocation, selectedWorkGroup, selectedEmployeeBioId],
  () => {
    if (selectedPreset.value !== 'custom') {
      loadReport()
    }
  }
)

function applyCustomDateRange() {
  if (customStartDate.value && customEndDate.value) {
    loadReport()
  }
}

onMounted(() => {
  loadLookups()
  loadReport()
})

// Helper navigation functions
function navigateToDaily(filter?: string, bioId?: string, date?: string) {
  const query: Record<string, string> = {}
  if (filter) query.filter = filter
  if (bioId) query.bioId = bioId
  if (date) query.date = date
  router.push({ path: '/attendance/daily', query })
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
            Visual attendance summaries, punctuality analysis, and shift metrics derived directly from authoritative daily records.
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

        <!-- Custom Date Range Inputs (Only shown when 'custom' is selected) -->
        <div v-if="selectedPreset === 'custom'" class="flex items-center gap-1.5">
          <Input
            v-model="customStartDate"
            type="date"
            class="h-8 text-xs font-mono w-[130px]"
          />
          <span class="text-muted-foreground">to</span>
          <Input
            v-model="customEndDate"
            type="date"
            class="h-8 text-xs font-mono w-[130px]"
          />
          <Button
            size="sm"
            class="h-8 text-xs px-2.5 cursor-pointer"
            @click="applyCustomDateRange"
          >
            Apply
          </Button>
        </div>

        <!-- Work Group Filter -->
        <div class="flex items-center gap-1.5">
          <span class="font-semibold text-muted-foreground whitespace-nowrap">Work Group:</span>
          <Select v-model="selectedWorkGroup">
            <SelectTrigger class="w-[150px] h-8 text-xs font-medium bg-card">
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

        <!-- Employee Combobox Filter (Searchable by Name or Bio ID / Employee ID) -->
        <div class="flex items-center gap-1.5">
          <span class="font-semibold text-muted-foreground whitespace-nowrap">Employee:</span>
          
          <Popover v-model:open="isEmployeeComboboxOpen">
            <PopoverTrigger as-child>
              <button
                type="button"
                role="combobox"
                :aria-expanded="isEmployeeComboboxOpen"
                class="flex h-8 items-center justify-between rounded-md border border-input bg-card px-2.5 py-1 text-xs shadow-2xs transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer min-w-[190px] max-w-[260px]"
                :class="selectedEmployeeBioId !== 'all' ? 'border-primary/40 text-foreground font-medium' : 'text-muted-foreground'"
              >
                <div class="flex items-center gap-1.5 truncate mr-1.5">
                  <Fingerprint v-if="selectedEmployeeBioId !== 'all'" class="size-3.5 text-primary shrink-0" />
                  <Users v-else class="size-3.5 text-muted-foreground shrink-0" />

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
              <!-- Search Bar -->
              <div class="relative">
                <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  v-model="employeeSearchQuery"
                  placeholder="Search employee by name or Bio ID..."
                  class="pl-8 h-8 text-xs w-full bg-background"
                  autofocus
                />
              </div>

              <!-- Options List -->
              <div class="max-h-60 overflow-y-auto space-y-0.5 pr-0.5">
                <!-- All Employees Option -->
                <button
                  type="button"
                  class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer text-left"
                  :class="selectedEmployeeBioId === 'all' ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted text-foreground'"
                  @click="selectEmployee('all')"
                >
                  <div class="flex items-center gap-2">
                    <Users class="size-3.5 text-muted-foreground" />
                    <span>All Employees</span>
                  </div>
                  <Check v-if="selectedEmployeeBioId === 'all'" class="size-3.5 text-primary" />
                </button>

                <!-- Separator -->
                <div class="h-px bg-border my-1" />

                <!-- Filtered Employee List -->
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
                  <!-- Full Name - Left -->
                  <div class="min-w-0 flex-1 truncate">
                    <span class="font-medium text-foreground truncate group-hover:text-primary">
                      {{ emp.full_name }}
                    </span>
                  </div>

                  <!-- Bio ID - Right -->
                  <div class="flex items-center gap-1.5 shrink-0 ml-3">
                    <span class="text-[10px] text-muted-foreground font-mono">
                      Bio ID:
                    </span>

                    <span class="font-mono text-[10px] font-semibold text-foreground">
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
            Active Range: <strong>{{ reportData.dateRangeLabel }}</strong> ({{ reportData.daysCount }} days)
          </span>
        </div>
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
              All KPIs, punctuality charts, and rendered hour calculations are scoped exclusively to this employee.
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
      <!-- 1. KPI CARDS (Responsive Grid: 5 cards) -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <!-- KPI 1: Present -->
        <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs space-y-2 hover:border-emerald-500/40 transition-colors">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted-foreground">Present</span>
            <div class="size-7 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 class="size-4" />
            </div>
          </div>
          <div>
            <div class="text-2xl font-bold font-mono text-foreground">
              {{ reportData.kpis.presentCount }}
            </div>
            <div class="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 mt-0.5">
              <span>{{ reportData.kpis.attendanceRate }}% attendance rate</span>
            </div>
          </div>
        </div>

        <!-- KPI 2: Late Arrivals (Human-Readable Duration Display) -->
        <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs space-y-2 hover:border-amber-500/40 transition-colors">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted-foreground">Late Arrivals</span>
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
                <span>{{ formatDuration(reportData.kpis.totalLateMinutes) }} total late time</span>
              </div>
              <div class="text-[10px] text-muted-foreground font-mono">
                {{ reportData.kpis.totalLateMinutes.toLocaleString() }} minute{{ reportData.kpis.totalLateMinutes === 1 ? '' : 's' }}
              </div>
            </div>
          </div>
        </div>

        <!-- KPI 3: Absent -->
        <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs space-y-2 hover:border-red-500/40 transition-colors">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted-foreground">Absent / Unrecorded</span>
            <div class="size-7 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center">
              <AlertCircle class="size-4" />
            </div>
          </div>
          <div>
            <div class="text-2xl font-bold font-mono text-foreground">
              {{ reportData.kpis.absentCount }}
            </div>
            <div class="text-[11px] text-muted-foreground font-medium mt-0.5">
              Working shifts missed
            </div>
          </div>
        </div>

        <!-- KPI 4: Missing OUT -->
        <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs space-y-2 hover:border-indigo-500/40 transition-colors">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted-foreground">Missing OUT</span>
            <div class="size-7 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <FileQuestion class="size-4" />
            </div>
          </div>
          <div>
            <div class="text-2xl font-bold font-mono text-foreground">
              {{ reportData.kpis.missingOutCount }}
            </div>
            <div class="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">
              Awaiting / no shift exit
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

      <!-- 3. ATTENDANCE STATUS BREAKDOWN & RENDERED HOURS (2 Columns) -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <!-- Status Breakdown Card -->
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

        <!-- Rendered Hours Summary Card -->
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

      <!-- 4. REPEATED LATENESS & MISSING OUT MONITORING (2 Columns) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <!-- Top Repeated Lateness Card -->
        <div class="rounded-xl border bg-card p-5 shadow-xs space-y-4">
          <div class="flex items-center justify-between border-b pb-3">
            <div>
              <h3 class="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Clock class="size-3.5 text-amber-500" />
                <span>Repeated Lateness (Top Frequency)</span>
              </h3>
              <p class="text-[11px] text-muted-foreground">
                Employees with the highest number of late arrivals exceeding shift grace periods.
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              class="h-7 text-xs text-primary gap-1 cursor-pointer px-2"
              @click="navigateToDaily('late')"
            >
              <span>Filter Late</span>
              <ChevronRight class="size-3" />
            </Button>
          </div>

          <!-- Lateness Table -->
          <div v-if="reportData.topLateEmployees.length > 0" class="overflow-x-auto">
            <Table class="text-xs">
              <TableHeader>
                <TableRow class="bg-muted/40 hover:bg-muted/40">
                  <TableHead class="font-semibold text-foreground">Employee</TableHead>
                  <TableHead class="font-semibold text-foreground">Work Group</TableHead>
                  <TableHead class="font-semibold text-foreground text-center">Late Days</TableHead>
                  <TableHead class="font-semibold text-foreground text-right">Lost Time</TableHead>
                  <TableHead class="font-semibold text-foreground text-right w-[80px]">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                <TableRow
                  v-for="emp in reportData.topLateEmployees"
                  :key="emp.bioId"
                  class="hover:bg-muted/30 transition-colors"
                >
                  <TableCell class="py-2.5">
                    <div class="font-semibold text-foreground">{{ emp.name }}</div>
                    <div class="text-[10px] text-muted-foreground font-mono">Bio ID: {{ emp.bioId }}</div>
                  </TableCell>

                  <TableCell class="py-2.5 text-muted-foreground text-[11px]">
                    {{ emp.workGroupName }}
                  </TableCell>

                  <TableCell class="py-2.5 text-center">
                    <Badge variant="outline" class="text-[10px] font-mono text-amber-700 bg-amber-500/10 border-amber-500/30 font-bold">
                      {{ emp.lateDays }} day{{ emp.lateDays > 1 ? 's' : '' }}
                    </Badge>
                  </TableCell>

                  <TableCell class="py-2.5 text-right font-mono font-medium text-foreground">
                    <span class="font-bold text-amber-700 dark:text-amber-300">{{ formatDuration(emp.totalLateMinutes) }}</span>
                    <span class="text-[10px] text-muted-foreground block font-mono">({{ emp.totalLateMinutes }}m · avg {{ emp.avgLateMinutes }}m/day)</span>
                  </TableCell>

                  <TableCell class="py-2.5 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      class="h-6 px-2 text-[10px] cursor-pointer"
                      @click="navigateToDaily(undefined, emp.bioId, emp.latestLateDate)"
                    >
                      Inspect
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div v-else class="p-8 text-center text-xs text-muted-foreground border rounded-lg bg-muted/20">
            <CheckCircle2 class="size-6 text-emerald-600 mx-auto mb-1.5 opacity-80" />
            <div class="font-medium text-foreground">Zero Lateness Recorded</div>
            <p class="text-[11px] text-muted-foreground mt-0.5">
              All employees arrived within the standard shift grace period for this selection.
            </p>
          </div>
        </div>

        <!-- Missing OUT Monitoring Card -->
        <div class="rounded-xl border bg-card p-5 shadow-xs space-y-4">
          <div class="flex items-center justify-between border-b pb-3">
            <div>
              <h3 class="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileQuestion class="size-3.5 text-indigo-500" />
                <span>Missing OUT Monitoring</span>
              </h3>
              <p class="text-[11px] text-muted-foreground">
                Incomplete shift records requiring employee manual adjustment or HR resolution.
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

          <!-- Missing OUT Table -->
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
