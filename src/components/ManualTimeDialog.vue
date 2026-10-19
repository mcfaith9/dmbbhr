<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Clock, Send, CheckCircle2 } from '@lucide/vue'
import { attendanceService } from '@/services/attendance'
import { authService } from '@/services/auth'
import { employeeService } from '@/services/employees'
import { getManilaDateString } from '@/services/attendanceEngine'
import type { ManualAttendanceRecord } from '@/db'
import type { Employee } from '@/types'
import { Button } from '@/components/ui/button'
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

interface Props {
  open: boolean
  initialEmployeeId?: string
  initialDate?: string
  editingRecord?: ManualAttendanceRecord | null
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

const allEmployees = ref<Employee[]>([])
const employeeId = ref('')
const attendanceDate = ref('')
const origIn = ref('—')
const origOut = ref('—')
const schedule = ref('')
const adjustmentIn = ref('')
const adjustmentOut = ref('')
const adjustmentNotes = ref('')
const isFetchingOriginalAttendance = ref(false)
const isSubmitting = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

const currentUser = authService.currentUser
const isEditing = computed(() => props.editingRecord != null)

async function loadEmployeesIfNeeded() {
  if (props.employees && props.employees.length > 0) {
    allEmployees.value = props.employees.filter(e => e.status !== 'resigned')
    return
  }
  if (allEmployees.value.length === 0) {
    try {
      const emps = await employeeService.getEmployees()
      allEmployees.value = emps.filter(e => e.status !== 'resigned')
    } catch (err) {
      console.error('Failed to load employees for manual time dialog:', err)
    }
  }
}

async function fetchOriginalAttendance() {
  if (!employeeId.value || !attendanceDate.value) return
  isFetchingOriginalAttendance.value = true
  try {
    const records = await attendanceService.getDailyAttendance(
      attendanceDate.value,
      'all',
      'all',
      {},
      employeeId.value
    )
    if (records && records.length > 0) {
      const rec = records[0]
      origIn.value = rec.actual_in
      origOut.value = rec.actual_out
      schedule.value = `${rec.expected_in} → ${rec.expected_out} (${rec.work_group_name})`
      adjustmentIn.value = normalizeTimeToHHMM(rec.actual_in) || ''
      adjustmentOut.value = normalizeTimeToHHMM(rec.actual_out) || ''
    } else {
      origIn.value = '—'
      origOut.value = '—'
      schedule.value = ''
      adjustmentIn.value = ''
      adjustmentOut.value = ''
    }
  } catch (err) {
    console.error('Failed to fetch original attendance:', err)
  } finally {
    isFetchingOriginalAttendance.value = false
  }
}

function initializeForm() {
  errorMsg.value = ''
  successMsg.value = ''
  adjustmentIn.value = ''
  adjustmentOut.value = ''
  adjustmentNotes.value = ''
  origIn.value = '—'
  origOut.value = '—'
  schedule.value = ''

  if (isEditing.value) {
    const rec = props.editingRecord
    if (!rec?.id) {
      errorMsg.value = 'Cannot edit manual time: the selected record is missing its ID.'
      return
    }
    employeeId.value = String(rec.bioId)
    attendanceDate.value = rec.date
    origIn.value = rec.originalIn || '—'
    origOut.value = rec.originalOut || '—'
    schedule.value = rec.scheduleContext || ''
    adjustmentIn.value = normalizeTimeToHHMM(rec.manualIn) || ''
    adjustmentOut.value = normalizeTimeToHHMM(rec.manualOut) || ''
    adjustmentNotes.value = rec.notes || rec.reason || ''
    return
  }

  attendanceDate.value = props.initialDate || getManilaDateString(new Date())

  if (props.initialEmployeeId) {
    employeeId.value = String(props.initialEmployeeId)
  } else if (!employeeId.value && allEmployees.value.length > 0) {
    employeeId.value = allEmployees.value[0].biometric_user_id
  }

  if (employeeId.value && attendanceDate.value) {
    fetchOriginalAttendance()
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

watch(
  () => [employeeId.value, attendanceDate.value],
  () => {
    if (props.open && !isEditing.value) {
      fetchOriginalAttendance()
    }
  }
)

const inStatus = computed(() => {
  const orig = origIn.value
  const requested = adjustmentIn.value.trim()
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

const outStatus = computed(() => {
  const orig = origOut.value
  const requested = adjustmentOut.value.trim()
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

const hasChange = computed(() => {
  return inStatus.value.changed || outStatus.value.changed
})

const hasInvalidTime = computed(() => {
  return !inStatus.value.valid || !outStatus.value.valid
})

const canSubmit = computed(() => {
  if (isSubmitting.value || !!successMsg.value) return false
  if (!employeeId.value || !attendanceDate.value) return false
  if (hasInvalidTime.value) return false
  if (!adjustmentIn.value.trim() && !adjustmentOut.value.trim()) return false
  if (isEditing.value) return true
  return hasChange.value
})

async function submitAdjustment() {
  errorMsg.value = ''
  if (!employeeId.value) {
    errorMsg.value = 'Please select an employee.'
    return
  }
  if (!attendanceDate.value) {
    errorMsg.value = 'Please select an attendance date.'
    return
  }

  const inVal = adjustmentIn.value.trim()
  const outVal = adjustmentOut.value.trim()

  if (!inVal && !outVal) {
    errorMsg.value = 'Please provide at least a Time IN or Time OUT adjustment.'
    return
  }

  if (inVal && !isValidTimeString(inVal)) {
    errorMsg.value = 'Invalid Time IN. Please enter a valid time.'
    return
  }

  if (outVal && !isValidTimeString(outVal)) {
    errorMsg.value = 'Invalid Time OUT. Please enter a valid time.'
    return
  }

  const inChanged = inVal ? hasTimeChanged(origIn.value, inVal) : false
  const outChanged = outVal ? hasTimeChanged(origOut.value, outVal) : false

  if (!isEditing.value && !inChanged && !outChanged) {
    errorMsg.value = 'No changes detected. Please modify the Time IN or Time OUT before submitting an adjustment.'
    return
  }

  isSubmitting.value = true
  try {
    const requesterName = currentUser.value?.name || currentUser.value?.username || 'Admin'
    const emp = allEmployees.value.find(e => e.biometric_user_id === employeeId.value)
    const empName = emp?.full_name || `Employee #${employeeId.value}`

    const formattedIn = inVal ? formatHHMMTo12Hour(inVal) : undefined
    const formattedOut = outVal ? formatHHMMTo12Hour(outVal) : undefined
    const payload = {
      bioId: employeeId.value,
      employeeName: empName,
      date: attendanceDate.value,
      scheduleContext: schedule.value || undefined,
      originalIn: origIn.value.replace(/\s*\(Manual\)/gi, '').trim(),
      originalOut: origOut.value.replace(/\s*\(Manual\)/gi, '').trim(),
      manualIn: formattedIn,
      manualOut: formattedOut,
      notes: adjustmentNotes.value.trim() || 'Manual attendance adjustment request',
      requestedBy: requesterName
    }

    if (isEditing.value) {
      if (!props.editingRecord?.id) {
        errorMsg.value = 'Cannot update manual time: the selected record is missing its ID.'
        return
      }
      await attendanceService.updateManualTimeRequest(props.editingRecord.id, payload)
      successMsg.value = 'Manual adjustment updated successfully.'
    } else {
      await attendanceService.submitManualTimeRequest(payload)
      successMsg.value = 'Manual adjustment request submitted successfully.'
    }

    emit('saved')
    setTimeout(() => {
      isOpen.value = false
    }, 700)
  } catch (err: any) {
    errorMsg.value = err?.message || 'Failed to submit adjustment request.'
  } finally {
    isSubmitting.value = false
  }
}

function handleClose() {
  isOpen.value = false
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 font-bold text-base">
          <Clock class="size-5 text-primary" />
          <span>{{ isEditing ? 'Edit Manual Time Adjustment' : 'Create Manual Time Adjustment' }}</span>
        </DialogTitle>
        <DialogDescription class="text-xs">
          {{ isEditing ? 'Update the existing attendance time adjustment. The original record ID is preserved.' : 'Submit an attendance time adjustment request for HR/Admin approval.' }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-3.5 py-1 text-xs">
        <!-- Employee Selection -->
        <div class="space-y-1.5">
          <label class="font-semibold text-foreground text-xs block">
            Select Employee
          </label>
          <Select v-model="employeeId" :disabled="isEditing">
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
          <DatePicker v-model="attendanceDate" class="w-full text-xs h-8" :disabled="isEditing" />
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
              <strong class="text-foreground font-mono">{{ formatOriginalTimeDisplay(origIn) }}</strong>
            </div>
            <div>
              <span>Original OUT: </span>
              <strong class="text-foreground font-mono">{{ formatOriginalTimeDisplay(origOut) }}</strong>
            </div>
          </div>
          <div v-if="schedule" class="text-[10px] text-muted-foreground pt-1 border-t border-muted/60">
            Schedule: <strong class="text-foreground">{{ schedule }}</strong>
          </div>
        </div>

        <!-- Error & Success messages -->
        <div v-if="errorMsg" class="p-2.5 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-xs">
          {{ errorMsg }}
        </div>

        <div v-if="successMsg" class="p-2.5 rounded-md border border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-1.5">
          <CheckCircle2 class="size-4 shrink-0 text-emerald-600" />
          <span>{{ successMsg }}</span>
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
                  inStatus.state === 'changed' ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300' :
                  inStatus.state === 'invalid' ? 'bg-destructive/20 text-destructive' :
                  'bg-muted text-muted-foreground'
                ]"
              >
                {{ inStatus.label }}
              </span>
            </div>

            <div class="space-y-1 text-[11px]">
              <div class="flex items-center justify-between text-muted-foreground">
                <span>Original:</span>
                <span class="font-mono font-medium text-foreground">{{ formatOriginalTimeDisplay(origIn) }}</span>
              </div>
              <div class="text-muted-foreground pt-1">
                <span>Adjusted:</span>
              </div>
            </div>

            <input
              v-model="adjustmentIn"
              type="time"
              step="60"
              class="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs font-mono shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
            />

            <div v-if="inStatus.state === 'invalid'" class="text-[11px] text-destructive font-medium">
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
                  outStatus.state === 'changed' ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300' :
                  outStatus.state === 'invalid' ? 'bg-destructive/20 text-destructive' :
                  'bg-muted text-muted-foreground'
                ]"
              >
                {{ outStatus.label }}
              </span>
            </div>

            <div class="space-y-1 text-[11px]">
              <div class="flex items-center justify-between text-muted-foreground">
                <span>Original:</span>
                <span class="font-mono font-medium text-foreground">{{ formatOriginalTimeDisplay(origOut) }}</span>
              </div>
              <div class="text-muted-foreground pt-1">
                <span>Adjusted:</span>
              </div>
            </div>

            <input
              v-model="adjustmentOut"
              type="time"
              step="60"
              class="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs font-mono shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
            />

            <div v-if="outStatus.state === 'invalid'" class="text-[11px] text-destructive font-medium">
              Invalid time. Please enter a valid time.
            </div>
          </div>
        </div>

        <!-- Unchanged Notice if both valid but no change -->
        <!-- <div
          v-if="!isEditing && !hasChange && (adjustmentIn || adjustmentOut) && !hasInvalidTime"
          class="p-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-1.5"
        >
          <span>No changes detected. Please modify the Time IN or Time OUT before submitting an adjustment.</span>
        </div> -->

        <!-- Reason / Notes -->
        <div class="space-y-1.5">
          <label class="font-semibold text-foreground text-xs flex items-center justify-between">
            <span>Reason / Notes</span>
            <span class="text-[10px] font-normal text-muted-foreground">Required explanation</span>
          </label>
          <Textarea
            v-model="adjustmentNotes"
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
          @click="handleClose"
        >
          Cancel
        </Button>

        <Button
          variant="default"
          size="sm"
          class="h-8 text-xs font-semibold gap-1.5 shadow-xs cursor-pointer"
          :disabled="!canSubmit"
          @click="submitAdjustment"
        >
          <Send class="size-3.5" />
          <span>{{ isSubmitting ? 'Saving...' : (isEditing ? 'Update Adjustment' : 'Submit Adjustment') }}</span>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
