<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Layers,
  Clock,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  UsersRound,
  Save,
  Coffee,
  CalendarDays,
  ShieldCheck,
  Sliders,
  ArrowLeft
} from '@lucide/vue'
import { employeeService } from '@/services/employees'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import HolidayManager from '@/components/holidays/HolidayManager.vue'
import { TimePicker } from '@/components/ui/time-picker'

const route = useRoute()

// Sub-navigation tab
type AttendanceTab = 'workgroups' | 'rules' | 'holidays'
const activeTab = ref<AttendanceTab>('workgroups')

// =========================================================================
// 1. WORK GROUPS STATE & LOGIC
// =========================================================================
const workGroups = ref<WorkGroup[]>([])
const loadingWorkGroups = ref(false)
const employeeCounts = ref<Record<string, number>>({})

// Add/Edit Work Group Modal State
const showGroupModal = ref(false)
const isEditingGroup = ref(false)
const modalGroupId = ref<string | null>(null)
const formGroupName = ref('')
const formGroupCode = ref('')
const formStandardIn = ref('08:00')
const formRequiredHours = ref(8)
const formLunchStart = ref('12:00')
const formLunchEnd = ref('13:00')
const formIsDefault = ref(false)
const formGroupSaving = ref(false)
const formGroupError = ref('')
const formGroupSuccess = ref('')

// Delete Work Group Protection Modal State
const showDeleteModal = ref(false)
const groupToDelete = ref<WorkGroup | null>(null)
const deleteAssignedCount = ref(0)
const reassignTargetGroupId = ref<string>('')
const isDeletingGroup = ref(false)
const deleteGroupError = ref('')
const deleteGroupSuccess = ref('')

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

async function loadWorkGroups() {
  loadingWorkGroups.value = true
  try {
    const [list, counts] = await Promise.all([
      employeeService.getWorkGroups(),
      employeeService.getAllAssignedEmployeeCounts()
    ])
    workGroups.value = list
    employeeCounts.value = counts
  } finally {
    loadingWorkGroups.value = false
  }
}

function openAddGroupModal() {
  isEditingGroup.value = false
  modalGroupId.value = null
  formGroupName.value = ''
  formGroupCode.value = ''
  formStandardIn.value = '08:00'
  formRequiredHours.value = 8
  formLunchStart.value = '12:00'
  formLunchEnd.value = '13:00'
  formIsDefault.value = false
  formGroupError.value = ''
  formGroupSuccess.value = ''
  showGroupModal.value = true
}

function openEditGroupModal(wg: WorkGroup) {
  isEditingGroup.value = true
  modalGroupId.value = wg.id
  formGroupName.value = wg.name
  formGroupCode.value = wg.code || wg.name.replace(/^Group\s*/i, '').trim().toUpperCase()
  formStandardIn.value = wg.standard_in || '08:00'
  formRequiredHours.value = Math.round((wg.required_work_minutes || 480) / 60)
  formLunchStart.value = wg.lunch_start || '12:00'
  formLunchEnd.value = wg.lunch_end || '13:00'
  formIsDefault.value = wg.is_default
  formGroupError.value = ''
  formGroupSuccess.value = ''
  showGroupModal.value = true
}

async function saveWorkGroupForm() {
  formGroupError.value = ''
  formGroupSuccess.value = ''

  const cleanName = formGroupName.value.trim()
  const cleanCode = formGroupCode.value.trim().toUpperCase()

  if (!cleanName) {
    formGroupError.value = 'Group Name is required.'
    return
  }

  if (!cleanCode) {
    formGroupError.value = 'Group Code is required (e.g. A, B, C).'
    return
  }

  formGroupSaving.value = true

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

    formGroupSuccess.value = `Work Group "${cleanName}" (${cleanCode}) saved successfully.`
    await loadWorkGroups()

    setTimeout(() => {
      showGroupModal.value = false
    }, 1200)
  } catch (err: any) {
    formGroupError.value = err.message || 'Failed to save Work Group.'
  } finally {
    formGroupSaving.value = false
  }
}

async function promptDeleteGroup(wg: WorkGroup) {
  groupToDelete.value = wg
  deleteGroupError.value = ''
  deleteGroupSuccess.value = ''
  isDeletingGroup.value = false

  const count = employeeCounts.value[wg.id] || 0
  deleteAssignedCount.value = count

  const otherGroups = workGroups.value.filter(g => g.id !== wg.id)
  reassignTargetGroupId.value = otherGroups[0]?.id || ''

  showDeleteModal.value = true
}

async function confirmDeleteGroup() {
  if (!groupToDelete.value) return

  isDeletingGroup.value = true
  deleteGroupError.value = ''
  deleteGroupSuccess.value = ''

  try {
    if (deleteAssignedCount.value > 0) {
      if (!reassignTargetGroupId.value) {
        deleteGroupError.value = 'Please select a Work Group to reassign assigned employees to.'
        isDeletingGroup.value = false
        return
      }

      await employeeService.reassignAndDeleteWorkGroup(
        groupToDelete.value.id,
        reassignTargetGroupId.value
      )
      deleteGroupSuccess.value = `Successfully reassigned ${deleteAssignedCount.value} employees and removed Work Group.`
    } else {
      await employeeService.deleteWorkGroup(groupToDelete.value.id)
      deleteGroupSuccess.value = `Work Group "${groupToDelete.value.name}" deleted.`
    }

    await loadWorkGroups()
    setTimeout(() => {
      showDeleteModal.value = false
      groupToDelete.value = null
    }, 1400)
  } catch (err: any) {
    deleteGroupError.value = err.message || 'Failed to delete Work Group.'
  } finally {
    isDeletingGroup.value = false
  }
}

// =========================================================================
// 2. ATTENDANCE RULES STATE & LOGIC
// =========================================================================
const RULES_STORAGE_KEY = 'dmbbhr_attendance_rules'

interface AttendanceRulesConfig {
  gracePeriodMinutes: number
  lateCalculationMethod: 'exact' | 'tiered' | 'round_15'
  earlyOutCalculationMethod: 'exact' | 'strict'
  singlePunchHandling: 'awaiting_out' | 'assume_shift_end' | 'require_manual'
  missingInHandling: 'flag_review' | 'manual_required'
  mealBreakDurationMinutes: number
  standardDailyWorkingHours: number
  nightDiffStart: string
  nightDiffEnd: string
  requireOtAuthorization: boolean
  restDayOvertimeMultiplier: string
}

const defaultRules: AttendanceRulesConfig = {
  gracePeriodMinutes: 15,
  lateCalculationMethod: 'exact',
  earlyOutCalculationMethod: 'exact',
  singlePunchHandling: 'awaiting_out',
  missingInHandling: 'flag_review',
  mealBreakDurationMinutes: 60,
  standardDailyWorkingHours: 8,
  nightDiffStart: '22:00',
  nightDiffEnd: '06:00',
  requireOtAuthorization: true,
  restDayOvertimeMultiplier: '130%'
}

function loadStoredRules(): AttendanceRulesConfig {
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY)
    if (raw) {
      return { ...defaultRules, ...JSON.parse(raw) }
    }
  } catch {
    // ignore
  }
  return { ...defaultRules }
}

const attendanceRules = ref<AttendanceRulesConfig>(loadStoredRules())
const rulesSaving = ref(false)
const rulesSuccess = ref('')

function saveAttendanceRules() {
  rulesSaving.value = true
  try {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(attendanceRules.value))
    rulesSuccess.value = 'Attendance rules updated successfully.'
    setTimeout(() => {
      rulesSuccess.value = ''
    }, 2000)
  } finally {
    rulesSaving.value = false
  }
}

// Sync activeTab with route query
function syncFromRoute() {
  const tab = (route.query.tab || route.query.section) as string | undefined
  if (tab === 'workgroups' || tab === 'rules' || tab === 'holidays') {
    activeTab.value = tab
  }
}

watch(() => [route.query.tab, route.query.section], () => {
  syncFromRoute()
})

onMounted(() => {
  syncFromRoute()
  loadWorkGroups()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <router-link
            to="/settings"
            class="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <ArrowLeft class="size-3.5" />
            <span>Settings</span>
          </router-link>
          <span class="text-xs text-muted-foreground">/</span>
          <span class="text-xs font-semibold text-foreground">Attendance Configuration</span>
        </div>
        <h1 class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>Attendance Configuration</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium font-mono">
            Policies & Shifts
          </span>
        </h1>
        <p class="text-xs text-muted-foreground">
          Configure work groups, shift schedules, late arrival thresholds, and Philippine holidays.
        </p>
      </div>

      <!-- Tab Switcher -->
      <div class="flex items-center gap-1 bg-card border rounded-lg p-1 self-start sm:self-auto shrink-0 shadow-2xs">
        <button
          type="button"
          class="px-3 py-1.5 text-xs rounded-md transition-all font-medium flex items-center gap-1.5 cursor-pointer"
          :class="activeTab === 'workgroups' ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'workgroups'"
        >
          <Layers class="size-3.5" />
          <span>Work Groups ({{ workGroups.length }})</span>
        </button>
        <button
          type="button"
          class="px-3 py-1.5 text-xs rounded-md transition-all font-medium flex items-center gap-1.5 cursor-pointer"
          :class="activeTab === 'rules' ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'rules'"
        >
          <Sliders class="size-3.5" />
          <span>Attendance Rules</span>
        </button>
        <button
          type="button"
          class="px-3 py-1.5 text-xs rounded-md transition-all font-medium flex items-center gap-1.5 cursor-pointer"
          :class="activeTab === 'holidays' ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'holidays'"
        >
          <CalendarDays class="size-3.5" />
          <span>Holidays</span>
        </button>
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- TAB 1: WORK GROUPS -->
    <!-- ========================================================================= -->
    <div v-if="activeTab === 'workgroups'" class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Layers class="size-4 text-primary" />
            <span>Configured Work Groups & Shift Schedules</span>
          </h3>
          <p class="text-xs text-muted-foreground">
            Shift parameters including Standard IN, Lunch Break, and auto-computed Expected OUT.
          </p>
        </div>

        <Button
          size="sm"
          class="h-8 gap-1.5 text-xs font-medium shadow-xs cursor-pointer"
          @click="openAddGroupModal"
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
                  <h4 class="font-bold text-base text-foreground">{{ wg.name }}</h4>
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
                  class="h-7 w-7 p-0 rounded-md text-muted-foreground hover:text-destructive cursor-pointer"
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
              class="h-6 px-2 text-[11px] gap-1 cursor-pointer"
              @click="openEditGroupModal(wg)"
            >
              <Edit2 class="size-2.5 text-primary" />
              <span>Configure</span>
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- TAB 2: ATTENDANCE RULES -->
    <!-- ========================================================================= -->
    <div v-else-if="activeTab === 'rules'" class="space-y-4">
      <div class="rounded-xl border bg-card p-5 shadow-xs space-y-4">
        <div class="flex items-center justify-between border-b pb-3">
          <div>
            <h3 class="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Sliders class="size-4 text-primary" />
              <span>Attendance Calculation & Punctuality Rules</span>
            </h3>
            <p class="text-xs text-muted-foreground">
              Define organizational rules for late arrival calculation, grace periods, missing OUT handling, and rest day policies.
            </p>
          </div>

          <Button
            size="sm"
            class="h-8 gap-1.5 text-xs shadow-xs cursor-pointer"
            :disabled="rulesSaving"
            @click="saveAttendanceRules"
          >
            <Save class="size-3.5" />
            <span>{{ rulesSaving ? 'Saving...' : 'Save Rules' }}</span>
          </Button>
        </div>

        <div v-if="rulesSuccess" class="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 class="size-4 shrink-0 text-emerald-600" />
          <span>{{ rulesSuccess }}</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <!-- Grace Period & Late Calculation -->
          <div class="rounded-xl border p-4 space-y-3 bg-muted/10">
            <div class="font-semibold text-foreground flex items-center gap-1.5">
              <Clock class="size-3.5 text-emerald-600" />
              <span>Grace Period & Late Rules</span>
            </div>

            <div class="space-y-1.5">
              <label class="text-muted-foreground block text-[11px]">Grace Period (Minutes)</label>
              <Input
                v-model.number="attendanceRules.gracePeriodMinutes"
                type="number"
                min="0"
                max="60"
                class="h-8 text-xs font-mono"
              />
              <p class="text-[10px] text-muted-foreground">
                Clock-ins within this grace period are recorded as on-time without late penalty.
              </p>
            </div>

            <div class="space-y-1.5">
              <label class="text-muted-foreground block text-[11px]">Late Minute Calculation Method</label>
              <Select v-model="attendanceRules.lateCalculationMethod">
                <SelectTrigger class="h-8 text-xs bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="exact">Exact Minutes (Standard DOLE Compliance)</SelectItem>
                    <SelectItem value="round_15">Round to nearest 15-minute block</SelectItem>
                    <SelectItem value="tiered">Tiered penalty policy</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <!-- Single Punch & Missing OUT Policy -->
          <div class="rounded-xl border p-4 space-y-3 bg-muted/10">
            <div class="font-semibold text-foreground flex items-center gap-1.5">
              <AlertCircle class="size-3.5 text-amber-500" />
              <span>Discrepancy & Missing Scans Policy</span>
            </div>

            <div class="space-y-1.5">
              <label class="text-muted-foreground block text-[11px]">Single Punch Handling (Morning only)</label>
              <Select v-model="attendanceRules.singlePunchHandling">
                <SelectTrigger class="h-8 text-xs bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="awaiting_out">Flag as Awaiting OUT until day closes, then prompt HR Review</SelectItem>
                    <SelectItem value="assume_shift_end">Automatically assume Expected OUT</SelectItem>
                    <SelectItem value="require_manual">Require HR Manual Time Approval</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div class="space-y-1.5">
              <label class="text-muted-foreground block text-[11px]">Missing IN Handling (Afternoon only scan)</label>
              <Select v-model="attendanceRules.missingInHandling">
                <SelectTrigger class="h-8 text-xs bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="flag_review">Flag as "Likely OUT — Missing IN" for review</SelectItem>
                    <SelectItem value="manual_required">Require Employee Manual Adjustment Request</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <!-- Working Hours & Lunch Break -->
          <div class="rounded-xl border p-4 space-y-3 bg-muted/10">
            <div class="font-semibold text-foreground flex items-center gap-1.5">
              <Coffee class="size-3.5 text-primary" />
              <span>Daily Hours & Meal Periods</span>
            </div>

            <div class="space-y-1.5">
              <label class="text-muted-foreground block text-[11px]">Standard Daily Full-Time Hours</label>
              <Input
                v-model.number="attendanceRules.standardDailyWorkingHours"
                type="number"
                min="1"
                max="12"
                class="h-8 text-xs font-mono"
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-muted-foreground block text-[11px]">Unpaid Meal Break Duration (Minutes)</label>
              <Input
                v-model.number="attendanceRules.mealBreakDurationMinutes"
                type="number"
                min="0"
                max="120"
                class="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <!-- Rest Day & Overtime Policy -->
          <div class="rounded-xl border p-4 space-y-3 bg-muted/10">
            <div class="font-semibold text-foreground flex items-center gap-1.5">
              <CalendarDays class="size-3.5 text-primary" />
              <span>Overtime & Rest Days</span>
            </div>

            <div class="space-y-2 pt-1">
              <div class="flex items-center justify-between">
                <div>
                  <span class="font-medium text-foreground block">Require Prior OT Authorization</span>
                  <span class="text-[10px] text-muted-foreground">Only authorized OT requests are credited to payroll.</span>
                </div>
                <input
                  type="checkbox"
                  v-model="attendanceRules.requireOtAuthorization"
                  class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                />
              </div>

              <div class="space-y-1 pt-1 border-t">
                <label class="text-muted-foreground block text-[11px]">Rest Day Premium Rate</label>
                <Input
                  v-model="attendanceRules.restDayOvertimeMultiplier"
                  type="text"
                  class="h-8 text-xs font-mono"
                  placeholder="130%"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- TAB 3: HOLIDAYS -->
    <!-- ========================================================================= -->
    <div v-else-if="activeTab === 'holidays'" class="space-y-4">
      <HolidayManager />
    </div>

    <!-- ============================================================= -->
    <!-- ADD / EDIT WORK GROUP MODAL DIALOG -->
    <!-- ============================================================= -->
    <Dialog :open="showGroupModal" @update:open="showGroupModal = $event">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-base">
            <Layers class="size-4 text-primary" />
            <span>{{ isEditingGroup ? 'Edit Work Group' : 'Add Work Group' }}</span>
          </DialogTitle>
          <DialogDescription class="text-xs">
            Configure shift timing, lunch breaks, and grace periods for automated daily attendance evaluation.
          </DialogDescription>
        </DialogHeader>

        <form @submit.prevent="saveWorkGroupForm" class="p-1 space-y-4 text-xs">
          <!-- Group Name and Group Code in 2 columns -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class="text-xs font-semibold text-foreground">
                Group Name <span class="text-destructive">*</span>
              </label>
              <Input
                v-model="formGroupName"
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
                v-model="formGroupCode"
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
              <TimePicker
                v-model="formStandardIn"
                placeholder="08:00"
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
              <TimePicker
                v-model="formLunchStart"
                placeholder="12:00"
                class="h-8 text-xs font-mono"
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-semibold text-foreground flex items-center gap-1">
                <Coffee class="size-3 text-amber-600" />
                <span>Lunch Break End</span>
              </label>
              <TimePicker
                v-model="formLunchEnd"
                placeholder="13:00"
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
          <div v-if="formGroupSuccess" class="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 class="size-4 shrink-0 text-emerald-600" />
            <span>{{ formGroupSuccess }}</span>
          </div>

          <div v-if="formGroupError" class="p-2.5 rounded bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
            <AlertCircle class="size-4 shrink-0" />
            <span>{{ formGroupError }}</span>
          </div>

          <!-- Actions -->
          <DialogFooter class="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="h-8 text-xs cursor-pointer"
              @click="showGroupModal = false"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              class="h-8 text-xs gap-1.5 font-medium shadow-xs cursor-pointer"
              :disabled="formGroupSaving"
            >
              <Save class="size-3.5" />
              <span>{{ formGroupSaving ? 'Saving...' : 'Save Work Group' }}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <!-- ============================================================= -->
    <!-- DELETE WORK GROUP CONFIRMATION & REASSIGNMENT MODAL -->
    <!-- ============================================================= -->
    <Dialog :open="showDeleteModal && !!groupToDelete" @update:open="showDeleteModal = $event">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 font-bold text-sm text-destructive">
            <AlertTriangle class="size-4 text-destructive" />
            <span>Delete Work Group: {{ groupToDelete?.name }}</span>
          </DialogTitle>
          <DialogDescription class="text-xs">
            Review assigned employees before deleting this shift configuration.
          </DialogDescription>
        </DialogHeader>

        <div v-if="groupToDelete" class="p-1 space-y-4 text-xs">
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
          <div v-if="deleteGroupSuccess" class="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 class="size-4 shrink-0 text-emerald-600" />
            <span>{{ deleteGroupSuccess }}</span>
          </div>

          <div v-if="deleteGroupError" class="p-2.5 rounded bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
            <AlertCircle class="size-4 shrink-0" />
            <span>{{ deleteGroupError }}</span>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="h-8 text-xs cursor-pointer"
            @click="showDeleteModal = false"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            class="h-8 text-xs gap-1.5 cursor-pointer"
            :disabled="isDeletingGroup"
            @click="confirmDeleteGroup"
          >
            <Trash2 class="size-3.5" />
            <span>{{ isDeletingGroup ? 'Deleting...' : (deleteAssignedCount > 0 ? 'Reassign & Delete' : 'Delete Group') }}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
