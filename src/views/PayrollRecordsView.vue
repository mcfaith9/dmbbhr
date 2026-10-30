<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  RefreshCw,
  Calendar,
  Clock,
  DollarSign,
  CheckCircle,
  Search,
  X,
  AlertCircle,
  Users,
  Calculator
} from '@lucide/vue'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination } from '@/components/ui/pagination'
import PayrollCalculationDialog from '@/components/PayrollCalculationDialog.vue'
import { payrollCalculationService, type EmployeePayrollRecord, type PayrollCutoffPeriod } from '@/services/payrollCalculation'
import { employeeRepository } from '@/repositories/employeeRepository'
import type { Employee } from '@/types'

const availableCutoffs = ref<PayrollCutoffPeriod[]>([])
const selectedPeriodId = ref('')
const records = ref<EmployeePayrollRecord[]>([])
const isLoading = ref(true)
const loadError = ref<string | null>(null)

// Payroll calculation modal state
const showPayrollCalculationModal = ref(false)
const selectedEmployeeForCalc = ref<Employee | null>(null)

const calcAnchorDate = computed(() => {
  if (selectedPeriod.value?.startDate) {
    return new Date(selectedPeriod.value.startDate)
  }
  return new Date()
})

// Search and filter state
const searchQuery = ref('')

// Pagination state
const currentPage = ref(1)
const pageSize = ref(25)

// Memory caches to avoid duplicate IndexedDB reads
let cachedEmployees: Employee[] | null = null
const payrollCache = new Map<string, EmployeePayrollRecord[]>()

// Request tracker to prevent race conditions from stale async responses
let activeRequestId = 0

const selectedPeriod = computed(() => {
  return availableCutoffs.value.find(p => p.id === selectedPeriodId.value)
})

function normalizeRecord(r: any): EmployeePayrollRecord {
  // Map/normalize different possible shapes into the expected display shape.
  const normalized: any = {
    id: String(r?.id ?? (r?.periodId && r?.bioId ? `${r.periodId}_${r.bioId}` : '')),
    bioId: String(r?.bioId ?? r?.employeeNumber ?? r?.employee_number ?? ''),
    employeeNumber: String(r?.employeeNumber ?? r?.bioId ?? r?.employee_number ?? ''),
    employeeName: String(r?.employeeName ?? r?.full_name ?? r?.name ?? ''),
    department: String(r?.department ?? r?.dept ?? r?.departmentName ?? ''),
    salaryType: String(r?.salaryType ?? r?.payType ?? r?.salary_type ?? 'unconfigured'),
    dailyRate: Number(r?.dailyRate ?? r?.daily_rate ?? 0),
    basicSalary: Number(r?.basicSalary ?? r?.basic_salary ?? 0),
    hourlyRate: Number(r?.hourlyRate ?? r?.hourly_rate ?? 0),
    earningsBreakdown: r?.earningsBreakdown ?? {
      basePay: Number(r?.basePay ?? r?.initialEarnings ?? 0),
      holidayPay: Number(r?.holidayPay ?? 0),
      overtimePay: Number(r?.overtimePay ?? 0),
      sundayDutyPay: Number(r?.sundayDutyPay ?? 0),
      allowances: Number((r?.earningsBreakdown && r.earningsBreakdown.allowances) || 0)
    },
    payableDays: Number(r?.payableDays ?? r?.payDays ?? 0),
    scheduledDays: Number(r?.scheduledDays ?? r?.scheduled_days ?? 0),
    overtimePay: Number(r?.overtimePay ?? r?.earningsBreakdown?.overtimePay ?? 0),
    overtimeHours: Number(r?.overtimeHours ?? r?.overtime_hours ?? 0),
    initialEarnings: Number(r?.initialEarnings ?? r?.gross ?? r?.basePay ?? 0),
    totalBenefitsAndLoans: Number(r?.totalBenefitsAndLoans ?? r?.benefits ?? 0),
    totalOtherDeductions: Number(r?.totalOtherDeductions ?? r?.otherDeductions ?? 0),
    cashAdvance: Number(r?.cashAdvance ?? 0),
    undertimeMinutes: Number(r?.undertimeMinutes ?? r?.undertime_minutes ?? 0),
    undertimeDeduction: Number(r?.undertimeDeduction ?? r?.undertime_deduction ?? 0),
    netPay: Number(r?.netPay ?? r?.net_pay ?? 0),
    reviewStatus: r?.reviewStatus ?? r?.review_status ?? 'ready',
    // keep raw for debugging
    __raw: r
  }

  return normalized as EmployeePayrollRecord
}

async function openPayrollCalculationForRecord(r: EmployeePayrollRecord) {
  const cleanBio = String(r.bioId).replace(/^emp[-_]/i, '').toLowerCase()
  let emp = cachedEmployees?.find(e =>
    String(e.biometric_user_id).replace(/^emp[-_]/i, '').toLowerCase() === cleanBio ||
    String(e.employee_number || '').replace(/^emp[-_]/i, '').toLowerCase() === cleanBio
  )
  if (!emp) {
    const fetched = await employeeRepository.getByBioId(r.bioId)
    emp = fetched || undefined
  }
  if (emp) {
    selectedEmployeeForCalc.value = emp
    showPayrollCalculationModal.value = true
  }
}

async function onWageUpdated(data?: { bioId: string; dailyRate: number; basicSalary: number; hourlyRate: number }) {
  payrollCache.clear()
  cachedEmployees = null
  if (data && selectedEmployeeForCalc.value) {
    const cleanTarget = String(data.bioId).replace(/^emp[-_]/i, '').toLowerCase()
    const curEmpBio = String(selectedEmployeeForCalc.value.biometric_user_id || '').replace(/^emp[-_]/i, '').toLowerCase()
    if (cleanTarget === curEmpBio) {
      selectedEmployeeForCalc.value.daily_rate = data.dailyRate
      ;(selectedEmployeeForCalc.value as any).dailyRate = data.dailyRate
      selectedEmployeeForCalc.value.basic_salary = data.basicSalary
      ;(selectedEmployeeForCalc.value as any).basicSalary = data.basicSalary
      selectedEmployeeForCalc.value.hourly_rate = data.hourlyRate
      ;(selectedEmployeeForCalc.value as any).hourlyRate = data.hourlyRate
      selectedEmployeeForCalc.value.salary_type = 'Daily'
      selectedEmployeeForCalc.value.payroll_status = 'configured'
    }
  }
  if (selectedPeriodId.value) {
    await loadRecordsForPeriod(selectedPeriodId.value, true)
  }
}

async function loadRecordsForPeriod(periodId: string, forceRefresh = false) {
  if (!periodId) return
  const currentPeriod = selectedPeriod.value?.id === periodId
    ? selectedPeriod.value
    : availableCutoffs.value.find(p => p.id === periodId)
  if (!currentPeriod) return

  // Check cache first if not force refreshing
  if (!forceRefresh && payrollCache.has(periodId)) {
    records.value = payrollCache.get(periodId)!
    loadError.value = null
    isLoading.value = false
    currentPage.value = 1
    return
  }

  const requestId = ++activeRequestId
  isLoading.value = true
  loadError.value = null

  try {
    // Reuse cached employees or fetch if not available or on forced refresh
    if (!cachedEmployees || forceRefresh) {
      cachedEmployees = await employeeRepository.getAll()
    }

    // Check if this request is still the active one
    if (requestId !== activeRequestId) return

    const computedRecords = await payrollCalculationService.computePayroll(
      currentPeriod,
      cachedEmployees
    )

    // Check again before committing state to avoid race condition overwrite
    if (requestId !== activeRequestId) return

    const normalized = computedRecords.map(normalizeRecord)
    records.value = normalized
    payrollCache.set(periodId, normalized)
    currentPage.value = 1
  } catch (err: any) {
    if (requestId !== activeRequestId) return
    // eslint-disable-next-line no-console
    console.error('Failed to compute payroll records:', err)
    loadError.value = err?.message || 'Failed to load employee payroll records. Please retry.'
  } finally {
    if (requestId === activeRequestId) {
      isLoading.value = false
    }
  }
}

async function loadPeriodsAndRecords(forceRefresh = false) {
  try {
    const cutoffs = payrollCalculationService.getAvailableCutoffs(new Date(), 6)
    availableCutoffs.value = cutoffs
    if (!selectedPeriodId.value && cutoffs.length > 0) {
      selectedPeriodId.value = cutoffs[0].id
    }

    if (forceRefresh) {
      payrollCache.clear()
      cachedEmployees = null
    }

    if (selectedPeriodId.value) {
      await loadRecordsForPeriod(selectedPeriodId.value, forceRefresh)
    }
  } catch (err: any) {
    loadError.value = err?.message || 'Failed to initialize payroll cutoff periods.'
    isLoading.value = false
  }
}

function onPeriodChange() {
  currentPage.value = 1
  loadRecordsForPeriod(selectedPeriodId.value, false)
}

function refreshRecords() {
  loadPeriodsAndRecords(true)
}

function clearSearch() {
  searchQuery.value = ''
  currentPage.value = 1
}

function onSearchInput() {
  currentPage.value = 1
}

function onPageChange(page: number) {
  currentPage.value = page
}

function onPageSizeChange(size: number) {
  pageSize.value = size
  currentPage.value = 1
}

onMounted(() => {
  loadPeriodsAndRecords()
  employeeRepository.onChange(async () => {
    payrollCache.clear()
    cachedEmployees = null
    if (selectedPeriodId.value) {
      await loadRecordsForPeriod(selectedPeriodId.value, true)
    }
  })
})

// Lightweight computed search filter over all batch records
const filteredRecords = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) {
    return records.value
  }

  return records.value.filter(r => {
    const nameMatch = r.employeeName.toLowerCase().includes(query)
    const bioIdMatch = r.bioId.toLowerCase().includes(query)
    const empNumMatch = r.employeeNumber ? r.employeeNumber.toLowerCase().includes(query) : false
    const deptMatch = r.department ? r.department.toLowerCase().includes(query) : false
    return nameMatch || bioIdMatch || empNumMatch || deptMatch
  })
})

const totalPages = computed(() => {
  return Math.ceil(filteredRecords.value.length / pageSize.value) || 1
})

const paginatedRecords = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredRecords.value.slice(start, start + pageSize.value)
})

// Overall batch totals computed over all eligible records in the selected period (preserves accuracy)
const totalPayrollNet = computed(() => {
  return records.value.reduce((sum, r) => sum + (Number(r.netPay) || 0), 0)
})

const totalAuthorizedOtPay = computed(() => {
  return records.value.reduce((sum, r) => sum + (Number(r.overtimePay) || 0), 0)
})

const totalAuthorizedOtHours = computed(() => {
  return records.value.reduce((sum, r) => sum + (Number(r.overtimeHours) || 0), 0)
})

const totalHolidayPay = computed(() => {
  return records.value.reduce((sum, r) => sum + (Number(r.earningsBreakdown?.holidayPay) || 0), 0)
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header with Cutoff Period Selector & Actions -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          Payroll Records & Audit
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Audited payroll summaries computed from verified daily attendance, authorized overtime forms, and holiday pay.
        </p>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <div class="w-full sm:w-[220px] max-w-full min-w-0">
          <Select
            v-model="selectedPeriodId"
            :disabled="isLoading"
            @update:model-value="onPeriodChange"
          >
            <SelectTrigger
              class="h-8 w-full min-w-0 bg-background text-xs font-medium"
            >
              <SelectValue placeholder="Select Cutoff" />
            </SelectTrigger>

            <SelectContent class="max-h-64 overflow-y-auto">
              <SelectGroup>
                <SelectItem
                  v-for="p in availableCutoffs"
                  :key="p.id"
                  :value="p.id"
                >
                  {{ p.label }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          size="sm"
          class="h-8 gap-1.5 text-xs"
          :disabled="isLoading"
          @click="refreshRecords"
        >
          <RefreshCw class="size-3.5" :class="{ 'animate-spin': isLoading }" />
        </Button>
      </div>
    </div>

    <!-- Error Alert Banner -->
    <div
      v-if="loadError"
      class="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive flex items-center justify-between gap-3"
    >
      <div class="flex items-center gap-2">
        <AlertCircle class="size-4 shrink-0 text-destructive" />
        <span>{{ loadError }}</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        class="h-7 text-xs border-destructive/40 hover:bg-destructive/15 text-destructive"
        @click="refreshRecords"
      >
        Retry
      </Button>
    </div>

    <!-- Summary KPI cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Active Batch Net Pay</span>
          <DollarSign class="size-3.5 text-emerald-600" />
        </div>
        <div v-if="isLoading" class="mt-1">
          <Skeleton class="h-6 w-28" />
        </div>
        <div v-else class="text-xl font-bold mt-1 text-emerald-600 font-mono">
          ₱{{ totalPayrollNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
        </div>
      </div>

      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Authorized Overtime</span>
          <Clock class="size-3.5 text-indigo-600" />
        </div>
        <div v-if="isLoading" class="mt-1 space-y-1">
          <Skeleton class="h-6 w-24" />
          <Skeleton class="h-3 w-16" />
        </div>
        <div v-else>
          <div class="text-xl font-bold mt-1 text-indigo-600 font-mono">
            ₱{{ totalAuthorizedOtPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
          </div>
          <div class="text-[10px] text-muted-foreground font-mono mt-0.5">
            {{ totalAuthorizedOtHours }} authorized hrs
          </div>
        </div>
      </div>

      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Holiday Earnings</span>
          <Calendar class="size-3.5 text-amber-600" />
        </div>
        <div v-if="isLoading" class="mt-1">
          <Skeleton class="h-6 w-24" />
        </div>
        <div v-else class="text-xl font-bold mt-1 text-amber-600 font-mono">
          ₱{{ totalHolidayPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
        </div>
      </div>

      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Employees in Batch</span>
          <CheckCircle class="size-3.5 text-blue-600" />
        </div>
        <div v-if="isLoading" class="mt-1">
          <Skeleton class="h-6 w-16" />
        </div>
        <div v-else class="text-xl font-bold mt-1 text-foreground font-mono">
          {{ records.length }}
        </div>
      </div>
    </div>

    <!-- Search Bar & Controls Toolbar -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
      <div class="relative flex-1 max-w-md">
        <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          v-model="searchQuery"
          type="text"
          placeholder="Search by employee name, Bio ID, or Employee ID..."
          class="pl-8 pr-8 h-8 text-xs bg-card"
          :disabled="isLoading && records.length === 0"
          @input="onSearchInput"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="absolute right-2 top-2 size-4 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
          title="Clear search"
          @click="clearSearch"
        >
          <X class="size-3.5" />
        </button>
      </div>

      <!-- Result Counter & Period Info -->
      <div class="flex items-center gap-2 self-start sm:self-center text-xs text-muted-foreground">
        <template v-if="isLoading">
          <Skeleton class="h-5 w-28 rounded-md" />
        </template>
        <template v-else-if="records.length > 0">
          <span v-if="searchQuery.trim()" class="inline-flex items-center gap-1.5 font-medium">
            <span class="text-foreground font-semibold">{{ filteredRecords.length }}</span>
            <span>of</span>
            <span>{{ records.length }} employees</span>
            <span class="text-[10px] text-muted-foreground font-normal">(filtered)</span>
          </span>
          <span v-else class="text-muted-foreground">
            Total <strong class="text-foreground">{{ records.length }}</strong> employees in batch
          </span>
        </template>
      </div>
    </div>

    <!-- Payroll Table Card -->
    <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
      <div class="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow class="bg-muted/40">
              <TableHead class="font-semibold text-xs whitespace-nowrap">Bio ID</TableHead>
              <TableHead class="font-semibold text-xs whitespace-nowrap min-w-[180px]">Employee Name</TableHead>
              <TableHead class="font-semibold text-xs whitespace-nowrap">Base Pay</TableHead>
              <TableHead class="font-semibold text-xs whitespace-nowrap">Payable Days</TableHead>
              <TableHead class="font-semibold text-xs whitespace-nowrap">Holiday Pay</TableHead>
              <TableHead class="font-semibold text-xs whitespace-nowrap">Authorized OT</TableHead>
              <TableHead class="font-semibold text-xs whitespace-nowrap">Gross Pay</TableHead>
              <TableHead class="font-semibold text-xs whitespace-nowrap">Deductions</TableHead>
              <TableHead class="font-semibold text-xs whitespace-nowrap text-right">Net Pay</TableHead>
              <TableHead class="font-semibold text-xs whitespace-nowrap text-center">Status</TableHead>
              <TableHead class="font-semibold text-xs whitespace-nowrap text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <!-- 1. Skeleton Loading State -->
            <template v-if="isLoading">
              <TableRow v-for="i in 8" :key="`skeleton-row-${i}`" class="text-xs">
                <TableCell><Skeleton class="h-4 w-12" /></TableCell>
                <TableCell>
                  <div class="space-y-1">
                    <Skeleton class="h-4 w-36" />
                    <Skeleton class="h-3 w-24" />
                  </div>
                </TableCell>
                <TableCell><Skeleton class="h-4 w-16" /></TableCell>
                <TableCell><Skeleton class="h-4 w-14" /></TableCell>
                <TableCell><Skeleton class="h-4 w-14" /></TableCell>
                <TableCell><Skeleton class="h-4 w-16" /></TableCell>
                <TableCell><Skeleton class="h-4 w-16" /></TableCell>
                <TableCell><Skeleton class="h-4 w-14" /></TableCell>
                <TableCell class="text-right"><Skeleton class="h-4 w-16 ml-auto" /></TableCell>
                <TableCell class="text-center"><Skeleton class="h-5 w-16 mx-auto rounded-full" /></TableCell>
                <TableCell class="text-right"><Skeleton class="h-6 w-16 ml-auto" /></TableCell>
              </TableRow>
            </template>

            <!-- 2. Search Yielded No Results -->
            <TableRow v-else-if="records.length > 0 && filteredRecords.length === 0">
              <TableCell :colspan="11" class="h-32 text-center text-xs">
                <div class="flex flex-col items-center justify-center py-4 space-y-2">
                  <Search class="size-6 text-muted-foreground/60" />
                  <div class="font-medium text-foreground">
                    No employees matching "{{ searchQuery }}"
                  </div>
                  <div class="text-muted-foreground text-[11px] max-w-sm">
                    No payroll records in this batch match your search query. Check for typos or search by Bio ID.
                  </div>
                  <Button variant="outline" size="sm" class="h-7 text-xs mt-1" @click="clearSearch">
                    Clear Search
                  </Button>
                </div>
              </TableCell>
            </TableRow>

            <!-- 3. Period Has No Records -->
            <TableRow v-else-if="records.length === 0">
              <TableCell :colspan="11" class="h-28 text-center text-xs">
                <div class="flex flex-col items-center justify-center py-4 space-y-1.5 text-muted-foreground">
                  <Users class="size-6 text-muted-foreground/60" />
                  <div class="font-medium text-foreground">No active employees in this period.</div>
                  <div class="text-[11px]">
                    No attendance records or payroll calculations found for the selected cutoff.
                  </div>
                </div>
              </TableCell>
            </TableRow>

            <!-- 4. Rendered Employee Payroll Records -->
            <TableRow
              v-else
              v-for="r in paginatedRecords"
              :key="r.id"
              class="text-xs hover:bg-muted/40 transition-colors"
            >
              <TableCell class="font-mono text-muted-foreground font-medium whitespace-nowrap">
                {{ r.bioId }}
              </TableCell>
              <TableCell class="font-medium text-foreground">
                <div class="font-medium">{{ r.employeeName }}</div>
                <div class="text-[10px] text-muted-foreground">
                  {{ r.department || 'Operations' }} • {{ r.salaryType }}
                </div>
              </TableCell>
              <TableCell class="font-mono whitespace-nowrap">
                ₱{{ ((r.earningsBreakdown?.basePay ?? (r.initialEarnings || 0)) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
              </TableCell>
              <TableCell class="text-xs whitespace-nowrap">
                <span class="font-semibold">{{ r.payableDays }}</span>
                <span class="text-muted-foreground text-[10px]"> / {{ r.scheduledDays }} days</span>
              </TableCell>
              <TableCell class="font-mono whitespace-nowrap">
                <span :class="(Number(r.earningsBreakdown?.holidayPay) || 0) > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-muted-foreground'">
                  ₱{{ (Number(r.earningsBreakdown?.holidayPay) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
                </span>
              </TableCell>
              <TableCell class="font-mono whitespace-nowrap">
                <div v-if="Number(r.overtimeHours) > 0">
                  <span class="font-semibold text-indigo-600 dark:text-indigo-400">
                    ₱{{ (Number(r.overtimePay) || 0).toFixed(2) }}
                  </span>
                  <span class="text-[10px] text-muted-foreground block">
                    {{ r.overtimeHours }} hr(s) qualifying
                  </span>
                </div>
                <div v-else class="text-muted-foreground text-[11px]">
                  ₱0.00
                </div>
              </TableCell>
              <TableCell class="font-mono whitespace-nowrap">
                ₱{{ (Number(r.initialEarnings) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
              </TableCell>
              <TableCell class="font-mono text-rose-600 dark:text-rose-400 whitespace-nowrap">
                -₱{{ (Number(r.totalBenefitsAndLoans || 0) + Number(r.totalOtherDeductions || 0) + Number(r.cashAdvance || 0) + Number(r.undertimeDeduction || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
              </TableCell>
              <TableCell class="font-mono font-bold text-right text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                ₱{{ (Number(r.netPay) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
              </TableCell>
              <TableCell class="text-center whitespace-nowrap">
                <Badge
                  :variant="r.reviewStatus === 'approved' || r.reviewStatus === 'finalized' ? 'success' : r.reviewStatus === 'needs_review' ? 'warning' : 'outline'"
                  class="text-[10px] capitalize"
                >
                  {{ r.reviewStatus ? r.reviewStatus.replace('_', ' ') : 'ready' }}
                </Badge>
              </TableCell>
              <TableCell class="text-right whitespace-nowrap">
                <Button
                  size="sm"
                  variant="outline"
                  class="h-7 px-2 text-xs gap-1 font-medium hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                  :title="`Open payroll calculation for ${r.employeeName}`"
                  @click="openPayrollCalculationForRecord(r)"
                >
                  <Calculator class="size-3 text-primary" />
                  <span>Calculate</span>
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- Pagination Footer -->
      <div v-if="!isLoading && filteredRecords.length > 0" class="border-t bg-muted/20 p-2 sm:p-3">
        <Pagination
          :current-page="currentPage"
          :total-pages="totalPages"
          :total-items="filteredRecords.length"
          :page-size="pageSize"
          @update:page="onPageChange"
          @update:page-size="onPageSizeChange"
        />
      </div>
    </div>

    <!-- Payroll Calculation Dialog -->
    <PayrollCalculationDialog
      v-model:open="showPayrollCalculationModal"
      :selected-employee="selectedEmployeeForCalc"
      :period-anchor-date="calcAnchorDate"
      @wage-updated="onWageUpdated"
    />
  </div>
</template>
