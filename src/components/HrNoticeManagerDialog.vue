<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  Bell,
  Plus,
  Trash2,
  Edit2,
  Play,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Sparkles
} from '@lucide/vue'
import { hrNoticeService, isNoticeActive, type HrNotice } from '@/services/hrNotices'
import { employeeService } from '@/services/employees'
import { normalizeBioId } from '@/services/punchDisplay'
import type { Employee } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Avatar,
  AvatarFallback,
  AvatarImage
} from '@/components/ui/avatar'

const props = defineProps<{
  open: boolean
  targetBioId?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'close'): void
}>()

const notices = hrNoticeService.notices
const employees = ref<Employee[]>([])
const searchQuery = ref('')
const selectedFilter = ref<'all' | 'active' | 'inactive' | 'expired'>('all')

// Form modal state
const isFormOpen = ref(false)
const editingNoticeId = ref<string | null>(null)
const formBioId = ref('')
const formMessage = ref('')
const formHasExpiration = ref(false)
const formExpiresAt = ref('')
const formEnabled = ref(true)
const formError = ref('')
const formSuccess = ref('')
const isSaving = ref(false)

// Delete confirm modal state
const noticeToDelete = ref<HrNotice | null>(null)
const isDeleting = ref(false)

onMounted(async () => {
  try {
    employees.value = await employeeService.getEmployees()
  } catch {
    // ignore
  }
})

// Watch targetBioId prop to prefill form when opening specifically for an employee
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      if (props.targetBioId) {
        openCreateForm(props.targetBioId)
      }
    } else {
      isFormOpen.value = false
    }
  }
)

const activeNoticesCount = computed(() => {
  return notices.value.filter(n => isNoticeActive(n)).length
})

const filteredNotices = computed(() => {
  let list = notices.value

  if (selectedFilter.value === 'active') {
    list = list.filter(n => isNoticeActive(n))
  } else if (selectedFilter.value === 'inactive') {
    list = list.filter(n => !n.enabled)
  } else if (selectedFilter.value === 'expired') {
    list = list.filter(n => {
      if (!n.expiresAt) return false
      const exp = new Date(n.expiresAt).getTime()
      return !isNaN(exp) && exp <= Date.now()
    })
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    list = list.filter(n =>
      n.employeeName.toLowerCase().includes(q) ||
      n.bioId.toLowerCase().includes(q) ||
      n.message.toLowerCase().includes(q) ||
      (n.department && n.department.toLowerCase().includes(q))
    )
  }

  return list
})

const selectedEmployee = computed(() => {
  if (!formBioId.value) return null
  const clean = normalizeBioId(formBioId.value)
  return employees.value.find(e => normalizeBioId(e.biometric_user_id) === clean) || null
})

function formatDateTimeDisplay(isoStr?: string | null): string {
  if (!isoStr) return 'No expiration'
  try {
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(new Date(isoStr))
  } catch {
    return isoStr
  }
}

function getNoticeStatus(notice: HrNotice): { label: string; variant: 'success' | 'secondary' | 'warning' } {
  if (!notice.enabled) {
    return { label: 'Inactive', variant: 'secondary' }
  }
  if (notice.expiresAt) {
    const exp = new Date(notice.expiresAt).getTime()
    if (!isNaN(exp) && exp <= Date.now()) {
      return { label: 'Expired', variant: 'warning' }
    }
  }
  return { label: 'Active', variant: 'success' }
}

function openCreateForm(prefillBioId?: string) {
  editingNoticeId.value = null
  formBioId.value = prefillBioId ? normalizeBioId(prefillBioId) : (employees.value[0]?.biometric_user_id || '')
  formMessage.value = ''
  formHasExpiration.value = false
  formExpiresAt.value = ''
  formEnabled.value = true
  formError.value = ''
  formSuccess.value = ''
  isFormOpen.value = true
}

function openEditForm(notice: HrNotice) {
  editingNoticeId.value = notice.id
  formBioId.value = notice.bioId
  formMessage.value = notice.message
  formEnabled.value = notice.enabled
  if (notice.expiresAt) {
    formHasExpiration.value = true
    try {
      const d = new Date(notice.expiresAt)
      // Format as YYYY-MM-DDTHH:mm for datetime-local input
      const pad = (n: number) => String(n).padStart(2, '0')
      formExpiresAt.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    } catch {
      formExpiresAt.value = ''
    }
  } else {
    formHasExpiration.value = false
    formExpiresAt.value = ''
  }
  formError.value = ''
  formSuccess.value = ''
  isFormOpen.value = true
}

function applyTemplate(text: string) {
  const emp = selectedEmployee.value
  const name = emp ? (emp.preferred_name || emp.full_name) : 'Employee'
  formMessage.value = text.replace('{name}', name)
}

async function handleSaveNotice() {
  if (!formBioId.value) {
    formError.value = 'Please select a target employee.'
    return
  }
  if (!formMessage.value.trim()) {
    formError.value = 'Notice message is required.'
    return
  }

  isSaving.value = true
  formError.value = ''
  formSuccess.value = ''

  try {
    const emp = selectedEmployee.value
    const resolvedName = emp?.full_name || `Employee ${formBioId.value}`
    const resolvedDept = emp?.department
    const resolvedPhoto = emp?.photo

    let isoExpiresAt: string | null = null
    if (formHasExpiration.value && formExpiresAt.value) {
      isoExpiresAt = new Date(formExpiresAt.value).toISOString()
    }

    await hrNoticeService.saveNotice({
      id: editingNoticeId.value || undefined,
      bioId: formBioId.value,
      employeeName: resolvedName,
      department: resolvedDept,
      photoUrl: resolvedPhoto || undefined,
      message: formMessage.value.trim(),
      expiresAt: isoExpiresAt,
      enabled: formEnabled.value,
      createdBy: 'HR Office'
    })

    formSuccess.value = editingNoticeId.value ? 'Notice updated successfully.' : 'Notice created successfully.'
    setTimeout(() => {
      isFormOpen.value = false
      formSuccess.value = ''
    }, 600)
  } catch (err: any) {
    formError.value = err?.message || 'Failed to save notice.'
  } finally {
    isSaving.value = false
  }
}

async function handleToggle(notice: HrNotice) {
  await hrNoticeService.toggleNotice(notice.id)
}

function confirmDelete(notice: HrNotice) {
  noticeToDelete.value = notice
}

async function executeDelete() {
  if (!noticeToDelete.value) return
  isDeleting.value = true
  try {
    await hrNoticeService.deleteNotice(noticeToDelete.value.id)
    noticeToDelete.value = null
  } finally {
    isDeleting.value = false
  }
}

function testPreview(notice: HrNotice) {
  hrNoticeService.triggerNoticePreview(notice)
}

function handleClose() {
  emit('update:open', false)
  emit('close')
}
</script>

<template>
  <div>
    <!-- Main HR Notifications Manager Dialog -->
    <Dialog :open="props.open" @update:open="(val: boolean) => emit('update:open', val)">
      <DialogContent class="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <!-- Top Dialog Header -->
        <div class="p-5 border-b bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="size-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold border border-blue-500/20 shrink-0">
              <Bell class="size-5" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <DialogTitle class="text-lg font-bold text-foreground">
                  HR-to-Employee Biometric Punch Notifications
                </DialogTitle>
                <Badge variant="outline" class="font-mono text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">
                  {{ activeNoticesCount }} Active
                </Badge>
              </div>
              <DialogDescription class="text-xs text-muted-foreground mt-0.5">
                Target notifications to specific employees. When the assigned employee punches their fingerprint, their notice appears on the Punch Display.
              </DialogDescription>
            </div>
          </div>

          <Button
            size="sm"
            class="h-8 gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white shrink-0 shadow-xs"
            @click="openCreateForm()"
          >
            <Plus class="size-3.5" />
            <span>New Notification</span>
          </Button>
        </div>

        <!-- Filter & Search Bar -->
        <div class="p-3 border-b bg-card flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div class="relative w-full sm:w-80">
            <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              v-model="searchQuery"
              type="text"
              placeholder="Search by employee name, Bio ID, message..."
              class="pl-8 h-8 text-xs bg-muted/30"
            />
          </div>

          <!-- Status Filters -->
          <div class="flex items-center gap-1 w-full sm:w-auto overflow-x-auto">
            <button
              type="button"
              class="px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer"
              :class="selectedFilter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'"
              @click="selectedFilter = 'all'"
            >
              All ({{ notices.length }})
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer"
              :class="selectedFilter === 'active' ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:bg-muted'"
              @click="selectedFilter = 'active'"
            >
              Active ({{ activeNoticesCount }})
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer"
              :class="selectedFilter === 'inactive' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'"
              @click="selectedFilter = 'inactive'"
            >
              Inactive
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer"
              :class="selectedFilter === 'expired' ? 'bg-amber-600 text-white' : 'text-muted-foreground hover:bg-muted'"
              @click="selectedFilter = 'expired'"
            >
              Expired
            </button>
          </div>
        </div>

        <!-- Notices List Area -->
        <div class="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px]">
          <!-- Empty State -->
          <div
            v-if="filteredNotices.length === 0"
            class="flex flex-col items-center justify-center py-16 text-center text-muted-foreground border border-dashed rounded-xl"
          >
            <Bell class="size-10 stroke-1 mb-2 opacity-50" />
            <div class="font-medium text-sm text-foreground">No Employee Notifications Found</div>
            <p class="text-xs max-w-sm mt-1">
              {{ searchQuery ? 'No notifications match your current filter query.' : 'Create an HR notice to alert an employee the next time they punch at the biometric reader.' }}
            </p>
            <Button
              v-if="!searchQuery"
              size="sm"
              variant="outline"
              class="mt-4 text-xs gap-1.5"
              @click="openCreateForm()"
            >
              <Plus class="size-3.5" />
              <span>Create First Notice</span>
            </Button>
          </div>

          <!-- Cards List -->
          <div
            v-for="notice in filteredNotices"
            :key="notice.id"
            class="p-4 rounded-xl border bg-card hover:border-blue-500/40 transition-all shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <!-- Left Employee Info & Notice Content -->
            <div class="flex items-start gap-3.5 flex-1 min-w-0">
              <Avatar class="size-11 rounded-lg shrink-0 border">
                <AvatarImage
                  v-if="notice.photoUrl"
                  :src="notice.photoUrl"
                  :alt="notice.employeeName"
                />
                <AvatarFallback class="bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-sm">
                  {{ notice.employeeName.charAt(0).toUpperCase() }}
                </AvatarFallback>
              </Avatar>

              <div class="space-y-1.5 flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-bold text-sm text-foreground">
                    {{ notice.employeeName }}
                  </span>
                  <Badge variant="outline" class="font-mono text-[10px] px-1.5 py-0">
                    Bio ID: {{ notice.bioId }}
                  </Badge>
                  <span v-if="notice.department" class="text-xs text-muted-foreground font-medium">
                    • {{ notice.department }}
                  </span>
                  <Badge
                    :variant="getNoticeStatus(notice).variant"
                    class="text-[10px] uppercase font-mono px-1.5 py-0"
                  >
                    {{ getNoticeStatus(notice).label }}
                  </Badge>
                </div>

                <!-- Message Box -->
                <div class="rounded-lg bg-blue-500/5 border border-blue-500/20 p-2.5 text-xs font-medium text-foreground leading-relaxed">
                  <span class="font-bold text-blue-600 dark:text-blue-400">Notice: </span>
                  "{{ notice.message }}"
                </div>

                <!-- Metadata Row -->
                <div class="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
                  <div class="flex items-center gap-1">
                    <Clock class="size-3" />
                    <span>Expires: {{ formatDateTimeDisplay(notice.expiresAt) }}</span>
                  </div>
                  <div>
                    Created: {{ new Date(notice.createdAt).toLocaleDateString() }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Right Controls: Toggle, Preview, Edit, Delete -->
            <div class="flex items-center gap-2 md:self-center shrink-0 border-t md:border-t-0 pt-2 md:pt-0">
              <!-- Active/Inactive Toggle -->
              <div class="flex items-center gap-2 mr-2">
                <Switch
                  :checked="notice.enabled"
                  @update:checked="handleToggle(notice)"
                />
                <span class="text-xs font-mono font-medium" :class="notice.enabled ? 'text-foreground' : 'text-muted-foreground'">
                  {{ notice.enabled ? 'ON' : 'OFF' }}
                </span>
              </div>

              <!-- Test on Punch Display Preview -->
              <Button
                variant="outline"
                size="sm"
                class="h-8 px-2.5 text-xs gap-1 hover:text-blue-600 hover:border-blue-500"
                title="Preview this notice on the Punch Display"
                @click="testPreview(notice)"
              >
                <Play class="size-3" />
                <span class="hidden sm:inline">Test Preview</span>
              </Button>

              <!-- Edit Button -->
              <Button
                variant="ghost"
                size="sm"
                class="h-8 px-2 text-xs"
                title="Edit Notice"
                @click="openEditForm(notice)"
              >
                <Edit2 class="size-3.5" />
              </Button>

              <!-- Delete Button -->
              <Button
                variant="ghost"
                size="sm"
                class="h-8 px-2 text-xs text-destructive hover:bg-destructive/10"
                title="Delete Notice"
                @click="confirmDelete(notice)"
              >
                <Trash2 class="size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <!-- Footer Strip -->
        <div class="p-3 border-t bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
          <div class="flex items-center gap-1.5">
            <Sparkles class="size-3.5 text-blue-500" />
            <span>Notices automatically trigger after the employee's fingerprint punch is logged.</span>
          </div>
          <Button variant="ghost" size="sm" class="h-7 text-xs" @click="handleClose">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Create / Edit Notice Sub-Dialog -->
    <Dialog :open="isFormOpen" @update:open="(val: boolean) => isFormOpen = val">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle class="text-base font-bold flex items-center gap-2">
            <Bell class="size-4 text-blue-500" />
            <span>{{ editingNoticeId ? 'Edit Punch Notification' : 'Assign Employee Punch Notification' }}</span>
          </DialogTitle>
          <DialogDescription class="text-xs">
            Configure the message and duration. This notification will display on the Punch Display immediately after the employee punches.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4 py-2">
          <!-- Alert feedback -->
          <div v-if="formError" class="p-2.5 rounded-md bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-center gap-2">
            <AlertTriangle class="size-4 shrink-0" />
            <span>{{ formError }}</span>
          </div>
          <div v-if="formSuccess" class="p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
            <CheckCircle2 class="size-4 shrink-0" />
            <span>{{ formSuccess }}</span>
          </div>

          <!-- Employee Selector -->
          <div class="space-y-1.5">
            <Label for="employee-select" class="text-xs font-semibold">
              Select Target Employee (Unique Bio ID) <span class="text-destructive">*</span>
            </Label>
            <Select v-model="formBioId" :disabled="Boolean(editingNoticeId)">
              <SelectTrigger id="employee-select" class="w-full text-xs h-9 bg-card">
                <SelectValue placeholder="Choose an employee..." />
              </SelectTrigger>
              <SelectContent class="max-h-60">
                <SelectGroup>
                  <SelectItem
                    v-for="emp in employees"
                    :key="emp.biometric_user_id"
                    :value="normalizeBioId(emp.biometric_user_id)"
                  >
                    {{ emp.full_name }} (Bio ID: {{ emp.biometric_user_id }}) — {{ emp.department || 'Operations' }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            <!-- Selected Employee Info Preview Card -->
            <div v-if="selectedEmployee" class="p-2.5 rounded-lg bg-muted/40 border flex items-center gap-3">
              <Avatar class="size-8 rounded-md shrink-0">
                <AvatarImage
                  v-if="selectedEmployee.photo"
                  :src="selectedEmployee.photo"
                  :alt="selectedEmployee.full_name"
                />
                <AvatarFallback class="text-xs font-bold bg-primary/10 text-primary">
                  {{ selectedEmployee.full_name.charAt(0) }}
                </AvatarFallback>
              </Avatar>
              <div class="text-xs leading-tight min-w-0">
                <div class="font-bold truncate text-foreground">{{ selectedEmployee.full_name }}</div>
                <div class="text-muted-foreground text-[11px] truncate">
                  Bio ID: {{ selectedEmployee.biometric_user_id }} • {{ selectedEmployee.position || 'Staff' }} ({{ selectedEmployee.department || 'Operations' }})
                </div>
              </div>
            </div>
          </div>

          <!-- Notice Message -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <Label for="notice-message" class="text-xs font-semibold">
                Notification Message <span class="text-destructive">*</span>
              </Label>
              <span class="text-[10px] text-muted-foreground">Max 250 characters</span>
            </div>
            <Textarea
              id="notice-message"
              v-model="formMessage"
              rows="3"
              maxlength="250"
              placeholder="e.g. Please proceed to HR office to claim your document."
              class="text-xs bg-card"
            />

            <!-- Quick Template Buttons -->
            <div class="pt-1">
              <div class="text-[10px] font-medium text-muted-foreground mb-1">Quick Suggestions:</div>
              <div class="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  class="text-[11px] px-2 py-0.5 rounded-md border bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  @click="applyTemplate('Please see HR office.')"
                >
                  "Please see HR office."
                </button>
                <button
                  type="button"
                  class="text-[11px] px-2 py-0.5 rounded-md border bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  @click="applyTemplate('Please claim your document at the admin desk.')"
                >
                  "Claim document at admin desk"
                </button>
                <button
                  type="button"
                  class="text-[11px] px-2 py-0.5 rounded-md border bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  @click="applyTemplate('Please submit your daily accomplishment report.')"
                >
                  "Submit accomplishment report"
                </button>
              </div>
            </div>
          </div>

          <!-- Expiration Date & Time (Optional) -->
          <div class="space-y-2 border-t pt-3">
            <div class="flex items-center justify-between">
              <div>
                <Label for="has-expiration" class="text-xs font-semibold cursor-pointer">
                  Set Expiration Date/Time
                </Label>
                <div class="text-[11px] text-muted-foreground">
                  Optional: notification will stop appearing after this date/time.
                </div>
              </div>
              <Switch
                id="has-expiration"
                :checked="formHasExpiration"
                @update:checked="(val: boolean) => formHasExpiration = val"
              />
            </div>

            <div v-if="formHasExpiration" class="pt-1">
              <Input
                v-model="formExpiresAt"
                type="datetime-local"
                class="text-xs h-9 bg-card"
              />
            </div>
          </div>

          <!-- Active Toggle -->
          <div class="flex items-center justify-between border-t pt-3">
            <div>
              <Label for="form-enabled" class="text-xs font-semibold cursor-pointer">
                Status: Active
              </Label>
              <div class="text-[11px] text-muted-foreground">
                Notice is immediately enabled upon saving.
              </div>
            </div>
            <Switch
              id="form-enabled"
              :checked="formEnabled"
              @update:checked="(val: boolean) => formEnabled = val"
            />
          </div>
        </div>

        <DialogFooter class="gap-2">
          <Button variant="outline" size="sm" class="text-xs" @click="isFormOpen = false">
            Cancel
          </Button>
          <Button
            size="sm"
            class="text-xs bg-blue-600 hover:bg-blue-700 text-white"
            :disabled="isSaving"
            @click="handleSaveNotice"
          >
            {{ isSaving ? 'Saving...' : (editingNoticeId ? 'Update Notice' : 'Save & Activate Notice') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Confirmation Modal -->
    <Dialog :open="Boolean(noticeToDelete)" @update:open="(val: boolean) => { if (!val) noticeToDelete = null }">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle class="text-base font-bold text-destructive flex items-center gap-2">
            <Trash2 class="size-4" />
            <span>Delete Notification?</span>
          </DialogTitle>
          <DialogDescription class="text-xs">
            Are you sure you want to remove the notification for
            <span class="font-bold text-foreground">{{ noticeToDelete?.employeeName }}</span>?
            It will no longer appear on the Punch Display.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter class="gap-2">
          <Button variant="outline" size="sm" class="text-xs" @click="noticeToDelete = null">
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            class="text-xs"
            :disabled="isDeleting"
            @click="executeDelete"
          >
            {{ isDeleting ? 'Deleting...' : 'Delete Notification' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
