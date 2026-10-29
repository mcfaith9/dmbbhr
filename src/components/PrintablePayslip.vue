<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
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

const activeLogoUrl = ref(props.logoUrl)
const isPrinting = ref(false)

function onLogoError() {
  // If primary logo fails, gracefully try alternate /dbblogo.png
  if (activeLogoUrl.value !== '/dbblogo.png') {
    activeLogoUrl.value = '/dbblogo.png'
  }
}

// Compute total deductions purely from the parent-supplied payroll record
const totalDeductions = computed(() => {
  const r = props.record
  return Math.round(
    ((r.totalBenefitsAndLoans || 0) +
      (r.cashAdvance || 0) +
      (r.totalOtherDeductions || 0) +
      (r.undertimeDeduction || 0) +
      (r.withholdingTax || 0)) * 100
  ) / 100
})

/**
 * Preloads the logo image and triggers the Windows browser print dialog.
 * Exposed to parent components for clean integration.
 */
async function print(): Promise<void> {
  if (isPrinting.value) return
  isPrinting.value = true

  try {
    // 1. Ensure logo image is fully decoded before opening print dialog
    await new Promise<void>((resolve) => {
      const img = new Image()
      img.onload = () => resolve()
      img.onerror = () => resolve()
      img.src = activeLogoUrl.value
      if (img.complete) {
        resolve()
      }
    })

    // 2. Allow DOM to settle
    await nextTick()

    // 3. Open browser print dialog
    window.print()
  } finally {
    isPrinting.value = false
  }
}

defineExpose({
  print,
  isPrinting
})
</script>

<template>
  <div id="printable-payslip" class="printable-payslip-root bg-white text-neutral-900 font-sans p-5 sm:p-6 print:p-0">
    <!-- ================================================================= -->
    <!-- 1. COMPANY HEADER & IDENTIFICATION -->
    <!-- ================================================================= -->
    <header class="border-b border-neutral-300 pb-3 mb-3 print:pb-2 print:mb-2">
      <div class="flex items-center justify-between gap-3">
        <!-- Logo and Company Details -->
        <div class="flex items-center gap-3">
          <img
            :src="activeLogoUrl"
            :alt="companyName"
            class="h-12 w-auto max-w-[64px] object-contain shrink-0 print:h-11"
            crossorigin="anonymous"
            @error="onLogoError"
          />
          <div class="text-left">
            <h1 class="text-sm sm:text-base font-bold tracking-tight text-neutral-900 uppercase leading-snug">
              {{ companyName }}
            </h1>
            <p class="text-[10.5px] text-neutral-600 uppercase tracking-wider font-medium">
              {{ companySubtitle }}
            </p>
          </div>
        </div>

        <!-- Document Type & Reference -->
        <div class="text-right shrink-0">
          <div class="text-[11px] font-bold text-neutral-800 tracking-wide uppercase">
            Payslip Voucher
          </div>
          <p class="text-[9.5px] font-mono text-neutral-500 pt-0.5">
            Ref: {{ record.id }}
          </p>
        </div>
      </div>

      <!-- Cutoff Period and Payday Row -->
      <div class="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-neutral-200 text-xs">
        <div class="flex items-center gap-1.5">
          <span class="text-neutral-500 text-[10px] uppercase tracking-wider">Payroll Period:</span>
          <span class="font-mono font-semibold text-neutral-900 text-[11px]">{{ cutoff.label }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-neutral-500 text-[10px] uppercase tracking-wider">Payday:</span>
          <span class="font-mono font-semibold text-neutral-900 text-[11px]">{{ cutoff.paydayDisplay }}</span>
        </div>
      </div>
    </header>

    <!-- ================================================================= -->
    <!-- 2. EMPLOYEE INFORMATION -->
    <!-- ================================================================= -->
    <section class="border border-neutral-300 rounded-md p-2.5 mb-3 bg-neutral-50/60 print:bg-transparent print:p-2 print:mb-2 text-[11px] font-mono">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <span class="text-[9px] text-neutral-500 uppercase font-sans tracking-wider block">Employee Name</span>
          <span class="font-bold text-neutral-900 text-xs block truncate">{{ record.employeeName }}</span>
        </div>
        <div>
          <span class="text-[9px] text-neutral-500 uppercase font-sans tracking-wider block">Employee / Bio ID</span>
          <span class="font-bold text-neutral-900 block">#{{ record.employeeNumber }}</span>
        </div>
        <div>
          <span class="text-[9px] text-neutral-500 uppercase font-sans tracking-wider block">Position / Department</span>
          <span class="font-semibold text-neutral-900 block truncate">{{ record.position }}</span>
          <span class="text-[10px] text-neutral-600 block truncate">{{ record.department }}</span>
        </div>
        <div>
          <span class="text-[9px] text-neutral-500 uppercase font-sans tracking-wider block">Salary Rate / Schedule</span>
          <span class="font-semibold text-neutral-900 block">
            <template v-if="record.salaryType === 'Daily' && record.dailyRate > 0">
              ₱{{ record.dailyRate.toFixed(2) }}/day (Daily)
            </template>
            <template v-else-if="record.salaryType === 'Monthly' && record.basicSalary > 0">
              ₱{{ record.basicSalary.toFixed(2) }}/mo (Monthly)
            </template>
            <template v-else-if="record.salaryType === 'Hourly' && record.hourlyRate > 0">
              ₱{{ record.hourlyRate.toFixed(2) }}/hr (Hourly)
            </template>
            <template v-else>
              {{ record.salaryType }}
            </template>
          </span>
          <span class="text-[10px] text-neutral-600 block">
            {{ record.payableDays }} payable day{{ record.payableDays === 1 ? '' : 's' }}
          </span>
        </div>
      </div>
    </section>

    <!-- ================================================================= -->
    <!-- 3. EARNINGS & DEDUCTIONS BREAKDOWN (SIDE-BY-SIDE) -->
    <!-- ================================================================= -->
    <section class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 print:gap-2.5 print:mb-2">
      <!-- Earnings Column -->
      <div class="border border-neutral-300 rounded-md p-2.5 flex flex-col justify-between print:p-2">
        <div>
          <div class="flex items-center justify-between border-b border-neutral-200 pb-1 mb-1.5">
            <h2 class="text-[10.5px] font-bold uppercase tracking-wider text-neutral-900">
              Gross Earnings
            </h2>
            <span class="text-[9px] text-neutral-500 uppercase font-sans">Credit</span>
          </div>

          <div class="space-y-1 font-mono text-[11px]">
            <div class="flex justify-between py-0.5 border-b border-neutral-100">
              <span class="text-neutral-600 font-sans">Basic Wage ({{ record.payableDays }} days):</span>
              <span class="font-medium text-neutral-900">₱{{ record.earningsBreakdown.basePay.toFixed(2) }}</span>
            </div>
            <div v-if="record.earningsBreakdown.sundayDutyPay > 0" class="flex justify-between py-0.5 border-b border-neutral-100">
              <span class="text-neutral-600 font-sans">Sunday Duty (+30%):</span>
              <span class="font-medium text-neutral-900">₱{{ record.earningsBreakdown.sundayDutyPay.toFixed(2) }}</span>
            </div>
            <div v-if="record.earningsBreakdown.holidayPay > 0" class="flex justify-between py-0.5 border-b border-neutral-100">
              <span class="text-neutral-600 font-sans">Holiday Duty:</span>
              <span class="font-medium text-neutral-900">₱{{ record.earningsBreakdown.holidayPay.toFixed(2) }}</span>
            </div>
            <div v-if="record.earningsBreakdown.overtimePay > 0" class="flex justify-between py-0.5 border-b border-neutral-100">
              <span class="text-neutral-600 font-sans">Authorized Overtime ({{ record.overtimeHours }}h):</span>
              <span class="font-medium text-neutral-900">₱{{ record.earningsBreakdown.overtimePay.toFixed(2) }}</span>
            </div>
            <div v-if="record.earningsBreakdown.allowances > 0" class="flex justify-between py-0.5 border-b border-neutral-100">
              <span class="text-neutral-600 font-sans">Allowances:</span>
              <span class="font-medium text-neutral-900">₱{{ record.earningsBreakdown.allowances.toFixed(2) }}</span>
            </div>
          </div>
        </div>

        <!-- Total Gross -->
        <div class="border-t border-neutral-300 pt-1.5 mt-2 flex justify-between items-center text-xs bg-neutral-50 px-2 py-1 rounded print:bg-transparent">
          <span class="font-bold uppercase tracking-wider text-[10px] text-neutral-700">Total Gross:</span>
          <span class="font-mono font-bold text-neutral-900 text-xs">₱{{ record.initialEarnings.toFixed(2) }}</span>
        </div>
      </div>

      <!-- Deductions Column -->
      <div class="border border-neutral-300 rounded-md p-2.5 flex flex-col justify-between print:p-2">
        <div>
          <div class="flex items-center justify-between border-b border-neutral-200 pb-1 mb-1.5">
            <h2 class="text-[10.5px] font-bold uppercase tracking-wider text-neutral-900">
              Authorized Deductions
            </h2>
            <span class="text-[9px] text-neutral-500 uppercase font-sans">Debit</span>
          </div>

          <div class="space-y-1 font-mono text-[11px] max-h-48 overflow-y-auto print:max-h-none print:overflow-visible">
            <div v-if="record.sss > 0" class="flex justify-between py-0.5 border-b border-neutral-100">
              <span class="text-neutral-600 font-sans">SSS Contribution:</span>
              <span class="text-neutral-900">-₱{{ record.sss.toFixed(2) }}</span>
            </div>
            <div v-if="record.philhealth > 0" class="flex justify-between py-0.5 border-b border-neutral-100">
              <span class="text-neutral-600 font-sans">PhilHealth Contribution:</span>
              <span class="text-neutral-900">-₱{{ record.philhealth.toFixed(2) }}</span>
            </div>
            <div v-if="record.pagibig > 0" class="flex justify-between py-0.5 border-b border-neutral-100">
              <span class="text-neutral-600 font-sans">Pag-IBIG Contribution:</span>
              <span class="text-neutral-900">-₱{{ record.pagibig.toFixed(2) }}</span>
            </div>
            <div v-if="record.sssLoan > 0" class="flex justify-between py-0.5 border-b border-neutral-100">
              <span class="text-neutral-600 font-sans">SSS Loan Repayment:</span>
              <span class="text-neutral-900">-₱{{ record.sssLoan.toFixed(2) }}</span>
            </div>
            <div v-if="record.pagibigLoan > 0" class="flex justify-between py-0.5 border-b border-neutral-100">
              <span class="text-neutral-600 font-sans">Pag-IBIG Loan Repayment:</span>
              <span class="text-neutral-900">-₱{{ record.pagibigLoan.toFixed(2) }}</span>
            </div>
            <div v-if="record.otherLoan > 0" class="flex justify-between py-0.5 border-b border-neutral-100">
              <span class="text-neutral-600 font-sans">Other Company Loan:</span>
              <span class="text-neutral-900">-₱{{ record.otherLoan.toFixed(2) }}</span>
            </div>
            <div v-if="(record.undertimeDeduction || 0) > 0" class="flex justify-between py-0.5 border-b border-neutral-100">
              <span class="text-neutral-600 font-sans">Undertime ({{ record.undertimeMinutes }}m):</span>
              <span class="text-neutral-900">-₱{{ record.undertimeDeduction.toFixed(2) }}</span>
            </div>
            <div v-for="d in record.itemizedDeductions" :key="d.id" class="flex justify-between py-0.5 border-b border-neutral-100 text-[10.5px]">
              <span class="truncate max-w-[145px] text-neutral-600 font-sans">{{ d.description }}:</span>
              <span class="text-neutral-900">-₱{{ d.amount.toFixed(2) }}</span>
            </div>
            <div v-if="record.withholdingTax > 0" class="flex justify-between py-0.5 border-b border-neutral-100">
              <span class="text-neutral-600 font-sans">Withholding Tax (BIR):</span>
              <span class="text-neutral-900">-₱{{ record.withholdingTax.toFixed(2) }}</span>
            </div>
            <div v-if="totalDeductions === 0" class="text-center py-2 text-neutral-400 font-sans text-[10.5px] italic">
              No deductions applied.
            </div>
          </div>
        </div>

        <!-- Total Deductions -->
        <div class="border-t border-neutral-300 pt-1.5 mt-2 flex justify-between items-center text-xs bg-neutral-50 px-2 py-1 rounded print:bg-transparent">
          <span class="font-bold uppercase tracking-wider text-[10px] text-neutral-700">Total Deductions:</span>
          <span class="font-mono font-bold text-neutral-900 text-xs">-₱{{ totalDeductions.toFixed(2) }}</span>
        </div>
      </div>
    </section>

    <!-- ================================================================= -->
    <!-- 4. NET PAY SUMMARY BANNER -->
    <!-- ================================================================= -->
    <section class="border border-neutral-400 rounded-md p-2.5 sm:p-3 mb-4 bg-neutral-50 flex items-center justify-between print:p-2 print:mb-3 print:bg-neutral-50/50">
      <div>
        <span class="text-[10px] font-bold uppercase tracking-wider text-neutral-700 block">
          Net Take-Home Pay
        </span>
        <span class="text-[9.5px] text-neutral-500 font-mono block">
          Gross: ₱{{ record.initialEarnings.toFixed(2) }} · Deductions: -₱{{ totalDeductions.toFixed(2) }}
        </span>
      </div>
      <div class="text-lg sm:text-xl font-black font-mono text-neutral-900">
        ₱{{ record.netPay.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
      </div>
    </section>

    <!-- ================================================================= -->
    <!-- 5. SIGNATURES & ACKNOWLEDGMENT -->
    <!-- ================================================================= -->
    <footer class="grid grid-cols-2 gap-8 pt-4 border-t border-neutral-300 text-[11px] print:pt-3 print:gap-10">
      <div class="border-t border-neutral-400 pt-1 text-center">
        <span class="text-neutral-500 block text-[9.5px] uppercase font-sans">Prepared & Audited By</span>
        <span class="font-bold text-neutral-800 text-[10.5px]">Human Resources / Payroll Officer</span>
      </div>
      <div class="border-t border-neutral-400 pt-1 text-center">
        <span class="text-neutral-500 block text-[9.5px] uppercase font-sans">Received By (Employee Signature)</span>
        <span class="font-bold text-neutral-800 text-[10.5px]">{{ record.employeeName }}</span>
      </div>
    </footer>
  </div>
</template>