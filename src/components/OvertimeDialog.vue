<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  FileText,
  Pencil,
  Search,
  ChevronsUpDown,
  Check
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { getManilaDateString } from '@/services/attendanceEngine'
import type { OvertimeAuthorizationRecord } from '@/db'
import type { Employee } from '@/types'

interface Props {
  open: boolean
  initialEmployeeId?: string
  initialDate?: string
  editingRecord?: OvertimeAuthorizationRecord | null
  employees?: Employee[]
}

const props = withDefaults(defineProps<Props>(), {
  initialEmployeeId: '',
  initialDate: '',
  editingRecord: null,
  employees: () => []
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'saved'): void
}>()

const isOpen = computed({
  get: () => props.open,
  set: (val: boolean) => emit('update:open', val)
})

const isEditing = computed(() => props.editingRecord != null)
const localEmployees = ref<Employee[]>([])

const formNumber = ref('')
const selectedBioId = ref('')
const isEmployeeSelectorOpen = ref(false)
const employeeSearchQuery = ref('')

const otDate = ref(getManilaDateString(new Date()))
const startTime = ref('17:00')
const endTime = ref('18:00')
const authorizedHours = ref<number>(1.0)
const purpose = ref('')
const approvedBy = ref('HR Operations')
const initialStatus = ref<'Approved' | 'Pending'>('Approved')
const remarks = ref('')
const isSaving = ref(false)
const saveError = ref('')

async function loadEmployeesIfNeeded() {
  if (props.employees && props.employees.length > 0) {
    localEmployees.value = props.employees
    return
  }
  if (localEmployees.value.length === 0) {
    try {
      localEmployees.value = await employeeRepository.getAll()
    } catch (err) {
      console.error('Failed to load employees for overtime dialog:', err)
    }
  }
}

const availableEmployees = computed(() => {
  if (props.employees && props.employees.length > 0) {
    return props.employees
  }
  return localEmployees.value
})

const selectedEmployee = computed(() => {
  return availableEmployees.value.find((emp) => {
    const employeeId = String(
      emp.biometric_user_id || emp.employee_number || emp.id || ''
    )
    return employeeId === selectedBioId.value
  })
})

const selectableEmployees = computed(() => {
  const query = employeeSearchQuery.value.trim().toLowerCase()
  return availableEmployees.value.filter((emp) => {
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

function onStartTimeChange() {
  calculateDuration()
}

function onEndTimeChange() {
  calculateDuration()
}

function initializeForm() {
  saveError.value = ''
  if (props.editingRecord) {
    if (!props.editingRecord.id) {
      saveError.value = 'Cannot update overtime: the selected record is missing its ID.'
    }
    const rec = props.editingRecord
    formNumber.value = rec.formNumber || ''
    selectedBioId.value = rec.bioId
    otDate.value = rec.date || getManilaDateString(new Date())
    startTime.value = rec.startTime || '17:00'
    endTime.value = rec.endTime || '18:00'
    authorizedHours.value = Number(rec.authorizedHours) || 1.0
    purpose.value = rec.purpose || ''
    approvedBy.value = rec.approvedBy || 'HR Operations'
    initialStatus.value = rec.status === 'Approved' ? 'Approved' : 'Pending'
    remarks.value = rec.remarks || ''
  } else {
    formNumber.value = ''
    selectedBioId.value = props.initialEmployeeId ? String(props.initialEmployeeId) : ''
    otDate.value = props.initialDate || getManilaDateString(new Date())
    startTime.value = '17:00'
    endTime.value = '18:00'
    authorizedHours.value = 1.0
    purpose.value = ''
    approvedBy.value = 'HR Operations'
    initialStatus.value = 'Approved'
    remarks.value = ''
  }
}

watch(
  () => props.open,
  async (newVal) => {
    if (newVal) {
      await loadEmployeesIfNeeded()
      initializeForm()
    }
  },
  { immediate: true }
)

watch(
  () => [props.editingRecord, props.initialEmployeeId, props.initialDate],
  () => {
    if (props.open) {
      initializeForm()
    }
  }
)

async function handleSaveAuthorization() {
  if (!selectedBioId.value) {
    saveError.value = 'Please select an employee.'
    return
  }

  isSaving.value = true
  saveError.value = ''

  try {
    const selectedEmp = availableEmployees.value.find(
      e => String(e.biometric_user_id || e.employee_number || e.id) === selectedBioId.value
    )
    const empName = selectedEmp ? selectedEmp.full_name : 'Staff'
    const dept = selectedEmp?.department || 'Operations'
    const targetDate = otDate.value.trim()

    if (isEditing.value) {
      const existing = props.editingRecord
      if (!existing?.id) {
        saveError.value = 'Cannot update overtime: the selected record is missing its ID.'
        return
      }
      const record: OvertimeAuthorizationRecord = {
        id: existing.id,
        bioId: selectedBioId.value,
        employeeName: empName,
        department: dept,
        date: targetDate,
        startTime: startTime.value,
        endTime: endTime.value,
        authorizedHours: Number(authorizedHours.value) || 1.0,
        formNumber: formNumber.value.trim() || (existing.formNumber || `OT-${targetDate.replace(/-/g, '')}`),
        purpose: purpose.value.trim() || 'Scheduled authorized extension',
        status: initialStatus.value,
        approvedBy: initialStatus.value === 'Approved' ? (approvedBy.value.trim() || 'HR Operations') : undefined,
        approvedAt: initialStatus.value === 'Approved' ? (existing.approvedAt || new Date().toISOString()) : undefined,
        remarks: remarks.value.trim(),
        createdAt: existing.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await overtimeRepository.saveAuthorization(record)
    } else {
      const record: OvertimeAuthorizationRecord = {
        id: `ot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        bioId: selectedBioId.value,
        employeeName: empName,
        department: dept,
        date: targetDate,
        startTime: startTime.value,
        endTime: endTime.value,
        authorizedHours: Number(authorizedHours.value) || 1.0,
        formNumber: formNumber.value.trim() || `OT-${targetDate.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
        purpose: purpose.value.trim() || 'Scheduled authorized extension',
        status: initialStatus.value,
        approvedBy: initialStatus.value === 'Approved' ? (approvedBy.value.trim() || 'HR Operations') : undefined,
        approvedAt: initialStatus.value === 'Approved' ? new Date().toISOString() : undefined,
        remarks: remarks.value.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await overtimeRepository.saveAuthorization(record)
    }

    emit('saved')
    isOpen.value = false
  } catch (err: any) {
    saveError.value = err?.message || 'Failed to save overtime authorization.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle class="text-base flex items-center gap-2">
          <component :is="isEditing ? Pencil : FileText" class="size-4" />
          {{ isEditing ? 'Edit Physical Overtime Authorization' : 'New Physical Overtime Authorization' }}
        </DialogTitle>

        <DialogDescription class="text-xs">
          {{ isEditing ? 'Update authorized schedule, employee, or status for this audited physical overtime form.' : 'Record the employee, approved overtime schedule, and details from the signed physical overtime authorization form.' }}
        </DialogDescription>
      </DialogHeader>

      <form @submit.prevent="handleSaveAuthorization" class="space-y-3.5 py-2 text-xs">
        <div v-if="saveError" class="p-2.5 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-xs">
          {{ saveError }}
        </div>

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
                class="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
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
              class="w-80 max-w-[calc(100vw-2rem)] p-2 shadow-lg"
            >
              <div class="relative">
                <Search
                  class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none"
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
                  class="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted cursor-pointer"
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
              <SelectTrigger class="h-8 w-full text-xs bg-background">
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

        <DialogFooter class="pt-2">
          <DialogClose as-child>
            <Button type="button" variant="outline" size="sm" class="h-8 text-xs cursor-pointer">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" size="sm" class="h-8 text-xs text-white cursor-pointer" :disabled="isSaving">
            {{ isSaving ? 'Saving...' : (isEditing ? 'Update Authorization' : 'Save Authorization') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
