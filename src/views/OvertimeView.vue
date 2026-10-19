<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  FileText,
  Plus,
  Pencil,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  Search,
  Filter,
  ShieldAlert
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { overtimeRepository } from '@/repositories/overtimeRepository'
import { employeeRepository } from '@/repositories/employeeRepository'
import type { OvertimeAuthorizationRecord } from '@/db'
import type { Employee } from '@/types'
import OvertimeDialog from '@/components/OvertimeDialog.vue'

const overtimeList = ref<OvertimeAuthorizationRecord[]>([])
const employees = ref<Employee[]>([])
const isLoading = ref(true)
const searchQuery = ref('')
const statusFilter = ref<'all' | 'Approved' | 'Pending' | 'Rejected'>('all')

// Dialog & Edit state
const isDialogOpen = ref(false)
const editingRecord = ref<OvertimeAuthorizationRecord | null>(null)

async function loadData() {
  isLoading.value = true
  try {
    const [ots, emps] = await Promise.all([
      overtimeRepository.getAll(),
      employeeRepository.getAll()
    ])
    overtimeList.value = ots
    employees.value = emps
  } catch (err) {
    console.error('Error loading overtime records:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadData()
})

// Metrics
const totalForms = computed(() => overtimeList.value.length)
const approvedCount = computed(() => overtimeList.value.filter(o => o.status === 'Approved').length)
const pendingCount = computed(() => overtimeList.value.filter(o => o.status === 'Pending').length)
const totalApprovedHours = computed(() => {
  return overtimeList.value
    .filter(o => o.status === 'Approved')
    .reduce((sum, o) => sum + (Number(o.authorizedHours) || 0), 0)
    .toFixed(1)
})

// Filtered List
const filteredList = computed(() => {
  return overtimeList.value.filter(item => {
    if (statusFilter.value !== 'all' && item.status !== statusFilter.value) {
      return false
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim().toLowerCase()
      const nameMatch = item.employeeName.toLowerCase().includes(q)
      const bioMatch = item.bioId.toLowerCase().includes(q)
      const formMatch = (item.formNumber || '').toLowerCase().includes(q)
      const purposeMatch = (item.purpose || '').toLowerCase().includes(q)
      const dateMatch = (item.date || '').toLowerCase().includes(q)
      return nameMatch || bioMatch || formMatch || purposeMatch || dateMatch
    }
    return true
  })
})

function openCreateDialog() {
  editingRecord.value = null
  isDialogOpen.value = true
}

function openEditDialog(record: OvertimeAuthorizationRecord) {
  editingRecord.value = record
  isDialogOpen.value = true
}

async function handleApprove(id: string) {
  await overtimeRepository.updateStatus(id, 'Approved', 'HR Admin', 'Verified physical form with authorized supervisor signature')
  await loadData()
}

async function handleReject(id: string) {
  await overtimeRepository.updateStatus(id, 'Rejected', 'HR Admin', 'Physical form missing or supervisor signature absent')
  await loadData()
}

async function handleDelete(id: string) {
  if (confirm('Delete this overtime authorization record?')) {
    await overtimeRepository.deleteAuthorization(id)
    await loadData()
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header with DOLE Policy Banner -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <FileText class="size-5 text-indigo-600" />
          Authorized Overtime Management
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Audited physical overtime pre-approvals paired strictly with biometric checkout logs.
        </p>
      </div>

      <Button size="sm" class="h-8 gap-1.5 text-xs text-white" @click="openCreateDialog">
        <Plus class="size-3.5" />
        Record Physical OT Form
      </Button>

      <OvertimeDialog
        v-model:open="isDialogOpen"
        :editing-record="editingRecord"
        :employees="employees"
        @saved="loadData"
      />
    </div>

    <!-- Mandatory Rule Callout -->
    <div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
      <ShieldAlert class="size-4 text-amber-600 shrink-0 mt-0.5" />
      <div>
        <span class="font-semibold">Company Policy & DOLE Authorization Protocol:</span>
        Attendance after 5:00 PM is attendance data only; it does
        <span class="font-bold underline">never automatically authorize overtime</span>. Overtime earnings are payable
        <span class="font-bold">only</span> when an approved physical overtime form exists and will never exceed the authorized duration.
      </div>
    </div>

    <!-- KPI Summary Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Total Forms</span>
          <FileText class="size-3.5 text-muted-foreground" />
        </div>
        <div class="text-xl font-bold mt-1 text-foreground font-mono">{{ totalForms }}</div>
      </div>

      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Approved Forms</span>
          <CheckCircle class="size-3.5 text-emerald-600" />
        </div>
        <div class="text-xl font-bold mt-1 text-emerald-600 font-mono">{{ approvedCount }}</div>
      </div>

      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Pending Verification</span>
          <Clock class="size-3.5 text-amber-600" />
        </div>
        <div class="text-xl font-bold mt-1 text-amber-600 font-mono">{{ pendingCount }}</div>
      </div>

      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Approved OT Hours</span>
          <Clock class="size-3.5 text-indigo-600" />
        </div>
        <div class="text-xl font-bold mt-1 text-indigo-600 font-mono">{{ totalApprovedHours }} hrs</div>
      </div>
    </div>

    <!-- Filter & Search Toolbar -->
    <div class="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-card border rounded-lg p-2.5">
      <div class="relative w-full sm:w-72">
        <Search class="size-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
        <Input
          v-model="searchQuery"
          placeholder="Search by Employee, Bio ID, or Form #..."
          class="h-8 pl-8 text-xs"
        />
      </div>

      <div class="flex items-center gap-2 w-full sm:w-auto">
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter class="size-3.5" />
          <span>Status:</span>
        </div>
        <select
          v-model="statusFilter"
          class="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-hidden"
        >
          <option value="all">All Forms</option>
          <option value="Approved">Approved Only</option>
          <option value="Pending">Pending Only</option>
          <option value="Rejected">Rejected Only</option>
        </select>
      </div>
    </div>

    <!-- Overtime Forms Table -->
    <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow class="bg-muted/40">
            <TableHead class="font-semibold text-xs">Form Number</TableHead>
            <TableHead class="font-semibold text-xs">Employee</TableHead>
            <TableHead class="font-semibold text-xs">OT Date</TableHead>
            <TableHead class="font-semibold text-xs">Time Window</TableHead>
            <TableHead class="font-semibold text-xs">Authorized Hours</TableHead>
            <TableHead class="font-semibold text-xs">Purpose / Justification</TableHead>
            <TableHead class="font-semibold text-xs">Audited By</TableHead>
            <TableHead class="font-semibold text-xs">Status</TableHead>
            <TableHead class="font-semibold text-xs text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <TableRow v-if="filteredList.length === 0">
            <TableCell colspan="9" class="h-24 text-center text-xs text-muted-foreground">
              No overtime authorization records match your filter.
            </TableCell>
          </TableRow>

          <TableRow v-for="ot in filteredList" :key="ot.id" class="text-xs">
            <TableCell class="font-mono font-medium text-foreground">
              {{ ot.formNumber || '—' }}
            </TableCell>
            <TableCell>
              <div class="font-medium text-foreground">{{ ot.employeeName }}</div>
              <div class="text-[10px] text-muted-foreground font-mono">ID: {{ ot.bioId }} • {{ ot.department }}</div>
            </TableCell>
            <TableCell class="font-mono whitespace-nowrap">
              {{ ot.date }}
            </TableCell>
            <TableCell class="font-mono text-muted-foreground whitespace-nowrap">
              {{ ot.startTime }} → {{ ot.endTime }}
            </TableCell>
            <TableCell class="font-mono font-semibold text-indigo-600">
              {{ ot.authorizedHours }} hr{{ ot.authorizedHours === 1 ? '' : 's' }}
            </TableCell>
            <TableCell class="max-w-xs truncate" :title="ot.purpose">
              {{ ot.purpose }}
            </TableCell>
            <TableCell class="text-muted-foreground text-[11px]">
              {{ ot.approvedBy || 'Pending' }}
            </TableCell>
            <TableCell>
              <Badge
                :variant="ot.status === 'Approved' ? 'success' : ot.status === 'Pending' ? 'warning' : 'destructive'"
                class="text-[10px]"
              >
                {{ ot.status }}
              </Badge>
            </TableCell>
            <TableCell class="text-right">
              <div class="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-7 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                  title="Edit Authorization"
                  @click="openEditDialog(ot)"
                >
                  <Pencil class="size-3.5" />
                </Button>
                <Button
                  v-if="ot.status !== 'Approved'"
                  variant="ghost"
                  size="icon"
                  class="size-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                  title="Approve Form"
                  @click="handleApprove(ot.id)"
                >
                  <CheckCircle class="size-3.5" />
                </Button>
                <Button
                  v-if="ot.status !== 'Rejected'"
                  variant="ghost"
                  size="icon"
                  class="size-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950"
                  title="Reject Form"
                  @click="handleReject(ot.id)"
                >
                  <XCircle class="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-7 text-muted-foreground hover:text-destructive"
                  title="Delete"
                  @click="handleDelete(ot.id)"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
