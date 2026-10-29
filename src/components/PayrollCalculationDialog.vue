<script setup lang="ts">
import { ref, computed, watch, toRaw } from 'vue'
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Calculator,
  Printer,
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  ShieldCheck,
  User,
  FileText,
  Clock
} from '@lucide/vue'
import {
  payrollCalculationService,
  type PayrollCutoffPeriod,
  type EmployeePayrollRecord,
  type ItemizedDeduction
} from '@/services/payrollCalculation'
import type { Employee } from '@/types'
import type { HolidayRecord } from '@/db'
import type { DailyAttendanceRecord } from '@/services/attendanceEngine'

const props = defineProps<{
  open: boolean
  selectedEmployee?: Employee | null
  periodAnchorDate?: Date
  attendanceRecords?: DailyAttendanceRecord[]
  holidaysList?: HolidayRecord[]
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

// UI state
const isLoading = ref(false)
const isSaving = ref(false)
const saveSuccessMessage = ref('')
const saveErrorMessage = ref('')
const isPayslipViewOpen = ref(false)

// Cutoff Periods
const availableCutoffs = ref<PayrollCutoffPeriod[]>([])
const selectedCutoffId = ref<string>('')

const currentCutoff = computed<PayrollCutoffPeriod | undefined>(() => {
  return availableCutoffs.value.find(c => c.id === selectedCutoffId.value)
})

// Current Single Employee Payroll Record
const currentRecord = ref<EmployeePayrollRecord | null>(null)

// Itemized deduction draft for Stage C
const newDeductionCategory = ref<'cash_advance' | 'safety_boots' | 'gloves' | 'uniform' | 'other'>('cash_advance')
const newDeductionDescription = ref('')
const newDeductionAmount = ref<number | ''>('')

// Initialize cutoffs list
function initCutoffs(forceSync = false) {
  const anchor = props.periodAnchorDate || new Date()
  const cutoffs = payrollCalculationService.getAvailableCutoffs(anchor, 8)
  availableCutoffs.value = cutoffs
  if ((forceSync || !selectedCutoffId.value) && cutoffs.length > 0) {
    selectedCutoffId.value = cutoffs[0].id
  }
}

// Compute/Load payroll for the selected employee only
async function loadEmployeePayroll() {
  saveSuccessMessage.value = ''
  saveErrorMessage.value = ''

  if (!props.selectedEmployee) {
    currentRecord.value = null
    return
  }

  if (!currentCutoff.value) {
    initCutoffs(false)
  }

  if (!currentCutoff.value) return

  isLoading.value = true
  try {
    let passedRecords = props.attendanceRecords || []
    if (passedRecords.length > 0 && currentCutoff.value) {
      const cutoffDatesSet = new Set(currentCutoff.value.dates)
      const hasMatchingDates = passedRecords.some(r => cutoffDatesSet.has(r.raw_date || r.date))
      if (!hasMatchingDates) {
        passedRecords = []
      }
    }

    const record = await payrollCalculationService.computeSingleEmployeePayroll(
      currentCutoff.value,
      props.selectedEmployee,
      props.holidaysList || [],
      passedRecords
    )
    currentRecord.value = record
  } catch (err: any) {
    saveErrorMessage.value = `Failed to compute payroll: ${err?.message || 'Unknown error'}`
  } finally {
    isLoading.value = false
  }
}

// Watch modal open and selectedEmployee changes
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      initCutoffs(true)
      loadEmployeePayroll()
    } else {
      // Clear messages when closed
      saveSuccessMessage.value = ''
      saveErrorMessage.value = ''
      isPayslipViewOpen.value = false
    }
  }
)

watch(
  () => props.periodAnchorDate,
  () => {
    if (props.open) {
      initCutoffs(true)
      loadEmployeePayroll()
    }
  }
)

watch(
  () => props.selectedEmployee?.biometric_user_id,
  (newId, oldId) => {
    if (props.open && newId !== oldId) {
      currentRecord.value = null // Prevent stale data
      loadEmployeePayroll()
    }
  }
)

watch(
  () => props.attendanceRecords,
  () => {
    if (props.open) {
      loadEmployeePayroll()
    }
  },
  { deep: true }
)

watch(selectedCutoffId, (newId, oldId) => {
  if (props.open && newId && newId !== oldId) {
    loadEmployeePayroll()
  }
})

// Stage B: Statutory recalculation
function onStatutoryChange() {
  if (!currentRecord.value) return
  payrollCalculationService.recalculateRecord(currentRecord.value)
}

// Stage C: Add Itemized Deduction
function addDeductionItem() {
  if (!currentRecord.value) return
  const amount = Number(newDeductionAmount.value)
  if (isNaN(amount) || amount <= 0) return

  const desc = newDeductionDescription.value.trim() || getDefaultCategoryName(newDeductionCategory.value)
  const newItem: ItemizedDeduction = {
    id: `ded_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    category: newDeductionCategory.value,
    description: desc,
    amount: Math.round(amount * 100) / 100,
    createdAt: new Date().toISOString()
  }

  if (!Array.isArray(currentRecord.value.itemizedDeductions)) {
    currentRecord.value.itemizedDeductions = []
  }

  currentRecord.value.itemizedDeductions.push(newItem)
  payrollCalculationService.recalculateRecord(currentRecord.value)

  // Reset inputs
  newDeductionDescription.value = ''
  newDeductionAmount.value = ''
}

// Stage C: Remove Itemized Deduction
function removeDeductionItem(index: number) {
  if (!currentRecord.value || !Array.isArray(currentRecord.value.itemizedDeductions)) return
  currentRecord.value.itemizedDeductions.splice(index, 1)
  payrollCalculationService.recalculateRecord(currentRecord.value)
}

function getDefaultCategoryName(cat: string): string {
  switch (cat) {
    case 'cash_advance': return 'Cash Advance (CA)'
    case 'safety_boots': return 'Safety Boots'
    case 'gloves': return 'Safety Gloves'
    case 'uniform': return 'Uniform'
    default: return 'Authorized Deduction'
  }
}

// Stage D: Withholding Tax change
function onTaxChange() {
  if (!currentRecord.value) return
  payrollCalculationService.recalculateRecord(currentRecord.value)
}

function clearTax() {
  if (!currentRecord.value) return
  currentRecord.value.withholdingTax = 0
  payrollCalculationService.recalculateRecord(currentRecord.value)
}

// Save Snapshot to IndexedDB
async function saveRecord(batchStatus: 'draft' | 'approved' | 'finalized') {
  if (!currentRecord.value) return

  isSaving.value = true
  saveSuccessMessage.value = ''
  saveErrorMessage.value = ''

  try {
    currentRecord.value.batchStatus = batchStatus
    if (batchStatus === 'finalized') {
      currentRecord.value.reviewStatus = 'finalized'
    }

    const plainRecord = toRaw(currentRecord.value)
    await payrollCalculationService.savePayrollSnapshot(
      [plainRecord],
      batchStatus,
      'Authorized HR Admin'
    )

    saveSuccessMessage.value = batchStatus === 'finalized'
      ? `Payroll snapshot finalized and locked for ${currentRecord.value.employeeName}.`
      : `Payroll record successfully saved for ${currentRecord.value.employeeName}.`

    setTimeout(() => {
      saveSuccessMessage.value = ''
    }, 4000)
  } catch (err: any) {
    saveErrorMessage.value = `Failed to save payroll snapshot: ${err?.message || 'Database error'}`
  } finally {
    isSaving.value = false
  }
}

// Print / View Payslip
function triggerPrint() {
  window.print()
}
</script>

<template>
  <Dialog :open="open" @update:open="(val) => emit('update:open', val)">
    <DialogContent class="sm:max-w-5xl max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-2xl border shadow-2xl">
      <!-- Modal Top Header -->
      <DialogHeader class="px-5 pt-4 pb-2 border-b bg-card shrink-0">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <!-- Title & Badges -->
          <div>
            <div class="flex items-center gap-2">
              <div class="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Calculator class="size-4" />
              </div>
              <div>
                <DialogTitle class="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                  <span>Semi-Monthly Payroll Calculation</span>
                  <Badge variant="outline" class="text-[10px] font-mono py-0 font-medium border-primary/30 text-primary">
                    Single Employee
                  </Badge>
                </DialogTitle>
                <DialogDescription class="text-xs text-muted-foreground mt-0.5">
                  Attendance matrix compliance, statutory contributions, itemized deductions, and withholding tax.
                </DialogDescription>
              </div>
            </div>
          </div>
        </div>

        <!-- Designated Payday & Period Banner -->
        <div v-if="currentCutoff" class="mt-3 flex flex-wrap items-center justify-between gap-2 p-2 text-xs">
          <!-- Cutoff Period Selector & Quick Actions -->
          <div class="flex min-w-0 items-center gap-2">
            <span class="shrink-0 text-muted-foreground font-medium">
              Cutoff Window:
            </span>

            <div class="min-w-0 flex-1 sm:flex-none sm:w-58 !gap-1">
              <Select v-model="selectedCutoffId">
                <SelectTrigger class="h-8 w-full min-w-0 bg-background text-xs font-semibold">
                  <CalendarDays class="mr-1.5 size-3.5 shrink-0 text-primary" />
                  <SelectValue placeholder="Select Cutoff Period..." />
                </SelectTrigger>

                <SelectContent class="max-h-60 text-xs">
                  <SelectGroup>
                    <SelectItem
                      v-for="c in availableCutoffs"
                      :key="c.id"
                      :value="c.id"
                      class="cursor-pointer text-xs"
                    >
                      {{ c.label }}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              class="h-8 shrink-0 cursor-pointer gap-1.5 px-2.5 text-xs shadow-2xs"
              :disabled="isLoading || !selectedEmployee"
              @click="loadEmployeePayroll"
              title="Refresh attendance records from matrix"
            >
              <RefreshCw :class="['size-3.5', isLoading ? 'animate-spin' : '']" />
            </Button>

            <!-- Print / View Payslip -->
            <Button
              variant="outline"
              size="sm"
              class="h-8 gap-1.5 text-xs cursor-pointer shadow-2xs"
              :disabled="!currentRecord"
              @click="isPayslipViewOpen = true"
            >
              <Printer class="size-3.5 text-primary" />
            </Button>
          </div>
        </div>

        <!-- Notification Alerts -->
        <div v-if="saveSuccessMessage" class="mt-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 class="size-3.5 text-emerald-600 shrink-0" />
          <span>{{ saveSuccessMessage }}</span>
        </div>
        <div v-if="saveErrorMessage" class="mt-2 p-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
          <AlertCircle class="size-3.5 shrink-0" />
          <span>{{ saveErrorMessage }}</span>
        </div>
      </DialogHeader>

      <!-- Main Body Container -->
      <div class="flex-1 overflow-y-auto px-4 py-1 space-y-4">
        <!-- Case 1: No Employee Selected -->
        <div v-if="!selectedEmployee" class="p-8 text-center rounded-xl border border-dashed text-xs text-muted-foreground space-y-2">
          <User class="size-8 text-muted-foreground mx-auto opacity-50" />
          <p class="font-semibold text-foreground text-sm">No Employee Selected</p>
          <p>Please select an employee in the Attendance Matrix before opening Payroll Calculation.</p>
        </div>

        <!-- Case 2: Loading State -->
        <div v-else-if="isLoading" class="p-12 text-center text-xs text-muted-foreground space-y-2">
          <RefreshCw class="size-6 animate-spin mx-auto text-primary" />
          <p class="font-semibold text-foreground">Computing Semi-Monthly Payroll...</p>
          <p class="text-muted-foreground">Auditing duty punches, holiday premiums, and benefit deductions for {{ selectedEmployee.full_name }}.</p>
        </div>

        <!-- Case 3: Employee Payroll Ready -->
        <template v-else-if="currentRecord">
          <!-- 1. Employee Profile Card -->
          <div class="rounded-xl border bg-card p-3.5 sm:p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <Avatar class="size-12 border shadow-xs">
                <AvatarImage
                  v-if="selectedEmployee.photo"
                  :src="selectedEmployee.photo"
                  :alt="selectedEmployee.full_name"
                />
                <AvatarFallback class="bg-primary/10 text-primary font-bold text-sm">
                  {{ selectedEmployee.full_name.charAt(0) }}
                </AvatarFallback>
              </Avatar>

              <div class="space-y-0.5">
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 class="text-sm sm:text-base font-bold text-foreground">
                    {{ currentRecord.employeeName }}
                  </h2>
                  <!-- <Badge variant="outline" class="font-mono text-[10px] py-0 px-1.5 font-semibold">
                    ID: {{ currentRecord.employeeNumber }}
                  </Badge> -->
                  <Badge variant="secondary" class="text-[11px] py-0 px-1.5">
                    #{{ currentRecord.bioId }}
                  </Badge>
                </div>
                <div class="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span>{{ currentRecord.department }}</span>
                  <span>•</span>
                  <span>{{ currentRecord.position }}</span>
                  <span>•</span>
                  <span class="text-primary font-medium">{{ currentRecord.workGroupId }}</span>
                </div>
              </div>
            </div>

            <!-- Salary Configuration Status Pill -->
            <div class="flex items-center gap-2 self-start sm:self-auto">
              <div
                v-if="currentRecord.basicSalary > 0 || currentRecord.dailyRate > 0"
                class="px-3 py-1.5 rounded-lg border bg-muted/40 text-xs font-mono text-right"
              >
                <div class="text-[10px] uppercase text-muted-foreground font-semibold">
                  {{ currentRecord.salaryType }} Rate
                </div>
                <div class="font-bold text-foreground">
                  ₱{{ (currentRecord.basicSalary || currentRecord.dailyRate).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                  <span class="text-[10px] font-normal text-muted-foreground">
                    {{ currentRecord.salaryType === 'Monthly' ? '/mo' : '/day' }}
                  </span>
                </div>
              </div>
              <div
                v-else
                class="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-1.5"
              >
                <AlertTriangle class="size-4 shrink-0 text-amber-600" />
                <span class="font-medium">Unconfigured Salary</span>
              </div>
            </div>
          </div>

          <!-- Audit Warning / Flags Banner -->
          <div
            v-if="currentRecord.reviewReasons.length > 0 || currentRecord.attendanceReviewNotes.length > 0"
            class="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs space-y-1.5"
          >
            <div class="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
              <AlertTriangle class="size-4 text-amber-600 shrink-0" />
              <span>Requires HR Review & Audit:</span>
            </div>
            <ul class="list-disc list-inside space-y-0.5 text-[11px] pl-1 text-amber-800 dark:text-amber-300">
              <li v-for="(reason, idx) in currentRecord.reviewReasons" :key="`r-${idx}`">
                {{ reason }}
              </li>
              <li v-for="(note, idx) in currentRecord.attendanceReviewNotes" :key="`n-${idx}`">
                {{ note }}
              </li>
            </ul>
          </div>

          <!-- Stage A: Initial Earnings -->
          <div class="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
            <div class="flex items-center justify-between border-b pb-2">
              <div class="flex items-center gap-2">
                <span class="size-5 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                  A
                </span>
                <h3 class="text-xs font-bold uppercase tracking-wider text-foreground">
                  Initial Gross Earnings
                </h3>
              </div>
              <div class="text-xs font-mono font-bold text-primary">
                ₱{{ currentRecord.initialEarnings.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
              </div>
            </div>

            <!-- Attendance Days Metric Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 text-xs">
              <div class="p-2 rounded-lg border bg-muted/20">
                <span class="text-[10px] text-muted-foreground block">Scheduled</span>
                <span class="font-bold text-foreground font-mono text-sm">{{ currentRecord.scheduledDays }} days</span>
              </div>
              <div class="p-2 rounded-lg border bg-emerald-500/5 border-emerald-500/20">
                <span class="text-[10px] text-emerald-700 dark:text-emerald-400 block font-medium">Duty / Present</span>
                <span class="font-bold text-emerald-600 font-mono text-sm">{{ currentRecord.presentDays }} days</span>
              </div>
              <div class="p-2 rounded-lg border bg-amber-500/5 border-amber-500/20">
                <span class="text-[10px] text-amber-700 dark:text-amber-400 block font-medium">Sunday Duty (+30%)</span>
                <span class="font-bold text-amber-600 font-mono text-sm">{{ currentRecord.sundayWorkDays }} days</span>
              </div>
              <div class="p-2 rounded-lg border bg-amber-500/5 border-amber-500/20">
                <span class="text-[10px] text-amber-700 dark:text-amber-400 block font-medium">Holidays</span>
                <span class="font-bold text-amber-600 font-mono text-sm">{{ currentRecord.holidayDays }} days</span>
              </div>
              <div class="p-2 rounded-lg border bg-destructive/5 border-destructive/20">
                <span class="text-[10px] text-destructive block font-medium">Absences</span>
                <span class="font-bold text-destructive font-mono text-sm">{{ currentRecord.absentDays }} days</span>
              </div>
              <div class="p-2 rounded-lg border bg-muted/20">
                <span class="text-[10px] text-muted-foreground block">Late Tardy</span>
                <span class="font-bold text-foreground font-mono text-sm">{{ currentRecord.lateMinutes }} mins</span>
              </div>
              <div class="p-2 rounded-lg border" :class="(currentRecord.undertimeMinutes || 0) > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-muted/20'">
                <span class="text-[10px] block" :class="(currentRecord.undertimeMinutes || 0) > 0 ? 'text-amber-700 dark:text-amber-300 font-semibold' : 'text-muted-foreground'">Undertime</span>
                <span class="font-bold font-mono text-sm" :class="(currentRecord.undertimeMinutes || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'">{{ currentRecord.undertimeMinutes || 0 }} mins</span>
              </div>
            </div>

            <!-- Earnings Breakdown Lines -->
            <div class="space-y-1.5 pt-1 text-xs">
              <div class="flex justify-between items-center py-1 border-b text-muted-foreground">
                <span>Base Working Pay ({{ currentRecord.payableDays }} payable days):</span>
                <span class="font-mono font-medium text-foreground">
                  ₱{{ currentRecord.earningsBreakdown.basePay.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                </span>
              </div>
              <div v-if="currentRecord.earningsBreakdown.sundayDutyPay > 0" class="flex justify-between items-center py-1 border-b text-muted-foreground">
                <span>Sunday Duty Premium (+30% Philippine Labor Code):</span>
                <span class="font-mono font-medium text-foreground">
                  +₱{{ currentRecord.earningsBreakdown.sundayDutyPay.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                </span>
              </div>
              <div v-if="currentRecord.earningsBreakdown.holidayPay > 0" class="flex justify-between items-center py-1 border-b text-muted-foreground">
                <span>Holiday Duty Premium (Regular / Special):</span>
                <span class="font-mono font-medium text-foreground">
                  +₱{{ currentRecord.earningsBreakdown.holidayPay.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                </span>
              </div>
              <div v-if="currentRecord.earningsBreakdown.overtimePay > 0" class="flex justify-between items-center py-1 border-b text-muted-foreground">
                <span class="flex items-center gap-1.5">
                  <Clock class="size-3.5 text-indigo-600" />
                  <span>
                    Authorized Overtime Premium
                    <span class="text-[10px]">({{ currentRecord.overtimeHours }} qualifying hr{{ currentRecord.overtimeHours === 1 ? '' : 's' }})</span>
                  </span>
                </span>
                <span class="font-mono font-medium text-foreground">
                  +₱{{ currentRecord.earningsBreakdown.overtimePay.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                </span>
              </div>
              <div v-if="currentRecord.earningsBreakdown.allowances > 0" class="flex justify-between items-center py-1 border-b text-muted-foreground">
                <span>Semi-Monthly Allowances:</span>
                <span class="font-mono font-medium text-foreground">
                  +₱{{ currentRecord.earningsBreakdown.allowances.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                </span>
              </div>
              <div class="flex justify-between items-center pt-1 font-bold">
                <span class="text-foreground">Total Initial Gross Earnings:</span>
                <span class="font-mono text-sm text-primary">
                  ₱{{ currentRecord.initialEarnings.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                </span>
              </div>
            </div>
          </div>

          <!-- 2-Column Grid: Stage B & Stage C -->
          <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
            <!-- Stage B: Statutory Benefits & Loan Repayments -->
            <div class="md:col-span-2 rounded-xl border bg-card p-4 shadow-2xs space-y-3 flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between border-b pb-2">
                  <div class="flex items-center gap-2">
                    <span class="size-5 rounded-full bg-rose-500/10 text-rose-600 font-bold text-xs flex items-center justify-center">
                      B
                    </span>
                    <h3 class="text-xs font-bold uppercase tracking-wider text-foreground">
                      Contributions & Loans
                    </h3>
                  </div>
                  <div class="text-xs font-mono font-bold text-rose-600 dark:text-rose-400">
                    -₱{{ currentRecord.totalBenefitsAndLoans.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                  </div>
                </div>

                <!-- Editable Fields -->
                <div class="space-y-2.5 pt-2 text-xs">
                  <div class="flex items-center justify-between gap-2">
                    <label class="text-muted-foreground">SSS Contribution:</label>
                    <div class="relative w-32">
                      <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">₱</span>
                      <Input
                        v-model.number="currentRecord.sss"
                        type="number"
                        step="0.01"
                        min="0"
                        class="h-7 text-xs pl-6 text-right font-mono"
                        @input="onStatutoryChange"
                      />
                    </div>
                  </div>

                  <div class="flex items-center justify-between gap-2">
                    <label class="text-muted-foreground">PhilHealth Contribution:</label>
                    <div class="relative w-32">
                      <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">₱</span>
                      <Input
                        v-model.number="currentRecord.philhealth"
                        type="number"
                        step="0.01"
                        min="0"
                        class="h-7 text-xs pl-6 text-right font-mono"
                        @input="onStatutoryChange"
                      />
                    </div>
                  </div>

                  <div class="flex items-center justify-between gap-2">
                    <label class="text-muted-foreground">Pag-IBIG Contribution:</label>
                    <div class="relative w-32">
                      <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">₱</span>
                      <Input
                        v-model.number="currentRecord.pagibig"
                        type="number"
                        step="0.01"
                        min="0"
                        class="h-7 text-xs pl-6 text-right font-mono"
                        @input="onStatutoryChange"
                      />
                    </div>
                  </div>

                  <div class="flex items-center justify-between gap-2">
                    <label class="text-muted-foreground">SSS Loan Repayment:</label>
                    <div class="relative w-32">
                      <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">₱</span>
                      <Input
                        v-model.number="currentRecord.sssLoan"
                        type="number"
                        step="0.01"
                        min="0"
                        class="h-7 text-xs pl-6 text-right font-mono"
                        @input="onStatutoryChange"
                      />
                    </div>
                  </div>

                  <div class="flex items-center justify-between gap-2">
                    <label class="text-muted-foreground">Pag-IBIG Loan Repayment:</label>
                    <div class="relative w-32">
                      <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">₱</span>
                      <Input
                        v-model.number="currentRecord.pagibigLoan"
                        type="number"
                        step="0.01"
                        min="0"
                        class="h-7 text-xs pl-6 text-right font-mono"
                        @input="onStatutoryChange"
                      />
                    </div>
                  </div>

                  <div class="flex items-center justify-between gap-2">
                    <label class="text-muted-foreground">Other Company Loan:</label>
                    <div class="relative w-32">
                      <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">₱</span>
                      <Input
                        v-model.number="currentRecord.otherLoan"
                        type="number"
                        step="0.01"
                        min="0"
                        class="h-7 text-xs pl-6 text-right font-mono"
                        @input="onStatutoryChange"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <!-- Running Subtotal after Stage B -->
              <div class="pt-2 border-t flex justify-between items-center text-xs">
                <span class="text-muted-foreground">Balance after Benefits & Loans:</span>
                <span class="font-mono font-bold text-foreground">
                  ₱{{ currentRecord.balanceAfterBenefitsAndLoans.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                </span>
              </div>
            </div>

            <!-- Stage C: Cash Advance & Other Authorized Deductions -->
            <div class="md:col-span-3 rounded-xl border bg-card p-4 shadow-2xs space-y-3 flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between border-b pb-2">
                  <div class="flex items-center gap-2">
                    <span class="size-5 rounded-full bg-rose-500/10 text-rose-600 font-bold text-xs flex items-center justify-center">
                      C
                    </span>
                    <h3 class="text-xs font-bold uppercase tracking-wider text-foreground">
                      Cash Advance & Other Deductions
                    </h3>
                  </div>
                  <div class="text-xs font-mono font-bold text-rose-600 dark:text-rose-400">
                    -₱{{ (currentRecord.cashAdvance + currentRecord.totalOtherDeductions + (currentRecord.undertimeDeduction || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                  </div>
                </div>

                <!-- Undertime Deduction Entry (if any undertime accrued) -->
                <div
                  v-if="(currentRecord.undertimeDeduction || 0) > 0"
                  class="flex items-center justify-between gap-2 p-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs mb-2"
                >
                  <div class="min-w-0 flex-1 flex items-center gap-1.5 truncate">
                    <Badge variant="outline" class="text-[9px] py-0 px-1 font-mono uppercase shrink-0 border-amber-500/40 text-amber-700 dark:text-amber-300">
                      UNDERTIME
                    </Badge>
                    <span class="truncate font-medium text-foreground">
                      Undertime ({{ currentRecord.undertimeMinutes }}m / {{ (currentRecord.undertimeMinutes / 60).toFixed(1) }}h @ ₱{{ currentRecord.hourlyRate.toFixed(2) }}/hr)
                    </span>
                  </div>

                  <div class="flex items-center gap-2 shrink-0 font-mono font-bold text-rose-600 dark:text-rose-400">
                    -₱{{ currentRecord.undertimeDeduction.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                  </div>
                </div>

                <!-- Existing Itemized Entries List -->
                <div class="pt-2 space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  <div
                    v-if="(!currentRecord.itemizedDeductions || currentRecord.itemizedDeductions.length === 0) && (!currentRecord.undertimeDeduction || currentRecord.undertimeDeduction <= 0)"
                    class="py-4 text-center text-xs text-muted-foreground italic border rounded-lg bg-muted/10"
                  >
                    No cash advance or itemized deduction recorded for this cutoff.
                  </div>

                  <div
                    v-for="(item, idx) in currentRecord.itemizedDeductions"
                    :key="item.id || idx"
                    class="flex items-center justify-between gap-2 p-1.5 rounded-lg border bg-background text-xs"
                  >
                    <div class="min-w-0 flex-1 flex items-center gap-1.5 truncate">
                      <Badge variant="outline" class="text-[9px] py-0 px-1 font-mono uppercase shrink-0">
                        {{ item.category.replace('_', ' ') }}
                      </Badge>
                      <span class="truncate font-medium text-foreground">
                        {{ item.description }}
                      </span>
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                      <span class="font-mono font-semibold text-rose-600 dark:text-rose-400">
                        -₱{{ item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="size-6 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
                        title="Remove deduction"
                        @click="removeDeductionItem(idx)"
                      >
                        <Trash2 class="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                <!-- Add New Item Form -->
                <div class="mt-3 p-2.5 rounded-lg border bg-muted/20 space-y-2">
                  <span class="text-[10px] uppercase font-bold text-muted-foreground block">
                    Add Deduction Entry
                  </span>

                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Select v-model="newDeductionCategory">
                      <SelectTrigger class="!h-7 w-full min-w-0 m-0 p-0 px-2 text-xs bg-background">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent class="text-xs">
                        <SelectItem value="cash_advance">Cash Advance (CA)</SelectItem>
                        <SelectItem value="safety_boots">Safety Boots</SelectItem>
                        <SelectItem value="gloves">Gloves</SelectItem>
                        <SelectItem value="uniform">Uniform</SelectItem>
                        <SelectItem value="other">Other Authorized</SelectItem>
                      </SelectContent>
                    </Select>

                    <Input
                      v-model="newDeductionDescription"
                      placeholder="Description / note..."
                      class="h-7 min-w-0 w-full text-xs bg-background"
                    />

                    <div class="flex items-center gap-1.5 min-w-0">
                      <div class="relative flex-1 min-w-0">
                        <span class="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">₱</span>
                        <Input
                          v-model.number="newDeductionAmount"
                          type="number"
                          step="0.01"
                          placeholder="Amount"
                          class="h-7 w-full min-w-0 pl-5 text-xs bg-background font-mono"
                          @keydown.enter="addDeductionItem"
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        class="h-7 px-2.5 text-xs gap-1 cursor-pointer"
                        :disabled="!newDeductionAmount || Number(newDeductionAmount) <= 0"
                        @click="addDeductionItem"
                      >
                        <Plus class="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Running Subtotal after Stage C -->
              <div class="pt-2 border-t flex justify-between items-center text-xs">
                <span class="text-muted-foreground">Balance before Tax:</span>
                <span class="font-mono font-bold text-foreground">
                  ₱{{ currentRecord.balanceBeforeTax.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Stage D & Stage E Row -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Stage D: Withholding Tax (Manually Editable) -->
            <div class="rounded-xl border bg-card p-4 shadow-2xs space-y-3 flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between border-b pb-2">
                  <div class="flex items-center gap-2">
                    <span class="size-5 rounded-full bg-amber-500/10 text-amber-600 font-bold text-xs flex items-center justify-center">
                      D
                    </span>
                    <h3 class="text-xs font-bold uppercase tracking-wider text-foreground">
                      Withholding Tax
                    </h3>
                  </div>
                  <Badge variant="secondary" class="text-[10px] py-0 font-normal">
                    Manually Editable
                  </Badge>
                </div>

                <div class="pt-3 space-y-2 text-xs">
                  <div class="flex items-center justify-between gap-3">
                    <label class="font-medium text-foreground">
                      Withholding Tax Amount:
                    </label>
                    <div class="flex items-center gap-1.5">
                      <div class="relative w-36">
                        <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">₱</span>
                        <Input
                          v-model.number="currentRecord.withholdingTax"
                          type="number"
                          step="0.01"
                          min="0"
                          class="h-8 text-xs pl-6 text-right font-mono font-bold text-amber-700 dark:text-amber-300"
                          @input="onTaxChange"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="h-8 px-2 text-[11px] text-muted-foreground cursor-pointer"
                        title="Clear tax to 0"
                        @click="clearTax"
                      >
                        Zero
                      </Button>
                    </div>
                  </div>

                  <p class="text-[11px] text-muted-foreground leading-relaxed pt-1">
                    Entered manually by authorized payroll staff based on BIR graduated withholding tax brackets or exemption certificate. No fixed tax is applied automatically.
                  </p>
                </div>
              </div>

              <div class="pt-2 border-t flex justify-between items-center text-xs">
                <span class="text-muted-foreground">Withholding Tax Deducted:</span>
                <span class="font-mono font-bold text-amber-600 dark:text-amber-400">
                  -₱{{ currentRecord.withholdingTax.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                </span>
              </div>
            </div>

            <!-- Stage E: Final Net Pay Highlight Card -->
            <div class="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-2xs space-y-3 flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                  <div class="flex items-center gap-2">
                    <span class="size-5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center justify-center">
                      E
                    </span>
                    <h3 class="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                      Final Net Take-Home Pay
                    </h3>
                  </div>

                  <Badge
                    :variant="currentRecord.reviewStatus === 'needs_review' ? 'destructive' : 'default'"
                    class="text-[10px] py-0 uppercase font-semibold"
                  >
                    {{ currentRecord.reviewStatus.replace('_', ' ') }}
                  </Badge>
                </div>

                <!-- Big Net Pay Display -->
                <div class="py-3 text-center space-y-1">
                  <span class="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold block">
                    Calculated Net Pay
                  </span>
                  <div
                    class="text-2xl sm:text-3xl font-black font-mono tracking-tight"
                    :class="currentRecord.netPay < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'"
                  >
                    ₱{{ currentRecord.netPay.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                  </div>
                  <div class="text-[11px] text-muted-foreground">
                    Payday on <strong class="text-foreground">{{ currentCutoff?.paydayDisplay }}</strong>
                  </div>
                </div>

                <!-- Compact Summary Line -->
                <div class="text-[11px] text-muted-foreground space-y-1 border-t border-emerald-500/20 pt-2">
                  <div class="flex justify-between">
                    <span>Initial Earnings:</span>
                    <span class="font-mono text-foreground">+₱{{ currentRecord.initialEarnings.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Total Deductions:</span>
                    <span class="font-mono text-rose-600 dark:text-rose-400">
                      -₱{{ (currentRecord.totalBenefitsAndLoans + currentRecord.cashAdvance + currentRecord.totalOtherDeductions + currentRecord.withholdingTax).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Snapshot Status Badge -->
              <div class="pt-2 border-t border-emerald-500/20 flex justify-between items-center text-xs">
                <span class="text-muted-foreground">Database Snapshot:</span>
                <span class="font-mono uppercase font-semibold text-[10px] text-foreground">
                  {{ currentRecord.batchStatus }}
                </span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Modal Footer Action Bar -->
      <DialogFooter class="px-5 py-3 border-t bg-muted/20 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div class="flex items-center gap-2">   
          <span v-if="currentRecord" class="text-[11px] text-muted-foreground font-mono hidden sm:inline">
            Updated: {{ new Date(currentRecord.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            class="h-8 text-xs cursor-pointer"
            @click="emit('update:open', false)"
          >
            Close
          </Button>

          <!-- Save Snapshot as Draft -->
          <Button
            variant="outline"
            size="sm"
            class="h-8 gap-1.5 text-xs cursor-pointer shadow-2xs"
            :disabled="isSaving || !currentRecord"
            @click="saveRecord('draft')"
          >
            <Save class="size-3.5 text-muted-foreground" />
            <span>Save Draft</span>
          </Button>

          <!-- Approve / Finalize Snapshot -->
          <Button
            variant="default"
            size="sm"
            class="h-8 gap-1.5 text-xs cursor-pointer shadow-xs"
            :disabled="isSaving || !currentRecord"
            @click="saveRecord('finalized')"
          >
            <ShieldCheck class="size-3.5" />
            <span>Finalize Snapshot</span>
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Individual Printable Payslip Modal -->
  <Dialog :open="isPayslipViewOpen" @update:open="(val) => isPayslipViewOpen = val">
    <DialogContent class="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl border shadow-2xl">
      <DialogHeader class="px-5 py-3 border-b bg-card shrink-0 flex flex-row items-center justify-between">
        <div>
          <DialogTitle class="text-base font-bold text-foreground flex items-center gap-2">
            <FileText class="size-4 text-primary" />
            <span>Official Employee Payslip</span>
          </DialogTitle>
          <DialogDescription class="text-xs text-muted-foreground">
            Printable semi-monthly payslip voucher for {{ currentRecord?.employeeName }}.
          </DialogDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="h-8 gap-1.5 text-xs cursor-pointer mr-6"
          @click="triggerPrint"
        >
          <Printer class="size-3.5" />
          <span>Print Voucher</span>
        </Button>
      </DialogHeader>

      <div v-if="currentRecord && currentCutoff" class="flex-1 overflow-y-auto p-6 space-y-4 print:p-0 text-xs text-foreground bg-background">
        <!-- Printable Payslip Header -->
        <div class="border-b pb-3 text-center space-y-1">
          <h2 class="text-base font-black tracking-wide uppercase text-foreground">
            DMBB HOLDINGS INC. — HUMAN RESOURCES
          </h2>
          <p class="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">
            Confidential Semi-Monthly Employee Payslip
          </p>
          <div class="flex justify-center items-center gap-4 text-xs font-medium pt-1">
            <span>Cut-Off Period: <strong>{{ currentCutoff.label }}</strong></span>
            <span>•</span>
            <span>Payday: <strong class="text-emerald-700 dark:text-emerald-400">{{ currentCutoff.paydayDisplay }}</strong></span>
          </div>
        </div>

        <!-- Employee Info Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg border bg-muted/20 font-mono text-[11px]">
          <div>
            <span class="text-muted-foreground block text-[10px] uppercase font-sans">Employee Name</span>
            <strong class="text-foreground text-xs">{{ currentRecord.employeeName }}</strong>
          </div>
          <div>
            <span class="text-muted-foreground block text-[10px] uppercase font-sans">Employee / Bio ID</span>
            <strong class="text-foreground">#{{ currentRecord.employeeNumber }}</strong>
          </div>
          <div>
            <span class="text-muted-foreground block text-[10px] uppercase font-sans">Department</span>
            <strong class="text-foreground">{{ currentRecord.department }}</strong>
          </div>
          <div>
            <span class="text-muted-foreground block text-[10px] uppercase font-sans">Position / Group</span>
            <strong class="text-foreground">{{ currentRecord.position }}</strong>
          </div>
        </div>

        <!-- Earnings & Deductions Tables -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Earnings Column -->
          <div class="border rounded-lg p-3 space-y-2">
            <h4 class="font-bold uppercase tracking-wider text-[11px] text-primary border-b pb-1">
              Gross Earnings
            </h4>
            <div class="space-y-1.5 font-mono text-xs">
              <div class="flex justify-between">
                <span>Basic Wage ({{ currentRecord.payableDays }} days):</span>
                <span>₱{{ currentRecord.earningsBreakdown.basePay.toFixed(2) }}</span>
              </div>
              <div v-if="currentRecord.earningsBreakdown.sundayDutyPay > 0" class="flex justify-between">
                <span>Sunday Duty (+30%):</span>
                <span>₱{{ currentRecord.earningsBreakdown.sundayDutyPay.toFixed(2) }}</span>
              </div>
              <div v-if="currentRecord.earningsBreakdown.holidayPay > 0" class="flex justify-between">
                <span>Holiday Duty:</span>
                <span>₱{{ currentRecord.earningsBreakdown.holidayPay.toFixed(2) }}</span>
              </div>
              <div v-if="currentRecord.earningsBreakdown.overtimePay > 0" class="flex justify-between">
                <span>Authorized Overtime:</span>
                <span>₱{{ currentRecord.earningsBreakdown.overtimePay.toFixed(2) }}</span>
              </div>
              <div v-if="currentRecord.earningsBreakdown.allowances > 0" class="flex justify-between">
                <span>Allowances:</span>
                <span>₱{{ currentRecord.earningsBreakdown.allowances.toFixed(2) }}</span>
              </div>
            </div>
            <div class="border-t pt-1.5 flex justify-between font-bold text-xs">
              <span>Total Gross:</span>
              <span class="text-primary font-mono">₱{{ currentRecord.initialEarnings.toFixed(2) }}</span>
            </div>
          </div>

          <!-- Deductions Column -->
          <div class="border rounded-lg p-3 space-y-2">
            <h4 class="font-bold uppercase tracking-wider text-[11px] text-rose-600 dark:text-rose-400 border-b pb-1">
              Authorized Deductions
            </h4>
            <div class="space-y-1 font-mono text-xs max-h-36 overflow-y-auto">
              <div v-if="currentRecord.sss > 0" class="flex justify-between">
                <span>SSS:</span>
                <span>-₱{{ currentRecord.sss.toFixed(2) }}</span>
              </div>
              <div v-if="currentRecord.philhealth > 0" class="flex justify-between">
                <span>PhilHealth:</span>
                <span>-₱{{ currentRecord.philhealth.toFixed(2) }}</span>
              </div>
              <div v-if="currentRecord.pagibig > 0" class="flex justify-between">
                <span>Pag-IBIG:</span>
                <span>-₱{{ currentRecord.pagibig.toFixed(2) }}</span>
              </div>
              <div v-if="currentRecord.sssLoan > 0" class="flex justify-between">
                <span>SSS Loan:</span>
                <span>-₱{{ currentRecord.sssLoan.toFixed(2) }}</span>
              </div>
              <div v-if="currentRecord.pagibigLoan > 0" class="flex justify-between">
                <span>Pag-IBIG Loan:</span>
                <span>-₱{{ currentRecord.pagibigLoan.toFixed(2) }}</span>
              </div>
              <div v-if="currentRecord.otherLoan > 0" class="flex justify-between">
                <span>Other Loan:</span>
                <span>-₱{{ currentRecord.otherLoan.toFixed(2) }}</span>
              </div>
              <div v-if="(currentRecord.undertimeDeduction || 0) > 0" class="flex justify-between text-amber-700 dark:text-amber-400">
                <span>Undertime ({{ currentRecord.undertimeMinutes }}m):</span>
                <span>-₱{{ currentRecord.undertimeDeduction.toFixed(2) }}</span>
              </div>
              <div v-for="d in currentRecord.itemizedDeductions" :key="d.id" class="flex justify-between text-[11px]">
                <span class="truncate max-w-[140px]">{{ d.description }}:</span>
                <span>-₱{{ d.amount.toFixed(2) }}</span>
              </div>
              <div v-if="currentRecord.withholdingTax > 0" class="flex justify-between text-amber-700 dark:text-amber-400">
                <span>Withholding Tax:</span>
                <span>-₱{{ currentRecord.withholdingTax.toFixed(2) }}</span>
              </div>
            </div>
            <div class="border-t pt-1.5 flex justify-between font-bold text-xs">
              <span>Total Deductions:</span>
              <span class="text-rose-600 dark:text-rose-400 font-mono">
                -₱{{ (currentRecord.totalBenefitsAndLoans + currentRecord.cashAdvance + currentRecord.totalOtherDeductions + (currentRecord.undertimeDeduction || 0) + currentRecord.withholdingTax).toFixed(2) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Net Take Home Pay Highlight -->
        <div class="p-3.5 rounded-lg border-2 border-emerald-500/40 bg-emerald-500/10 flex items-center justify-between">
          <div>
            <span class="text-[10px] uppercase font-bold tracking-wider text-emerald-800 dark:text-emerald-300 block">
              Net Amount Received
            </span>
            <span class="text-xs text-muted-foreground">
              Direct transfer / Cash envelope
            </span>
          </div>
          <div class="text-xl sm:text-2xl font-black font-mono text-emerald-700 dark:text-emerald-400">
            ₱{{ currentRecord.netPay.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
          </div>
        </div>

        <!-- Signatures & Acknowledgment -->
        <div class="grid grid-cols-2 gap-8 pt-8 border-t text-[11px]">
          <div class="border-t border-muted-foreground/40 pt-1 text-center">
            <span class="text-muted-foreground block">Prepared & Audited By</span>
            <strong class="text-foreground">Human Resources / Payroll Officer</strong>
          </div>
          <div class="border-t border-muted-foreground/40 pt-1 text-center">
            <span class="text-muted-foreground block">Received By (Employee Signature)</span>
            <strong class="text-foreground">{{ currentRecord.employeeName }}</strong>
          </div>
        </div>
      </div>

      <DialogFooter class="px-5 py-2.5 border-t bg-muted/20">
        <Button variant="ghost" size="sm" class="h-8 text-xs cursor-pointer" @click="isPayslipViewOpen = false">
          Close Preview
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
