<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
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
  Calculator,
  Printer,
  Search,
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Plus,
  Trash2,
  Eye,
  Lock,
  Save,
  RefreshCw,
  Landmark,
  ShieldCheck
} from '@lucide/vue'
import {
  payrollCalculationService,
  type PayrollCutoffPeriod,
  type EmployeePayrollRecord,
  type ItemizedDeduction
} from '@/services/payrollCalculation'
import { employeeService } from '@/services/employees'
import { attendanceService } from '@/services/attendance'
import { holidayService } from '@/services/holidays/holidayService'
import type { Employee } from '@/types'
import type { HolidayRecord } from '@/db'
import type { DailyAttendanceRecord } from '@/services/attendanceEngine'

const props = defineProps<{
  open: boolean
  periodAnchorDate?: Date
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

// Loading & UI State
const isLoading = ref(false)
const isSaving = ref(false)
const saveSuccessMessage = ref('')
const saveErrorMessage = ref('')

// Cutoff Periods
const availableCutoffs = ref<PayrollCutoffPeriod[]>([])
const selectedCutoffId = ref<string>('')

const currentCutoff = computed<PayrollCutoffPeriod | undefined>(() => {
  return availableCutoffs.value.find(c => c.id === selectedCutoffId.value)
})

// Loaded Base Data
const employees = ref<Employee[]>([])
const holidays = ref<HolidayRecord[]>([])
const periodAttendanceRecords = ref<DailyAttendanceRecord[]>([])

// Master Payroll Records
const payrollRecords = ref<EmployeePayrollRecord[]>([])

// Search & Filter
const searchQuery = ref('')
const statusFilter = ref<'all' | 'needs_review' | 'ready' | 'finalized'>('all')

const filteredRecords = computed(() => {
  let list = payrollRecords.value
  if (statusFilter.value === 'needs_review') {
    list = list.filter(r => r.reviewStatus === 'needs_review')
  } else if (statusFilter.value === 'ready') {
    list = list.filter(r => r.reviewStatus === 'ready' || r.reviewStatus === 'approved')
  } else if (statusFilter.value === 'finalized') {
    list = list.filter(r => r.batchStatus === 'finalized' || r.reviewStatus === 'finalized')
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(r =>
      r.employeeName.toLowerCase().includes(q) ||
      r.bioId.toLowerCase().includes(q) ||
      r.department.toLowerCase().includes(q) ||
      r.position.toLowerCase().includes(q)
    )
  }
  return list
})

// KPI Totals across all active employees in this period
const periodKPIs = computed(() => {
  const records = payrollRecords.value
  let totalEarnings = 0
  let totalBenefits = 0
  let totalCashAdvance = 0
  let totalOtherDeductions = 0
  let totalTax = 0
  let totalNetPay = 0
  let needsReviewCount = 0
  let payableDaysSum = 0

  for (const r of records) {
    totalEarnings += r.initialEarnings || 0
    totalBenefits += r.totalBenefitsAndLoans || 0
    totalCashAdvance += r.cashAdvance || 0
    totalOtherDeductions += r.totalOtherDeductions || 0
    totalTax += r.withholdingTax || 0
    totalNetPay += r.netPay || 0
    payableDaysSum += r.payableDays || 0
    if (r.reviewStatus === 'needs_review') {
      needsReviewCount++
    }
  }

  return {
    totalEmployees: records.length,
    payableDaysSum,
    totalEarnings: Math.round(totalEarnings * 100) / 100,
    totalBenefits: Math.round(totalBenefits * 100) / 100,
    totalCashAdvance: Math.round(totalCashAdvance * 100) / 100,
    totalOtherDeductions: Math.round(totalOtherDeductions * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
    totalNetPay: Math.round(totalNetPay * 100) / 100,
    needsReviewCount
  }
})

// Batch Status
const currentBatchStatus = computed(() => {
  if (payrollRecords.value.length === 0) return 'draft'
  if (payrollRecords.value.every(r => r.batchStatus === 'finalized')) return 'finalized'
  if (payrollRecords.value.some(r => r.reviewStatus === 'needs_review')) return 'needs_review'
  return 'draft'
})

// Deduction & Stage Breakdown Inspection Dialog State
const showDetailModal = ref(false)
const inspectingRecord = ref<EmployeePayrollRecord | null>(null)

// Add Itemized Deduction Form
const newDeductionCategory = ref<ItemizedDeduction['category']>('cash_advance')
const newDeductionDescription = ref('')
const newDeductionAmount = ref<number | ''>('')
const newDeductionError = ref('')

function openInspectModal(record: EmployeePayrollRecord) {
  inspectingRecord.value = record
  newDeductionCategory.value = 'cash_advance'
  newDeductionDescription.value = ''
  newDeductionAmount.value = ''
  newDeductionError.value = ''
  showDetailModal.value = true
}

function addDeductionItem() {
  if (!inspectingRecord.value) return
  if (!newDeductionDescription.value.trim()) {
    newDeductionError.value = 'Please provide a description (e.g. Cash Advance, Safety Boots).'
    return
  }
  const amt = Number(newDeductionAmount.value)
  if (isNaN(amt) || amt <= 0) {
    newDeductionError.value = 'Please provide a valid deduction amount greater than zero.'
    return
  }

  newDeductionError.value = ''
  const item: ItemizedDeduction = {
    id: `ded-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category: newDeductionCategory.value,
    description: newDeductionDescription.value.trim(),
    amount: Math.round(amt * 100) / 100,
    createdAt: new Date().toISOString()
  }

  if (!Array.isArray(inspectingRecord.value.itemizedDeductions)) {
    inspectingRecord.value.itemizedDeductions = []
  }
  inspectingRecord.value.itemizedDeductions.push(item)

  // Recalculate
  payrollCalculationService.recalculateRecord(inspectingRecord.value)

  // Reset form
  newDeductionDescription.value = ''
  newDeductionAmount.value = ''
}

function removeDeductionItem(itemId: string) {
  if (!inspectingRecord.value) return
  inspectingRecord.value.itemizedDeductions = inspectingRecord.value.itemizedDeductions.filter(i => i.id !== itemId)
  payrollCalculationService.recalculateRecord(inspectingRecord.value)
}

function onWithholdingTaxChange(record: EmployeePayrollRecord, event: Event) {
  const target = event.target as HTMLInputElement
  const val = parseFloat(target.value) || 0
  record.withholdingTax = Math.max(0, val)
  payrollCalculationService.recalculateRecord(record)
}

function onInlineFieldChange(record: EmployeePayrollRecord) {
  payrollCalculationService.recalculateRecord(record)
}

/**
 * Loads payroll records for the selected cutoff period.
 */
async function loadPayrollData() {
  if (!currentCutoff.value) return
  isLoading.value = true
  saveSuccessMessage.value = ''
  saveErrorMessage.value = ''

  try {
    const period = currentCutoff.value

    // Load base employees if not yet cached
    if (employees.value.length === 0) {
      employees.value = await employeeService.getEmployees()
    }

    // Load holidays for this cutoff period's year
    const holidayRes = await holidayService.getHolidays(period.year)
    holidays.value = holidayRes.holidays.map(h => ({
      id: h.id || h.date,
      name: h.name,
      date: h.date,
      type: h.type as any,
      isNationwide: h.scope === 'National'
    }))

    // Load daily attendance records for this 15-day window
    const attendancePromises = period.dates.map(async (dStr) => {
      try {
        return await attendanceService.getDailyAttendance(dStr)
      } catch {
        return []
      }
    })
    const attendanceArrays = await Promise.all(attendancePromises)
    const flattenedAttendance = attendanceArrays.flat()
    periodAttendanceRecords.value = flattenedAttendance

    // Compute payroll
    const records = await payrollCalculationService.computePayroll(
      period,
      employees.value,
      holidays.value,
      periodAttendanceRecords.value
    )

    payrollRecords.value = records
  } catch (err: any) {
    saveErrorMessage.value = err?.message || 'Failed to calculate payroll records.'
  } finally {
    isLoading.value = false
  }
}

/**
 * Saves current payroll calculations as a Draft.
 */
async function saveDraft() {
  if (payrollRecords.value.length === 0) return
  isSaving.value = true
  saveSuccessMessage.value = ''
  saveErrorMessage.value = ''

  try {
    await payrollCalculationService.savePayrollSnapshot(payrollRecords.value, 'draft')
    saveSuccessMessage.value = 'Payroll draft saved successfully in local database.'
    setTimeout(() => {
      saveSuccessMessage.value = ''
    }, 3500)
  } catch (err: any) {
    saveErrorMessage.value = err?.message || 'Failed to save payroll draft.'
  } finally {
    isSaving.value = false
  }
}

/**
 * Finalizes the payroll calculation and preserves as a locked historical snapshot.
 */
async function finalizePayroll() {
  if (payrollRecords.value.length === 0) return

  // Check if any records require review
  const issues = payrollRecords.value.filter(r => r.reviewStatus === 'needs_review')
  if (issues.length > 0) {
    saveErrorMessage.value = `Cannot finalize payroll: ${issues.length} employee record(s) require review (e.g. unconfigured salary rate or unresolved attendance). Please review them first.`
    return
  }

  isSaving.value = true
  saveSuccessMessage.value = ''
  saveErrorMessage.value = ''

  try {
    for (const r of payrollRecords.value) {
      r.batchStatus = 'finalized'
      r.reviewStatus = 'finalized'
    }

    await payrollCalculationService.savePayrollSnapshot(payrollRecords.value, 'finalized', 'Authorized HR Admin')
    saveSuccessMessage.value = `Payroll for ${currentCutoff.value?.label} successfully finalized and locked as an official historical snapshot.`
    setTimeout(() => {
      saveSuccessMessage.value = ''
    }, 4000)
  } catch (err: any) {
    saveErrorMessage.value = err?.message || 'Failed to finalize payroll snapshot.'
  } finally {
    isSaving.value = false
  }
}

function handleClose() {
  emit('update:open', false)
}

// Initialize Cutoffs on mount or anchor change
function initializeCutoffs() {
  const anchor = props.periodAnchorDate || new Date()
  const cutoffs = payrollCalculationService.getAvailableCutoffs(anchor, 8)
  availableCutoffs.value = cutoffs

  // Match anchor's period
  const anchorY = anchor.getFullYear()
  const anchorM = anchor.getMonth() + 1
  const anchorHalf = anchor.getDate() <= 15 ? 1 : 2
  const matched = cutoffs.find(c => c.year === anchorY && c.month === anchorM && c.half === anchorHalf)
  selectedCutoffId.value = matched ? matched.id : cutoffs[0].id
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      initializeCutoffs()
      loadPayrollData()
    }
  }
)

watch(selectedCutoffId, () => {
  if (props.open) {
    loadPayrollData()
  }
})

onMounted(() => {
  initializeCutoffs()
})
</script>

<template>
  <div>
    <!-- Main Payroll Calculation Dialog -->
    <Dialog :open="open" @update:open="$emit('update:open', $event)">
      <DialogContent class="sm:max-w-6xl max-w-7xl w-[96vw] max-h-[92vh] flex flex-col p-0 overflow-hidden shadow-2xl rounded-xl">
        <!-- Dialog Header -->
        <DialogHeader class="p-4 border-b bg-muted/30 shrink-0">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <Calculator class="size-5 text-primary shrink-0" />
                <DialogTitle class="text-base sm:text-lg font-bold tracking-tight text-foreground">
                  Payroll Calculation
                </DialogTitle>
                <Badge
                  :variant="currentBatchStatus === 'finalized' ? 'default' : (currentBatchStatus === 'needs_review' ? 'destructive' : 'secondary')"
                  class="text-[10px] uppercase font-mono px-2 py-0.5"
                >
                  <Lock v-if="currentBatchStatus === 'finalized'" class="size-2.5 mr-1 inline" />
                  {{ currentBatchStatus === 'finalized' ? 'Finalized Snapshot' : (currentBatchStatus === 'needs_review' ? 'Action Required' : 'Draft Batch') }}
                </Badge>
              </div>
              <DialogDescription class="text-xs text-muted-foreground">
                Semi-monthly earnings, statutory benefits, itemized deductions, and withholding tax derived from verified attendance.
              </DialogDescription>
            </div>

            <!-- Cutoff Selector & Payday Display Pill -->
            <div class="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <div class="flex flex-col items-end">
                <label class="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-0.5">
                  Cut-off Period & Payday
                </label>
                <div class="flex items-center gap-2">
                  <Select v-model="selectedCutoffId">
                    <SelectTrigger class="h-8 text-xs w-[240px] sm:w-[280px] bg-background">
                      <SelectValue placeholder="Select Cut-off Period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem
                          v-for="c in availableCutoffs"
                          :key="c.id"
                          :value="c.id"
                          class="text-xs"
                        >
                          {{ c.label }}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    size="sm"
                    class="h-8 size-8 p-0"
                    title="Refresh Live Data"
                    :disabled="isLoading"
                    @click="loadPayrollData"
                  >
                    <RefreshCw class="size-3.5" :class="isLoading ? 'animate-spin' : ''" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <!-- Highlight Banner: Selected Period & Official Payday -->
          <div v-if="currentCutoff" class="mt-3 p-2.5 rounded-lg border bg-background/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div class="flex items-center gap-4 flex-wrap">
              <div class="flex items-center gap-1.5 font-medium">
                <CalendarDays class="size-3.5 text-primary" />
                <span class="text-muted-foreground">Selected Cut-off:</span>
                <span class="font-bold text-foreground">{{ currentCutoff.shortLabel }}</span>
              </div>
              <div class="flex items-center gap-1.5 font-medium">
                <Landmark class="size-3.5 text-emerald-600" />
                <span class="text-muted-foreground">Designated Payday:</span>
                <span class="font-bold text-emerald-700 dark:text-emerald-400 font-mono">{{ currentCutoff.paydayDisplay }}</span>
                <span class="text-[10px] text-muted-foreground font-normal">
                  ({{ currentCutoff.half === 1 ? '20th of same month' : '5th of following month' }})
                </span>
              </div>
            </div>

            <div class="text-[11px] text-muted-foreground">
              Source: <strong class="text-foreground">Attendance Matrix & Biometric Scanner</strong>
            </div>
          </div>

          <!-- Notification Banners -->
          <div v-if="saveSuccessMessage" class="mt-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 class="size-3.5 text-emerald-600 shrink-0" />
            <span>{{ saveSuccessMessage }}</span>
          </div>

          <div v-if="saveErrorMessage" class="mt-2 p-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
            <AlertCircle class="size-3.5 shrink-0" />
            <span>{{ saveErrorMessage }}</span>
          </div>
        </DialogHeader>

        <!-- KPI Stages Breakdown Strip -->
        <div class="px-4 py-3 border-b bg-card grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs shrink-0">
          <!-- Total Payable Days -->
          <div class="rounded-lg border p-2 bg-muted/20">
            <span class="text-[10px] text-muted-foreground font-semibold uppercase block">Payable Days</span>
            <div class="text-base font-bold text-foreground font-mono mt-0.5">
              {{ periodKPIs.payableDaysSum }} <span class="text-xs font-normal text-muted-foreground">days</span>
            </div>
          </div>

          <!-- Stage A: Initial Gross Earnings -->
          <div class="rounded-lg border border-primary/20 bg-primary/5 p-2">
            <span class="text-[10px] text-primary font-semibold uppercase block truncate">A. Initial Earnings</span>
            <div class="text-base font-bold text-foreground font-mono mt-0.5">
              ₱{{ periodKPIs.totalEarnings.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
            </div>
          </div>

          <!-- Stage B: Statutory Benefits & Loans -->
          <div class="rounded-lg border p-2 bg-muted/20">
            <span class="text-[10px] text-muted-foreground font-semibold uppercase block truncate">B. Benefits & Loans</span>
            <div class="text-base font-semibold text-rose-600 dark:text-rose-400 font-mono mt-0.5">
              -₱{{ periodKPIs.totalBenefits.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
            </div>
          </div>

          <!-- Stage C: CA & Other Deductions -->
          <div class="rounded-lg border p-2 bg-muted/20">
            <span class="text-[10px] text-muted-foreground font-semibold uppercase block truncate">C. CA & Deductions</span>
            <div class="text-base font-semibold text-rose-600 dark:text-rose-400 font-mono mt-0.5">
              -₱{{ (periodKPIs.totalCashAdvance + periodKPIs.totalOtherDeductions).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
            </div>
          </div>

          <!-- Stage D: Withholding Tax -->
          <div class="rounded-lg border p-2 bg-muted/20">
            <span class="text-[10px] text-muted-foreground font-semibold uppercase block truncate">D. Withholding Tax</span>
            <div class="text-base font-semibold text-amber-600 dark:text-amber-400 font-mono mt-0.5">
              -₱{{ periodKPIs.totalTax.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
            </div>
          </div>

          <!-- Stage E: Final Net Pay -->
          <div class="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2">
            <span class="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold uppercase block truncate">E. Total Net Pay</span>
            <div class="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
              ₱{{ periodKPIs.totalNetPay.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
            </div>
          </div>
        </div>

        <!-- Filter & Search Toolbar -->
        <div class="px-4 py-2 border-b bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0 text-xs">
          <!-- Status Tabs -->
          <div class="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              class="px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer"
              :class="statusFilter === 'all' ? 'bg-primary text-primary-foreground shadow-2xs' : 'text-muted-foreground hover:bg-muted'"
              @click="statusFilter = 'all'"
            >
              All Employees ({{ payrollRecords.length }})
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1"
              :class="statusFilter === 'needs_review' ? 'bg-amber-600 text-white shadow-2xs' : 'text-muted-foreground hover:bg-muted'"
              @click="statusFilter = 'needs_review'"
            >
              <AlertTriangle v-if="periodKPIs.needsReviewCount > 0" class="size-3 text-amber-200" />
              <span>Requires Review</span>
              <span v-if="periodKPIs.needsReviewCount > 0" class="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/20">
                {{ periodKPIs.needsReviewCount }}
              </span>
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer"
              :class="statusFilter === 'ready' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-muted-foreground hover:bg-muted'"
              @click="statusFilter = 'ready'"
            >
              Audited & Ready
            </button>
          </div>

          <!-- Search Box -->
          <div class="relative w-full sm:w-64">
            <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              v-model="searchQuery"
              placeholder="Search employee, ID, dept..."
              class="h-7 text-xs pl-8 bg-background w-full"
            />
          </div>
        </div>

        <!-- Employee Payroll Breakdown Table (Responsive & Horizontally Scrollable) -->
        <div class="flex-1 overflow-y-auto overflow-x-auto min-h-[300px]">
          <div v-if="isLoading" class="p-12 text-center text-xs text-muted-foreground">
            <RefreshCw class="size-5 animate-spin mx-auto mb-2 text-primary" />
            <span>Calculating semi-monthly payroll from attendance matrix data...</span>
          </div>

          <div v-else-if="filteredRecords.length === 0" class="p-12 text-center text-xs text-muted-foreground">
            No employee payroll records match the filter criteria.
          </div>

          <Table v-else class="text-xs border-collapse min-w-[1100px]">
            <TableHeader class="sticky top-0 bg-muted/95 backdrop-blur-xs z-10 shadow-2xs">
              <TableRow class="hover:bg-transparent">
                <TableHead class="w-[75px] font-semibold">ID</TableHead>
                <TableHead class="w-[160px] font-semibold">Employee Name</TableHead>
                <TableHead class="w-[85px] text-center font-semibold">Payable Days</TableHead>
                <TableHead class="w-[110px] text-right font-semibold">Initial Earnings</TableHead>
                <TableHead class="w-[80px] text-right font-semibold">SSS</TableHead>
                <TableHead class="w-[80px] text-right font-semibold">PhilHealth</TableHead>
                <TableHead class="w-[80px] text-right font-semibold">Pag-IBIG</TableHead>
                <TableHead class="w-[85px] text-right font-semibold">Loans</TableHead>
                <TableHead class="w-[90px] text-right font-semibold">Cash Adv.</TableHead>
                <TableHead class="w-[90px] text-right font-semibold">Other Ded.</TableHead>
                <TableHead class="w-[110px] text-right font-semibold">Withholding Tax</TableHead>
                <TableHead class="w-[115px] text-right font-semibold font-mono">Final Net Pay</TableHead>
                <TableHead class="w-[110px] text-center font-semibold">Review Status</TableHead>
                <TableHead class="w-[80px] text-center font-semibold">Details</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              <TableRow
                v-for="rec in filteredRecords"
                :key="rec.id"
                class="hover:bg-muted/30 transition-colors"
                :class="rec.reviewStatus === 'needs_review' ? 'bg-amber-500/[0.03]' : ''"
              >
                <!-- Employee ID (Bio ID) -->
                <TableCell class="font-mono font-bold text-foreground">
                  {{ rec.bioId }}
                </TableCell>

                <!-- Employee Name & Dept -->
                <TableCell>
                  <div class="font-medium text-foreground leading-tight truncate max-w-[155px]" :title="rec.employeeName">
                    {{ rec.employeeName }}
                  </div>
                  <div class="text-[10px] text-muted-foreground truncate">
                    {{ rec.department }} • <span class="capitalize">{{ rec.salaryType }}</span>
                  </div>
                </TableCell>

                <!-- Payable Working Days -->
                <TableCell class="text-center font-mono font-medium">
                  <span :class="rec.payableDays === 0 ? 'text-destructive font-bold' : 'text-foreground'">
                    {{ rec.payableDays }}
                  </span>
                  <span v-if="rec.sundayWorkDays > 0" class="text-[10px] text-emerald-600 block leading-none" title="Includes Sunday rest day duty">
                    +{{ rec.sundayWorkDays }} Sun
                  </span>
                </TableCell>

                <!-- Initial Earnings (Stage A) -->
                <TableCell class="text-right font-mono font-bold text-foreground">
                  <span v-if="rec.initialEarnings > 0">
                    ₱{{ rec.initialEarnings.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                  </span>
                  <span v-else class="text-amber-600 font-semibold text-[11px]">
                    Unconfigured
                  </span>
                </TableCell>

                <!-- SSS Contribution -->
                <TableCell class="text-right font-mono text-muted-foreground">
                  ₱{{ (rec.sss || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                </TableCell>

                <!-- PhilHealth Contribution -->
                <TableCell class="text-right font-mono text-muted-foreground">
                  ₱{{ (rec.philhealth || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                </TableCell>

                <!-- Pag-IBIG Contribution -->
                <TableCell class="text-right font-mono text-muted-foreground">
                  ₱{{ (rec.pagibig || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                </TableCell>

                <!-- Loan Deductions -->
                <TableCell class="text-right font-mono text-muted-foreground">
                  <span :class="(rec.sssLoan + rec.pagibigLoan + rec.otherLoan) > 0 ? 'text-rose-600 font-semibold' : ''">
                    ₱{{ ((rec.sssLoan || 0) + (rec.pagibigLoan || 0) + (rec.otherLoan || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                  </span>
                </TableCell>

                <!-- Cash Advance -->
                <TableCell class="text-right font-mono text-muted-foreground">
                  <span :class="rec.cashAdvance > 0 ? 'text-rose-600 font-semibold' : ''">
                    ₱{{ (rec.cashAdvance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                  </span>
                </TableCell>

                <!-- Other Itemized Deductions -->
                <TableCell class="text-right font-mono text-muted-foreground">
                  <span :class="rec.totalOtherDeductions > 0 ? 'text-rose-600 font-semibold' : ''">
                    ₱{{ (rec.totalOtherDeductions || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                  </span>
                </TableCell>

                <!-- Withholding Tax (Manually editable, not auto-threshold) -->
                <TableCell class="text-right">
                  <div class="relative flex items-center justify-end">
                    <span class="text-[10px] text-muted-foreground font-mono mr-1">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      :value="rec.withholdingTax"
                      class="h-7 w-20 text-right px-1.5 py-0.5 text-xs font-mono rounded border bg-background text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                      :disabled="currentBatchStatus === 'finalized'"
                      placeholder="0.00"
                      @change="onWithholdingTaxChange(rec, $event)"
                    />
                  </div>
                </TableCell>

                <!-- Final Net Pay -->
                <TableCell class="text-right font-mono font-black text-sm" :class="rec.netPay < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'">
                  ₱{{ rec.netPay.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                </TableCell>

                <!-- Review Status -->
                <TableCell class="text-center">
                  <Badge
                    :variant="rec.reviewStatus === 'needs_review' ? 'destructive' : (rec.reviewStatus === 'finalized' ? 'default' : 'secondary')"
                    class="text-[10px] px-2 py-0.5 cursor-pointer capitalize inline-flex items-center gap-1 font-semibold"
                    :title="rec.reviewReasons.join('; ') || 'Ready for audit'"
                    @click="openInspectModal(rec)"
                  >
                    <AlertTriangle v-if="rec.reviewStatus === 'needs_review'" class="size-2.5 text-amber-200" />
                    <span>{{ rec.reviewStatus === 'needs_review' ? 'Review' : (rec.reviewStatus === 'finalized' ? 'Finalized' : 'Ready') }}</span>
                  </Badge>
                </TableCell>

                <!-- Details Action Button -->
                <TableCell class="text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-7 w-7 p-0 cursor-pointer text-muted-foreground hover:text-foreground"
                    title="Inspect & Edit Deduction Details"
                    @click="openInspectModal(rec)"
                  >
                    <Eye class="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <!-- Dialog Footer -->
        <DialogFooter class="p-3 border-t bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div class="flex items-center gap-2 text-xs">
            <!-- Save Draft Button -->
            <Button
              variant="outline"
              size="sm"
              class="h-8 gap-1.5 text-xs cursor-pointer shadow-2xs font-medium"
              :disabled="isSaving || payrollRecords.length === 0 || currentBatchStatus === 'finalized'"
              @click="saveDraft"
            >
              <Save class="size-3.5" />
              <span>Save Draft</span>
            </Button>

            <!-- Finalize Button -->
            <Button
              variant="default"
              size="sm"
              class="h-8 gap-1.5 text-xs cursor-pointer shadow-2xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              :disabled="isSaving || payrollRecords.length === 0 || currentBatchStatus === 'finalized'"
              @click="finalizePayroll"
            >
              <ShieldCheck class="size-3.5" />
              <span>Finalize & Lock Snapshot</span>
            </Button>
          </div>

          <div class="flex items-center gap-2 self-end sm:self-auto">
            <!-- PRINT BUTTON (Normal action button appearance with printer icon, strictly nonfunctional per prompt) -->
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="h-8 gap-1.5 text-xs font-medium shadow-2xs cursor-not-allowed opacity-80"
              title="Print payroll report (Action disabled in preview)"
            >
              <Printer class="size-3.5" />
              <span>Print</span>
            </Button>

            <!-- CLOSE BUTTON -->
            <Button
              type="button"
              variant="secondary"
              size="sm"
              class="h-8 text-xs cursor-pointer"
              @click="handleClose"
            >
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ============================================================= -->
    <!-- NESTED INSPECT & ITEMIZE DEDUCTIONS MODAL -->
    <!-- ============================================================= -->
    <Dialog v-model:open="showDetailModal">
      <DialogContent class="sm:max-w-xl max-w-2xl max-h-[88vh] flex flex-col p-0 overflow-hidden shadow-2xl rounded-xl">
        <DialogHeader class="p-4 border-b bg-muted/30 shrink-0">
          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <DialogTitle class="text-base font-bold text-foreground flex items-center gap-2">
                <span>{{ inspectingRecord?.employeeName }}</span>
                <Badge variant="outline" class="font-mono text-xs">
                  Bio ID: {{ inspectingRecord?.bioId }}
                </Badge>
              </DialogTitle>
              <DialogDescription class="text-xs text-muted-foreground">
                Detailed Stage A–E Calculation Breakdown and Itemized Deductions Manager
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div v-if="inspectingRecord" class="p-4 space-y-4 overflow-y-auto text-xs">
          <!-- Warnings / Review Flags if any -->
          <div v-if="inspectingRecord.reviewReasons.length > 0" class="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 space-y-1">
            <div class="font-semibold flex items-center gap-1.5">
              <AlertTriangle class="size-3.5 text-amber-600" />
              <span>Requires HR Review:</span>
            </div>
            <ul class="list-disc pl-4 space-y-0.5 text-[11px]">
              <li v-for="(reason, idx) in inspectingRecord.reviewReasons" :key="idx">
                {{ reason }}
              </li>
            </ul>
          </div>

          <!-- Step-by-Step Mathematical Calculation Stages -->
          <div class="rounded-xl border bg-card p-3.5 space-y-2.5 shadow-2xs">
            <div class="font-bold text-foreground text-xs uppercase tracking-wider pb-1.5 border-b">
              Five-Stage Payroll Calculation Formula
            </div>

            <!-- Stage A -->
            <div class="flex items-center justify-between py-1 border-b">
              <div>
                <span class="font-semibold text-foreground">Stage A: Initial Earnings</span>
                <span class="text-[10px] text-muted-foreground block">
                  Payable Days: {{ inspectingRecord.payableDays }} • Daily Rate: ₱{{ inspectingRecord.dailyRate.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                </span>
              </div>
              <span class="font-mono font-bold text-foreground">
                ₱{{ inspectingRecord.initialEarnings.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
              </span>
            </div>

            <!-- Stage B Subtraction -->
            <div class="flex items-center justify-between py-1 border-b text-rose-600 dark:text-rose-400">
              <div>
                <span class="font-medium">− Stage B: Benefits Contributions & Loans</span>
                <span class="text-[10px] text-muted-foreground block">
                  SSS (₱{{ inspectingRecord.sss }}), PHIC (₱{{ inspectingRecord.philhealth }}), HDMF (₱{{ inspectingRecord.pagibig }}), Loans (₱{{ inspectingRecord.sssLoan + inspectingRecord.pagibigLoan + inspectingRecord.otherLoan }})
                </span>
              </div>
              <span class="font-mono font-semibold">
                -₱{{ inspectingRecord.totalBenefitsAndLoans.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
              </span>
            </div>

            <!-- Subtotal: Balance After Contributions & Loans -->
            <div class="flex items-center justify-between py-1 border-b bg-muted/20 px-2 rounded font-semibold text-foreground">
              <span>= Balance after Contributions & Loans</span>
              <span class="font-mono">
                ₱{{ inspectingRecord.balanceAfterBenefitsAndLoans.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
              </span>
            </div>

            <!-- Stage C Subtraction -->
            <div class="flex items-center justify-between py-1 border-b text-rose-600 dark:text-rose-400">
              <div>
                <span class="font-medium">− Stage C: Cash Advance & Other Deductions</span>
                <span class="text-[10px] text-muted-foreground block">
                  Cash Advance (₱{{ inspectingRecord.cashAdvance }}) + Other Itemized (₱{{ inspectingRecord.totalOtherDeductions }})
                </span>
              </div>
              <span class="font-mono font-semibold">
                -₱{{ (inspectingRecord.cashAdvance + inspectingRecord.totalOtherDeductions).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
              </span>
            </div>

            <!-- Subtotal: Balance Before Withholding Tax -->
            <div class="flex items-center justify-between py-1 border-b bg-muted/20 px-2 rounded font-semibold text-foreground">
              <span>= Balance before Withholding Tax</span>
              <span class="font-mono">
                ₱{{ inspectingRecord.balanceBeforeTax.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
              </span>
            </div>

            <!-- Stage D Subtraction -->
            <div class="flex items-center justify-between py-1 border-b text-amber-700 dark:text-amber-400">
              <div>
                <span class="font-medium">− Stage D: Manually Entered Withholding Tax</span>
                <span class="text-[10px] text-muted-foreground block">
                  Entered directly by payroll staff (no automated fixed deduction)
                </span>
              </div>
              <span class="font-mono font-semibold">
                -₱{{ inspectingRecord.withholdingTax.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
              </span>
            </div>

            <!-- Stage E Final -->
            <div class="flex items-center justify-between py-1.5 bg-emerald-500/10 border border-emerald-500/30 px-2.5 rounded-lg text-emerald-800 dark:text-emerald-300">
              <span class="font-bold uppercase tracking-wider text-xs">Stage E: Final Net Pay</span>
              <span class="font-mono font-black text-sm">
                ₱{{ inspectingRecord.netPay.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
              </span>
            </div>
          </div>

          <!-- Stage B: Statutory Deductions & Loans (Editable) -->
          <div class="rounded-xl border bg-card p-3.5 space-y-2.5 shadow-2xs">
            <div class="font-bold text-foreground text-xs uppercase tracking-wider pb-1 border-b">
              Statutory Contributions & Loan Repayments
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div class="space-y-1">
                <label class="text-[11px] text-muted-foreground">SSS Contribution</label>
                <Input
                  v-model.number="inspectingRecord.sss"
                  type="number"
                  step="0.01"
                  min="0"
                  class="h-7 text-xs font-mono"
                  @change="onInlineFieldChange(inspectingRecord)"
                />
              </div>
              <div class="space-y-1">
                <label class="text-[11px] text-muted-foreground">PhilHealth Contribution</label>
                <Input
                  v-model.number="inspectingRecord.philhealth"
                  type="number"
                  step="0.01"
                  min="0"
                  class="h-7 text-xs font-mono"
                  @change="onInlineFieldChange(inspectingRecord)"
                />
              </div>
              <div class="space-y-1">
                <label class="text-[11px] text-muted-foreground">Pag-IBIG Contribution</label>
                <Input
                  v-model.number="inspectingRecord.pagibig"
                  type="number"
                  step="0.01"
                  min="0"
                  class="h-7 text-xs font-mono"
                  @change="onInlineFieldChange(inspectingRecord)"
                />
              </div>
              <div class="space-y-1">
                <label class="text-[11px] text-muted-foreground">SSS Loan Repayment</label>
                <Input
                  v-model.number="inspectingRecord.sssLoan"
                  type="number"
                  step="0.01"
                  min="0"
                  class="h-7 text-xs font-mono"
                  @change="onInlineFieldChange(inspectingRecord)"
                />
              </div>
              <div class="space-y-1">
                <label class="text-[11px] text-muted-foreground">Pag-IBIG Loan Repayment</label>
                <Input
                  v-model.number="inspectingRecord.pagibigLoan"
                  type="number"
                  step="0.01"
                  min="0"
                  class="h-7 text-xs font-mono"
                  @change="onInlineFieldChange(inspectingRecord)"
                />
              </div>
              <div class="space-y-1">
                <label class="text-[11px] text-muted-foreground">Company / Other Loan</label>
                <Input
                  v-model.number="inspectingRecord.otherLoan"
                  type="number"
                  step="0.01"
                  min="0"
                  class="h-7 text-xs font-mono"
                  @change="onInlineFieldChange(inspectingRecord)"
                />
              </div>
            </div>
          </div>

          <!-- Stage C: Itemized Deductions Manager -->
          <div class="rounded-xl border bg-card p-3.5 space-y-3 shadow-2xs">
            <div class="flex items-center justify-between pb-1 border-b">
              <div class="font-bold text-foreground text-xs uppercase tracking-wider">
                Stage C: Cash Advance & Itemized Deductions
              </div>
              <span class="text-[11px] font-mono font-semibold text-rose-600">
                Total: ₱{{ (inspectingRecord.cashAdvance + inspectingRecord.totalOtherDeductions).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
              </span>
            </div>

            <!-- List of existing deductions -->
            <div v-if="!inspectingRecord.itemizedDeductions || inspectingRecord.itemizedDeductions.length === 0" class="text-xs text-muted-foreground italic py-2 text-center">
              No cash advances or itemized deductions entered for this cutoff.
            </div>

            <div v-else class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              <div
                v-for="item in inspectingRecord.itemizedDeductions"
                :key="item.id"
                class="flex items-center justify-between p-2 rounded-lg border bg-muted/20 text-xs gap-2"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" class="text-[10px] uppercase font-mono shrink-0">
                    {{ item.category.replace('_', ' ') }}
                  </Badge>
                  <span class="font-medium text-foreground truncate">{{ item.description }}</span>
                </div>

                <div class="flex items-center gap-2 shrink-0">
                  <span class="font-mono font-semibold text-rose-600">
                    ₱{{ item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                  </span>
                  <button
                    type="button"
                    class="text-muted-foreground hover:text-destructive p-1 rounded transition-colors cursor-pointer"
                    title="Remove deduction"
                    @click="removeDeductionItem(item.id)"
                  >
                    <Trash2 class="size-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <!-- Add new item form -->
            <div class="pt-2 border-t space-y-2">
              <div class="text-[11px] font-semibold text-foreground">Add New Deduction Entry:</div>
              <div class="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div class="sm:col-span-4">
                  <Select v-model="newDeductionCategory">
                    <SelectTrigger class="h-7 text-xs bg-background">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="cash_advance" class="text-xs">Cash Advance (CA)</SelectItem>
                        <SelectItem value="safety_boots" class="text-xs">Safety Boots</SelectItem>
                        <SelectItem value="gloves" class="text-xs">Gloves</SelectItem>
                        <SelectItem value="uniform" class="text-xs">Uniform</SelectItem>
                        <SelectItem value="other" class="text-xs">Other Authorized</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div class="sm:col-span-5">
                  <Input
                    v-model="newDeductionDescription"
                    placeholder="Description (e.g. Safety Boots #42)"
                    class="h-7 text-xs bg-background"
                  />
                </div>

                <div class="sm:col-span-3 flex items-center gap-1.5">
                  <Input
                    v-model.number="newDeductionAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="₱ Amount"
                    class="h-7 text-xs font-mono bg-background"
                  />
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    class="h-7 w-7 p-0 shrink-0 cursor-pointer"
                    title="Add deduction"
                    @click="addDeductionItem"
                  >
                    <Plus class="size-3.5" />
                  </Button>
                </div>
              </div>

              <div v-if="newDeductionError" class="text-destructive text-[11px]">
                {{ newDeductionError }}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter class="p-3 border-t bg-muted/30 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            class="h-8 text-xs cursor-pointer"
            @click="showDetailModal = false"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
