<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Server,
  Database,
  Layers,
  Clock,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  UsersRound,
  Save,
  Coffee,
  CalendarDays,
  ShieldCheck
} from '@lucide/vue'
import { employeeService } from '@/services/employees'
import { liveAttendanceService } from '@/services/liveAttendance'
import { calculateExpectedOutMinutes, formatTime12h } from '@/repositories/workGroupRepository'
import type { WorkGroup } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

const activeTab = ref<'workgroups' | 'network'>('workgroups')
const workGroups = ref<WorkGroup[]>([])
const loading = ref(false)
const employeeCounts = ref<Record<string, number>>({})

// Real hardware status
const deviceStatus = liveAttendanceService.deviceStatus

// Add/Edit Work Group Modal State
const showGroupModal = ref(false)
const isEditing = ref(false)
const modalGroupId = ref<string | null>(null)
const formName = ref('')
const formCode = ref('')
const formStandardIn = ref('08:00')
const formRequiredHours = ref(8)
const formLunchStart = ref('12:00')
const formLunchEnd = ref('13:00')
const formIsDefault = ref(false)
const formSaving = ref(false)
const formError = ref('')
const formSuccess = ref('')

// Delete Work Group Protection Modal State
const showDeleteModal = ref(false)
const groupToDelete = ref<WorkGroup | null>(null)
const deleteAssignedCount = ref(0)
const reassignTargetGroupId = ref<string>('')
const isDeleting = ref(false)
const deleteError = ref('')
const deleteSuccess = ref('')

// Computed live preview of Expected OUT
const calculatedExpectedOut = computed(() => {
  const reqMins = (formRequiredHours.value || 8) * 60
  return calculateExpectedOutMinutes(
    formStandardIn.value || '08:00',
    reqMins,
    formLunchStart.value || '12:00',
    formLunchEnd.value || '13:00'
  )
})

async function loadData() {
  loading.value = true
  try {
    const [list, counts] = await Promise.all([
      employeeService.getWorkGroups(),
      employeeService.getAllAssignedEmployeeCounts()
    ])
    workGroups.value = list
    employeeCounts.value = counts
  } finally {
    loading.value = false
  }
}

function openAddModal() {
  isEditing.value = false
  modalGroupId.value = null
  formName.value = ''
  formCode.value = ''
  formStandardIn.value = '08:00'
  formRequiredHours.value = 8
  formLunchStart.value = '12:00'
  formLunchEnd.value = '13:00'
  formIsDefault.value = false
  formError.value = ''
  formSuccess.value = ''
  showGroupModal.value = true
}

function openEditModal(wg: WorkGroup) {
  isEditing.value = true
  modalGroupId.value = wg.id
  formName.value = wg.name
  formCode.value = wg.code || wg.name.replace(/^Group\s*/i, '').trim().toUpperCase()
  formStandardIn.value = wg.standard_in || '08:00'
  formRequiredHours.value = Math.round((wg.required_work_minutes || 480) / 60)
  formLunchStart.value = wg.lunch_start || '12:00'
  formLunchEnd.value = wg.lunch_end || '13:00'
  formIsDefault.value = wg.is_default
  formError.value = ''
  formSuccess.value = ''
  showGroupModal.value = true
}

async function saveWorkGroupForm() {
  formError.value = ''
  formSuccess.value = ''

  const cleanName = formName.value.trim()
  const cleanCode = formCode.value.trim().toUpperCase()

  if (!cleanName) {
    formError.value = 'Group Name is required.'
    return
  }

  if (!cleanCode) {
    formError.value = 'Group Code is required (e.g. A, B, C).'
    return
  }

  formSaving.value = true

  try {
    await employeeService.saveWorkGroup({
      id: modalGroupId.value || undefined,
      name: cleanName,
      code: cleanCode,
      standard_in: formStandardIn.value,
      required_work_minutes: formRequiredHours.value * 60,
      lunch_start: formLunchStart.value,
      lunch_end: formLunchEnd.value,
      is_default: formIsDefault.value
    })

    formSuccess.value = `Work Group "${cleanName}" (${cleanCode}) saved successfully.`
    await loadData()

    setTimeout(() => {
      showGroupModal.value = false
    }, 1200)
  } catch (err: any) {
    formError.value = err.message || 'Failed to save Work Group.'
  } finally {
    formSaving.value = false
  }
}

async function promptDeleteGroup(wg: WorkGroup) {
  groupToDelete.value = wg
  deleteError.value = ''
  deleteSuccess.value = ''
  isDeleting.value = false

  const count = employeeCounts.value[wg.id] || 0
  deleteAssignedCount.value = count

  // Set default reassignment target if available
  const otherGroups = workGroups.value.filter(g => g.id !== wg.id)
  reassignTargetGroupId.value = otherGroups[0]?.id || ''

  showDeleteModal.value = true
}

async function confirmDeleteGroup() {
  if (!groupToDelete.value) return

  isDeleting.value = true
  deleteError.value = ''
  deleteSuccess.value = ''

  try {
    if (deleteAssignedCount.value > 0) {
      if (!reassignTargetGroupId.value) {
        deleteError.value = 'Please select a Work Group to reassign assigned employees to.'
        isDeleting.value = false
        return
      }

      await employeeService.reassignAndDeleteWorkGroup(
        groupToDelete.value.id,
        reassignTargetGroupId.value
      )
      deleteSuccess.value = `Successfully reassigned ${deleteAssignedCount.value} employees and removed Work Group.`
    } else {
      await employeeService.deleteWorkGroup(groupToDelete.value.id)
      deleteSuccess.value = `Work Group "${groupToDelete.value.name}" deleted.`
    }

    await loadData()
    setTimeout(() => {
      showDeleteModal.value = false
      groupToDelete.value = null
    }, 1400)
  } catch (err: any) {
    deleteError.value = err.message || 'Failed to delete Work Group.'
  } finally {
    isDeleting.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>Settings & Work Groups</span>
          <Badge variant="outline" class="text-[11px] font-mono">
            {{ workGroups.length }} Work Groups Configured
          </Badge>
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Configure canonical Work Group schedules (Standard IN, Lunch Break, Expected OUT) and hardware parameters.
        </p>
      </div>

      <!-- Tab switch buttons -->
      <div class="flex items-center gap-1.5 rounded-lg border bg-card p-1 shadow-xs">
        <button
          type="button"
          class="px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5"
          :class="activeTab === 'workgroups' ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'workgroups'"
        >
          <Layers class="size-3.5" />
          <span>Work Groups</span>
        </button>
        <button
          type="button"
          class="px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5"
          :class="activeTab === 'network' ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'network'"
        >
          <Server class="size-3.5" />
          <span>Hardware & Network</span>
        </button>
      </div>
    </div>

    <!-- ============================================================= -->
    <!-- TAB 1: WORK GROUPS MANAGEMENT -->
    <!-- ============================================================= -->
    <div v-if="activeTab === 'workgroups'" class="space-y-4">
      <!-- Section Action Header -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Layers class="size-4 text-primary" />
            <span>Configured Work Groups & Shift Schedules</span>
          </h2>
          <p class="text-xs text-muted-foreground">
            Excel employee import matches against Group Code or Name. Expected OUT is calculated automatically excluding lunch.
          </p>
        </div>

        <Button
          size="sm"
          class="h-8 gap-1.5 text-xs font-medium shadow-xs"
          @click="openAddModal"
        >
          <Plus class="size-3.5" />
          <span>Add Work Group</span>
        </Button>
      </div>

      <!-- Work Groups Grid Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div
          v-for="wg in workGroups"
          :key="wg.id"
          class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs flex flex-col justify-between transition-all hover:border-primary/40 relative group"
        >
          <div class="space-y-3">
            <!-- Title & Code Badge -->
            <div class="flex items-start justify-between gap-2">
              <div class="space-y-0.5">
                <div class="flex items-center gap-2">
                  <h3 class="font-bold text-base text-foreground">{{ wg.name }}</h3>
                  <Badge variant="default" class="font-mono text-xs font-bold px-1.5 py-0">
                    Code: {{ wg.code || wg.name.replace(/^Group\s*/i, '') }}
                  </Badge>
                  <Badge v-if="wg.is_default" variant="secondary" class="text-[10px]">
                    Default
                  </Badge>
                </div>
                <div class="text-[11px] text-muted-foreground flex items-center gap-1">
                  <UsersRound class="size-3" />
                  <span class="font-semibold text-foreground">{{ employeeCounts[wg.id] || 0 }}</span> employees assigned
                </div>
              </div>

              <!-- Action icons -->
              <div class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 w-7 p-0 rounded-md text-muted-foreground hover:text-destructive"
                  title="Delete Group"
                  @click="promptDeleteGroup(wg)"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </div>
            </div>

            <!-- Schedule Metrics List -->
            <div class="space-y-2 text-xs pt-1 border-t">
              <div class="flex items-center justify-between p-2 rounded-md bg-muted/40">
                <span class="text-muted-foreground flex items-center gap-1.5">
                  <Clock class="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  Standard IN:
                </span>
                <span class="font-mono font-bold text-foreground">
                  {{ formatTime12h(wg.standard_in) }}
                </span>
              </div>

              <div class="flex items-center justify-between p-2 rounded-md bg-muted/40">
                <span class="text-muted-foreground flex items-center gap-1.5">
                  <Coffee class="size-3.5 text-amber-600 dark:text-amber-400" />
                  Unpaid Lunch Break:
                </span>
                <span class="font-mono font-medium text-foreground">
                  {{ formatTime12h(wg.lunch_start) }} – {{ formatTime12h(wg.lunch_end) }}
                </span>
              </div>

              <div class="flex items-center justify-between p-2 rounded-md bg-primary/5 border border-primary/20">
                <span class="text-foreground font-medium flex items-center gap-1.5">
                  <CalendarDays class="size-3.5 text-primary" />
                  Expected OUT:
                </span>
                <span class="font-mono font-bold text-primary text-sm">
                  {{ formatTime12h(wg.expected_out) }}
                </span>
              </div>

              <div class="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
                <span>Required Working:</span>
                <span class="font-mono">{{ Math.round((wg.required_work_minutes || 480) / 60) }} hours</span>
              </div>
            </div>
          </div>

          <!-- Bottom Footer -->
          <div class="mt-3 pt-2.5 border-t flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Grace Period: {{ wg.grace_period_minutes || 15 }}m</span>
            <Button
              variant="outline"
              size="sm"
              class="h-6 px-2 text-[11px] gap-1"
              @click="openEditModal(wg)"
            >
              <Edit2 class="size-2.5 text-primary" />
              <span>Configure</span>
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================= -->
    <!-- TAB 2: HARDWARE & NETWORK CONFIGURATION -->
    <!-- ============================================================= -->
    <div v-else-if="activeTab === 'network'" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3">
        <div class="flex items-center justify-between font-semibold text-sm text-foreground">
          <div class="flex items-center gap-2">
            <Server class="size-4 text-primary" />
            <span>Biometric Hardware Listener</span>
          </div>
          <Badge
            :variant="deviceStatus.status === 'online' ? 'success' : (deviceStatus.status === 'connecting' ? 'warning' : 'outline')"
            class="text-[10px] uppercase font-mono"
          >
            {{ deviceStatus.status }}
          </Badge>
        </div>
        <div class="space-y-2 text-xs">
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Target Device:</span>
            <div class="font-mono font-medium text-foreground">BISMAC BISBIO B-29b</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Socket Target IP & Port:</span>
            <div class="font-mono font-medium text-foreground">192.168.1.201 : 4370 (TCP/IP)</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Local Dev Socket Bridge:</span>
            <div class="font-mono font-medium text-foreground">ws://localhost:5174</div>
          </div>
        </div>
      </div>

      <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3">
        <div class="flex items-center justify-between font-semibold text-sm text-foreground">
          <div class="flex items-center gap-2">
            <Server class="size-4 text-primary" />
            <span>Biometric Hardware Listener</span>
          </div>
          <Badge
            variant="outline"
            class="text-[10px] uppercase font-mono"
          >
            Not Configured
          </Badge>
        </div>
        <div class="space-y-2 text-xs">
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Target Device:</span>
            <div class="font-mono font-medium text-foreground">BIO 2</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Socket Target IP & Port:</span>
            <div class="font-mono font-medium text-foreground">192.168.x.x : 4370 (TCP/IP)</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Local Dev Socket Bridge:</span>
            <div class="font-mono font-medium text-foreground">ws://localhost:5174</div>
          </div>
        </div>
      </div>

      <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3">
        <div class="flex items-center justify-between font-semibold text-sm text-foreground">
          <div class="flex items-center gap-2">
            <Server class="size-4 text-primary" />
            <span>Biometric Hardware Listener</span>
          </div>
          <Badge
            variant="outline"
            class="text-[10px] uppercase font-mono"
          >
            Not Configured
          </Badge>
        </div>
        <div class="space-y-2 text-xs">
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Target Device:</span>
            <div class="font-mono font-medium text-foreground">BIO 3</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Socket Target IP & Port:</span>
            <div class="font-mono font-medium text-foreground">192.168.x.x : 4370 (TCP/IP)</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Local Dev Socket Bridge:</span>
            <div class="font-mono font-medium text-foreground">ws://localhost:5174</div>
          </div>
        </div>
      </div>

      <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3">
        <div class="flex items-center gap-2 font-semibold text-sm text-foreground">
          <Database class="size-4 text-primary" />
          <span>Backend Target & Timezone</span>
        </div>
        <div class="space-y-2 text-xs">
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Laravel API URL:</span>
            <div class="font-mono font-medium text-foreground">http://localhost:8000/api</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Local Persistence Engine:</span>
            <div class="font-medium text-foreground">Dexie IndexedDB (DMBBHR_LocalDB)</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Standard Timezone:</span>
            <div class="font-medium text-foreground">Philippine Standard Time (Asia/Manila UTC+08:00)</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================= -->
    <!-- ADD / EDIT WORK GROUP MODAL DIALOG -->
    <!-- ============================================================= -->
    <div
      v-if="showGroupModal"
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div class="bg-card text-card-foreground border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b bg-muted/40">
          <div class="flex items-center gap-2">
            <Layers class="size-4 text-primary" />
            <h2 class="font-bold text-sm">
              {{ isEditing ? 'Edit Work Group' : 'Add Work Group' }}
            </h2>
          </div>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground rounded p-1"
            @click="showGroupModal = false"
          >
            <X class="size-4" />
          </button>
        </div>

        <form @submit.prevent="saveWorkGroupForm" class="p-5 space-y-4">
          <!-- Group Name and Group Code in 2 columns -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class="text-xs font-semibold text-foreground">
                Group Name <span class="text-destructive">*</span>
              </label>
              <Input
                v-model="formName"
                type="text"
                required
                placeholder="e.g. Group A"
                class="h-8 text-xs"
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Group Code <span class="text-destructive">*</span></span>
                <span class="text-[10px] text-muted-foreground font-mono">Unique (e.g. A, B, C)</span>
              </label>
              <Input
                v-model="formCode"
                type="text"
                required
                maxlength="8"
                placeholder="e.g. A"
                class="h-8 text-xs font-mono uppercase"
              />
            </div>
          </div>

          <!-- Standard IN & Required Working Hours -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class="text-xs font-semibold text-foreground flex items-center gap-1">
                <Clock class="size-3 text-emerald-600" />
                <span>Standard IN (24h) <span class="text-destructive">*</span></span>
              </label>
              <Input
                v-model="formStandardIn"
                type="time"
                required
                class="h-8 text-xs font-mono"
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-semibold text-foreground">
                Required Working Hours <span class="text-destructive">*</span>
              </label>
              <Input
                v-model.number="formRequiredHours"
                type="number"
                min="1"
                max="24"
                required
                class="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <!-- Lunch Break Start & Lunch Break End -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class="text-xs font-semibold text-foreground flex items-center gap-1">
                <Coffee class="size-3 text-amber-600" />
                <span>Lunch Break Start</span>
              </label>
              <Input
                v-model="formLunchStart"
                type="time"
                required
                class="h-8 text-xs font-mono"
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-semibold text-foreground flex items-center gap-1">
                <Coffee class="size-3 text-amber-600" />
                <span>Lunch Break End</span>
              </label>
              <Input
                v-model="formLunchEnd"
                type="time"
                required
                class="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <!-- Automatically Calculated Expected OUT Display Box -->
          <div class="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <CalendarDays class="size-3.5 text-primary" />
                Automatically Calculated Expected OUT
              </span>
              <Badge variant="outline" class="text-[10px] font-mono bg-card">
                Read-Only (Auto-Computed)
              </Badge>
            </div>
            <div class="flex items-baseline justify-between pt-1">
              <span class="text-2xl font-bold font-mono text-primary">
                {{ calculatedExpectedOut.outFormatted12h }}
              </span>
              <span class="text-xs text-muted-foreground font-mono">
                ({{ calculatedExpectedOut.outHHMM }} 24h)
              </span>
            </div>
            <p class="text-[11px] text-muted-foreground">
              Based on {{ formatTime12h(formStandardIn) }} Standard IN + {{ formRequiredHours }}h working time excluding {{ formatTime12h(formLunchStart) }}–{{ formatTime12h(formLunchEnd) }} unpaid lunch.
            </p>
          </div>

          <!-- Feedback messages -->
          <div v-if="formSuccess" class="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 class="size-4 shrink-0 text-emerald-600" />
            <span>{{ formSuccess }}</span>
          </div>

          <div v-if="formError" class="p-2.5 rounded bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
            <AlertCircle class="size-4 shrink-0" />
            <span>{{ formError }}</span>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-end gap-2 pt-3 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="h-8 text-xs"
              @click="showGroupModal = false"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              class="h-8 text-xs gap-1.5 font-medium shadow-xs"
              :disabled="formSaving"
            >
              <Save class="size-3.5" />
              <span>{{ formSaving ? 'Saving...' : 'Save Work Group' }}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>

    <!-- ============================================================= -->
    <!-- DELETE WORK GROUP CONFIRMATION & REASSIGNMENT MODAL -->
    <!-- ============================================================= -->
    <div
      v-if="showDeleteModal && groupToDelete"
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div class="bg-card text-card-foreground border rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b bg-destructive/10 text-destructive">
          <div class="flex items-center gap-2 font-bold text-sm">
            <AlertTriangle class="size-4 text-destructive" />
            <span>Delete Work Group: {{ groupToDelete.name }}</span>
          </div>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground rounded p-1"
            @click="showDeleteModal = false"
          >
            <X class="size-4" />
          </button>
        </div>

        <div class="p-5 space-y-4 text-xs">
          <!-- In-use protection warning -->
          <div v-if="deleteAssignedCount > 0" class="space-y-3">
            <div class="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 space-y-1">
              <div class="font-bold flex items-center gap-1.5">
                <ShieldCheck class="size-4 text-amber-600 shrink-0" />
                <span>Deletion Protection Triggered</span>
              </div>
              <p>
                <strong>{{ groupToDelete.name }}</strong> (Code: <strong>{{ groupToDelete.code }}</strong>) is currently assigned to <strong>{{ deleteAssignedCount }}</strong> employee(s).
              </p>
              <p class="text-[11px] text-muted-foreground">
                You cannot delete this group until those employees are reassigned to another Work Group.
              </p>
            </div>

            <!-- Reassignment Selector -->
            <div class="space-y-1.5 pt-1">
              <label class="font-semibold text-foreground">
                Reassign all {{ deleteAssignedCount }} employees to:
              </label>
              <Select v-model="reassignTargetGroupId">
                <SelectTrigger class="h-8 text-xs w-full bg-card">
                  <SelectValue placeholder="Select target Work Group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem
                      v-for="wg in workGroups.filter(g => g.id !== groupToDelete?.id)"
                      :key="wg.id"
                      :value="wg.id"
                    >
                      {{ wg.name }} (Code: {{ wg.code }})
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <!-- Unassigned Group confirmation -->
          <div v-else class="space-y-2">
            <p class="text-muted-foreground">
              Are you sure you want to permanently delete Work Group <strong>{{ groupToDelete.name }}</strong> (Code: <strong>{{ groupToDelete.code }}</strong>)?
            </p>
            <p class="text-[11px] text-muted-foreground">
              No employees are currently assigned to this group. This operation cannot be undone.
            </p>
          </div>

          <!-- Feedback messages -->
          <div v-if="deleteSuccess" class="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 class="size-4 shrink-0 text-emerald-600" />
            <span>{{ deleteSuccess }}</span>
          </div>

          <div v-if="deleteError" class="p-2.5 rounded bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
            <AlertCircle class="size-4 shrink-0" />
            <span>{{ deleteError }}</span>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-end gap-2 pt-3 border-t">
            <Button
              variant="outline"
              size="sm"
              class="h-8 text-xs"
              :disabled="isDeleting"
              @click="showDeleteModal = false"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              class="h-8 text-xs gap-1.5 font-medium shadow-xs"
              :disabled="isDeleting || (deleteAssignedCount > 0 && !reassignTargetGroupId)"
              @click="confirmDeleteGroup"
            >
              <Trash2 class="size-3.5" />
              <span>
                {{ isDeleting ? 'Processing...' : (deleteAssignedCount > 0 ? 'Reassign & Delete' : 'Delete Group') }}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
