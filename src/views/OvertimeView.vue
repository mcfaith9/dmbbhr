<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  FileText,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  Search,
  Filter,
  ShieldAlert,
  Fingerprint,
  Users,
  ChevronsUpDown,
  Check
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { TimePicker } from '@/components/ui/time-picker'
import {
  Popover,
  PopoverTrigger,
  PopoverContent
} from '@/components/ui/popover'
import { overtimeRepository } from '@/repositories/overtimeRepository'
import { employeeRepository } from '@/repositories/employeeRepository'
import type { OvertimeAuthorizationRecord } from '@/db'
import type { Employee } from '@/types'

const overtimeList = ref<OvertimeAuthorizationRecord[]>([])
const employees = ref<Employee[]>([])
const isLoading = ref(true)
const searchQuery = ref('')
const statusFilter = ref<'all' | 'Approved' | 'Pending' | 'Rejected'>('all')

// Dialog state
const isDialogOpen = ref(false)
const formNumber = ref('')
const selectedBioId = ref('')
const isEmployeeSelectorOpen = ref(false)
const employeeSearchQuery = ref('')

const selectedEmployee = computed(() => {
  return employees.value.find((emp) => {
    const employeeId = String(
      emp.biometric_user_id || emp.employee_number || emp.id || ''
    )

    return employeeId === selectedBioId.value
  })
})

const selectableEmployees = computed(() => {
  const query = employeeSearchQuery.value.trim().toLowerCase()

  return employees.value.filter((emp) => {
    const matchesSearch =
      !query ||
      [
        emp.full_name,
        emp.biometric_user_id,
        emp.employee_number,
        emp.department
      ].some((value) =>
        String(value ?? '').toLowerCase().includes(query)
      )

    return matchesSearch
  })
})

function selectEmployee(employeeId: string | number) {
  selectedBioId.value = String(employeeId)
  isEmployeeSelectorOpen.value = false
  employeeSearchQuery.value = ''
}

const otDate = ref(new Date().toISOString().slice(0, 10))
const startTime = ref('17:00')
const endTime = ref('18:00')
const authorizedHours = ref<number>(1.0)
const purpose = ref('')
const approvedBy = ref('HR Operations')
const initialStatus = ref<'Approved' | 'Pending'>('Approved')
const remarks = ref('')

async function loadData() {
  isLoading.value = true
  try {
    const [ots, emps] = await Promise.all([
      overtimeRepository.getAll(),
      employeeRepository.getAll()
    ])
    overtimeList.value = ots
    employees.value = emps

    // Seed initial realistic approved physical overtime form if database is empty
    if (ots.length === 0 && emps.length > 0) {
      const sampleEmp = emps.find((e: Employee) => e.biometric_user_id === '25065' || e.full_name.includes('Cabigas')) || emps[0]
      const sampleRecord: OvertimeAuthorizationRecord = {
        id: `ot_${Date.now()}`,
        bioId: sampleEmp.biometric_user_id || sampleEmp.employee_number || '25065',
        employeeName: sampleEmp.full_name,
        department: sampleEmp.department || 'Operations',
        date: '2026-10-06',
        startTime: '17:00',
        endTime: '18:00',
        authorizedHours: 1.0,
        formNumber: 'OT-2026-1006-01',
        purpose: 'Authorized emergency equipment inspection',
        status: 'Approved',
        approvedBy: 'HR Supervisor',
        approvedAt: new Date().toISOString(),
        remarks: 'Physical form signed and verified on file.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await overtimeRepository.saveAuthorization(sampleRecord)
      overtimeList.value = [sampleRecord]
    }
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
      return nameMatch || bioMatch || formMatch || purposeMatch
    }
    return true
  })
})

function onStartTimeChange() {
  calculateDuration()
}

function onEndTimeChange() {
  calculateDuration()
}

function calculateDuration() {
  try {
    const [sh, sm] = startTime.value.split(':').map(Number)
    const [eh, em] = endTime.value.split(':').map(Number)
    const sTotal = sh * 60 + sm
    const eTotal = eh * 60 + em
    if (eTotal > sTotal) {
      authorizedHours.value = Math.round(((eTotal - sTotal) / 60) * 10) / 10
    }
  } catch {
    // ignore
  }
}

async function handleSaveNewAuthorization() {
  if (!selectedBioId.value) return

  const selectedEmp = employees.value.find(
    e => e.biometric_user_id === selectedBioId.value || e.employee_number === selectedBioId.value || e.id === selectedBioId.value
  )
  const empName = selectedEmp ? selectedEmp.full_name : 'Staff'
  const dept = selectedEmp?.department || 'Operations'

  const record: OvertimeAuthorizationRecord = {
    id: `ot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    bioId: selectedBioId.value,
    employeeName: empName,
    department: dept,
    date: otDate.value,
    startTime: startTime.value,
    endTime: endTime.value,
    authorizedHours: Number(authorizedHours.value) || 1.0,
    formNumber: formNumber.value.trim() || `OT-${otDate.value.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
    purpose: purpose.value.trim() || 'Scheduled authorized extension',
    status: initialStatus.value,
    approvedBy: initialStatus.value === 'Approved' ? (approvedBy.value.trim() || 'HR Department') : undefined,
    approvedAt: initialStatus.value === 'Approved' ? new Date().toISOString() : undefined,
    remarks: remarks.value.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  await overtimeRepository.saveAuthorization(record)
  isDialogOpen.value = false
  // Reset form
  formNumber.value = ''
  selectedBioId.value = ''
  purpose.value = ''
  remarks.value = ''
  await loadData()
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

      <Dialog v-model:open="isDialogOpen">
        <DialogTrigger as-child>
          <Button size="sm" class="h-8 gap-1.5 text-xs text-white">
            <Plus class="size-3.5" />
            Record Physical OT Form
          </Button>
        </DialogTrigger>

        <DialogContent class="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle class="text-base flex items-center gap-2">
              <FileText class="size-4" />
              New Physical Overtime Authorization
            </DialogTitle>

            <DialogDescription class="text-xs">
              Record the employee, approved overtime schedule, and details from the
              signed physical overtime authorization form.
            </DialogDescription>
          </DialogHeader>

          <form @submit.prevent="handleSaveNewAuthorization" class="space-y-3.5 py-2 text-xs">
            <div class="flex flex-col gap-1.5">
              <label class="font-medium text-foreground">
                Physical Form / Permit Number
              </label>

              <Input
                v-model="formNumber"
                placeholder="e.g. OT-2026-1014-04"
                class="h-8 text-xs font-mono"
              />

              <p class="text-[10px] text-muted-foreground">
                Unique control number from the printed and signed physical form.
              </p>
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="font-medium text-foreground">Select Employee *</label>
              <Popover v-model:open="isEmployeeSelectorOpen">
                <PopoverTrigger as-child>
                  <button
                    type="button"
                    role="combobox"
                    :aria-expanded="isEmployeeSelectorOpen"
                    class="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    :class="selectedEmployee ? '' : 'text-muted-foreground'"
                  >
                    <span class="truncate">
                      <template v-if="selectedEmployee">
                        {{ selectedEmployee.full_name }}
                        (Bio ID: {{ selectedEmployee.biometric_user_id || selectedEmployee.employee_number || selectedEmployee.id }})
                        - {{ selectedEmployee.department || 'Operations' }}
                      </template>
                      <template v-else>
                        -- Search and choose employee --
                      </template>
                    </span>

                    <ChevronsUpDown class="ml-2 size-3.5 shrink-0 opacity-60" />
                  </button>
                </PopoverTrigger>

                <PopoverContent
                  align="start"
                  class="w-80 max-w-[calc(100vw-2rem)] p-2"
                >
                  <div class="relative">
                    <Search
                      class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground"
                    />
                    <Input
                      v-model="employeeSearchQuery"
                      placeholder="Search name, Bio ID, or department..."
                      class="h-8 pl-8 text-xs"
                    />
                  </div>

                  <div class="mt-2 max-h-60 space-y-0.5 overflow-y-auto">
                    <div
                      v-if="selectableEmployees.length === 0"
                      class="p-3 text-center text-xs text-muted-foreground"
                    >
                      No matching employee found.
                    </div>

                    <button
                      v-for="emp in selectableEmployees"
                      :key="emp.biometric_user_id || emp.employee_number || emp.id"
                      type="button"
                      class="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted"
                      :class="
                        selectedBioId === String(emp.biometric_user_id || emp.employee_number || emp.id)
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground'
                      "
                      @click="selectEmployee(emp.biometric_user_id || emp.employee_number || emp.id)"
                    >
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-medium">
                          {{ emp.full_name }}
                        </span>
                        <span class="block truncate text-[10px] text-muted-foreground">
                          Bio ID: {{ emp.biometric_user_id || emp.employee_number || emp.id }}
                          · {{ emp.department || 'Operations' }}
                        </span>
                      </span>

                      <Check
                        v-if="
                          selectedBioId === String(emp.biometric_user_id || emp.employee_number || emp.id)
                        "
                        class="size-3.5 shrink-0"
                      />
                    </button>
                  </div>
                </PopoverContent>
              </Popover>

              <input
                type="text"
                :value="selectedBioId"
                required
                tabindex="-1"
                aria-label="Selected employee"
                class="pointer-events-none absolute h-px w-px opacity-0"
              />
            </div>

            <div class="grid grid-cols-3 gap-2">
              <div class="flex flex-col gap-1.5">
                <label class="font-medium text-foreground">OT Date</label>
                <DatePicker v-model="otDate" class="w-full text-xs h-8" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="font-medium text-foreground">Start Time</label>
                <TimePicker
                  v-model="startTime"
                  placeholder="--:--"
                  class="h-8 w-full"
                  @update:model-value="onStartTimeChange"
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="font-medium text-foreground">End Time</label>
                <TimePicker
                  v-model="endTime"
                  placeholder="--:--"
                  class="h-8 w-full"
                  @update:model-value="onEndTimeChange"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div class="flex flex-col gap-1.5">
                <label class="font-medium text-foreground">Authorized Duration (Hours) *</label>
                <Input
                  v-model.number="authorizedHours"
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="12"
                  required
                  class="h-8 text-xs font-mono font-semibold"
                />
                <p class="text-[10px] text-muted-foreground">Capped: Never pays more than this.</p>
              </div>

              <div class="flex flex-col gap-1.5">
                <label class="font-medium text-foreground">
                  Authorization Status
                </label>

                <Select v-model="initialStatus">
                  <SelectTrigger class="h-8 w-full text-xs">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="Approved" class="text-xs">
                      Approved (Ready for Payroll)
                    </SelectItem>

                    <SelectItem value="Pending" class="text-xs">
                      Pending (Physical Audit Pending)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="font-medium text-foreground">Purpose / Reason *</label>
              <Input
                v-model="purpose"
                placeholder="e.g. Urgent machine maintenance / Inventory count"
                required
                class="h-8 text-xs"
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="font-medium text-foreground">Approved By (Supervisor / Dept Head)</label>
              <Input
                v-model="approvedBy"
                placeholder="e.g. Operations Manager / HR Admin"
                class="h-8 text-xs"
              />
            </div>

            <!-- <div class="flex flex-col gap-1.5">
              <label class="font-medium text-foreground">Auditor Remarks (Optional)</label>
              <Input
                v-model="remarks"
                placeholder="e.g. Physical slip filed in Cabinet B"
                class="h-8 text-xs"
              />
            </div> -->

            <DialogFooter class="pt-2">
              <DialogClose as-child>
                <Button type="button" variant="outline" size="sm" class="h-8 text-xs">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" class="h-8 text-xs text-white">
                Save Authorization
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
