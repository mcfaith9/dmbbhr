<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import {
  Search,
  Fingerprint,
  Users,
  Edit2,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  MapPin,
  Building,
  Save,
  Layers,
  Upload,
  Download,
  FileSpreadsheet,
  RefreshCw
} from '@lucide/vue'
import * as XLSX from 'xlsx'
import {
  employeeService,
  VALID_LOCATIONS,
  type PeopleImportPreviewResult,
  type PeopleImportRowItem,
  type PeopleImportApplyResult
} from '@/services/employees'
import type { Employee, EmployeeLocation, WorkGroup } from '@/types'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pagination } from '@/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

const employees = ref<Employee[]>([])
const workGroups = ref<WorkGroup[]>([])
const loading = ref(false)
const searchQuery = ref('')
const selectedLocation = ref<string>('all')
const selectedWorkGroup = ref<string>('all')

// Pagination state
const currentPage = ref(1)
const pageSize = ref(10)

// Modal state for single employee edit
const showEditModal = ref(false)
const editBioId = ref('')
const editName = ref('')
const editLocation = ref<EmployeeLocation>('DBB CEBU')
const editWorkGroupId = ref<string>('wg-group-c')
const editDepartment = ref('')
const editPosition = ref('')
const editSaving = ref(false)
const editSuccessMsg = ref('')
const editErrorMsg = ref('')

// Bulk Import State
const fileInputRef = ref<HTMLInputElement | null>(null)
const showImportModal = ref(false)
const importFileName = ref('')
const isParsingExcel = ref(false)
const isApplyingImport = ref(false)
const importPreview = ref<PeopleImportPreviewResult | null>(null)
const activePreviewTab = ref<'all' | 'update' | 'create' | 'unchanged' | 'unknown' | 'invalid'>('all')
const previewSearch = ref('')
const importResultSuccess = ref<PeopleImportApplyResult | null>(null)
const importError = ref<string>('')

const filteredPreviewRows = computed<PeopleImportRowItem[]>(() => {
  if (!importPreview.value) return []
  let list = importPreview.value.allRows

  if (activePreviewTab.value === 'update') {
    list = list.filter(r => r.action === 'UPDATE')
  } else if (activePreviewTab.value === 'create') {
    list = list.filter(r => r.action === 'CREATE')
  } else if (activePreviewTab.value === 'unchanged') {
    list = list.filter(r => r.action === 'UNCHANGED')
  } else if (activePreviewTab.value === 'unknown') {
    list = list.filter(r => r.isWarning)
  } else if (activePreviewTab.value === 'invalid') {
    list = list.filter(r => r.action === 'SKIP' || r.isError)
  }

  if (previewSearch.value.trim()) {
    const q = previewSearch.value.trim().toLowerCase()
    list = list.filter(r =>
      r.id.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.group.toLowerCase().includes(q) ||
      r.department.toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q)
    )
  }

  return list
})

async function loadLookups() {
  workGroups.value = await employeeService.getWorkGroups()
}

async function loadEmployees() {
  loading.value = true
  try {
    employees.value = await employeeService.getEmployees()
  } finally {
    loading.value = false
  }
}

watch([selectedLocation, selectedWorkGroup], () => {
  currentPage.value = 1
})

// Debounced filtering
const filteredEmployees = computed(() => {
  let list = employees.value

  if (selectedLocation.value && selectedLocation.value !== 'all') {
    list = list.filter(e => e.location === selectedLocation.value)
  }

  if (selectedWorkGroup.value && selectedWorkGroup.value !== 'all') {
    list = list.filter(e => (e.work_group_id || 'wg-group-c') === selectedWorkGroup.value)
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    list = list.filter(e =>
      e.full_name.toLowerCase().includes(q) ||
      e.biometric_user_id.toLowerCase().includes(q) ||
      e.employee_number.toLowerCase().includes(q) ||
      (e.work_group_name && e.work_group_name.toLowerCase().includes(q)) ||
      (e.work_group_code && e.work_group_code.toLowerCase().includes(q)) ||
      (e.department && e.department.toLowerCase().includes(q))
    )
  }

  return list
})

const totalPages = computed(() => Math.ceil(filteredEmployees.value.length / pageSize.value) || 1)

const paginatedEmployees = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredEmployees.value.slice(start, start + pageSize.value)
})

function onPageChange(page: number) {
  currentPage.value = page
}

function openEditModal(emp: Employee) {
  editBioId.value = emp.biometric_user_id
  editName.value = emp.full_name
  editLocation.value = emp.location || 'DBB CEBU'
  editWorkGroupId.value = emp.work_group_id || 'wg-group-c'
  editDepartment.value = emp.department || 'Operations'
  editPosition.value = emp.position || 'Staff'
  editSuccessMsg.value = ''
  editErrorMsg.value = ''
  showEditModal.value = true
}

async function saveEmployee() {
  if (!editName.value.trim()) {
    editErrorMsg.value = 'Employee Name cannot be empty.'
    return
  }

  editSaving.value = true
  editErrorMsg.value = ''
  editSuccessMsg.value = ''

  try {
    await employeeService.updateEmployee(editBioId.value, {
      full_name: editName.value.trim(),
      location: editLocation.value,
      work_group_id: editWorkGroupId.value,
      department: editDepartment.value.trim(),
      position: editPosition.value.trim()
    })

    editSuccessMsg.value = `Employee profile for Bio ID ${editBioId.value} updated successfully.`
    setTimeout(() => {
      showEditModal.value = false
      loadEmployees()
    }, 1200)
  } catch (err: any) {
    editErrorMsg.value = err.message || 'Failed to update employee.'
  } finally {
    editSaving.value = false
  }
}

// -------------------------------------------------------------
// Bulk Excel Import Workflow
// -------------------------------------------------------------
function triggerFileInput() {
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
    fileInputRef.value.click()
  }
}

async function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return

  const file = target.files[0]
  importFileName.value = file.name
  isParsingExcel.value = true
  importError.value = ''
  importResultSuccess.value = null

  const reader = new FileReader()
  reader.onload = async (e: any) => {
    try {
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]
      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet)

      if (jsonData.length === 0) {
        importError.value = 'The selected Excel sheet contains no rows.'
        isParsingExcel.value = false
        return
      }

      // Generate full preview and validation
      const preview = await employeeService.previewImportFromExcel(jsonData)
      importPreview.value = preview
      activePreviewTab.value = 'all'
      previewSearch.value = ''

      showImportModal.value = true
    } catch (err: any) {
      importError.value = 'Failed to parse Excel file: ' + err.message
    } finally {
      isParsingExcel.value = false
    }
  }

  reader.onerror = () => {
    importError.value = 'Failed to read file.'
    isParsingExcel.value = false
  }

  reader.readAsArrayBuffer(file)
}

async function executeImportChanges() {
  if (!importPreview.value || importPreview.value.recordsToApply.length === 0) return

  isApplyingImport.value = true
  importError.value = ''

  try {
    const result = await employeeService.applyImport(importPreview.value)
    importResultSuccess.value = result

    await loadEmployees()

    setTimeout(() => {
      showImportModal.value = false
      importPreview.value = null
    }, 2500)
  } catch (err: any) {
    importError.value = 'Error saving changes: ' + err.message
  } finally {
    isApplyingImport.value = false
  }
}

// -------------------------------------------------------------
// People Export Workflow
// -------------------------------------------------------------
async function exportPeople(format: 'xlsx' | 'csv') {
  const data = await employeeService.getExportData()
  if (data.length === 0) {
    alert('No employee records available to export.')
    return
  }

  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'People_Directory')

  const filename = `DMBBHR_People_Directory_${new Date().toISOString().slice(0, 10)}.${format}`

  if (format === 'csv') {
    XLSX.writeFile(workbook, filename, { bookType: 'csv' })
  } else {
    XLSX.writeFile(workbook, filename, { bookType: 'xlsx' })
  }
}

let unSubChange: (() => void) | null = null

onMounted(async () => {
  await loadLookups()
  await loadEmployees()
  unSubChange = employeeService.onEmployeesChanged(() => {
    loadLookups()
    loadEmployees()
  })
})

onUnmounted(() => {
  if (unSubChange) unSubChange()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Hidden File Input for Excel Import -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".xlsx, .xls, .csv"
      class="hidden"
      @change="handleFileSelect"
    />

    <!-- Header with Action Buttons -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>People Directory</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-muted font-normal text-muted-foreground font-mono">
            {{ filteredEmployees.length }} Profiles
          </span>
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Master employee records linked by permanent Bio ID. Bulk update names and Work Group schedules from Excel.
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2 flex-wrap">
        <Button
          variant="default"
          size="sm"
          class="h-8 gap-1.5 font-medium shadow-xs"
          :disabled="isParsingExcel"
          @click="triggerFileInput"
        >
          <Upload :class="['size-3.5', isParsingExcel ? 'animate-spin' : '']" />
          <span class="text-xs">{{ isParsingExcel ? 'Reading Excel...' : 'Import Employees' }}</span>
        </Button>

        <div class="flex items-center rounded-md border bg-card shadow-xs">
          <Button
            variant="ghost"
            size="sm"
            class="h-8 px-2.5 text-xs rounded-r-none border-r"
            @click="exportPeople('xlsx')"
          >
            <Download class="size-3.5" />
            Excel
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="h-8 px-2.5 text-xs rounded-l-none"
            @click="exportPeople('csv')"
          >
            <Download class="size-3.5" />
            CSV
          </Button>
        </div>
      </div>
    </div>

    <!-- Filter and Search Bar -->
    <div class="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-2 items-center">
      <div class="relative sm:col-span-2">
        <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          type="text"
          placeholder="Search by Bio ID, name, or work group..."
          class="pl-8 h-8 text-xs bg-card"
          @input="currentPage = 1"
        />
      </div>

      <!-- Location Filter -->
      <div>
        <Select v-model="selectedLocation">
          <SelectTrigger class="h-8 text-xs w-full bg-card">
            <SelectValue placeholder="All Locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All Locations</SelectItem>
              <SelectItem v-for="loc in VALID_LOCATIONS" :key="loc" :value="loc">
                {{ loc }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <!-- Work Group Filter -->
      <div>
        <Select v-model="selectedWorkGroup">
          <SelectTrigger class="h-8 text-xs w-full bg-card">
            <SelectValue placeholder="All Work Groups" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All Work Groups</SelectItem>
              <SelectItem v-for="wg in workGroups" :key="wg.id" :value="wg.id">
                {{ wg.name }} (Code: {{ wg.code }})
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>

    <!-- Master Employee Table -->
    <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow class="bg-muted/40">
            <TableHead class="w-[110px] font-semibold">Bio ID (Permanent)</TableHead>
            <TableHead class="font-semibold">Employee Name</TableHead>
            <TableHead class="font-semibold">Location</TableHead>
            <TableHead class="font-semibold">Work Group</TableHead>
            <TableHead class="font-semibold">Group Code</TableHead>
            <TableHead class="font-semibold">Department</TableHead>
            <TableHead class="font-semibold">Position</TableHead>
            <TableHead class="font-semibold">Status</TableHead>
            <TableHead class="text-right font-semibold">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <template v-if="loading">
            <TableRow>
              <TableCell colspan="9" class="h-32 text-center text-xs text-muted-foreground">
                <RefreshCw class="size-4 animate-spin mx-auto mb-2 text-primary" />
                Loading employee records...
              </TableCell>
            </TableRow>
          </template>

          <template v-else-if="filteredEmployees.length === 0">
            <TableRow>
              <TableCell colspan="9" class="h-32 text-center text-muted-foreground">
                <div class="flex flex-col items-center justify-center gap-1.5">
                  <Users class="size-6 text-muted-foreground/40" />
                  <span class="font-medium text-foreground text-sm">No employees found</span>
                  <p class="text-xs text-muted-foreground">
                    Try adjusting your search query, or click <strong>Import People (Excel)</strong> to bulk upload names.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          </template>

          <template v-else>
            <TableRow v-for="emp in paginatedEmployees" :key="emp.biometric_user_id">
              <TableCell class="font-mono font-semibold text-primary">
                <span class="inline-flex items-center gap-1.5" :title="`Permanent Biometric Identifier: ${emp.biometric_user_id}`">
                  <Fingerprint class="size-3.5 text-muted-foreground" />
                  {{ emp.biometric_user_id }}
                </span>
              </TableCell>
              <TableCell class="font-medium text-foreground text-xs">
                {{ emp.full_name }}
              </TableCell>
              <TableCell class="text-xs">
                <span class="inline-flex items-center gap-1 font-medium text-foreground">
                  <MapPin class="size-3 text-emerald-600 dark:text-emerald-400" />
                  {{ emp.location }}
                </span>
              </TableCell>

              <!-- Work Group Badge -->
              <TableCell class="text-xs">
                <Badge variant="outline" class="font-mono text-[10px] gap-1 bg-muted/40 font-medium">
                  <Layers class="size-2.5 text-primary" />
                  {{ emp.work_group_name || 'Group C' }}
                </Badge>
              </TableCell>

              <!-- Work Group Code -->
              <TableCell class="text-xs font-mono font-bold text-foreground">
                <span class="px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[11px]">
                  {{ emp.work_group_code || (emp.work_group_name?.replace(/^Group\s*/i, '') || 'C') }}
                </span>
              </TableCell>

              <TableCell class="text-xs text-muted-foreground">
                {{ emp.department || 'Operations' }}
              </TableCell>
              <TableCell class="text-xs text-muted-foreground">
                {{ emp.position || 'Staff' }}
              </TableCell>
              <TableCell>
                <Badge variant="success" class="text-[10px] uppercase font-mono">
                  {{ emp.status }}
                </Badge>
              </TableCell>
              <TableCell class="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7 px-2 text-xs gap-1"
                  @click="openEditModal(emp)"
                >
                  <Edit2 class="size-3 text-primary" />
                  <span>Edit</span>
                </Button>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>

      <!-- Pagination Footer -->
      <div v-if="filteredEmployees.length > pageSize" class="p-3 border-t bg-muted/20">
        <Pagination
          :current-page="currentPage"
          :total-pages="totalPages"
          :total-items="filteredEmployees.length"
          :page-size="pageSize"
          @update:page="onPageChange"
        />
      </div>
    </div>

    <!-- ============================================================= -->
    <!-- BULK EXCEL IMPORT PREVIEW DIALOG -->
    <!-- ============================================================= -->
    <div
      v-if="showImportModal && importPreview"
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
    >
      <div class="bg-card text-card-foreground border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <!-- Dialog Header -->
        <div class="p-4 border-b bg-muted/30 flex items-center justify-between">
          <div class="space-y-0.5">
            <div class="flex items-center gap-2">
              <FileSpreadsheet class="size-5 text-primary" />
              <h2 class="font-bold text-base text-foreground">Import Employee Data</h2>
              <span class="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                {{ importFileName }}
              </span>
            </div>
            <p class="text-xs text-muted-foreground">
              Review how Excel IDs match to permanent Bio IDs and canonical Work Groups before applying changes.
            </p>
          </div>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground rounded p-1"
            :disabled="isApplyingImport"
            @click="showImportModal = false"
          >
            <X class="size-4" />
          </button>
        </div>

        <!-- Success notification if completed -->
        <div
          v-if="importResultSuccess"
          class="p-4 m-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 flex items-center gap-3 animate-in fade-in duration-200"
        >
          <CheckCircle2 class="size-5 text-emerald-600 shrink-0" />
          <div class="text-xs">
            <span class="font-semibold text-sm">Import Complete!</span>
            <p class="mt-0.5">
              Successfully updated <strong>{{ importResultSuccess.updatedCount }}</strong> existing profiles and created <strong>{{ importResultSuccess.createdCount }}</strong> new employees.
            </p>
          </div>
        </div>

        <!-- Error notification -->
        <div
          v-if="importError"
          class="p-3 m-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2"
        >
          <AlertCircle class="size-4 shrink-0" />
          <span>{{ importError }}</span>
        </div>

        <!-- Summary KPI Counter Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 p-4 border-b bg-card">
          <div class="rounded-lg border p-2.5 bg-muted/20">
            <div class="text-[11px] text-muted-foreground font-medium">Total Rows</div>
            <div class="text-lg font-bold font-mono text-foreground">{{ importPreview.totalRows }}</div>
          </div>
          <div class="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
            <div class="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium leading-tight">Existing to Update</div>
            <div class="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {{ importPreview.updatedCount }}
            </div>
          </div>
          <div class="rounded-lg border border-blue-500/30 bg-blue-500/5 p-2.5">
            <div class="text-[11px] text-blue-700 dark:text-blue-400 font-medium leading-tight">New Employees</div>
            <div class="text-lg font-bold font-mono text-blue-600 dark:text-blue-400">
              {{ importPreview.newCount }}
            </div>
          </div>
          <div class="rounded-lg border p-2.5 bg-muted/20">
            <div class="text-[11px] text-muted-foreground font-medium">Unchanged</div>
            <div class="text-lg font-bold font-mono text-foreground">
              {{ importPreview.unchangedCount }}
            </div>
          </div>
          <div class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
            <div class="text-[11px] text-amber-700 dark:text-amber-400 font-medium leading-tight">Unknown Groups</div>
            <div class="text-lg font-bold font-mono text-amber-600 dark:text-amber-400">
              {{ importPreview.unknownGroupsCount }}
            </div>
          </div>
          <div class="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
            <div class="text-[11px] text-destructive font-medium leading-tight">Invalid Rows</div>
            <div class="text-lg font-bold font-mono text-destructive">
              {{ importPreview.invalidCount }}
            </div>
          </div>
        </div>

        <!-- Warning notice if unknown groups -->
        <div
          v-if="importPreview.unknownGroupsCount > 0"
          class="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2"
        >
          <AlertTriangle class="size-4 shrink-0 text-amber-600" />
          <span>
            <strong>{{ importPreview.unknownGroupsCount }} row(s)</strong> have Work Groups not registered in Settings. Existing employees keep their current group; new employees use the default group.
          </span>
        </div>

        <!-- Filter & Search Toolbar -->
        <div class="p-3 border-b bg-muted/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div class="flex items-center gap-1 overflow-x-auto text-xs pb-1 sm:pb-0">
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap flex items-center gap-1.5"
              :class="activePreviewTab === 'all' ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:bg-muted'"
              @click="activePreviewTab = 'all'"
            >
              <span>All</span>
              <span class="text-[10px] font-mono px-1.5 py-0.2 rounded" :class="activePreviewTab === 'all' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'">{{ importPreview.totalRows }}</span>
            </button>
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap flex items-center gap-1.5"
              :class="activePreviewTab === 'update' ? 'bg-emerald-600 text-white font-semibold shadow-xs' : 'text-muted-foreground hover:bg-muted'"
              @click="activePreviewTab = 'update'"
            >
              <span>Update</span>
              <span class="text-[10px] font-mono px-1.5 py-0.2 rounded" :class="activePreviewTab === 'update' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'">{{ importPreview.updatedCount }}</span>
            </button>
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap flex items-center gap-1.5"
              :class="activePreviewTab === 'create' ? 'bg-blue-600 text-white font-semibold shadow-xs' : 'text-muted-foreground hover:bg-muted'"
              @click="activePreviewTab = 'create'"
            >
              <span>Create</span>
              <span class="text-[10px] font-mono px-1.5 py-0.2 rounded" :class="activePreviewTab === 'create' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'">{{ importPreview.newCount }}</span>
            </button>
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap flex items-center gap-1.5"
              :class="activePreviewTab === 'unchanged' ? 'bg-slate-700 text-white font-semibold shadow-xs' : 'text-muted-foreground hover:bg-muted'"
              @click="activePreviewTab = 'unchanged'"
            >
              <span>Unchanged</span>
              <span class="text-[10px] font-mono px-1.5 py-0.2 rounded" :class="activePreviewTab === 'unchanged' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'">{{ importPreview.unchangedCount }}</span>
            </button>
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap flex items-center gap-1.5"
              :class="activePreviewTab === 'unknown' ? 'bg-amber-600 text-white font-semibold shadow-xs' : 'text-muted-foreground hover:bg-muted'"
              @click="activePreviewTab = 'unknown'"
            >
              <span>Unknown Groups</span>
              <span class="text-[10px] font-mono px-1.5 py-0.2 rounded" :class="activePreviewTab === 'unknown' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'">{{ importPreview.unknownGroupsCount }}</span>
            </button>
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap flex items-center gap-1.5"
              :class="activePreviewTab === 'invalid' ? 'bg-destructive text-destructive-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:bg-muted'"
              @click="activePreviewTab = 'invalid'"
            >
              <span>Invalid</span>
              <span class="text-[10px] font-mono px-1.5 py-0.2 rounded" :class="activePreviewTab === 'invalid' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'">{{ importPreview.invalidCount }}</span>
            </button>
          </div>

          <div class="relative w-full sm:w-56 shrink-0">
            <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              v-model="previewSearch"
              placeholder="Search ID, Name, Dept..."
              class="h-8 pl-8 text-xs w-full bg-card"
            />
          </div>
        </div>

        <!-- Unified Table Area (Scrollable) -->
        <div class="flex-1 overflow-y-auto min-h-[300px] max-h-[50vh]">
          <div v-if="filteredPreviewRows.length === 0" class="text-center py-12 text-xs text-muted-foreground">
            No rows match the selected filter.
          </div>
          <Table v-else>
            <TableHeader class="sticky top-0 bg-muted/80 backdrop-blur-xs z-10 shadow-xs">
              <TableRow class="text-xs">
                <TableHead class="w-[90px] font-semibold">ID</TableHead>
                <TableHead class="font-semibold">Name</TableHead>
                <TableHead class="w-[120px] font-semibold">Group</TableHead>
                <TableHead class="w-[140px] font-semibold">Department</TableHead>
                <TableHead class="w-[100px] font-semibold">Action</TableHead>
                <TableHead class="font-semibold">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="row in filteredPreviewRows" :key="row.rowNumber" class="text-xs hover:bg-muted/30">
                <TableCell class="font-mono font-medium text-foreground">
                  {{ row.id }}
                </TableCell>
                <TableCell class="font-medium text-foreground">
                  {{ row.name }}
                </TableCell>
                <TableCell>
                  <span v-if="row.group" class="font-mono text-xs">
                    {{ row.group }}
                  </span>
                  <span v-else class="text-muted-foreground italic text-[11px]">—</span>
                </TableCell>
                <TableCell>
                  <span v-if="row.department" class="text-foreground font-medium text-xs">
                    {{ row.department }}
                  </span>
                  <span v-else class="text-muted-foreground italic text-[11px]">—</span>
                </TableCell>
                <TableCell>
                  <Badge
                    v-if="row.action === 'UPDATE'"
                    class="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] px-2 py-0.5 font-semibold"
                  >
                    Update
                  </Badge>
                  <Badge
                    v-else-if="row.action === 'CREATE'"
                    class="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30 text-[10px] px-2 py-0.5 font-semibold"
                  >
                    Create
                  </Badge>
                  <Badge
                    v-else-if="row.action === 'UNCHANGED'"
                    variant="secondary"
                    class="text-[10px] px-2 py-0.5 text-muted-foreground"
                  >
                    Unchanged
                  </Badge>
                  <Badge
                    v-else
                    variant="destructive"
                    class="text-[10px] px-2 py-0.5"
                  >
                    Skip
                  </Badge>
                </TableCell>
                <TableCell>
                  <div class="flex items-center gap-1.5">
                    <AlertTriangle v-if="row.isWarning" class="size-3.5 text-amber-500 shrink-0" />
                    <AlertCircle v-else-if="row.isError" class="size-3.5 text-destructive shrink-0" />
                    <span
                      :class="[
                        row.isError
                          ? 'text-destructive font-medium'
                          : row.isWarning
                            ? 'text-amber-700 dark:text-amber-300'
                            : 'text-muted-foreground'
                      ]"
                    >
                      {{ row.status }}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <!-- Dialog Footer Actions -->
        <div class="p-4 border-t bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
          <div class="text-xs text-muted-foreground">
            Ready to apply <strong>{{ importPreview.recordsToApply.length }}</strong> employee profile changes to the local database.
          </div>
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              class="h-8 text-xs"
              :disabled="isApplyingImport"
              @click="showImportModal = false"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              class="h-8 text-xs gap-1.5 font-medium shadow-xs"
              :disabled="isApplyingImport || importPreview.recordsToApply.length === 0 || importResultSuccess !== null"
              @click="executeImportChanges"
            >
              <RefreshCw v-if="isApplyingImport" class="size-3.5 animate-spin" />
              <CheckCircle2 v-else class="size-3.5" />
              <span>{{ isApplyingImport ? 'Applying Changes...' : 'Import Changes' }}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================= -->
    <!-- EDIT SINGLE EMPLOYEE MODAL -->
    <!-- ============================================================= -->
    <div
      v-if="showEditModal"
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div class="bg-card text-card-foreground border rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div class="flex items-center justify-between p-4 border-b bg-muted/40">
          <div class="flex items-center gap-2">
            <Building class="size-4 text-primary" />
            <h2 class="font-semibold text-sm">Edit Employee Profile</h2>
          </div>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground rounded p-1"
            @click="showEditModal = false"
          >
            <X class="size-4" />
          </button>
        </div>

        <form @submit.prevent="saveEmployee" class="p-4 space-y-3.5">
          <!-- Permanent Bio ID (Read-only) -->
          <div class="space-y-1">
            <label class="text-xs font-semibold text-muted-foreground flex items-center justify-between">
              <span>Biometric User ID</span>
              <span class="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-normal">Permanent Immutable Key</span>
            </label>
            <div class="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-muted/60 text-xs font-mono font-semibold text-foreground">
              <Fingerprint class="size-3.5 text-muted-foreground" />
              <span>{{ editBioId }}</span>
            </div>
          </div>

          <!-- Employee Name -->
          <div class="space-y-1">
            <label class="text-xs font-semibold text-foreground">
              Employee Full Name <span class="text-destructive">*</span>
            </label>
            <Input
              v-model="editName"
              type="text"
              required
              placeholder="e.g. Santos, Roberto"
              class="h-8 text-xs"
            />
          </div>

          <!-- Location -->
          <div class="space-y-1">
            <label class="text-xs font-semibold text-foreground">Branch Location</label>
            <Select v-model="editLocation">
              <SelectTrigger class="h-8 text-xs w-full bg-card">
                <SelectValue placeholder="Select Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="loc in VALID_LOCATIONS" :key="loc" :value="loc">
                    {{ loc }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <!-- Work Group Schedule -->
          <div class="space-y-1">
            <label class="text-xs font-semibold text-foreground">Assigned Work Group</label>
            <Select v-model="editWorkGroupId">
              <SelectTrigger class="h-8 text-xs w-full bg-card">
                <SelectValue placeholder="Select Work Group" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="wg in workGroups" :key="wg.id" :value="wg.id">
                    {{ wg.name }} ({{ wg.standard_in }}–{{ wg.expected_out }})
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <!-- Department -->
          <div class="space-y-1">
            <label class="text-xs font-semibold text-foreground">Department</label>
            <Input
              v-model="editDepartment"
              type="text"
              placeholder="Operations"
              class="h-8 text-xs"
            />
          </div>

          <!-- Position -->
          <div class="space-y-1">
            <label class="text-xs font-semibold text-foreground">Position / Role</label>
            <Input
              v-model="editPosition"
              type="text"
              placeholder="Staff"
              class="h-8 text-xs"
            />
          </div>

          <!-- Feedback messages -->
          <div v-if="editSuccessMsg" class="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 class="size-4 shrink-0" />
            <span>{{ editSuccessMsg }}</span>
          </div>

          <div v-if="editErrorMsg" class="p-2.5 rounded bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
            <AlertCircle class="size-4 shrink-0" />
            <span>{{ editErrorMsg }}</span>
          </div>

          <div class="flex items-center justify-end gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="h-8 text-xs"
              @click="showEditModal = false"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              class="h-8 text-xs gap-1.5 font-medium"
              :disabled="editSaving"
            >
              <Save class="size-3.5" />
              <span>{{ editSaving ? 'Saving...' : 'Save Profile' }}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
