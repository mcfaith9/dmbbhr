<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  Calendar as CalendarIcon,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Edit2,
  Trash2,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Database,
  Globe,
  Settings2,
  Landmark,
  Save,
  Tag
} from '@lucide/vue'
import {
  holidayService,
  type HolidayItem,
  type HolidayType,
  type HolidayScope,
  type HolidaySettingsConfig
} from '@/services/holidays'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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

const currentYear = new Date().getFullYear()
const selectedYear = ref<number>(currentYear)
const holidays = ref<HolidayItem[]>([])
const loading = ref(false)
const searchQuery = ref('')
const selectedTypeFilter = ref<string>('all')
const selectedScopeFilter = ref<string>('all')

// Status & source
const activeSource = ref<'local' | 'api'>('local')
const isFallback = ref(false)
const sourceErrorMessage = ref<string | undefined>()

// Add / Edit Modal State
const showHolidayModal = ref(false)
const isEditing = ref(false)
const editingHolidayId = ref<string | null>(null)
const formName = ref('')
const formDate = ref('')
const formType = ref<HolidayType>('Regular')
const formScope = ref<HolidayScope>('Cebu City')
const formDescription = ref('')
const formLegalBasis = ref('')
const formSaving = ref(false)
const formError = ref('')
const formSuccess = ref('')

// Delete Modal State
const showDeleteModal = ref(false)
const holidayToDelete = ref<HolidayItem | null>(null)
const isDeleting = ref(false)

// Config Drawer / Modal State
const showConfigModal = ref(false)
const config = ref<HolidaySettingsConfig>(holidayService.getConfig())
const testLoading = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

const availableYears = [2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032]

async function loadHolidays() {
  loading.value = true
  sourceErrorMessage.value = undefined
  try {
    const res = await holidayService.getHolidays(selectedYear.value)
    holidays.value = res.holidays
    activeSource.value = res.activeSource
    isFallback.value = res.isFallback
    sourceErrorMessage.value = res.errorMessage
  } catch (err: any) {
    sourceErrorMessage.value = err.message
  } finally {
    loading.value = false
  }
}

watch(selectedYear, () => {
  loadHolidays()
})

function prevYear() {
  selectedYear.value = selectedYear.value - 1
}

function nextYear() {
  selectedYear.value = selectedYear.value + 1
}

const filteredHolidays = computed(() => {
  let list = holidays.value

  if (selectedTypeFilter.value !== 'all') {
    list = list.filter(h => h.type === selectedTypeFilter.value)
  }

  if (selectedScopeFilter.value !== 'all') {
    list = list.filter(h => h.scope === selectedScopeFilter.value)
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(h =>
      h.name.toLowerCase().includes(q) ||
      h.date.toLowerCase().includes(q) ||
      (h.description && h.description.toLowerCase().includes(q)) ||
      (h.legalBasis && h.legalBasis.toLowerCase().includes(q))
    )
  }

  return list
})

const stats = computed(() => {
  const total = holidays.value.length
  const regular = holidays.value.filter(h => h.type === 'Regular').length
  const special = holidays.value.filter(h => h.type === 'Special Non-Working').length
  const cebu = holidays.value.filter(h => h.scope === 'Cebu City' || h.type === 'Local Holiday').length
  const custom = holidays.value.filter(h => h.source === 'custom').length
  return { total, regular, special, cebu, custom }
})

function openAddModal() {
  isEditing.value = false
  editingHolidayId.value = null
  formName.value = ''
  formDate.value = `${selectedYear.value}-01-01`
  formType.value = 'Special Non-Working'
  formScope.value = 'Cebu City'
  formDescription.value = ''
  formLegalBasis.value = 'City Proclamation / Local HR Memo'
  formError.value = ''
  formSuccess.value = ''
  showHolidayModal.value = true
}

function openEditModal(h: HolidayItem) {
  isEditing.value = true
  editingHolidayId.value = h.id
  formName.value = h.name
  formDate.value = h.date
  formType.value = h.type
  formScope.value = h.scope
  formDescription.value = h.description || ''
  formLegalBasis.value = h.legalBasis || ''
  formError.value = ''
  formSuccess.value = ''
  showHolidayModal.value = true
}

async function saveHolidayForm() {
  if (!formName.value.trim()) {
    formError.value = 'Holiday Name is required.'
    return
  }
  if (!formDate.value.trim()) {
    formError.value = 'Holiday Date is required.'
    return
  }

  formSaving.value = true
  formError.value = ''
  formSuccess.value = ''

  try {
    await holidayService.saveCustomHoliday({
      id: editingHolidayId.value || undefined,
      name: formName.value.trim(),
      date: formDate.value.trim(),
      type: formType.value,
      scope: formScope.value,
      description: formDescription.value.trim(),
      legalBasis: formLegalBasis.value.trim()
    })

    formSuccess.value = `Holiday "${formName.value}" saved successfully.`
    await loadHolidays()
    setTimeout(() => {
      showHolidayModal.value = false
    }, 900)
  } catch (err: any) {
    formError.value = err.message || 'Failed to save holiday.'
  } finally {
    formSaving.value = false
  }
}

function promptDelete(h: HolidayItem) {
  holidayToDelete.value = h
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!holidayToDelete.value) return
  isDeleting.value = true
  try {
    await holidayService.deleteCustomHoliday(holidayToDelete.value.id)
    showDeleteModal.value = false
    holidayToDelete.value = null
    await loadHolidays()
  } finally {
    isDeleting.value = false
  }
}

function openConfigModal() {
  config.value = holidayService.getConfig()
  testResult.value = null
  showConfigModal.value = true
}

async function saveHolidayConfig() {
  holidayService.saveConfig(config.value)
  showConfigModal.value = false
  await loadHolidays()
}

async function testApiConnection() {
  testLoading.value = true
  testResult.value = null
  try {
    holidayService.saveConfig(config.value)
    const res = await holidayService.testApiConnection()
    testResult.value = res
  } finally {
    testLoading.value = false
  }
}

function formatDate(dateStr: string) {
  try {
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    return date.toLocaleDateString('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  } catch {
    return dateStr
  }
}

onMounted(() => {
  loadHolidays()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Top Action & Year Controls Bar -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border shadow-xs">
      <div>
        <div class="flex items-center gap-2 flex-wrap">
          <h2 class="text-lg font-bold text-foreground flex items-center gap-2">
            <span>Philippine & Cebu City Holiday Calendar</span>
          </h2>
          <span class="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
            <MapPin class="size-3" />
            <span>Cebu City, Philippines</span>
          </span>
        </div>
        <p class="text-xs text-muted-foreground mt-0.5">
          Regular, Special Non-Working, and Cebu City local statutory holidays for payroll calculation, overtime, and work schedule rules.
        </p>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <!-- Year Switcher Buttons -->
        <div class="flex items-center rounded-lg border bg-muted/30 p-0.5 shadow-2xs">
          <Button
            variant="ghost"
            size="sm"
            class="h-7 w-7 p-0"
            title="Previous Year"
            @click="prevYear"
          >
            <ChevronLeft class="size-4" />
          </Button>

          <Select :model-value="String(selectedYear)" @update:model-value="(val) => selectedYear = Number(val)">
            <SelectTrigger class="h-7 border-0 bg-transparent px-2.5 font-bold font-mono text-xs w-[84px] shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem v-for="yr in availableYears" :key="yr" :value="String(yr)">
                  {{ yr }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="sm"
            class="h-7 w-7 p-0"
            title="Next Year"
            @click="nextYear"
          >
            <ChevronRight class="size-4" />
          </Button>
        </div>

        <Button
          variant="outline"
          size="sm"
          class="h-8 text-xs gap-1.5 font-medium shadow-xs"
          @click="openConfigModal"
        >
          <Settings2 class="size-3.5 text-muted-foreground" />
          <span>Provider Source</span>
        </Button>

        <Button
          variant="default"
          size="sm"
          class="h-8 text-xs gap-1.5 font-medium shadow-xs"
          @click="openAddModal"
        >
          <Plus class="size-3.5" />
          <span>Add Custom Holiday</span>
        </Button>
      </div>
    </div>

    <!-- Active Source Indicator & Fallback Warning (if any) -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg border text-xs bg-muted/20">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-muted-foreground font-medium">Holiday Provider:</span>
        <Badge
          :variant="activeSource === 'api' ? 'default' : 'outline'"
          class="font-mono text-[11px] gap-1 px-2 py-0.5"
        >
          <Globe v-if="activeSource === 'api'" class="size-3" />
          <Database v-else class="size-3 text-primary" />
          <span>{{ activeSource === 'api' ? 'External Holiday API' : 'Local / Offline Provider' }}</span>
        </Badge>

        <span v-if="isFallback" class="text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1 text-[11px]">
          <AlertTriangle class="size-3.5 text-amber-500" />
          <span>Offline fallback engaged (local holiday dataset active)</span>
        </span>

        <span v-else class="text-muted-foreground text-[11px]">
          Fully operational offline with local Cebu City & Philippine holiday engine
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="text-xs text-primary hover:underline font-medium cursor-pointer flex items-center gap-1"
          @click="loadHolidays"
        >
          <RefreshCw class="size-3" :class="loading ? 'animate-spin' : ''" />
          <span>Reload {{ selectedYear }}</span>
        </button>
      </div>
    </div>

    <!-- Quick Metrics Ribbon -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <span class="text-[11px] text-muted-foreground font-medium">All Holidays ({{ selectedYear }})</span>
        <div class="text-lg font-bold text-foreground font-mono mt-0.5 flex items-center gap-1.5">
          <CalendarIcon class="size-4 text-primary" />
          <span>{{ stats.total }}</span>
        </div>
      </div>

      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <span class="text-[11px] text-muted-foreground font-medium">Regular Holidays</span>
        <div class="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5 flex items-center gap-1.5">
          <CheckCircle2 class="size-4" />
          <span>{{ stats.regular }}</span>
          <span class="text-[10px] font-normal text-muted-foreground font-sans">(200%)</span>
        </div>
      </div>

      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <span class="text-[11px] text-muted-foreground font-medium">Special Non-Working</span>
        <div class="text-lg font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5 flex items-center gap-1.5">
          <Tag class="size-4" />
          <span>{{ stats.special }}</span>
          <span class="text-[10px] font-normal text-muted-foreground font-sans">(130%)</span>
        </div>
      </div>

      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <span class="text-[11px] text-muted-foreground font-medium">Cebu City Local Holidays</span>
        <div class="text-lg font-bold text-primary font-mono mt-0.5 flex items-center gap-1.5">
          <MapPin class="size-4" />
          <span>{{ stats.cebu }}</span>
        </div>
      </div>
    </div>

    <!-- Filters & Search Toolbar -->
    <div class="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-2 items-center">
      <div class="relative sm:col-span-2">
        <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          type="text"
          :placeholder="`Search ${selectedYear} holidays by name or keyword...`"
          class="pl-8 h-8 text-xs bg-card"
        />
      </div>

      <div>
        <Select v-model="selectedTypeFilter">
          <SelectTrigger class="h-8 text-xs w-full bg-card">
            <SelectValue placeholder="All Holiday Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All Holiday Types</SelectItem>
              <SelectItem value="Regular">Regular Holiday</SelectItem>
              <SelectItem value="Special Non-Working">Special Non-Working</SelectItem>
              <SelectItem value="Local Holiday">Local Holiday</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Select v-model="selectedScopeFilter">
          <SelectTrigger class="h-8 text-xs w-full bg-card">
            <SelectValue placeholder="All Scopes" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All Scopes</SelectItem>
              <SelectItem value="Cebu City">Cebu City</SelectItem>
              <SelectItem value="National">National (Philippines)</SelectItem>
              <SelectItem value="Company / Custom">Company / Custom</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>

    <!-- Holidays Master Table -->
    <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow class="bg-muted/40">
            <TableHead class="w-[150px] font-semibold">Date</TableHead>
            <TableHead class="font-semibold">Holiday Name</TableHead>
            <TableHead class="font-semibold">Holiday Type</TableHead>
            <TableHead class="font-semibold">Applicable Scope</TableHead>
            <TableHead class="font-semibold">Payroll Pay Rule</TableHead>
            <TableHead class="font-semibold">Source</TableHead>
            <TableHead class="text-right font-semibold">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <template v-if="loading">
            <TableRow>
              <TableCell colspan="7" class="h-32 text-center text-xs text-muted-foreground">
                <RefreshCw class="size-4 animate-spin mx-auto mb-2 text-primary" />
                Loading {{ selectedYear }} holidays...
              </TableCell>
            </TableRow>
          </template>

          <template v-else-if="filteredHolidays.length === 0">
            <TableRow>
              <TableCell colspan="7" class="h-32 text-center text-muted-foreground">
                <div class="flex flex-col items-center justify-center gap-1.5">
                  <CalendarIcon class="size-6 text-muted-foreground/40" />
                  <span class="font-medium text-foreground text-sm">No holidays found for {{ selectedYear }}</span>
                  <p class="text-xs text-muted-foreground">
                    Try changing your search or filter options, or click <strong>Add Custom Holiday</strong>.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          </template>

          <template v-else>
            <TableRow
              v-for="h in filteredHolidays"
              :key="h.id"
              class="hover:bg-muted/30 transition-colors"
            >
              <!-- Date -->
              <TableCell class="font-mono font-medium text-foreground text-xs whitespace-nowrap">
                <div class="flex items-center gap-1.5">
                  <CalendarIcon class="size-3 text-primary shrink-0" />
                  <span>{{ formatDate(h.date) }}</span>
                </div>
              </TableCell>

              <!-- Name & Legal Basis -->
              <TableCell>
                <div>
                  <div class="font-semibold text-foreground text-xs flex items-center gap-1.5 flex-wrap">
                    <span>{{ h.name }}</span>
                    <Badge v-if="h.isMovable" variant="secondary" class="text-[9px] px-1 py-0 font-mono">
                      Movable
                    </Badge>
                  </div>
                  <div v-if="h.legalBasis" class="text-[11px] text-muted-foreground mt-0.5">
                    {{ h.legalBasis }}
                  </div>
                </div>
              </TableCell>

              <!-- Holiday Type Badge -->
              <TableCell>
                <Badge
                  :variant="h.type === 'Regular' ? 'default' : (h.type === 'Local Holiday' ? 'outline' : 'secondary')"
                  class="text-[10px] uppercase font-mono"
                  :class="h.type === 'Local Holiday' ? 'border-primary/40 text-primary' : ''"
                >
                  {{ h.type }}
                </Badge>
              </TableCell>

              <!-- Scope -->
              <TableCell class="text-xs">
                <span class="inline-flex items-center gap-1 font-medium text-foreground">
                  <MapPin v-if="h.scope === 'Cebu City'" class="size-3 text-emerald-600 dark:text-emerald-400" />
                  <Landmark v-else class="size-3 text-muted-foreground" />
                  {{ h.scope }}
                </span>
              </TableCell>

              <!-- Payroll Rule -->
              <TableCell class="text-xs">
                <span class="text-muted-foreground text-[11px] font-mono">
                  {{ h.payRule }}
                </span>
              </TableCell>

              <!-- Source Origin Identification -->
              <TableCell>
                <div class="flex items-center gap-1">
                  <Badge
                    v-if="h.source === 'system'"
                    variant="outline"
                    class="text-[10px] font-mono text-muted-foreground"
                    title="Computed from Local / System Philippine and Cebu City calendar data"
                  >
                    System Local
                  </Badge>
                  <Badge
                    v-else-if="h.source === 'api'"
                    variant="default"
                    class="text-[10px] font-mono bg-blue-600 text-white"
                    title="Synchronized via External Holiday API"
                  >
                    API Data
                  </Badge>
                  <Badge
                    v-else-if="h.source === 'custom'"
                    variant="default"
                    class="text-[10px] font-mono bg-purple-600 text-white"
                    title="Added manually as custom company / city holiday"
                  >
                    Custom Entry
                  </Badge>
                </div>
              </TableCell>

              <!-- Actions -->
              <TableCell class="text-right">
                <div class="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-7 w-7 p-0"
                    title="Edit Holiday"
                    @click="openEditModal(h)"
                  >
                    <Edit2 class="size-3 text-muted-foreground hover:text-foreground" />
                  </Button>

                  <Button
                    v-if="h.source === 'custom'"
                    variant="ghost"
                    size="sm"
                    class="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    title="Delete Custom Holiday"
                    @click="promptDelete(h)"
                  >
                    <Trash2 class="size-3" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </div>

    <!-- ============================================================= -->
    <!-- ADD / EDIT HOLIDAY DIALOG -->
    <!-- ============================================================= -->
    <Dialog :open="showHolidayModal" @update:open="showHolidayModal = $event">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-base">
            <CalendarIcon class="size-4 text-primary" />
            <span>{{ isEditing ? 'Edit Holiday' : 'Add Custom Holiday' }}</span>
          </DialogTitle>
          <DialogDescription class="text-xs">
            Configure holiday details for payroll premium and attendance calculation.
          </DialogDescription>
        </DialogHeader>

        <form @submit.prevent="saveHolidayForm" class="space-y-3.5 py-1 text-xs">
          <div class="space-y-1">
            <label class="font-semibold text-foreground">Holiday Name <span class="text-destructive">*</span></label>
            <Input
              v-model="formName"
              type="text"
              required
              placeholder="e.g. Cebu City Special Non-Working Day"
              class="h-8 text-xs"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="font-semibold text-foreground">Date <span class="text-destructive">*</span></label>
              <Input
                v-model="formDate"
                type="date"
                required
                class="h-8 text-xs font-mono"
              />
            </div>

            <div class="space-y-1">
              <label class="font-semibold text-foreground">Holiday Type</label>
              <Select v-model="formType">
                <SelectTrigger class="h-8 text-xs bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="Regular">Regular Holiday (200%)</SelectItem>
                    <SelectItem value="Special Non-Working">Special Non-Working (130%)</SelectItem>
                    <SelectItem value="Local Holiday">Local Holiday (Cebu City)</SelectItem>
                    <SelectItem value="Special Working">Special Working</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div class="space-y-1">
            <label class="font-semibold text-foreground">Applicable Scope</label>
            <Select v-model="formScope">
              <SelectTrigger class="h-8 text-xs bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="Cebu City">Cebu City</SelectItem>
                  <SelectItem value="National">National (Philippines)</SelectItem>
                  <SelectItem value="Regional">Regional (Central Visayas)</SelectItem>
                  <SelectItem value="Company / Custom">Company / Custom</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-1">
            <label class="font-semibold text-foreground">Legal Basis / Reference</label>
            <Input
              v-model="formLegalBasis"
              type="text"
              placeholder="e.g. Proclamation No. 123 / Republic Act No. 7287"
              class="h-8 text-xs"
            />
          </div>

          <div class="space-y-1">
            <label class="font-semibold text-foreground">Notes / Description</label>
            <Input
              v-model="formDescription"
              type="text"
              placeholder="Brief description of holiday observance..."
              class="h-8 text-xs"
            />
          </div>

          <div v-if="formSuccess" class="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 class="size-4 shrink-0 text-emerald-600" />
            <span>{{ formSuccess }}</span>
          </div>

          <div v-if="formError" class="p-2.5 rounded bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
            <AlertCircle class="size-4 shrink-0" />
            <span>{{ formError }}</span>
          </div>

          <DialogFooter class="pt-2">
            <Button type="button" variant="outline" size="sm" class="h-8 text-xs" @click="showHolidayModal = false">
              Cancel
            </Button>
            <Button type="submit" size="sm" class="h-8 text-xs gap-1.5 shadow-xs" :disabled="formSaving">
              <Save class="size-3.5" />
              <span>{{ formSaving ? 'Saving...' : 'Save Holiday' }}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <!-- ============================================================= -->
    <!-- DELETE CUSTOM HOLIDAY DIALOG -->
    <!-- ============================================================= -->
    <Dialog :open="showDeleteModal" @update:open="showDeleteModal = $event">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-destructive text-base">
            <AlertTriangle class="size-4" />
            <span>Delete Custom Holiday</span>
          </DialogTitle>
          <DialogDescription class="text-xs">
            Are you sure you want to delete this custom holiday?
          </DialogDescription>
        </DialogHeader>

        <div v-if="holidayToDelete" class="py-2 text-xs space-y-2">
          <p class="font-semibold text-foreground">{{ holidayToDelete.name }}</p>
          <p class="text-muted-foreground">Date: {{ formatDate(holidayToDelete.date) }}</p>
          <p class="text-[11px] text-muted-foreground">
            This entry will be permanently removed from custom holiday records.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" class="h-8 text-xs" @click="showDeleteModal = false">
            Cancel
          </Button>
          <Button variant="destructive" size="sm" class="h-8 text-xs" :disabled="isDeleting" @click="confirmDelete">
            <span>{{ isDeleting ? 'Deleting...' : 'Delete Holiday' }}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ============================================================= -->
    <!-- PROVIDER SOURCE CONFIGURATION DIALOG -->
    <!-- ============================================================= -->
    <Dialog :open="showConfigModal" @update:open="showConfigModal = $event">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-base">
            <Settings2 class="size-4 text-primary" />
            <span>Holiday Source & API Provider Architecture</span>
          </DialogTitle>
          <DialogDescription class="text-xs">
            Configure local offline data vs future external Holiday API. The application operates fully offline with automatic local fallback.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4 py-2 text-xs">
          <!-- Architecture Tree Schema Representation -->
          <div class="p-3 rounded-lg border bg-muted/40 space-y-1 font-mono text-[11px]">
            <div class="text-foreground font-bold">Holiday Provider Architecture:</div>
            <div class="text-muted-foreground">HolidaySource</div>
            <div class="text-muted-foreground pl-3">├── Local / Offline Provider (Cebu City & PH data)</div>
            <div class="text-muted-foreground pl-3">└── External API Provider (Configurable endpoint)</div>
          </div>

          <!-- Provider Select -->
          <div class="space-y-1.5">
            <label class="font-semibold text-foreground">Primary Holiday Source</label>
            <Select v-model="config.source">
              <SelectTrigger class="h-8 text-xs bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="local">Local / Offline Data (Recommended)</SelectItem>
                  <SelectItem value="api">External Holiday API (Optional)</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <p class="text-[11px] text-muted-foreground">
              Local data includes all Philippine regular holidays, special non-working days, and Cebu City statutory observances.
            </p>
          </div>

          <!-- API Settings (when API selected or prepared) -->
          <div class="rounded-xl border p-3.5 space-y-3 bg-card">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-xs text-foreground flex items-center gap-1.5">
                <Globe class="size-3.5 text-primary" />
                <span>External Holiday API Configuration</span>
              </span>
              <Badge variant="outline" class="text-[10px] font-mono">Future Ready</Badge>
            </div>

            <div class="space-y-1">
              <label class="text-xs font-medium text-foreground">API Endpoint URL</label>
              <Input
                v-model="config.apiUrl"
                type="url"
                placeholder="https://api.example.com/holidays"
                class="h-8 text-xs font-mono"
              />
            </div>

            <div class="space-y-1">
              <label class="text-xs font-medium text-foreground">API Key / Bearer Token (Optional)</label>
              <Input
                v-model="config.apiKey"
                type="password"
                placeholder="Enter secret token if required..."
                class="h-8 text-xs font-mono"
              />
            </div>

            <!-- Switches -->
            <div class="space-y-2 pt-1 border-t text-xs">
              <div class="flex items-center justify-between">
                <div>
                  <span class="font-medium text-foreground block">Enable API Synchronization</span>
                  <span class="text-[11px] text-muted-foreground">When enabled, queries the external holiday endpoint.</span>
                </div>
                <input
                  type="checkbox"
                  v-model="config.enableApiSync"
                  class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                />
              </div>

              <div class="flex items-center justify-between">
                <div>
                  <span class="font-medium text-foreground block">Fallback to Local Data</span>
                  <span class="text-[11px] text-muted-foreground">Guarantees zero downtime if internet or API is unreachable.</span>
                </div>
                <input
                  type="checkbox"
                  v-model="config.fallbackToLocal"
                  class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                />
              </div>
            </div>

            <div class="pt-2 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="h-7 text-xs gap-1.5"
                :disabled="testLoading || !config.apiUrl.trim()"
                @click="testApiConnection"
              >
                <RefreshCw class="size-3" :class="testLoading ? 'animate-spin' : ''" />
                <span>Test Connection & Sync</span>
              </Button>

              <span v-if="config.lastSyncTime" class="text-[10px] text-muted-foreground font-mono">
                Last checked: {{ new Date(config.lastSyncTime).toLocaleTimeString() }}
              </span>
            </div>

            <!-- Test Feedback Result -->
            <div v-if="testResult" class="p-2.5 rounded text-xs flex items-center gap-2" :class="testResult.success ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20'">
              <CheckCircle2 v-if="testResult.success" class="size-4 shrink-0 text-emerald-600" />
              <AlertCircle v-else class="size-4 shrink-0" />
              <span>{{ testResult.message }}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" class="h-8 text-xs" @click="showConfigModal = false">
            Cancel
          </Button>
          <Button size="sm" class="h-8 text-xs gap-1.5 shadow-xs" @click="saveHolidayConfig">
            <Save class="size-3.5" />
            <span>Save Configuration</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
