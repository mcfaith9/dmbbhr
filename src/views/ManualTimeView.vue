<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Check,
  Trash2,
  RefreshCw,
  UserCheck,
  History,
  ChevronLeft,
  ChevronRight,
  Plus,
  Send
} from '@lucide/vue'
import { attendanceService } from '@/services/attendance'
import { authService } from '@/services/auth'
import { employeeService } from '@/services/employees'
import type { Employee } from '@/types'
import type { ManualAttendanceRecord, ManualAttendanceHistoryRecord } from '@/db'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  isValidTimeString,
  normalizeTimeToHHMM,
  hasTimeChanged,
  formatHHMMTo12Hour,
  formatOriginalTimeDisplay
} from '@/lib/timeUtils'

// Top-level View Section: 'requests' (active workflow) vs 'history' (persistent completed log)
const activeSection = ref<'requests' | 'history'>('requests')

// Requests State
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

// History State
const historyRecords = ref<ManualAttendanceHistoryRecord[]>([])
const historyLoading = ref(false)
const historyStatusFilter = ref<'all' | 'Approved' | 'Rejected'>('all')
const historySearchQuery = ref('')
const historyDateFilter = ref('')
const historyPage = ref(1)
const historyPageSize = ref(10)
const historyTotal = ref(0)
const historyApprovedCount = ref(0)
const historyRejectedCount = ref(0)
const historyTotalPages = ref(1)

const currentUser = authService.currentUser

async function loadRequests() {
  loading.value = true
  try {
    requests.value = await attendanceService.getManualTimeRequests('all')
  } finally {
    loading.value = false
  }
}

async function loadHistory() {
  historyLoading.value = true
  try {
    const res = await attendanceService.getManualAttendanceHistory({
      status: historyStatusFilter.value,
      search: historySearchQuery.value,
      date: historyDateFilter.value,
      page: historyPage.value,
      pageSize: historyPageSize.value
    })
    historyRecords.value = res.records
    historyTotal.value = res.total
    historyApprovedCount.value = res.approvedCount
    historyRejectedCount.value = res.rejectedCount
    historyTotalPages.value = res.totalPages
  } finally {
    historyLoading.value = false
  }
}

async function handleRefresh() {
  if (activeSection.value === 'requests') {
    await loadRequests()
  } else {
    await loadHistory()
  }
}

// Watchers for History filters
watch([historyStatusFilter, historyDateFilter], () => {
  historyPage.value = 1
  loadHistory()
})

let searchDebounceTimer: any = null
function onHistorySearchInput() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    historyPage.value = 1
    loadHistory()
  }, 250)
}

function changeHistoryPage(newPage: number) {
  if (newPage < 1 || newPage > historyTotalPages.value) return
  historyPage.value = newPage
  loadHistory()
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

function cleanTime(t?: string) {
  if (!t) return ''
  return t.replace(/\s*\(Manual\)/gi, '').trim()
}

function hasInChanged(req?: ManualAttendanceRecord | null) {
  if (!req || !req.manualIn) return false
  return hasTimeChanged(req.originalIn, req.manualIn)
}

function hasOutChanged(req?: ManualAttendanceRecord | null) {
  if (!req || !req.manualOut) return false
  return hasTimeChanged(req.originalOut, req.manualOut)
}

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
    await Promise.all([loadRequests(), loadHistory()])
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
    await Promise.all([loadRequests(), loadHistory()])
  } finally {
    isSubmittingAction.value = false
  }
}

// Delete confirmation dialog state (shadcn-vue Dialog)
const isDeleteDialogOpen = ref(false)
const requestToDelete = ref<ManualAttendanceRecord | null>(null)
const isDeleting = ref(false)

function handleDelete(req: ManualAttendanceRecord) {
  requestToDelete.value = req
  isDeleteDialogOpen.value = true
}

async function confirmDelete() {
  if (!requestToDelete.value) return
  isDeleting.value = true
  try {
    const targetId = requestToDelete.value.id
    await attendanceService.deleteManualAdjustment(targetId)
    if (selectedRequest.value?.id === targetId) {
      isReviewDialogOpen.value = false
      selectedRequest.value = null
    }
    isDeleteDialogOpen.value = false
    requestToDelete.value = null
    await Promise.all([loadRequests(), loadHistory()])
  } finally {
    isDeleting.value = false
  }
}

// New Manual Time Adjustment Workflow State
const isNewAdjustmentDialogOpen = ref(false)
const allEmployees = ref<Employee[]>([])
const newAdjustmentEmployeeId = ref('')
const newAdjustmentDate = ref(new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date()))
const newAdjustmentOrigIn = ref('—')
const newAdjustmentOrigOut = ref('—')
const newAdjustmentSchedule = ref('')
const newAdjustmentIn = ref('')
const newAdjustmentOut = ref('')
const newAdjustmentNotes = ref('')
const isFetchingOriginalAttendance = ref(false)
const isSubmittingNewAdjustment = ref(false)
const newAdjustmentError = ref('')
const newAdjustmentSuccess = ref('')

async function openNewAdjustmentModal() {
  newAdjustmentError.value = ''
  newAdjustmentSuccess.value = ''
  newAdjustmentIn.value = ''
  newAdjustmentOut.value = ''
  newAdjustmentNotes.value = ''
  newAdjustmentOrigIn.value = '—'
  newAdjustmentOrigOut.value = '—'
  newAdjustmentSchedule.value = ''

  if (allEmployees.value.length === 0) {
    try {
      const emps = await employeeService.getEmployees()
      allEmployees.value = emps.filter(e => e.status !== 'resigned')
    } catch {
      // ignore
    }
  }

  if (!newAdjustmentEmployeeId.value && allEmployees.value.length > 0) {
    newAdjustmentEmployeeId.value = allEmployees.value[0].biometric_user_id
  }

  isNewAdjustmentDialogOpen.value = true
  if (newAdjustmentEmployeeId.value) {
    fetchOriginalAttendance()
  }
}

async function fetchOriginalAttendance() {
  if (!newAdjustmentEmployeeId.value || !newAdjustmentDate.value) return
  isFetchingOriginalAttendance.value = true
  try {
    const records = await attendanceService.getDailyAttendance(
      newAdjustmentDate.value,
      'all',
      'all',
      {},
      newAdjustmentEmployeeId.value
    )
    if (records && records.length > 0) {
      const rec = records[0]
      newAdjustmentOrigIn.value = rec.actual_in
      newAdjustmentOrigOut.value = rec.actual_out
      newAdjustmentSchedule.value = `${rec.expected_in} → ${rec.expected_out} (${rec.work_group_name})`
      newAdjustmentIn.value = normalizeTimeToHHMM(rec.actual_in) || ''
      newAdjustmentOut.value = normalizeTimeToHHMM(rec.actual_out) || ''
    } else {
      newAdjustmentOrigIn.value = '—'
      newAdjustmentOrigOut.value = '—'
      newAdjustmentSchedule.value = ''
      newAdjustmentIn.value = ''
      newAdjustmentOut.value = ''
    }
  } finally {
    isFetchingOriginalAttendance.value = false
  }
}

watch([newAdjustmentEmployeeId, newAdjustmentDate], () => {
  if (isNewAdjustmentDialogOpen.value) {
    fetchOriginalAttendance()
  }
})

const newInStatus = computed(() => {
  const orig = newAdjustmentOrigIn.value
  const requested = newAdjustmentIn.value.trim()
  if (!requested) {
    return { state: 'empty', label: 'Not specified', changed: false, valid: true }
  }
  if (!isValidTimeString(requested)) {
    return { state: 'invalid', label: 'Invalid time. Please enter a valid time.', changed: false, valid: false }
  }
  const changed = hasTimeChanged(orig, requested)
  if (changed) {
    return { state: 'changed', label: '✓ Changed', changed: true, valid: true }
  }
  return { state: 'unchanged', label: 'No change', changed: false, valid: true }
})

const newOutStatus = computed(() => {
  const orig = newAdjustmentOrigOut.value
  const requested = newAdjustmentOut.value.trim()
  if (!requested) {
    return { state: 'empty', label: 'Not specified', changed: false, valid: true }
  }
  if (!isValidTimeString(requested)) {
    return { state: 'invalid', label: 'Invalid time. Please enter a valid time.', changed: false, valid: false }
  }
  const changed = hasTimeChanged(orig, requested)
  if (changed) {
    return { state: 'changed', label: '✓ Changed', changed: true, valid: true }
  }
  return { state: 'unchanged', label: 'No change', changed: false, valid: true }
})

const hasNewAdjustmentChange = computed(() => {
  return newInStatus.value.changed || newOutStatus.value.changed
})

const hasNewInvalidTime = computed(() => {
  return !newInStatus.value.valid || !newOutStatus.value.valid
})

const canSubmitNewAdjustment = computed(() => {
  if (isSubmittingNewAdjustment.value || !!newAdjustmentSuccess.value) return false
  if (!newAdjustmentEmployeeId.value || !newAdjustmentDate.value) return false
  if (hasNewInvalidTime.value) return false
  if (!newAdjustmentIn.value.trim() && !newAdjustmentOut.value.trim()) return false
  return hasNewAdjustmentChange.value
})

async function submitNewAdjustment() {
  newAdjustmentError.value = ''
  if (!newAdjustmentEmployeeId.value) {
    newAdjustmentError.value = 'Please select an employee.'
    return
  }
  if (!newAdjustmentDate.value) {
    newAdjustmentError.value = 'Please select an attendance date.'
    return
  }

  const inVal = newAdjustmentIn.value.trim()
  const outVal = newAdjustmentOut.value.trim()

  if (!inVal && !outVal) {
    newAdjustmentError.value = 'Please provide at least a Time IN or Time OUT adjustment.'
    return
  }

  if (inVal && !isValidTimeString(inVal)) {
    newAdjustmentError.value = 'Invalid Time IN. Please enter a valid time.'
    return
  }

  if (outVal && !isValidTimeString(outVal)) {
    newAdjustmentError.value = 'Invalid Time OUT. Please enter a valid time.'
    return
  }

  const inChanged = inVal ? hasTimeChanged(newAdjustmentOrigIn.value, inVal) : false
  const outChanged = outVal ? hasTimeChanged(newAdjustmentOrigOut.value, outVal) : false

  if (!inChanged && !outChanged) {
    newAdjustmentError.value = 'No changes detected. Please modify the Time IN or Time OUT before submitting an adjustment.'
    return
  }

  isSubmittingNewAdjustment.value = true
  try {
    const requesterName = currentUser.value?.name || currentUser.value?.username || 'Admin'
    const emp = allEmployees.value.find(e => e.biometric_user_id === newAdjustmentEmployeeId.value)
    const empName = emp?.full_name || `Employee #${newAdjustmentEmployeeId.value}`

    const formattedIn = inVal ? formatHHMMTo12Hour(inVal) : undefined
    const formattedOut = outVal ? formatHHMMTo12Hour(outVal) : undefined

    await attendanceService.submitManualTimeRequest({
      bioId: newAdjustmentEmployeeId.value,
      employeeName: empName,
      date: newAdjustmentDate.value,
      scheduleContext: newAdjustmentSchedule.value || undefined,
      originalIn: newAdjustmentOrigIn.value.replace(/\s*\(Manual\)/gi, '').trim(),
      originalOut: newAdjustmentOrigOut.value.replace(/\s*\(Manual\)/gi, '').trim(),
      manualIn: formattedIn,
      manualOut: formattedOut,
      notes: newAdjustmentNotes.value.trim() || 'Manual attendance adjustment request',
      requestedBy: requesterName
    })

    newAdjustmentSuccess.value = 'Manual adjustment request submitted successfully.'
    setTimeout(() => {
      isNewAdjustmentDialogOpen.value = false
      loadRequests()
    }, 900)
  } catch (err: any) {
    newAdjustmentError.value = err?.message || 'Failed to submit adjustment request.'
  } finally {
    isSubmittingNewAdjustment.value = false
  }
}

function formatLongDate(dateStr?: string) {
  if (!dateStr) return '—'
  try {
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    }
    return dateStr
  } catch {
    return dateStr
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
      year: 'numeric',
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
  loadHistory()
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
          <span
            v-if="stats.pending > 0"
            class="text-xs px-2.5 py-0.5 rounded-md border bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 font-mono font-medium"
          >
            {{ stats.pending }} Pending Review
          </span>
          <span
            v-else
            class="text-xs px-2.5 py-0.5 rounded-md border bg-muted/50 font-mono font-medium text-muted-foreground"
          >
            All Caught Up
          </span>
        </div>
        <p class="text-xs text-muted-foreground">
          Dedicated workflow for reviewing, authorizing, and auditing manual attendance adjustments and transaction history.
        </p>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <!-- Main Section Switcher: Requests vs History -->
        <div class="flex items-center p-1 rounded-lg bg-muted/60 border text-xs">
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1 rounded-md font-semibold transition-all cursor-pointer"
            :class="activeSection === 'requests' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'"
            @click="activeSection = 'requests'"
          >
            <FileText class="size-3.5" />
            <span>Requests</span>
            <span
              v-if="stats.pending > 0"
              class="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 font-bold"
            >
              {{ stats.pending }}
            </span>
          </button>

          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1 rounded-md font-semibold transition-all cursor-pointer"
            :class="activeSection === 'history' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'"
            @click="activeSection = 'history'"
          >
            <History class="size-3.5" />
            <span>History</span>
            <span
              v-if="historyTotal > 0"
              class="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-muted text-muted-foreground font-mono"
            >
              {{ historyTotal }}
            </span>
          </button>
        </div>

        <Button
          variant="outline"
          size="sm"
          class="h-8 gap-1.5 text-xs font-semibold shadow-xs cursor-pointer"
          @click="openNewAdjustmentModal"
        >
          <Plus class="size-3.5" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          class="h-8 gap-1.5 text-xs font-medium"
          :disabled="loading || historyLoading"
          @click="handleRefresh"
        >
          <RefreshCw :class="['size-3.5', (loading || historyLoading) ? 'animate-spin' : '']" />
        </Button>
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- SECTION 1: REQUESTS WORKFLOW (Pending, Approved, Rejected, All)           -->
    <!-- ========================================================================= -->
    <template v-if="activeSection === 'requests'">
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
            All Adjustment Requests
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
            class="px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer"
            :class="activeTab === 'Pending' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
            @click="activeTab = 'Pending'"
          >
            Pending ({{ stats.pending }})
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer"
            :class="activeTab === 'Approved' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
            @click="activeTab = 'Approved'"
          >
            Approved ({{ stats.approved }})
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer"
            :class="activeTab === 'Rejected' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
            @click="activeTab = 'Rejected'"
          >
            Rejected ({{ stats.rejected }})
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer"
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
                <TableHead class="font-semibold text-foreground min-w-[100px]">Date</TableHead>
                <TableHead class="font-semibold text-foreground min-w-[130px]">Current IN / OUT</TableHead>
                <TableHead class="font-semibold text-foreground min-w-[170px]">Requested Adjustment</TableHead>
                <TableHead class="font-semibold text-foreground min-w-[180px]">Reason / Notes</TableHead>
                <TableHead class="font-semibold text-foreground min-w-[120px]">Requested By</TableHead>
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

                <!-- 3. Current / Original Captured Attendance -->
                <TableCell class="py-2.5 font-mono text-[11px]">
                  <div class="flex flex-col gap-0.5">
                    <div class="flex items-center gap-1">
                      <span class="text-[10px] text-muted-foreground font-sans font-medium">IN:</span>
                      <span :class="req.originalIn === '—' || !req.originalIn ? 'text-amber-600 font-sans' : 'text-foreground'">
                        {{ cleanTime(req.originalIn) || '—' }}
                      </span>
                    </div>
                    <div class="flex items-center gap-1">
                      <span class="text-[10px] text-muted-foreground font-sans font-medium">OUT:</span>
                      <span :class="req.originalOut === '—' || !req.originalOut ? 'text-muted-foreground' : 'text-foreground'">
                        {{ cleanTime(req.originalOut) || '—' }}
                      </span>
                    </div>
                  </div>
                </TableCell>

                <!-- 4. Requested Adjustment (Distinguishes Adjusted vs No change) -->
                <TableCell class="py-2.5 font-mono text-[11px]">
                  <div class="flex flex-col gap-1">
                    <!-- IN Status -->
                    <div v-if="hasInChanged(req)" class="flex items-center gap-1.5 flex-wrap">
                      <span class="text-[10px] text-emerald-700 dark:text-emerald-400 font-sans font-bold">IN:</span>
                      <span class="font-bold text-emerald-700 dark:text-emerald-400">{{ req.manualIn }}</span>
                      <span class="text-[9px] px-1.5 py-0.2 rounded font-sans font-semibold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">
                        Adjusted
                      </span>
                    </div>
                    <div v-else class="flex items-center gap-1 text-muted-foreground text-[10px] font-sans">
                      <span class="font-medium">IN:</span>
                      <span class="font-mono text-[11px]">{{ cleanTime(req.originalIn) || '—' }}</span>
                      <span class="text-[9px] text-muted-foreground/70 italic">(No change)</span>
                    </div>

                    <!-- OUT Status -->
                    <div v-if="hasOutChanged(req)" class="flex items-center gap-1.5 flex-wrap">
                      <span class="text-[10px] text-blue-700 dark:text-blue-400 font-sans font-bold">OUT:</span>
                      <span class="font-bold text-blue-700 dark:text-blue-400">{{ req.manualOut }}</span>
                      <span class="text-[9px] px-1.5 py-0.2 rounded font-sans font-semibold bg-blue-500/15 text-blue-800 dark:text-blue-300">
                        Adjusted
                      </span>
                    </div>
                    <div v-else class="flex items-center gap-1 text-muted-foreground text-[10px] font-sans">
                      <span class="font-medium">OUT:</span>
                      <span class="font-mono text-[11px]">{{ cleanTime(req.originalOut) || '—' }}</span>
                      <span class="text-[9px] text-muted-foreground/70 italic">(No change)</span>
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
                    :variant="
                      req.status === 'Approved'
                        ? 'success'
                        : req.status === 'Pending'
                          ? 'warning'
                          : 'destructive'
                    "
                    :class="[
                      'text-[10px] gap-1 font-medium whitespace-nowrap',
                      req.status !== 'Approved' && req.status !== 'Pending'
                        ? 'px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/30'
                        : ''
                    ]"
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
                    variant="default"
                    size="sm"
                    class="h-7 px-2.5 text-xs font-semibold shadow-2xs cursor-pointer"
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
    </template>

    <!-- ========================================================================= -->
    <!-- SECTION 2: TRANSACTION HISTORY (Persistent Approved & Rejected Log)       -->
    <!-- ========================================================================= -->
    <template v-else-if="activeSection === 'history'">
      <!-- History Quick Stats Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div
          class="rounded-xl border bg-card p-3 shadow-xs cursor-pointer transition-all"
          :class="historyStatusFilter === 'all' ? 'ring-2 ring-primary/50 border-primary/50 bg-primary/5' : 'hover:bg-muted/40'"
          @click="historyStatusFilter = 'all'"
        >
          <span class="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
            <History class="size-3 text-primary" />
            Total Transactions
          </span>
          <div class="text-xl font-bold text-foreground mt-1 font-mono">
            {{ historyTotal }}
          </div>
        </div>

        <div
          class="rounded-xl border bg-card p-3 shadow-xs cursor-pointer transition-all"
          :class="historyStatusFilter === 'Approved' ? 'ring-2 ring-emerald-500/50 border-emerald-500/50 bg-emerald-500/5' : 'hover:bg-muted/40'"
          @click="historyStatusFilter = 'Approved'"
        >
          <span class="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
            <CheckCircle2 class="size-3 text-emerald-600 dark:text-emerald-400" />
            Approved Transactions
          </span>
          <div class="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
            {{ historyApprovedCount }}
          </div>
        </div>

        <div
          class="rounded-xl border bg-card p-3 shadow-xs cursor-pointer transition-all"
          :class="historyStatusFilter === 'Rejected' ? 'ring-2 ring-rose-500/50 border-rose-500/50 bg-rose-500/5' : 'hover:bg-muted/40'"
          @click="historyStatusFilter = 'Rejected'"
        >
          <span class="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
            <XCircle class="size-3 text-rose-600 dark:text-rose-400" />
            Rejected Transactions
          </span>
          <div class="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1 font-mono">
            {{ historyRejectedCount }}
          </div>
        </div>
      </div>

      <!-- History Filtering Toolbar -->
      <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
        <!-- Status Tabs: All, Approved, Rejected -->
        <div class="flex items-center gap-1 bg-muted/50 p-1 rounded-lg text-xs">
          <button
            type="button"
            class="px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer"
            :class="historyStatusFilter === 'all' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
            @click="historyStatusFilter = 'all'"
          >
            All ({{ historyTotal }})
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer"
            :class="historyStatusFilter === 'Approved' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
            @click="historyStatusFilter = 'Approved'"
          >
            Approved ({{ historyApprovedCount }})
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer"
            :class="historyStatusFilter === 'Rejected' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
            @click="historyStatusFilter = 'Rejected'"
          >
            Rejected ({{ historyRejectedCount }})
          </button>
        </div>

        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <!-- Date Filter using shadcn-vue DatePicker -->
          <div class="w-full sm:w-48">
            <DatePicker
              v-model="historyDateFilter"
              placeholder="Filter by date..."
              class="w-full text-xs h-8 bg-card"
            />
          </div>

          <!-- Search Field -->
          <div class="relative w-full sm:w-64">
            <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              v-model="historySearchQuery"
              placeholder="Search ID, name, remarks, admin..."
              class="pl-8 text-xs h-8 bg-card"
              @input="onHistorySearchInput"
            />
          </div>
        </div>
      </div>

      <!-- Transaction History Table -->
      <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
        <!-- Loading State -->
        <div v-if="historyLoading" class="p-12 text-center text-xs text-muted-foreground space-y-2">
          <RefreshCw class="size-6 animate-spin mx-auto text-primary" />
          <p class="font-medium text-foreground">Loading transaction history...</p>
        </div>

        <!-- Empty State -->
        <div v-else-if="historyRecords.length === 0" class="p-12 text-center text-xs space-y-3">
          <div class="size-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
            <History class="size-6 text-muted-foreground/60" />
          </div>
          <div class="space-y-1">
            <p class="font-semibold text-foreground text-sm">
              No transaction history recorded.
            </p>
            <p class="text-muted-foreground max-w-md mx-auto">
              Completed manual attendance approvals and rejections are permanently recorded here for audit compliance.
            </p>
          </div>
        </div>

        <!-- History Table View -->
        <div v-else class="overflow-x-auto">
          <Table class="text-xs">
            <TableHeader>
              <TableRow class="bg-muted/50 hover:bg-muted/50 border-b">
                <TableHead class="font-semibold text-foreground min-w-[140px]">Date/Time</TableHead>
                <TableHead class="font-semibold text-foreground min-w-[100px]">Employee ID</TableHead>
                <TableHead class="font-semibold text-foreground min-w-[160px]">Employee Name</TableHead>
                <TableHead class="font-semibold text-foreground min-w-[110px]">Attendance Date</TableHead>
                <TableHead class="font-semibold text-foreground min-w-[150px]">Attendance Time</TableHead>
                <TableHead class="font-semibold text-foreground w-[100px] text-center">Action</TableHead>
                <TableHead class="font-semibold text-foreground min-w-[200px]">Remarks</TableHead>
                <TableHead class="font-semibold text-foreground min-w-[120px]">Processed By</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              <TableRow
                v-for="record in historyRecords"
                :key="record.id"
                class="hover:bg-muted/30 transition-colors border-b last:border-b-0"
              >
                <!-- 1. Processed Date/Time -->
                <TableCell class="py-2.5 font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                  {{ formatTimestamp(record.processedAt) }}
                </TableCell>

                <!-- 2. Employee ID -->
                <TableCell class="py-2.5 font-mono text-xs font-semibold text-foreground whitespace-nowrap">
                  #{{ record.employeeId }}
                </TableCell>

                <!-- 3. Employee Name -->
                <TableCell class="py-2.5 font-medium text-foreground whitespace-nowrap">
                  {{ record.employeeName }}
                </TableCell>

                <!-- 4. Attendance Date -->
                <TableCell class="py-2.5 whitespace-nowrap">
                  <div class="flex flex-col">
                    <span class="font-medium text-foreground">{{ formatDateDisplay(record.attendanceDate) }}</span>
                    <span class="font-mono text-[10px] text-muted-foreground">{{ record.attendanceDate }}</span>
                  </div>
                </TableCell>

                <!-- 5. Attendance Time -->
                <TableCell class="py-2.5 font-mono text-[11px] text-foreground">
                  {{ record.attendanceTime || '—' }}
                </TableCell>

                <!-- 6. Action (Approved vs Rejected clearly distinguishable, NO unnecessary icons) -->
                <TableCell class="py-2.5 text-center whitespace-nowrap">
                  <span
                    v-if="record.status === 'Approved'"
                    class="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30"
                  >
                    Approved
                  </span>
                  <span
                    v-else
                    class="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/30"
                  >
                    Rejected
                  </span>
                </TableCell>

                <!-- 7. Remarks -->
                <TableCell class="py-2.5 text-foreground">
                  <div class="max-w-[260px] line-clamp-2 text-xs" :title="record.remarks">
                    {{ record.remarks || '—' }}
                  </div>
                </TableCell>

                <!-- 8. Processed By -->
                <TableCell class="py-2.5 text-xs font-medium text-foreground whitespace-nowrap">
                  {{ record.processedBy || 'Admin' }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <!-- History Pagination Controls -->
          <div class="p-3 border-t flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground bg-muted/20">
            <div>
              Showing <span class="font-semibold text-foreground">{{ ((historyPage - 1) * historyPageSize) + (historyRecords.length ? 1 : 0) }}</span> to
              <span class="font-semibold text-foreground">{{ Math.min(historyPage * historyPageSize, historyTotal) }}</span> of
              <span class="font-semibold text-foreground">{{ historyTotal }}</span> transactions
            </div>

            <div class="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                class="h-7 px-2 text-xs cursor-pointer"
                :disabled="historyPage <= 1"
                @click="changeHistoryPage(historyPage - 1)"
              >
                <ChevronLeft class="size-3.5 mr-1" />
                <span>Previous</span>
              </Button>

              <span class="px-2 font-mono text-[11px]">
                {{ historyPage }} / {{ historyTotalPages }}
              </span>

              <Button
                variant="outline"
                size="sm"
                class="h-7 px-2 text-xs cursor-pointer"
                :disabled="historyPage >= historyTotalPages"
                @click="changeHistoryPage(historyPage + 1)"
              >
                <span>Next</span>
                <ChevronRight class="size-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Review & Authorization Dialog (Optimized layout, container bounds, and explicit field breakdown) -->
    <Dialog v-model:open="isReviewDialogOpen">
      <DialogContent class="sm:max-w-[520px] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader class="space-y-1">
          <DialogTitle class="flex items-center gap-2 text-base font-bold">
            <UserCheck class="size-5 text-primary shrink-0" />
            <span>Review Manual Time Adjustment</span>
          </DialogTitle>
          <DialogDescription class="text-xs">
            Inspect and authorize attendance corrections for <strong>{{ selectedRequest?.employeeName || selectedRequest?.bioId }}</strong> on {{ selectedRequest?.date }}.
          </DialogDescription>
        </DialogHeader>

        <div v-if="selectedRequest" class="space-y-3.5 py-2 text-xs">
          <!-- Employee & Schedule Header Card -->
          <div class="p-3 rounded-lg border bg-muted/40 space-y-1.5">
            <div class="flex items-center justify-between font-semibold text-foreground text-sm">
              <span>{{ selectedRequest.employeeName }} (#{{ selectedRequest.bioId }})</span>
              <Badge
                :variant="selectedRequest.status === 'Approved' ? 'success' : (selectedRequest.status === 'Pending' ? 'warning' : 'destructive')"
                class="text-[10px]"
              >
                {{ selectedRequest.status }}
              </Badge>
            </div>
            <div class="text-[11px] text-muted-foreground flex items-center justify-between flex-wrap gap-1">
              <span>Date: <strong class="text-foreground">{{ formatDateDisplay(selectedRequest.date) }}</strong></span>
              <span v-if="selectedRequest.scheduleContext">Schedule: <strong class="text-foreground">{{ selectedRequest.scheduleContext }}</strong></span>
            </div>
          </div>

          <!-- Explicit Comparison: IN & OUT with Adjusted vs No change -->
          <div class="space-y-2">
            <label class="font-bold text-foreground text-xs uppercase tracking-wider text-muted-foreground block">
              Requested Adjustment Breakdown
            </label>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <!-- Time IN Card -->
              <div
                class="p-3 rounded-lg border transition-all"
                :class="hasInChanged(selectedRequest) ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-background'"
              >
                <div class="flex items-center justify-between mb-1.5">
                  <span class="font-bold uppercase tracking-wider text-[11px]" :class="hasInChanged(selectedRequest) ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'">
                    Time IN
                  </span>
                  <span
                    class="text-[10px] px-1.5 py-0.2 rounded font-semibold font-sans"
                    :class="hasInChanged(selectedRequest) ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300' : 'bg-muted text-muted-foreground'"
                  >
                    {{ hasInChanged(selectedRequest) ? 'Adjusted' : 'No change' }}
                  </span>
                </div>

                <div v-if="hasInChanged(selectedRequest)" class="space-y-1 font-mono text-xs">
                  <div class="text-muted-foreground text-[11px] flex items-center justify-between">
                    <span>Original:</span>
                    <span class="font-medium text-foreground">{{ cleanTime(selectedRequest.originalIn) || '—' }}</span>
                  </div>
                  <div class="text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-between pt-1 border-t border-emerald-500/20">
                    <span>Requested:</span>
                    <span class="text-sm">{{ selectedRequest.manualIn }}</span>
                  </div>
                </div>

                <div v-else class="space-y-1 font-mono text-xs">
                  <div class="flex items-center justify-between text-muted-foreground text-[11px]">
                    <span>Current:</span>
                    <span class="font-semibold text-foreground">{{ cleanTime(selectedRequest.originalIn) || cleanTime(selectedRequest.manualIn) || '—' }}</span>
                  </div>
                  <div class="text-[10px] font-sans text-muted-foreground/70 italic pt-1 border-t">
                    No adjustment requested for Time IN
                  </div>
                </div>
              </div>

              <!-- Time OUT Card -->
              <div
                class="p-3 rounded-lg border transition-all"
                :class="hasOutChanged(selectedRequest) ? 'border-blue-500/40 bg-blue-500/5' : 'border-border bg-background'"
              >
                <div class="flex items-center justify-between mb-1.5">
                  <span class="font-bold uppercase tracking-wider text-[11px]" :class="hasOutChanged(selectedRequest) ? 'text-blue-700 dark:text-blue-300' : 'text-foreground'">
                    Time OUT
                  </span>
                  <span
                    class="text-[10px] px-1.5 py-0.2 rounded font-semibold font-sans"
                    :class="hasOutChanged(selectedRequest) ? 'bg-blue-500/20 text-blue-800 dark:text-blue-300' : 'bg-muted text-muted-foreground'"
                  >
                    {{ hasOutChanged(selectedRequest) ? 'Adjusted' : 'No change' }}
                  </span>
                </div>

                <div v-if="hasOutChanged(selectedRequest)" class="space-y-1 font-mono text-xs">
                  <div class="text-muted-foreground text-[11px] flex items-center justify-between">
                    <span>Original:</span>
                    <span class="font-medium text-foreground">{{ cleanTime(selectedRequest.originalOut) || '—' }}</span>
                  </div>
                  <div class="text-blue-700 dark:text-blue-300 font-bold flex items-center justify-between pt-1 border-t border-blue-500/20">
                    <span>Requested:</span>
                    <span class="text-sm">{{ selectedRequest.manualOut }}</span>
                  </div>
                </div>

                <div v-else class="space-y-1 font-mono text-xs">
                  <div class="flex items-center justify-between text-muted-foreground text-[11px]">
                    <span>Current:</span>
                    <span class="font-semibold text-foreground">{{ cleanTime(selectedRequest.originalOut) || cleanTime(selectedRequest.manualOut) || '—' }}</span>
                  </div>
                  <div class="text-[10px] font-sans text-muted-foreground/70 italic pt-1 border-t">
                    No adjustment requested for Time OUT
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Reason / Notes -->
          <div class="space-y-1">
            <label class="font-semibold text-foreground text-xs">Request Notes / Reason</label>
            <div class="p-2.5 rounded-md border bg-muted/30 text-foreground text-xs leading-relaxed max-h-24 overflow-y-auto">
              {{ selectedRequest.reason || selectedRequest.notes || 'No notes provided.' }}
            </div>
          </div>

          <!-- Submission Audit Info -->
          <div class="text-[11px] text-muted-foreground p-2 rounded bg-muted/20 border flex items-center justify-between flex-wrap gap-1">
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
          <div v-if="showRejectionInput && selectedRequest.status === 'Pending'" class="space-y-1.5 pt-2 border-t">
            <label class="font-semibold text-destructive text-xs">Reason for Rejection</label>
            <Textarea
              v-model="rejectionReasonInput"
              placeholder="Provide reason for rejecting this manual time adjustment..."
              class="h-16 text-xs"
            />
          </div>
        </div>

        <DialogFooter class="border-t pt-3 flex flex-wrap items-center justify-between gap-2">
          <!-- Left: Delete/Dismiss action -->
          <Button
            variant="ghost"
            size="sm"
            class="h-8 text-xs text-destructive hover:bg-destructive/10 cursor-pointer"
            @click="selectedRequest && handleDelete(selectedRequest)"
          >
            <Trash2 class="size-3.5 mr-1" />
            <span>Delete Record</span>
          </Button>

          <!-- Right Action Buttons grouped together -->
          <div class="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              class="h-8 text-xs cursor-pointer"
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
                class="h-8 text-xs font-semibold cursor-pointer"
                @click="showRejectionInput = true"
              >
                Reject
              </Button>
              <Button
                v-else
                variant="destructive"
                size="sm"
                class="h-8 text-xs font-semibold cursor-pointer"
                :disabled="isSubmittingAction"
                @click="handleReject"
              >
                Confirm Rejection
              </Button>

              <Button
                variant="default"
                size="sm"
                class="h-8 text-xs font-semibold gap-1.5 shadow-xs cursor-pointer"
                :disabled="isSubmittingAction"
                @click="handleApprove"
              >
                <Check class="size-3.5" />
                <span>Approve</span>
              </Button>
            </template>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Confirmation Dialog (shadcn-vue Dialog) -->
    <Dialog v-model:open="isDeleteDialogOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-base font-bold text-destructive">
            <Trash2 class="size-4 text-destructive" />
            <span>Delete Manual Time Adjustment?</span>
          </DialogTitle>
          <DialogDescription class="text-xs text-muted-foreground">
            Are you sure you want to delete this manual time adjustment?
          </DialogDescription>
        </DialogHeader>

        <div v-if="requestToDelete" class="p-3 my-2 rounded-lg border bg-muted/40 space-y-1.5 text-xs">
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Employee:</span>
            <span class="font-semibold text-foreground">{{ requestToDelete.employeeName || `User #${requestToDelete.bioId}` }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Bio ID:</span>
            <span class="font-mono font-medium text-foreground">{{ requestToDelete.bioId }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Date:</span>
            <span class="font-medium text-foreground">{{ formatLongDate(requestToDelete.date) }}</span>
          </div>
        </div>

        <DialogFooter class="border-t pt-3 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            class="h-8 text-xs cursor-pointer"
            :disabled="isDeleting"
            @click="isDeleteDialogOpen = false"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            class="h-8 text-xs font-semibold cursor-pointer"
            :disabled="isDeleting"
            @click="confirmDelete"
          >
            <span v-if="isDeleting">Deleting...</span>
            <span v-else>Delete</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- New Manual Time Adjustment Dialog -->
    <Dialog v-model:open="isNewAdjustmentDialogOpen">
      <DialogContent class="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 font-bold text-base">
            <Clock class="size-5 text-primary" />
            <span>Create Manual Time Adjustment</span>
          </DialogTitle>
          <DialogDescription class="text-xs">
            Submit an attendance time adjustment request for HR/Admin approval.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-3.5 py-1 text-xs">
          <!-- Employee Selection -->
          <div class="space-y-1.5">
            <label class="font-semibold text-foreground text-xs block">
              Select Employee
            </label>
            <Select v-model="newAdjustmentEmployeeId">
              <SelectTrigger class="h-8 text-xs w-full bg-background">
                <SelectValue placeholder="Choose an employee..." />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem
                    v-for="emp in allEmployees"
                    :key="emp.biometric_user_id"
                    :value="emp.biometric_user_id"
                  >
                    {{ emp.full_name }} (#{{ emp.biometric_user_id }}) - {{ emp.location }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <!-- Date Selection -->
          <div class="space-y-1.5">
            <label class="font-semibold text-foreground text-xs block">
              Attendance Date
            </label>
            <input
              v-model="newAdjustmentDate"
              type="date"
              class="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <!-- Original Attendance Display Context -->
          <div class="p-3 rounded-lg border bg-muted/40 space-y-1.5">
            <div class="flex items-center justify-between font-semibold text-foreground text-xs">
              <span>Original Attendance on Selected Date</span>
              <span v-if="isFetchingOriginalAttendance" class="text-primary text-[10px] animate-pulse">Loading...</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1">
              <div>
                <span>Original IN: </span>
                <strong class="text-foreground font-mono">{{ formatOriginalTimeDisplay(newAdjustmentOrigIn) }}</strong>
              </div>
              <div>
                <span>Original OUT: </span>
                <strong class="text-foreground font-mono">{{ formatOriginalTimeDisplay(newAdjustmentOrigOut) }}</strong>
              </div>
            </div>
            <div v-if="newAdjustmentSchedule" class="text-[10px] text-muted-foreground pt-1 border-t border-muted/60">
              Schedule: <strong class="text-foreground">{{ newAdjustmentSchedule }}</strong>
            </div>
          </div>

          <!-- Error & Success messages -->
          <div v-if="newAdjustmentError" class="p-2.5 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-xs">
            {{ newAdjustmentError }}
          </div>

          <div v-if="newAdjustmentSuccess" class="p-2.5 rounded-md border border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-1.5">
            <CheckCircle2 class="size-4 shrink-0 text-emerald-600" />
            <span>{{ newAdjustmentSuccess }}</span>
          </div>

          <!-- Adjusted Time IN and Time OUT fields -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <!-- Time IN -->
            <div class="space-y-2 p-3 rounded-lg border bg-card">
              <div class="flex items-center justify-between">
                <label class="font-bold text-foreground text-xs uppercase tracking-wider">
                  Time IN
                </label>
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded font-semibold font-sans"
                  :class="[
                    newInStatus.state === 'changed' ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300' :
                    newInStatus.state === 'invalid' ? 'bg-destructive/20 text-destructive' :
                    'bg-muted text-muted-foreground'
                  ]"
                >
                  {{ newInStatus.label }}
                </span>
              </div>

              <div class="space-y-1 text-[11px]">
                <div class="flex items-center justify-between text-muted-foreground">
                  <span>Original:</span>
                  <span class="font-mono font-medium text-foreground">{{ formatOriginalTimeDisplay(newAdjustmentOrigIn) }}</span>
                </div>
                <div class="text-muted-foreground pt-1">
                  <span>Adjusted:</span>
                </div>
              </div>

              <input
                v-model="newAdjustmentIn"
                type="time"
                step="60"
                class="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs font-mono shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              />

              <div v-if="newInStatus.state === 'invalid'" class="text-[11px] text-destructive font-medium">
                Invalid time. Please enter a valid time.
              </div>
            </div>

            <!-- Time OUT -->
            <div class="space-y-2 p-3 rounded-lg border bg-card">
              <div class="flex items-center justify-between">
                <label class="font-bold text-foreground text-xs uppercase tracking-wider">
                  Time OUT
                </label>
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded font-semibold font-sans"
                  :class="[
                    newOutStatus.state === 'changed' ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300' :
                    newOutStatus.state === 'invalid' ? 'bg-destructive/20 text-destructive' :
                    'bg-muted text-muted-foreground'
                  ]"
                >
                  {{ newOutStatus.label }}
                </span>
              </div>

              <div class="space-y-1 text-[11px]">
                <div class="flex items-center justify-between text-muted-foreground">
                  <span>Original:</span>
                  <span class="font-mono font-medium text-foreground">{{ formatOriginalTimeDisplay(newAdjustmentOrigOut) }}</span>
                </div>
                <div class="text-muted-foreground pt-1">
                  <span>Adjusted:</span>
                </div>
              </div>

              <input
                v-model="newAdjustmentOut"
                type="time"
                step="60"
                class="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs font-mono shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              />

              <div v-if="newOutStatus.state === 'invalid'" class="text-[11px] text-destructive font-medium">
                Invalid time. Please enter a valid time.
              </div>
            </div>
          </div>

          <!-- Unchanged Notice if both valid but no change -->
          <div
            v-if="!hasNewAdjustmentChange && (newAdjustmentIn || newAdjustmentOut) && !hasNewInvalidTime"
            class="p-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-1.5"
          >
            <span>No changes detected. Please modify the Time IN or Time OUT before submitting an adjustment.</span>
          </div>

          <!-- Reason / Notes -->
          <div class="space-y-1.5">
            <label class="font-semibold text-foreground text-xs flex items-center justify-between">
              <span>Reason / Notes</span>
              <span class="text-[10px] font-normal text-muted-foreground">Required explanation</span>
            </label>
            <Textarea
              v-model="newAdjustmentNotes"
              placeholder="e.g. Employee forgot to punch IN on terminal due to orientation"
              class="h-16 text-xs resize-none"
            />
          </div>
        </div>

        <DialogFooter class="border-t pt-3 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            class="h-8 text-xs cursor-pointer"
            @click="isNewAdjustmentDialogOpen = false"
          >
            Cancel
          </Button>

          <Button
            variant="default"
            size="sm"
            class="h-8 text-xs font-semibold gap-1.5 shadow-xs cursor-pointer"
            :disabled="!canSubmitNewAdjustment"
            @click="submitNewAdjustment"
          >
            <Send class="size-3.5" />
            <span>{{ isSubmittingNewAdjustment ? 'Submitting...' : 'Submit Adjustment' }}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
