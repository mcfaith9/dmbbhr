<template>
  <div class="p-4">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-lg font-semibold">Payroll Approval</h1>
        <p class="text-sm text-muted-foreground">Review and approve employee payroll snapshots for a cutoff period.</p>
      </div>
      <div class="flex items-center gap-2">
        <select v-model="selectedPeriod" class="border rounded px-2 py-1 text-sm">
          <option value="">All Cutoffs</option>
          <option v-for="p in cutoffs" :key="p.id" :value="p.id">{{ p.shortLabel }}</option>
        </select>
        <select v-model="statusFilter" class="border rounded px-2 py-1 text-sm">
          <option value="">All Statuses</option>
          <option value="ready">Pending Review</option>
          <option value="needs_review">Returned for Correction</option>
          <option value="approved">Approved</option>
        </select>
        <input v-model="query" placeholder="Search employee or ID" class="border rounded px-2 py-1 text-sm" />
        <button @click="reload" class="btn">Refresh</button>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full table-auto border-collapse">
        <thead>
          <tr class="text-left text-sm text-muted-foreground">
            <th class="px-3 py-2">Employee</th>
            <th class="px-3 py-2">Period</th>
            <th class="px-3 py-2">Gross</th>
            <th class="px-3 py-2">Deductions</th>
            <th class="px-3 py-2">Net</th>
            <th class="px-3 py-2">Status</th>
            <th class="px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="snap in filtered" :key="snap.id" class="border-t">
            <td class="px-3 py-2">{{ snap.employeeName }} <div class="text-xs text-muted-foreground">{{ snap.employeeNumber }}</div></td>
            <td class="px-3 py-2">{{ snap.periodId }}</td>
            <td class="px-3 py-2">₱{{ snap.initialEarnings.toFixed(2) }}</td>
            <td class="px-3 py-2">₱{{ snap.totalBenefitsAndLoans + snap.totalOtherDeductions + (snap.cashAdvance || 0) | numberFormat }}</td>
            <td class="px-3 py-2">₱{{ snap.netPay.toFixed(2) }}</td>
            <td class="px-3 py-2">{{ humanStatus(snap.reviewStatus) }}</td>
            <td class="px-3 py-2 space-x-2">
              <button @click="openRecord(snap)" class="btn btn-sm">View</button>
              <button v-if="snap.reviewStatus !== 'approved'" @click="approve(snap)" class="btn btn-sm btn-primary">Approve</button>
              <button v-if="snap.reviewStatus !== 'needs_review'" @click="returnForCorrection(snap)" class="btn btn-sm btn-warning">Return</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Details dialog -->
    <div v-if="activeSnap" class="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div class="bg-background rounded shadow max-w-3xl w-full p-4">
        <div class="flex items-start justify-between">
          <h2 class="text-lg font-semibold">Payroll Details — {{ activeSnap.employeeName }}</h2>
          <div class="space-x-2">
            <button @click="closeRecord" class="btn">Close</button>
          </div>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-4">
          <div>
            <div class="text-sm text-muted-foreground">Employee</div>
            <div class="font-medium">{{ activeSnap.employeeName }} ({{ activeSnap.employeeNumber }})</div>
            <div class="text-sm text-muted-foreground mt-2">Period</div>
            <div>{{ activeSnap.periodId }}</div>

            <div class="text-sm text-muted-foreground mt-2">Status</div>
            <div>{{ humanStatus(activeSnap.reviewStatus) }}</div>

            <div v-if="activeSnap.approvedBy" class="text-sm text-muted-foreground mt-2">Approved By</div>
            <div v-if="activeSnap.approvedBy">{{ activeSnap.approvedBy }} at {{ activeSnap.approvedAt }}</div>
          </div>

          <div>
            <div class="text-sm text-muted-foreground">Earnings</div>
            <div class="mt-1">
              <div class="flex justify-between"><span>Base Pay</span><span>₱{{ activeSnap.basicSalaryDisplay }}</span></div>
              <div class="flex justify-between"><span>Overtime</span><span>₱{{ activeSnap.overtimePay?.toFixed(2) }}</span></div>
              <div class="flex justify-between"><span>Holiday Pay</span><span>₱{{ activeSnap.holidayPay?.toFixed(2) }}</span></div>
              <div class="flex justify-between font-semibold mt-2"><span>Gross</span><span>₱{{ activeSnap.initialEarnings.toFixed(2) }}</span></div>
            </div>

            <div class="text-sm text-muted-foreground mt-3">Deductions</div>
            <div class="mt-1">
              <div v-for="d in activeSnap.itemizedDeductions || []" :key="d.id" class="flex justify-between text-sm"><span>{{ d.description }}</span><span>₱{{ Number(d.amount).toFixed(2) }}</span></div>
              <div class="flex justify-between font-semibold mt-2"><span>Total Deductions</span><span>₱{{ activeSnap.totalOtherDeductions.toFixed(2) }}</span></div>
              <div class="flex justify-between font-semibold mt-2"><span>Net Pay</span><span>₱{{ activeSnap.netPay.toFixed(2) }}</span></div>
            </div>
          </div>
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <button @click="closeRecord" class="btn">Close</button>
          <button v-if="activeSnap.reviewStatus !== 'approved'" @click="approve(activeSnap)" class="btn btn-primary">Approve</button>
          <button v-if="activeSnap.reviewStatus !== 'needs_review'" @click="returnForCorrection(activeSnap)" class="btn btn-warning">Return for Correction</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { db } from '@/db'
import { payrollCalculationService } from '@/services/payrollCalculation'
import { authService } from '@/services/auth'

const cutoffs = payrollCalculationService.getAvailableCutoffs(new Date(), 24)
const selectedPeriod = ref('')
const statusFilter = ref('')
const query = ref('')
const snapshots = ref([] as any[])
const activeSnap = ref<any | null>(null)

function humanStatus(s: string | undefined) {
  if (!s) return 'Unknown'
  if (s === 'ready') return 'Pending Review'
  if (s === 'needs_review') return 'Returned for Correction'
  if (s === 'approved') return 'Approved'
  if (s === 'finalized') return 'Finalized'
  return s
}

async function loadSnapshots() {
  let list = await db.payrollSnapshots.toArray()
  // filter out historical finalized if you only want non-finalized, but requirement said show finalized employee payroll records awaiting review — use reviewStatus filters
  // We'll keep all but the UI will filter
  snapshots.value = list
}

onMounted(() => {
  loadSnapshots()
})

function reload() {
  loadSnapshots()
}

const filtered = computed(() => {
  return snapshots.value
    .filter(snap => {
      if (selectedPeriod.value && snap.periodId !== selectedPeriod.value) return false
      if (statusFilter.value && String(snap.reviewStatus) !== statusFilter.value) return false
      if (query.value) {
        const q = query.value.toLowerCase()
        const match = (snap.employeeName || '').toLowerCase().includes(q) || String(snap.employeeNumber || '').toLowerCase().includes(q) || String(snap.bioId || '').toLowerCase().includes(q)
        if (!match) return false
      }
      return true
    })
    .sort((a, b) => (a.employeeName || '').localeCompare(b.employeeName || ''))
})

function openRecord(snap: any) {
  // Convert snapshot to payroll record shape for display
  const rec = payrollCalculationService.snapshotToPayrollRecord(snap)
  // attach some derived fields
  rec.basicSalaryDisplay = (snap.basicSalary || 0).toFixed(2)
  rec.holidayPay = snap.holidayPay || 0
  rec.overtimePay = snap.overtimePay || 0
  rec.itemizedDeductions = snap.itemizedDeductions || []
  rec.totalOtherDeductions = snap.totalOtherDeductions || 0
  activeSnap.value = { ...snap, ...rec }
}

function closeRecord() {
  activeSnap.value = null
}

async function approve(snap: any) {
  const user = authService.currentUser.value
  const approvedBy = user?.username || user?.name || 'unknown'
  const approvedAt = new Date().toISOString()

  await db.payrollSnapshots.update(snap.id, {
    reviewStatus: 'approved',
    approvedBy,
    approvedAt
  })
  await loadSnapshots()
  if (activeSnap.value && activeSnap.value.id === snap.id) {
    activeSnap.value.reviewStatus = 'approved'
    activeSnap.value.approvedBy = approvedBy
    activeSnap.value.approvedAt = approvedAt
  }
}

async function returnForCorrection(snap: any) {
  const reason = window.prompt('Please provide a reason for returning this payroll for correction:')
  if (!reason) return
  const reasons = Array.isArray(snap.reviewReasons) ? [...snap.reviewReasons] : []
  reasons.push(`Returned by ${authService.currentUser.value?.username || authService.currentUser.value?.name || 'unknown'}: ${reason}`)

  await db.payrollSnapshots.update(snap.id, {
    reviewStatus: 'needs_review',
    reviewReasons: reasons
  })
  await loadSnapshots()
  if (activeSnap.value && activeSnap.value.id === snap.id) {
    activeSnap.value.reviewStatus = 'needs_review'
    activeSnap.value.reviewReasons = reasons
  }
}
</script>

<style scoped>
.btn { @apply bg-gray-100 border rounded px-2 py-1 text-sm }
.btn-primary { @apply bg-primary text-white }
.btn-warning { @apply bg-yellow-400 text-black }
.btn-sm { @apply px-2 py-0.5 text-xs }
</style>
