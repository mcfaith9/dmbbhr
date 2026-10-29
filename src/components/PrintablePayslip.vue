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

const payslipRootRef = ref<HTMLElement | null>(null)
const activeLogoUrl = ref(props.logoUrl)
const isPrinting = ref(false)

function onLogoError() {
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
 * Clean currency formatter for Philippine Peso amounts
 */
function formatCurrency(val: number): string {
  return '₱' + (val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Isolated printing mechanism:
 * Injects the dedicated PrintablePayslip HTML into an isolated hidden iframe
 * so ONLY the compact official payslip is sent to the printer.
 * The parent Payroll Calculation dialog, dashboard, and backdrop are never printed.
 */
async function print(): Promise<void> {
  if (isPrinting.value) return
  isPrinting.value = true

  try {
    // 1. Ensure logo image is fully decoded before printing
    await new Promise<void>((resolve) => {
      const img = new Image()
      img.onload = () => resolve()
      img.onerror = () => resolve()
      img.src = activeLogoUrl.value
      if (img.complete) resolve()
    })

    await nextTick()

    const slipElement = payslipRootRef.value || document.getElementById('printable-payslip')
    if (!slipElement) {
      window.print()
      return
    }

    // 2. Reuse or create isolated hidden print iframe
    let iframe = document.getElementById('dmbb-payslip-print-iframe') as HTMLIFrameElement | null
    if (!iframe) {
      iframe = document.createElement('iframe')
      iframe.id = 'dmbb-payslip-print-iframe'
      iframe.style.position = 'fixed'
      iframe.style.right = '0'
      iframe.style.bottom = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = '0'
      iframe.style.opacity = '0'
      document.body.appendChild(iframe)
    }

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
    if (!iframeDoc) {
      window.print()
      return
    }

    const slipHtml = slipElement.outerHTML

    iframeDoc.open()
    iframeDoc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Payslip - ${props.record.employeeName}</title>
  <style>
    @page {
      size: auto;
      margin: 5mm 8mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      background: #ffffff !important;
      color: #000000 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 10.5px;
      line-height: 1.35;
    }
    .printable-payslip-root {
      width: 100%;
      max-width: 440px;
      margin: 0 auto;
      padding: 4px;
      background: #ffffff;
      color: #000000;
    }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .uppercase { text-transform: uppercase; }
    .border-b { border-bottom: 1px solid #222222; }
    .border-t { border-top: 1px solid #222222; }
    .border-b-dotted { border-bottom: 1px dotted #888888; }
    .border-double { border-top: 2px solid #222222; border-bottom: 2px solid #222222; }
    .row { display: flex; justify-content: space-between; align-items: center; padding: 1.5px 0; }
    .flex { display: flex; }
    .justify-between { justify-content: space-between; }
    .items-center { align-items: center; }
    .gap-2 { gap: 8px; }
    .my-1 { margin-top: 4px; margin-bottom: 4px; }
    .my-2 { margin-top: 8px; margin-bottom: 8px; }
    .py-1 { padding-top: 3px; padding-bottom: 3px; }
    .company-header {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .company-logo {
      height: 40px !important;
      max-height: 40px !important;
      width: auto !important;
      max-width: 50px;
      object-fit: contain;
      flex-shrink: 0;
    }

    .company-details h1 {
      font-size: 12px !important;
      line-height: 1 !important;
      font-weight: 700;
      margin: 0;
      text-transform: uppercase;
    }

    .company-details p {
      font-size: 10px !important;
      line-height: 1 !important;
      margin: 1px 0 0 !important;
      color: #525252;
    }
    
    .payslip-signatures {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #d4d4d4;
      font-size: 9px;
    }

    .signature-item {
      min-width: 0;
      text-align: center;
    }

    .signature-line {
      height: 24px;
      margin-bottom: 4px;
      border-bottom: 1px solid #000;
    }

    .signature-item span {
      display: block;
    }
  </style>
</head>
<body>
  ${slipHtml}
</body>
</html>`)
    iframeDoc.close()

    // 3. Allow small interval for iframe layout settle and image decode, then print
    await new Promise((r) => setTimeout(r, 200))
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
  } catch (err) {
    console.warn('Falling back to window.print():', err)
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
  <div
    id="printable-payslip"
    ref="payslipRootRef"
    class="printable-payslip-root bg-white text-black font-sans w-full max-w-[440px] mx-auto p-4 sm:p-5 text-[10.5px] leading-tight select-text"
  >
    <!-- ================================================================= -->
    <!-- 1. HEADER: PAYSLIP TITLE, LOGO, COMPANY NAME -->
    <!-- ================================================================= -->
    <div class="border-b border-black pb-2 mb-2">
      <div class="flex items-center justify-between gap-2">
        <div class="company-header">
          <img
            :src="activeLogoUrl"
            :alt="companyName"
            class="company-logo"
            crossorigin="anonymous"
            @error="onLogoError"
          />
          <div class="company-details">
            <h1>{{ companyName }}</h1>
            <p>{{ companySubtitle }}</p>
          </div>
        </div>
        <div class="text-right">
          <span class="text-[9px] font-medium tracking-widest uppercase">PAYSLIP</span>
          <p class="text-[9px] font-mono text-neutral-500">Ref: #{{ record.employeeNumber }}</p>
        </div>
      </div>

      <!-- Employee Information (Tightly Arranged) -->
      <div class="mt-2 pt-1.5 border-t border-neutral-300 space-y-0.5 text-[10px]">
        <div class="flex justify-between items-center">
          <span>Employee: <strong class="text-black">{{ record.employeeName }}</strong></span>
          <span class="font-mono">ID: <strong>#{{ record.employeeNumber }}</strong></span>
        </div>
        <div class="flex justify-between items-center text-neutral-700">
          <span>Position: {{ record.position }} <template v-if="record.department">({{ record.department }})</template></span>
        </div>
        <div class="flex justify-between items-center text-neutral-700">
          <span>Period: <strong class="font-mono text-black">{{ cutoff.label }}</strong></span>
          <span>Pay Date: <strong class="font-mono text-black">{{ cutoff.paydayDisplay }}</strong></span>
        </div>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- 2. EARNINGS -->
    <!-- ================================================================= -->
    <div class="mb-2">
      <div class="flex justify-between items-center border-b border-black pb-0.5 mb-1">
        <span class="font-bold uppercase tracking-wider text-[10px]">EARNINGS</span>
        <span class="text-[9px] uppercase font-mono text-neutral-600">AMOUNT</span>
      </div>

      <div class="space-y-0.5 font-mono text-[10.5px]">
        <div class="flex justify-between items-center py-0.5 border-b border-neutral-100">
          <span class="font-sans text-neutral-800">Working Days ({{ record.payableDays }} days):</span>
          <span>{{ formatCurrency(record.earningsBreakdown.basePay) }}</span>
        </div>
        <div v-if="record.earningsBreakdown.sundayDutyPay > 0" class="flex justify-between items-center py-0.5 border-b border-neutral-100">
          <span class="font-sans text-neutral-800">Sunday Duty (+30%):</span>
          <span>{{ formatCurrency(record.earningsBreakdown.sundayDutyPay) }}</span>
        </div>
        <div v-if="record.earningsBreakdown.holidayPay > 0" class="flex justify-between items-center py-0.5 border-b border-neutral-100">
          <span class="font-sans text-neutral-800">Holiday Pay:</span>
          <span>{{ formatCurrency(record.earningsBreakdown.holidayPay) }}</span>
        </div>
        <div v-if="record.earningsBreakdown.overtimePay > 0" class="flex justify-between items-center py-0.5 border-b border-neutral-100">
          <span class="font-sans text-neutral-800">Overtime Pay ({{ record.overtimeHours }}h):</span>
          <span>{{ formatCurrency(record.earningsBreakdown.overtimePay) }}</span>
        </div>
        <div v-if="record.earningsBreakdown.allowances > 0" class="flex justify-between items-center py-0.5 border-b border-neutral-100">
          <span class="font-sans text-neutral-800">Other Earnings / Allowances:</span>
          <span>{{ formatCurrency(record.earningsBreakdown.allowances) }}</span>
        </div>

        <div class="flex justify-between items-center pt-1 mt-1 border-t border-black font-bold text-[11px]">
          <span class="uppercase tracking-wider font-sans">Gross Pay:</span>
          <span>{{ formatCurrency(record.initialEarnings) }}</span>
        </div>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- 3. DEDUCTIONS -->
    <!-- ================================================================= -->
    <div class="mb-2">
      <div class="flex justify-between items-center border-b border-black pb-0.5 mb-1">
        <span class="font-bold uppercase tracking-wider text-[10px]">DEDUCTIONS</span>
        <span class="text-[9px] uppercase font-mono text-neutral-600">AMOUNT</span>
      </div>

      <div class="space-y-0.5 font-mono text-[10.5px]">
        <div v-if="record.sss > 0" class="flex justify-between items-center py-0.5 border-b border-neutral-100">
          <span class="font-sans text-neutral-800">SSS Contribution:</span>
          <span>-{{ formatCurrency(record.sss) }}</span>
        </div>
        <div v-if="record.philhealth > 0" class="flex justify-between items-center py-0.5 border-b border-neutral-100">
          <span class="font-sans text-neutral-800">PhilHealth:</span>
          <span>-{{ formatCurrency(record.philhealth) }}</span>
        </div>
        <div v-if="record.pagibig > 0" class="flex justify-between items-center py-0.5 border-b border-neutral-100">
          <span class="font-sans text-neutral-800">Pag-IBIG:</span>
          <span>-{{ formatCurrency(record.pagibig) }}</span>
        </div>
        <div v-if="record.sssLoan > 0" class="flex justify-between items-center py-0.5 border-b border-neutral-100">
          <span class="font-sans text-neutral-800">SSS Loan:</span>
          <span>-{{ formatCurrency(record.sssLoan) }}</span>
        </div>
        <div v-if="record.pagibigLoan > 0" class="flex justify-between items-center py-0.5 border-b border-neutral-100">
          <span class="font-sans text-neutral-800">Pag-IBIG Loan:</span>
          <span>-{{ formatCurrency(record.pagibigLoan) }}</span>
        </div>
        <div v-if="record.otherLoan > 0" class="flex justify-between items-center py-0.5 border-b border-neutral-100">
          <span class="font-sans text-neutral-800">Other Loan:</span>
          <span>-{{ formatCurrency(record.otherLoan) }}</span>
        </div>
        <div v-if="(record.undertimeDeduction || 0) > 0" class="flex justify-between items-center py-0.5 border-b border-neutral-100">
          <span class="font-sans text-neutral-800">Undertime ({{ record.undertimeMinutes }}m):</span>
          <span>-{{ formatCurrency(record.undertimeDeduction) }}</span>
        </div>
        <div v-for="d in record.itemizedDeductions" :key="d.id" class="flex justify-between items-center py-0.5 border-b border-neutral-100">
          <span class="font-sans text-neutral-800">{{ d.description }}:</span>
          <span>-{{ formatCurrency(d.amount) }}</span>
        </div>
        <div v-if="record.withholdingTax > 0" class="flex justify-between items-center py-0.5 border-b border-neutral-100">
          <span class="font-sans text-neutral-800">Withholding Tax:</span>
          <span>-{{ formatCurrency(record.withholdingTax) }}</span>
        </div>
        <div v-if="totalDeductions === 0" class="py-1 text-center font-sans text-neutral-500 italic text-[10px]">
          No authorized deductions applied.
        </div>

        <div class="flex justify-between items-center pt-1 mt-1 border-t border-black font-bold text-[11px]">
          <span class="uppercase tracking-wider font-sans">Total Deductions:</span>
          <span>-{{ formatCurrency(totalDeductions) }}</span>
        </div>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- 4. NET PAY -->
    <!-- ================================================================= -->
    <div class="my-2 p-2 border-2 border-black flex justify-between items-center">
      <span class="font-black uppercase tracking-wider text-xs">NET PAY:</span>
      <span class="font-mono font-black text-sm">
        {{ formatCurrency(record.netPay) }}
      </span>
    </div>

    <!-- ================================================================= -->
    <!-- 5. SIGNATURES -->
    <!-- ================================================================= -->
    <div class="payslip-signatures">
      <div class="signature-item">
        <div class="signature-line"></div>
        <span>Employee Signature</span>
      </div>

      <div class="signature-item">
        <div class="signature-line"></div>
        <span>Prepared By / Authorized Signature</span>
      </div>
    </div>
  </div>
</template>
<style scoped>
  .company-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .company-logo {
    height: 32px;
    width: auto;
    object-fit: contain;
    flex-shrink: 0;
  }

  .company-details h1 {
    font-size: 12px;
    font-weight: 700;
    line-height: 1.2;
    text-transform: uppercase;
    margin: 0;
  }

  .company-details p {
    font-size: 9.5px;
    line-height: 1.2;
    margin: 2px 0 0;
    color: #525252;
  }

  .payslip-signatures {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #d4d4d4;
    font-size: 9px;
  }

  .signature-item {
    min-width: 0;
    text-align: center;
  }

  .signature-line {
    height: 24px;
    margin-bottom: 4px;
    border-bottom: 1px solid #000;
  }

  .signature-item span {
    display: block;
  }
</style>