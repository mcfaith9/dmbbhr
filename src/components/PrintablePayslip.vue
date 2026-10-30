<script setup lang="ts">
import { ref } from 'vue'
import type { EmployeePayrollRecord, PayrollCutoffPeriod } from '@/services/payrollCalculation'

const props = withDefaults(
  defineProps<{
    record: EmployeePayrollRecord
    cutoff: PayrollCutoffPeriod
    companyName?: string
    companySubtitle?: string
    logoUrl?: string
  }>(),
  {
    companyName: 'DMBB Industrial Services',
    companySubtitle: 'Human Resources & Payroll',
    logoUrl: '/dmbblogo.png'
  }
)

const isPrinting = ref(false)

async function print() {
  if (isPrinting.value) return
  isPrinting.value = true
  try {
    window.print()
  } finally {
    isPrinting.value = false
  }
}

defineExpose({
  print,
  isPrinting
})

function formatCurrency(val?: number) {
  if (val === undefined || val === null || isNaN(val)) return '₱0.00'
  return `₱${val.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
</script>

<template>
  <div id="printable-payslip" class="printable-payslip-root p-6 bg-white text-neutral-900 font-sans text-xs max-w-lg mx-auto">
    <!-- Header -->
    <div class="border-b pb-3 mb-4 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <img
          v-if="logoUrl"
          :src="logoUrl"
          alt="Company Logo"
          class="h-10 w-10 object-contain rounded"
          @error="($event.target as HTMLElement).style.display = 'none'"
        />
        <div>
          <h2 class="text-sm font-bold uppercase tracking-wider text-neutral-900">{{ companyName }}</h2>
          <p class="text-[11px] text-neutral-500">{{ companySubtitle }}</p>
        </div>
      </div>
      <div class="text-right">
        <span class="inline-block bg-neutral-100 text-neutral-800 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border border-neutral-300">
          Payslip
        </span>
        <p class="text-[10px] text-neutral-500 mt-1">Payday: <strong class="text-neutral-800">{{ cutoff.paydayDisplay || record.payday }}</strong></p>
      </div>
    </div>

    <!-- Employee & Cutoff Summary -->
    <div class="grid grid-cols-2 gap-2 p-2.5 bg-neutral-50 border border-neutral-200 rounded mb-4 text-[11px]">
      <div>
        <span class="text-neutral-500">Employee:</span>
        <div class="font-bold text-neutral-900">{{ record.employeeName }}</div>
        <div class="text-[10px] text-neutral-600">ID: {{ record.bioId }} • Dept: {{ record.department }}</div>
      </div>
      <div class="text-right">
        <span class="text-neutral-500">Cutoff Period:</span>
        <div class="font-semibold text-neutral-900">{{ cutoff.shortLabel || record.periodId }}</div>
        <div class="text-[10px] text-neutral-600">
          Wage: {{ formatCurrency(record.dailyRate || record.basicSalary) }}
          <span class="text-[9px]">({{ record.salaryType }})</span>
        </div>
      </div>
    </div>

    <!-- Attendance Breakdown -->
    <div class="border border-neutral-200 rounded p-2.5 mb-3 bg-neutral-50/50">
      <div class="text-[10px] font-bold uppercase text-neutral-500 tracking-wider mb-1.5">Attendance Summary</div>
      <div class="grid grid-cols-4 gap-2 text-center text-[10px]">
        <div class="p-1 rounded bg-white border border-neutral-200">
          <div class="text-neutral-500">Days Paid</div>
          <div class="font-bold text-neutral-800">{{ record.payableDays }}</div>
        </div>
        <div class="p-1 rounded bg-white border border-neutral-200">
          <div class="text-neutral-500">OT (Hours)</div>
          <div class="font-bold text-neutral-800">{{ record.overtimeHours }}h</div>
        </div>
        <div class="p-1 rounded bg-white border border-neutral-200">
          <div class="text-neutral-500">Undertime</div>
          <div class="font-bold text-neutral-800">{{ record.undertimeMinutes }}m</div>
        </div>
        <div class="p-1 rounded bg-white border border-neutral-200">
          <div class="text-neutral-500">Late (Mins)</div>
          <div class="font-bold text-neutral-800">{{ record.lateMinutes }}m</div>
        </div>
      </div>
    </div>

    <!-- Earnings & Deductions Grid -->
    <div class="grid grid-cols-2 gap-3 mb-4">
      <!-- Earnings -->
      <div class="border border-neutral-200 rounded p-2.5">
        <div class="font-bold text-[11px] uppercase text-neutral-700 border-b border-neutral-200 pb-1 mb-2">Earnings</div>
        <div class="space-y-1 text-[11px]">
          <div class="flex justify-between">
            <span class="text-neutral-600">Base Pay:</span>
            <span class="font-medium">{{ formatCurrency(record.earningsBreakdown?.basePay) }}</span>
          </div>
          <div v-if="record.earningsBreakdown?.overtimePay > 0" class="flex justify-between">
            <span class="text-neutral-600">Overtime:</span>
            <span class="font-medium text-emerald-700">+{{ formatCurrency(record.earningsBreakdown?.overtimePay) }}</span>
          </div>
          <div v-if="record.earningsBreakdown?.holidayPay > 0" class="flex justify-between">
            <span class="text-neutral-600">Holiday Pay:</span>
            <span class="font-medium text-emerald-700">+{{ formatCurrency(record.earningsBreakdown?.holidayPay) }}</span>
          </div>
          <div v-if="record.earningsBreakdown?.sundayDutyPay > 0" class="flex justify-between">
            <span class="text-neutral-600">Rest Day Duty:</span>
            <span class="font-medium text-emerald-700">+{{ formatCurrency(record.earningsBreakdown?.sundayDutyPay) }}</span>
          </div>
          <div v-if="record.earningsBreakdown?.allowances > 0" class="flex justify-between">
            <span class="text-neutral-600">Allowances:</span>
            <span class="font-medium text-emerald-700">+{{ formatCurrency(record.earningsBreakdown?.allowances) }}</span>
          </div>
          <div class="border-t border-neutral-200 pt-1.5 mt-1.5 flex justify-between font-bold text-neutral-900">
            <span>Gross Earnings:</span>
            <span>{{ formatCurrency(record.initialEarnings) }}</span>
          </div>
        </div>
      </div>

      <!-- Deductions -->
      <div class="border border-neutral-200 rounded p-2.5">
        <div class="font-bold text-[11px] uppercase text-neutral-700 border-b border-neutral-200 pb-1 mb-2">Deductions</div>
        <div class="space-y-1 text-[11px]">
          <div v-if="record.undertimeDeduction > 0" class="flex justify-between">
            <span class="text-neutral-600">Undertime:</span>
            <span class="font-medium text-red-600">-{{ formatCurrency(record.undertimeDeduction) }}</span>
          </div>
          <div v-if="record.sss > 0" class="flex justify-between">
            <span class="text-neutral-600">SSS:</span>
            <span class="font-medium text-neutral-800">{{ formatCurrency(record.sss) }}</span>
          </div>
          <div v-if="record.philhealth > 0" class="flex justify-between">
            <span class="text-neutral-600">PhilHealth:</span>
            <span class="font-medium text-neutral-800">{{ formatCurrency(record.philhealth) }}</span>
          </div>
          <div v-if="record.pagibig > 0" class="flex justify-between">
            <span class="text-neutral-600">Pag-IBIG:</span>
            <span class="font-medium text-neutral-800">{{ formatCurrency(record.pagibig) }}</span>
          </div>
          <div v-if="record.sssLoan > 0 || record.pagibigLoan > 0 || record.otherLoan > 0" class="flex justify-between">
            <span class="text-neutral-600">Loans:</span>
            <span class="font-medium text-neutral-800">{{ formatCurrency((record.sssLoan || 0) + (record.pagibigLoan || 0) + (record.otherLoan || 0)) }}</span>
          </div>
          <div v-if="record.cashAdvance > 0" class="flex justify-between">
            <span class="text-neutral-600">Cash Advance:</span>
            <span class="font-medium text-neutral-800">{{ formatCurrency(record.cashAdvance) }}</span>
          </div>
          <div v-if="record.totalOtherDeductions > 0" class="flex justify-between">
            <span class="text-neutral-600">Other Deductions:</span>
            <span class="font-medium text-neutral-800">{{ formatCurrency(record.totalOtherDeductions) }}</span>
          </div>
          <div v-if="record.withholdingTax > 0" class="flex justify-between">
            <span class="text-neutral-600">Withholding Tax:</span>
            <span class="font-medium text-neutral-800">{{ formatCurrency(record.withholdingTax) }}</span>
          </div>
          <div class="border-t border-neutral-200 pt-1.5 mt-1.5 flex justify-between font-bold text-neutral-900">
            <span>Total Deductions:</span>
            <span class="text-red-700">
              {{ formatCurrency((record.initialEarnings || 0) - (record.netPay || 0)) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Final Net Pay Highlight -->
    <div class="p-3 bg-neutral-900 text-white rounded flex items-center justify-between mb-4">
      <span class="font-bold uppercase tracking-wider text-xs">Net Pay</span>
      <span class="font-mono font-bold text-base">{{ formatCurrency(record.netPay) }}</span>
    </div>

    <!-- Signatures -->
    <div class="grid grid-cols-2 gap-6 pt-4 border-t border-dashed border-neutral-300 text-center text-[10px] text-neutral-600">
      <div>
        <div class="h-8 border-b border-neutral-400 mb-1"></div>
        <span>Prepared By / HR Representative</span>
      </div>
      <div>
        <div class="h-8 border-b border-neutral-400 mb-1"></div>
        <span>Employee Signature / Received By</span>
      </div>
    </div>
  </div>
</template>
