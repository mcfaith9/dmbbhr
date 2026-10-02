<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Check,
  Trash2,
  RefreshCw,
  UserCheck
} from '@lucide/vue'
import { attendanceService } from '@/services/attendance'
import { authService } from '@/services/auth'
import type { ManualAttendanceRecord } from '@/db'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

const requests = ref<ManualAttendanceRecord[]>([])
const loading = ref(false)
const searchQuery = ref('')
const activeTab = ref<'all' | 'Pending' | 'Approved' | 'Rejected'>('Pending')

// Review Dialog State
const isReviewDialogOpen = ref(false)
const selectedRequest = ref<ManualAttendanceRecord | null>(null)
const rejectionReasonInput = ref('')
const showRejectionInput = ref(false)
const isSubmittingAction = ref(false)

const currentUser = authService.currentUser

async function loadRequests() {
  loading.value = true
  try {
    requests.value = await attendanceService.getManualTimeRequests('all')
  } finally {
    loading.value = false
  }
}

const stats = computed(() => {
  const all = requests.value
  const total = all.length
  const pending = all.filter(r => r.status === 'Pending').length
  const approved = all.filter(r => r.status === 'Approved').length
  const rejected = all.filter(r => r.status === 'Rejected').length
  return { total, pending, approved, rejected }
})

const filteredRequests = computed(() => {
  let list = requests.value

  if (activeTab.value !== 'all') {
    list = list.filter(r => r.status === activeTab.value)
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(r =>
      (r.employeeName && r.employeeName.toLowerCase().includes(q)) ||
      r.bioId.toLowerCase().includes(q) ||
      (r.notes && r.notes.toLowerCase().includes(q)) ||
      (r.reason && r.reason.toLowerCase().includes(q)) ||
      (r.requestedBy && r.requestedBy.toLowerCase().includes(q)) ||
      r.date.includes(q)
    )
  }

  return list
})

function openReviewModal(req: ManualAttendanceRecord) {
  selectedRequest.value = req
  showRejectionInput.value = false
  rejectionReasonInput.value = ''
  isReviewDialogOpen.value = true
}

async function handleApprove() {
  if (!selectedRequest.value) return
  isSubmittingAction.value = true
  try {
    const approverName = currentUser.value?.name || currentUser.value?.username || 'Admin'
    await attendanceService.approveManualTimeRequest(selectedRequest.value.id, undefined, approverName)
    isReviewDialogOpen.value = false
    await loadRequests()
  } finally {
    isSubmittingAction.value = false
  }
}

async function handleReject() {
  if (!selectedRequest.value) return
  isSubmittingAction.value = true
  try {
    const reviewerName = currentUser.value?.name || currentUser.value?.username || 'Admin'
    const reason = rejectionReasonInput.value.trim() || 'Disapproved by HR/Admin'
    await attendanceService.rejectManualTimeRequest(selectedRequest.value.id, undefined, reviewerName, reason)
    isReviewDialogOpen.value = false
    await loadRequests()
  } finally {
    isSubmittingAction.value = false
  }
}

async function handleDelete(req: ManualAttendanceRecord) {
  if (confirm(`Are you sure you want to delete the manual time adjustment record for ${req.employeeName || req.bioId} on ${req.date}?`)) {
    await attendanceService.deleteManualAdjustment(req.id)
    if (selectedRequest.value?.id === req.id) {
      isReviewDialogOpen.value = false
    }
    await loadRequests()
  }
}

function formatDateDisplay(dateStr: string) {
  try {
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
    return dateStr
  } catch {
    return dateStr
  }
}

function formatTimestamp(isoStr?: string) {
  if (!isoStr) return '—'
  try {
    const d = new Date(isoStr)
    return d.toLocaleString('en-US', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  } catch {
    return isoStr
  }
}

onMounted(() => {
  loadRequests()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header with Breadcrumb & Context -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
      <div class="space-y-1">
        <div class="flex items-center gap-2.5 flex-wrap">
          <h1 class="text-2xl font-bold tracking-tight text-foreground font-sans">
            Manual Time
          </h1>
          <span class="text-xs px-2.5 py-0.5 rounded-md border bg-muted/50 font-mono font-medium text-foreground">
            {{ stats.pending }} Pending Review
          </span>
        </div>
        <p class="text-xs text-muted-foreground">
          Dedicated workflow for reviewing, authorizing, and auditing manual attendance adjustments (missing punches, paper slips, and corrections).
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          class="h-8 gap-1.5 text-xs font-medium"
          :disabled="loading"
          @click="loadRequests"
        >
          <RefreshCw :class="['size-3.5', loading ? 'animate-spin' : '']" />
          <span>Refresh</span>
        </Button>
      </div>
    </div>

    <!-- Quick Stats Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      <div
        class="rounded-xl border bg-card p-3 shadow-xs cursor-pointer transition-all"
        :class="activeTab === 'Pending' ? 'ring-2 ring-amber-500/50 border-amber-500/50 bg-amber-500/5' : 'hover:bg-muted/40'"
        @click="activeTab = 'Pending'"
      >
        <span class="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
          <Clock class="size-3 text-amber-600 dark:text-amber-400" />
          Pending Approvals
        </span>
        <div class="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1 font-mono">
          {{ stats.pending }}
        </div>
      </div>

      <div
        class="rounded-xl border bg-card p-3 shadow-xs cursor-pointer transition-all"
        :class="activeTab === 'Approved' ? 'ring-2 ring-emerald-500/50 border-emerald-500/50 bg-emerald-500/5' : 'hover:bg-muted/40'"
        @click="activeTab = 'Approved'"
      >
        <span class="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
          <CheckCircle2 class="size-3 text-emerald-600 dark:text-emerald-400" />
          Approved Adjustments
        </span>
        <div class="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
          {{ stats.approved }}
        </div>
      </div>

      <div
        class="rounded-xl border bg-card p-3 shadow-xs cursor-pointer transition-all"
        :class="activeTab === 'Rejected' ? 'ring-2 ring-rose-500/50 border-rose-500/50 bg-rose-500/5' : 'hover:bg-muted/40'"
        @click="activeTab = 'Rejected'"
      >
        <span class="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
          <XCircle class="size-3 text-rose-600 dark:text-rose-400" />
          Rejected Requests
        </span>
        <div class="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1 font-mono">
          {{ stats.rejected }}
        </div>
      </div>

      <div
        class="rounded-xl border bg-card p-3 shadow-xs cursor-pointer transition-all"
        :class="activeTab === 'all' ? 'ring-2 ring-primary/50 border-primary/50 bg-primary/5' : 'hover:bg-muted/40'"
        @click="activeTab = 'all'"
      >
        <span class="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
          <FileText class="size-3 text-primary" />
          All Historical Requests
        </span>
        <div class="text-xl font-bold text-foreground mt-1 font-mono">
          {{ stats.total }}
        </div>
      </div>
    </div>

    <!-- Filter & Search Toolbar -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
      <!-- Status Tabs -->
      <div class="flex items-center gap-1 bg-muted/50 p-1 rounded-lg text-xs">
        <button
          type="button"
          class="px-3 py-1.5 rounded-md font-medium transition-all"
          :class="activeTab === 'Pending' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'Pending'"
        >
          Pending ({{ stats.pending }})
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded-md font-medium transition-all"
          :class="activeTab === 'Approved' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'Approved'"
        >
          Approved ({{ stats.approved }})
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded-md font-medium transition-all"
          :class="activeTab === 'Rejected' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'Rejected'"
        >
          Rejected ({{ stats.rejected }})
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded-md font-medium transition-all"
          :class="activeTab === 'all' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'all'"
        >
          All ({{ stats.total }})
        </button>
      </div>

      <!-- Search Field -->
      <div class="relative w-full sm:w-72">
        <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          placeholder="Search employee, ID, note, requester..."
          class="pl-8 text-xs h-8 bg-card"
        />
      </div>
    </div>

    <!-- Manual Time Requests Table -->
    <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
      <!-- Loading State -->
      <div v-if="loading" class="p-12 text-center text-xs text-muted-foreground space-y-2">
        <RefreshCw class="size-6 animate-spin mx-auto text-primary" />
        <p class="font-medium text-foreground">Loading manual time requests...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredRequests.length === 0" class="p-12 text-center text-xs space-y-3">
        <div class="size-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
          <FileText class="size-6 text-muted-foreground/60" />
        </div>
        <div class="space-y-1">
          <p class="font-semibold text-foreground text-sm">
            {{ activeTab === 'Pending' ? 'No pending manual time requests awaiting approval.' : 'No manual time records found.' }}
          </p>
          <p class="text-muted-foreground max-w-md mx-auto">
            When missing attendance punches or adjustments are submitted via <strong>Daily Attendance → Adjust</strong>, they will appear here for review.
          </p>
        </div>
      </div>

      <!-- Table View -->
      <div v-else class="overflow-x-auto">
        <Table class="text-xs">
          <TableHeader>
            <TableRow class="bg-muted/50 hover:bg-muted/50 border-b">
              <TableHead class="font-semibold text-foreground min-w-[170px]">Employee</TableHead>
              <TableHead class="font-semibold text-foreground min-w-[110px]">Date</TableHead>
              <TableHead class="font-semibold text-foreground min-w-[140px]">Original Captured</TableHead>
              <TableHead class="font-semibold text-foreground min-w-[150px]">Requested Adjustment</TableHead>
              <TableHead class="font-semibold text-foreground min-w-[180px]">Reason / Notes</TableHead>
              <TableHead class="font-semibold text-foreground min-w-[130px]">Requested By</TableHead>
              <TableHead class="font-semibold text-foreground text-center w-[100px]">Status</TableHead>
              <TableHead class="font-semibold text-foreground text-right w-[90px]">Action</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <TableRow
              v-for="req in filteredRequests"
              :key="req.id"
              class="hover:bg-muted/30 transition-colors border-b last:border-b-0"
              :class="req.status === 'Pending' ? 'bg-amber-500/5' : ''"
            >
              <!-- 1. Employee -->
              <TableCell class="py-2.5">
                <div class="flex flex-col gap-0.5">
                  <span class="font-semibold text-foreground">{{ req.employeeName || `User #${req.bioId}` }}</span>
                  <div class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span class="font-mono">#{{ req.bioId }}</span>
                    <span v-if="req.scheduleContext">· {{ req.scheduleContext }}</span>
                  </div>
                </div>
              </TableCell>

              <!-- 2. Target Date -->
              <TableCell class="py-2.5 font-medium whitespace-nowrap">
                <div class="flex flex-col">
                  <span>{{ formatDateDisplay(req.date) }}</span>
                  <span class="font-mono text-[10px] text-muted-foreground">{{ req.date }}</span>
                </div>
              </TableCell>

              <!-- 3. Original Captured Attendance -->
              <TableCell class="py-2.5 font-mono text-[11px]">
                <div class="flex flex-col gap-0.5">
                  <div class="flex items-center gap-1">
                    <span class="text-[10px] text-muted-foreground font-sans font-medium">IN:</span>
                    <span :class="req.originalIn === '—' || !req.originalIn ? 'text-amber-600 font-sans' : 'text-foreground'">
                      {{ req.originalIn || '—' }}
                    </span>
                  </div>
                  <div class="flex items-center gap-1">
                    <span class="text-[10px] text-muted-foreground font-sans font-medium">OUT:</span>
                    <span :class="req.originalOut === '—' || !req.originalOut ? 'text-muted-foreground' : 'text-foreground'">
                      {{ req.originalOut || '—' }}
                    </span>
                  </div>
                </div>
              </TableCell>

              <!-- 4. Requested Adjustment -->
              <TableCell class="py-2.5 font-mono text-[11px]">
                <div class="flex flex-col gap-0.5">
                  <div v-if="req.manualIn" class="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                    <span class="text-[10px] text-emerald-600/80 font-sans font-medium">IN:</span>
                    <span>{{ req.manualIn }}</span>
                    <span class="text-[9px] px-1 rounded bg-emerald-500/10 uppercase font-sans">Adjusted</span>
                  </div>
                  <div v-else class="text-muted-foreground text-[10px] font-sans">
                    IN: Unchanged
                  </div>

                  <div v-if="req.manualOut" class="flex items-center gap-1 font-semibold text-blue-700 dark:text-blue-400">
                    <span class="text-[10px] text-blue-600/80 font-sans font-medium">OUT:</span>
                    <span>{{ req.manualOut }}</span>
                    <span class="text-[9px] px-1 rounded bg-blue-500/10 uppercase font-sans">Adjusted</span>
                  </div>
                  <div v-else class="text-muted-foreground text-[10px] font-sans">
                    OUT: Unchanged
                  </div>
                </div>
              </TableCell>

              <!-- 5. Reason / Notes -->
              <TableCell class="py-2.5">
                <div class="max-w-[240px]">
                  <p class="font-medium text-foreground line-clamp-2" :title="req.reason">
                    {{ req.reason || req.notes || 'Manual Adjustment Request' }}
                  </p>
                  <p v-if="req.rejectionReason" class="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">
                    Rejection note: {{ req.rejectionReason }}
                  </p>
                </div>
              </TableCell>

              <!-- 6. Requested By & Timestamp -->
              <TableCell class="py-2.5 text-[11px]">
                <div class="flex flex-col gap-0.5">
                  <span class="font-medium text-foreground">{{ req.requestedBy || 'Admin' }}</span>
                  <span class="text-[10px] text-muted-foreground font-mono">{{ formatTimestamp(req.requestedAt) }}</span>
                </div>
              </TableCell>

              <!-- 7. Status Badge -->
              <TableCell class="py-2.5 text-center">
                <Badge
                  :variant="req.status === 'Approved' ? 'success' : (req.status === 'Pending' ? 'warning' : 'destructive')"
                  class="text-[10px] gap-1 font-medium whitespace-nowrap"
                >
                  <Clock v-if="req.status === 'Pending'" class="size-2.5" />
                  <CheckCircle2 v-else-if="req.status === 'Approved'" class="size-2.5" />
                  <XCircle v-else class="size-2.5" />
                  <span>{{ req.status }}</span>
                </Badge>
              </TableCell>

              <!-- 8. Action Button -->
              <TableCell class="py-2.5 text-right">
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7 px-2.5 text-xs font-semibold shadow-2xs"
                  :class="req.status === 'Pending' ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90' : 'hover:bg-muted'"
                  @click="openReviewModal(req)"
                >
                  <span>{{ req.status === 'Pending' ? 'Review' : 'Details' }}</span>
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>

    <!-- Review & Authorization Dialog -->
    <Dialog v-model:open="isReviewDialogOpen">
      <DialogContent class="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <UserCheck class="size-5 text-primary" />
            <span>Review Manual Time Adjustment</span>
          </DialogTitle>
          <DialogDescription class="text-xs">
            Inspect requested attendance corrections for <strong>{{ selectedRequest?.employeeName || selectedRequest?.bioId }}</strong> on {{ selectedRequest?.date }}.
          </DialogDescription>
        </DialogHeader>

        <div v-if="selectedRequest" class="space-y-3 py-1 text-xs">
          <!-- Employee & Schedule Header -->
          <div class="p-3 rounded-lg border bg-muted/40 space-y-1">
            <div class="flex items-center justify-between font-semibold text-foreground">
              <span>{{ selectedRequest.employeeName }} (#{{ selectedRequest.bioId }})</span>
              <Badge
                :variant="selectedRequest.status === 'Approved' ? 'success' : (selectedRequest.status === 'Pending' ? 'warning' : 'destructive')"
                class="text-[10px]"
              >
                {{ selectedRequest.status }}
              </Badge>
            </div>
            <div class="text-[11px] text-muted-foreground flex items-center justify-between">
              <span>Date: {{ formatDateDisplay(selectedRequest.date) }}</span>
              <span v-if="selectedRequest.scheduleContext">{{ selectedRequest.scheduleContext }}</span>
            </div>
          </div>

          <!-- Comparison: Original vs Requested -->
          <div class="grid grid-cols-2 gap-2.5">
            <!-- Original Captured -->
            <div class="p-2.5 rounded-lg border border-border bg-background space-y-1.5">
              <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Original Captured</span>
              <div class="font-mono text-xs space-y-1">
                <div>IN: <span class="font-semibold">{{ selectedRequest.originalIn || '—' }}</span></div>
                <div>OUT: <span class="font-semibold">{{ selectedRequest.originalOut || '—' }}</span></div>
              </div>
            </div>

            <!-- Requested Adjustment -->
            <div class="p-2.5 rounded-lg border border-primary/30 bg-primary/5 space-y-1.5">
              <span class="text-[10px] font-bold uppercase tracking-wider text-primary">Requested Adjustment</span>
              <div class="font-mono text-xs space-y-1">
                <div class="text-emerald-700 dark:text-emerald-300">
                  IN: <span class="font-bold">{{ selectedRequest.manualIn || 'Unchanged' }}</span>
                </div>
                <div class="text-blue-700 dark:text-blue-300">
                  OUT: <span class="font-bold">{{ selectedRequest.manualOut || 'Unchanged' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Notes / Reason -->
          <div class="space-y-1">
            <label class="font-semibold text-foreground text-xs">Request Notes / Reason</label>
            <div class="p-2.5 rounded-md border bg-muted/30 text-foreground text-xs leading-relaxed">
              {{ selectedRequest.reason || selectedRequest.notes || 'No notes provided.' }}
            </div>
          </div>

          <!-- Submission Audit Info -->
          <div class="text-[11px] text-muted-foreground p-2 rounded bg-muted/20 border flex items-center justify-between">
            <span>Requested by: <strong class="text-foreground">{{ selectedRequest.requestedBy }}</strong></span>
            <span class="font-mono">{{ formatTimestamp(selectedRequest.requestedAt) }}</span>
          </div>

          <!-- Already Approved / Rejected Info -->
          <div v-if="selectedRequest.status === 'Approved'" class="p-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 text-[11px] flex items-center gap-1.5">
            <CheckCircle2 class="size-4 shrink-0 text-emerald-600" />
            <span>Approved by <strong>{{ selectedRequest.approvedBy || 'Admin' }}</strong> on {{ formatTimestamp(selectedRequest.approvedAt || selectedRequest.updatedAt) }}. Reflected in Daily Attendance.</span>
          </div>

          <div v-else-if="selectedRequest.status === 'Rejected'" class="p-2.5 rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200 text-[11px] space-y-1">
            <div class="flex items-center gap-1.5 font-semibold">
              <XCircle class="size-4 shrink-0 text-rose-600" />
              <span>Rejected by {{ selectedRequest.reviewedBy || 'Admin' }} on {{ formatTimestamp(selectedRequest.reviewedAt) }}.</span>
            </div>
            <div v-if="selectedRequest.rejectionReason" class="text-[11px] text-rose-700 dark:text-rose-300">
              Reason: {{ selectedRequest.rejectionReason }}
            </div>
          </div>

          <!-- Rejection Input (Expandable) -->
          <div v-if="showRejectionInput && selectedRequest.status === 'Pending'" class="space-y-1 pt-1 border-t">
            <label class="font-semibold text-destructive text-xs">Reason for Rejection</label>
            <Textarea
              v-model="rejectionReasonInput"
              placeholder="Provide reason for rejecting this manual time adjustment..."
              class="h-16 text-xs"
            />
          </div>
        </div>

        <DialogFooter class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 border-t pt-3">
          <!-- Left: Delete/Dismiss action -->
          <Button
            variant="ghost"
            size="sm"
            class="h-8 text-xs text-destructive hover:bg-destructive/10"
            @click="selectedRequest && handleDelete(selectedRequest)"
          >
            <Trash2 class="size-3.5 mr-1" />
            <span>Delete Record</span>
          </Button>

          <!-- Right Action Buttons -->
          <div class="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              class="h-8 text-xs"
              @click="isReviewDialogOpen = false"
            >
              Cancel
            </Button>

            <!-- Pending Review Actions -->
            <template v-if="selectedRequest?.status === 'Pending'">
              <Button
                v-if="!showRejectionInput"
                variant="destructive"
                size="sm"
                class="h-8 text-xs font-semibold"
                @click="showRejectionInput = true"
              >
                Reject Request
              </Button>
              <Button
                v-else
                variant="destructive"
                size="sm"
                class="h-8 text-xs font-semibold"
                :disabled="isSubmittingAction"
                @click="handleReject"
              >
                Confirm Rejection
              </Button>

              <Button
                variant="default"
                size="sm"
                class="h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-xs"
                :disabled="isSubmittingAction"
                @click="handleApprove"
              >
                <Check class="size-3.5" />
                <span>Approve Adjustment</span>
              </Button>
            </template>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
