<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RefreshCw, Calendar, Clock, DollarSign, CheckCircle } from '@lucide/vue'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { payrollCalculationService, type EmployeePayrollRecord, type PayrollCutoffPeriod } from '@/services/payrollCalculation'
import { employeeRepository } from '@/repositories/employeeRepository'

const availableCutoffs = ref<PayrollCutoffPeriod[]>([])
const selectedPeriodId = ref('')
const records = ref<EmployeePayrollRecord[]>([])
const isLoading = ref(true)

const selectedPeriod = computed(() => {
  return availableCutoffs.value.find(p => p.id === selectedPeriodId.value)
})

function normalizeRecord(r: any): EmployeePayrollRecord {
  // Map/normalize different possible shapes into the expected display shape.
  const normalized: any = {
    id: String(r?.id ?? (r?.periodId && r?.bioId ? `${r.periodId}_${r.bioId}` : '')),
    bioId: String(r?.bioId ?? r?.employeeNumber ?? r?.employee_number ?? ''),
    employeeName: String(r?.employeeName ?? r?.full_name ?? r?.name ?? ''),
    department: String(r?.department ?? r?.dept ?? r?.departmentName ?? ''),
    salaryType: String(r?.salaryType ?? r?.payType ?? r?.salary_type ?? 'unconfigured'),
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
    netPay: Number(r?.netPay ?? r?.net_pay ?? 0),
    reviewStatus: r?.reviewStatus ?? r?.review_status ?? 'ready',
    // keep raw for debugging
    __raw: r
  }

  // Minor sanity checks in dev — log any odd records so they can be inspected later.
  if (!normalized.employeeName || normalized.initialEarnings === undefined) {
    // eslint-disable-next-line no-console
    console.warn('PayrollRecords: normalized record missing expected keys', normalized.__raw, normalized)
  }

  return normalized as EmployeePayrollRecord
}

async function loadPeriodsAndRecords() {
  isLoading.value = true
  try {
    const cutoffs = payrollCalculationService.getAvailableCutoffs(new Date(), 6)
    availableCutoffs.value = cutoffs
    if (!selectedPeriodId.value && cutoffs.length > 0) {
      selectedPeriodId.value = cutoffs[0].id
    }

    if (selectedPeriod.value) {
      const emps = await employeeRepository.getAll()
      const computedRecords = await payrollCalculationService.computePayroll(selectedPeriod.value, emps)
      // Normalize every record to avoid mixed-shape rendering issues
      records.value = computedRecords.map(normalizeRecord)
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load payroll records:', err)
  } finally {
    isLoading.value = false
  }
}

async function onPeriodChange() {
  if (selectedPeriod.value) {
    isLoading.value = true
    try {
      const emps = await employeeRepository.getAll()
      const computedRecords = await payrollCalculationService.computePayroll(selectedPeriod.value, emps)
      records.value = computedRecords.map(normalizeRecord)
    } finally {
      isLoading.value = false
    }
  }
}

onMounted(() => {
  loadPeriodsAndRecords()
})

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
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          Payroll Records & Audit
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Audited payroll summaries computed from verified daily attendance, authorized overtime forms, and holiday pay.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <select
          v-model="selectedPeriodId"
          @change="onPeriodChange"
          class="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground font-medium focus:outline-hidden"
        >
          <option v-for="p in availableCutoffs" :key="p.id" :value="p.id">
            {{ p.label }}
          </option>
        </select>

        <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs" @click="loadPeriodsAndRecords">
          <RefreshCw class="size-3.5" :class="{ 'animate-spin': isLoading }" />
          Refresh
        </Button>
      </div>
    </div>

    <!-- Summary KPI cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Active Batch Net Pay</span>
          <DollarSign class="size-3.5 text-emerald-600" />
        </div>
        <div class="text-xl font-bold mt-1 text-emerald-600 font-mono">
          ₱{{ totalPayrollNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
        </div>
      </div>

      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Authorized Overtime</span>
          <Clock class="size-3.5 text-indigo-600" />
        </div>
        <div class="text-xl font-bold mt-1 text-indigo-600 font-mono">
          ₱{{ totalAuthorizedOtPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
        </div>
        <div class="text-[10px] text-muted-foreground font-mono mt-0.5">{{ totalAuthorizedOtHours }} authorized hrs</div>
      </div>

      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Holiday Earnings</span>
          <Calendar class="size-3.5 text-amber-600" />
        </div>
        <div class="text-xl font-bold mt-1 text-amber-600 font-mono">
          ₱{{ totalHolidayPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
        </div>
      </div>

      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Employees in Batch</span>
          <CheckCircle class="size-3.5 text-blue-600" />
        </div>
        <div class="text-xl font-bold mt-1 text-foreground font-mono">{{ records.length }}</div>
      </div>
    </div>

    <!-- Payroll Table -->
    <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow class="bg-muted/40">
            <TableHead class="font-semibold text-xs">Bio ID</TableHead>
            <TableHead class="font-semibold text-xs">Employee Name</TableHead>
            <TableHead class="font-semibold text-xs">Base Pay</TableHead>
            <TableHead class="font-semibold text-xs">Payable Days</TableHead>
            <TableHead class="font-semibold text-xs">Holiday Pay</TableHead>
            <TableHead class="font-semibold text-xs">Authorized OT</TableHead>
            <TableHead class="font-semibold text-xs">Gross Pay</TableHead>
            <TableHead class="font-semibold text-xs">Deductions</TableHead>
            <TableHead class="font-semibold text-xs text-right">Net Pay</TableHead>
            <TableHead class="font-semibold text-xs text-center">Status</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <TableRow v-if="records.length === 0">
            <TableCell :colspan="10" class="h-24 text-center text-xs text-muted-foreground">
              {{ isLoading ? 'Computing payroll batch...' : 'No active employees in this period.' }}
            </TableCell>
          </TableRow>

          <TableRow v-for="r in records" :key="r.id" class="text-xs">
            <TableCell class="font-mono text-muted-foreground">{{ r.bioId }}</TableCell>
            <TableCell class="font-medium text-foreground">
              <div>{{ r.employeeName }}</div>
              <div class="text-[10px] text-muted-foreground">{{ r.department }} • {{ r.salaryType }}</div>
            </TableCell>
            <TableCell class="font-mono">
              ₱{{ ((r.earningsBreakdown?.basePay ?? (r.initialEarnings || 0)) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
            </TableCell>
            <TableCell class="text-xs">
              <span class="font-semibold">{{ r.payableDays }}</span>
              <span class="text-muted-foreground text-[10px]"> / {{ r.scheduledDays }} days</span>
            </TableCell>
            <TableCell class="font-mono">
              <span :class="(Number(r.earningsBreakdown?.holidayPay) || 0) > 0 ? 'text-amber-600 font-semibold' : 'text-muted-foreground'">
                ₱{{ (Number(r.earningsBreakdown?.holidayPay) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
              </span>
            </TableCell>
            <TableCell class="font-mono">
              <div v-if="Number(r.overtimeHours) > 0">
                <span class="font-semibold text-indigo-600">₱{{ (Number(r.overtimePay) || 0).toFixed(2) }}</span>
                <span class="text-[10px] text-muted-foreground block">{{ r.overtimeHours }} hr(s) qualifying</span>
              </div>
              <div v-else class="text-muted-foreground text-[11px]">
                ₱0.00
              </div>
            </TableCell>
            <TableCell class="font-mono">
              ₱{{ (Number(r.initialEarnings) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
            </TableCell>
            <TableCell class="font-mono text-rose-600">
              -₱{{ (Number(r.totalBenefitsAndLoans || 0) + Number(r.totalOtherDeductions || 0) + Number(r.cashAdvance || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
            </TableCell>
            <TableCell class="font-mono font-bold text-right text-emerald-600">
              ₱{{ (Number(r.netPay) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
            </TableCell>
            <TableCell class="text-center">
              <Badge
                :variant="r.reviewStatus === 'approved' || r.reviewStatus === 'finalized' ? 'success' : r.reviewStatus === 'needs_review' ? 'warning' : 'outline'"
                class="text-[10px]"
              >
                {{ r.reviewStatus }}
              </Badge>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
