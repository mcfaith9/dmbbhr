<template>
  <div class="p-4">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-lg font-semibold">Payroll Approval</h1>
        <p class="text-sm text-muted-foreground">Review and approve employee payroll snapshots for a cutoff period.</p>
      </div>

      <div class="flex items-center gap-2">
        <select v-model="selectedPeriod" class="h-8 rounded-md border border-input bg-background px-2.5 text-sm text-foreground">
          <option value="">All Cutoffs</option>
          <option v-for="p in cutoffs" :key="p.id" :value="p.id">{{ p.shortLabel }}</option>
        </select>

        <select v-model="statusFilter" class="h-8 rounded-md border border-input bg-background px-2.5 text-sm text-foreground">
          <option value="">All Statuses</option>
          <option value="ready">Pending Review</option>
          <option value="needs_review">Returned for Correction</option>
          <option value="approved">Approved</option>
        </select>

        <input v-model="query" placeholder="Search employee or ID" class="h-8 rounded-md border border-input bg-background px-2.5 text-sm text-foreground" />

        <Button variant="outline" size="sm" class="h-8" @click="reload">
          Refresh
        </Button>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
      <div class="col-span-2 grid grid-cols-2 gap-3">
        <div class="rounded-xl border bg-card p-3 shadow-xs">
          <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
            <span>Pending Items</span>
            <span class="text-xs text-muted-foreground">{{ filtered.length }} shown</span>
          </div>
          <div class="text-lg font-bold mt-1 text-foreground">Review payroll snapshots</div>
        </div>

        <div class="rounded-xl border bg-card p-3 shadow-xs">
          <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
            <span>Quick Help</span>
          </div>
          <div class="text-sm text-muted-foreground mt-2">Approve payroll snapshots after confirming earnings and deductions. Return for correction to require recalculation in Attendance Matrix.</div>
        </div>
      </div>

      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Reviewer</span>
        </div>
        <div class="mt-2 flex items-center gap-3">
          <div class="h-10 w-10 rounded bg-muted/50 flex items-center justify-center text-sm font-semibold text-muted-foreground">{{ reviewerInitials }}</div>
          <div>
            <div class="font-medium">{{ reviewerName }}</div>
            <div class="text-xs text-muted-foreground">{{ reviewerRole }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
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
          <!-- Loading skeleton -->
          <tr v-if="loadingDebounced">
            <td colspan="7" class="p-4">
              <div class="space-y-2">
                <div v-for="n in 6" :key="n" class="flex items-center gap-4">
                  <div class="h-4 rounded bg-muted/50 w-48"></div>
                  <div class="h-4 rounded bg-muted/50 w-24"></div>
                  <div class="h-4 rounded bg-muted/50 w-20 ml-auto"></div>
                </div>
              </div>
            </td>
          </tr>

          <!-- Empty state -->
          <tr v-else-if="!loadingDebounced && filtered.length === 0">
            <td colspan="7" class="h-24 text-center text-xs text-muted-foreground">No payroll snapshots match the selected filters.</td>
          </tr>

          <!-- Actual rows -->
          <tr v-else v-for="snap in filtered" :key="snap.id" class="border-t hover:bg-muted/5 transition-colors">
            <td class="px-3 py-3">
              <div class="font-medium">{{ snap.employeeName }}</div>
              <div class="text-xs text-muted-foreground">{{ snap.employeeNumber }} • {{ snap.bioId }}</div>
            </td>
            <td class="px-3 py-3">{{ snap.periodId }}</td>
            <td class="px-3 py-3">₱{{ snap.initialEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</td>
            <td class="px-3 py-3">₱{{ (snap.totalBenefitsAndLoans + snap.totalOtherDeductions + (snap.cashAdvance || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</td>
            <td class="px-3 py-3 font-bold text-emerald-600">₱{{ snap.netPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</td>
            <td class="px-3 py-3">
              <Badge :variant="badgeVariant(snap.reviewStatus)">{{ humanStatus(snap.reviewStatus) }}</Badge>
            </td>
            <td class="px-3 py-3">
              <div class="flex items-center gap-2">
                <Button size="sm" variant="ghost" @click="openRecord(snap)">View</Button>
                <Button size="sm" variant="default" class="text-xs" :disabled="snap.reviewStatus === 'approved'" @click="confirmApprove(snap)">Approve</Button>
                <Button size="sm" variant="destructive" :disabled="snap.reviewStatus === 'needs_review'" @click="promptReturn(snap)">Return</Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Details / history modal -->
    <div v-if="activeSnap" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div class="bg-background rounded shadow max-w-3xl w-full p-4">
        <div class="flex items-start justify-between">
          <div>
            <h2 class="text-lg font-semibold">Payroll Details — {{ activeSnap.employeeName }}</h2>
            <div class="text-xs text-muted-foreground">Period: {{ activeSnap.periodId }}</div>
          </div>
          <div class="space-x-2">
            <Button variant="ghost" size="sm" @click="closeRecord">Close</Button>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div class="text-sm text-muted-foreground mb-2">Earnings</div>
            <div class="space-y-1">
              <div class="flex justify-between"><span>Base Pay</span><span>₱{{ activeSnap.basicSalaryDisplay }}</span></div>
              <div class="flex justify-between"><span>Overtime</span><span>₱{{ activeSnap.overtimePay?.toFixed(2) }}</span></div>
              <div class="flex justify-between"><span>Holiday Pay</span><span>₱{{ activeSnap.holidayPay?.toFixed(2) }}</span></div>
              <div class="flex justify-between font-semibold mt-2"><span>Gross</span><span>₱{{ activeSnap.initialEarnings.toFixed(2) }}</span></div>
            </div>

            <div class="text-sm text-muted-foreground mt-4 mb-2">Deductions</div>
            <div class="space-y-1">
              <div v-for="d in activeSnap.itemizedDeductions || []" :key="d.id" class="flex justify-between text-sm"><span>{{ d.description }}</span><span>₱{{ Number(d.amount).toFixed(2) }}</span></div>
              <div class="flex justify-between font-semibold mt-2"><span>Total Deductions</span><span>₱{{ activeSnap.totalOtherDeductions.toFixed(2) }}</span></div>
              <div class="flex justify-between font-semibold mt-2"><span>Net Pay</span><span>₱{{ activeSnap.netPay.toFixed(2) }}</span></div>
            </div>
          </div>

          <div>
            <div class="text-sm text-muted-foreground mb-2">Approval History</div>
            <div class="space-y-2 max-h-56 overflow-auto p-2 rounded border border-input bg-muted/5">
              <div v-if="(activeSnap.reviewReasons || []).length === 0" class="text-xs text-muted-foreground">No review history</div>
              <div v-else v-for="(r, i) in (activeSnap.reviewReasons || [])" :key="i" class="text-sm">{{ r }}</div>
            </div>

            <div class="mt-4">
              <div class="text-sm text-muted-foreground">Status</div>
              <div class="mt-1"><Badge :variant="badgeVariant(activeSnap.reviewStatus)">{{ humanStatus(activeSnap.reviewStatus) }}</Badge></div>

              <div v-if="activeSnap.approvedBy" class="mt-3 text-sm text-muted-foreground">Last Approved By</div>
              <div v-if="activeSnap.approvedBy" class="font-medium">{{ activeSnap.approvedBy }} <span class="text-xs text-muted-foreground">at {{ formatDate(activeSnap.approvedAt) }}</span></div>
            </div>
          </div>
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <Button variant="ghost" @click="closeRecord">Close</Button>
          <Button variant="default" :disabled="activeSnap.reviewStatus === 'approved'" @click="confirmApprove(activeSnap)">Approve</Button>
          <Button variant="destructive" :disabled="activeSnap.reviewStatus === 'needs_review'" @click="promptReturn(activeSnap)">Return for Correction</Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { db, type PayrollSnapshotRecord } from '@/db'
import { payrollCalculationService, type EmployeePayrollRecord } from '@/services/payrollCalculation'
import { authService } from '@/services/auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export interface PayrollApprovalDetailRecord extends EmployeePayrollRecord {
  basicSalaryDisplay: string
  holidayPay: number
  approvedBy?: string
  approvedAt?: string
}

const cutoffs = payrollCalculationService.getAvailableCutoffs(new Date(), 24)
const selectedPeriod = ref('')
const statusFilter = ref('')
const query = ref('')
const snapshots = ref<PayrollSnapshotRecord[]>([])
const activeSnap = ref<PayrollApprovalDetailRecord | null>(null)
const isLoading = ref(false)

// simple debounce for skeleton to avoid flicker on fast loads
const loadingDebounced = ref(false)
let loadingTimer: any = null
function setLoading(flag: boolean) {
  isLoading.value = flag
  if (loadingTimer) clearTimeout(loadingTimer)
  if (flag) {
    // show skeleton only if loading lasts longer than 80ms
    loadingTimer = setTimeout(() => loadingDebounced.value = true, 80)
  } else {
    loadingDebounced.value = false
  }
}

function humanStatus(s: string | undefined) {
  if (!s) return 'Unknown'
  if (s === 'ready') return 'Pending Review'
  if (s === 'needs_review') return 'Returned for Correction'
  if (s === 'approved') return 'Approved'
  if (s === 'finalized') return 'Finalized'
  return s
}

function badgeVariant(s: string | undefined) {
  if (s === 'approved' || s === 'finalized') return 'success'
  if (s === 'needs_review') return 'warning'
  return 'outline'
}

async function loadSnapshots() {
  setLoading(true)
  try {
    const list = await db.payrollSnapshots.toArray()
    snapshots.value = list
  } finally {
    setLoading(false)
  }
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

function openRecord(snap: PayrollSnapshotRecord) {
  const rec = payrollCalculationService.snapshotToPayrollRecord(snap)
  const holidayPay = snap.holidayPay ?? rec.earningsBreakdown?.holidayPay ?? 0
  activeSnap.value = {
    ...snap,
    ...rec,
    basicSalaryDisplay: (snap.basicSalary || 0).toFixed(2),
    holidayPay,
    overtimePay: snap.overtimePay ?? rec.overtimePay ?? 0,
    itemizedDeductions: snap.itemizedDeductions || [],
    totalOtherDeductions: snap.totalOtherDeductions || 0,
    approvedBy: snap.approvedBy,
    approvedAt: snap.approvedAt
  }
}

function closeRecord() {
  activeSnap.value = null
}

function formatDate(s?: string) {
  if (!s) return ''
  try {
    return new Date(s).toLocaleString()
  } catch {
    return s
  }
}

async function doApprove(snap: PayrollSnapshotRecord | PayrollApprovalDetailRecord) {
  const user = authService.currentUser.value
  const approvedBy = user?.username || user?.name || 'unknown'
  const approvedAt = new Date().toISOString()
  const reasons = Array.isArray(snap.reviewReasons) ? [...snap.reviewReasons] : []
  reasons.push(`Approved by ${approvedBy} at ${new Date(approvedAt).toLocaleString()}`)

  await db.payrollSnapshots.update(snap.id, {
    reviewStatus: 'approved',
    approvedBy,
    approvedAt,
    reviewReasons: reasons
  })
  await loadSnapshots()
  if (activeSnap.value && activeSnap.value.id === snap.id) {
    activeSnap.value.reviewStatus = 'approved'
    activeSnap.value.approvedBy = approvedBy
    activeSnap.value.approvedAt = approvedAt
    activeSnap.value.reviewReasons = reasons
  }
}

function confirmApprove(snap: PayrollSnapshotRecord | PayrollApprovalDetailRecord) {
  const ok = window.confirm(`Approve payroll for ${snap.employeeName}?`)
  if (!ok) return
  doApprove(snap)
}

async function promptReturn(snap: PayrollSnapshotRecord | PayrollApprovalDetailRecord) {
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

const reviewerName = authService.currentUser.value?.name || authService.currentUser.value?.username || 'Reviewer'
const reviewerRole = authService.currentUser.value?.role || 'HR'
const reviewerInitials = reviewerName.split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase()
</script>

<style scoped>
/* Minor visual polish; keep theme tokens */
</style>
