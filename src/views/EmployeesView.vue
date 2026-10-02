<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, toRaw } from 'vue'
import { useRouter } from 'vue-router'
import {
  Search,
  Fingerprint,
  Users,
  UserRoundPen,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  MapPin,
  Building,
  Save,
  Upload,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Lock,
  Phone,
  User,
  ShieldAlert,
  CreditCard,
  ExternalLink,
  Eye
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

const router = useRouter()

const employees = ref<Employee[]>([])
const workGroups = ref<WorkGroup[]>([])
const loading = ref(false)
const searchQuery = ref('')
const selectedLocation = ref<string>('all')
const selectedWorkGroup = ref<string>('all')
const selectedDepartment = ref<string>('all')
const selectedStatus = ref<string>('all')

// Pagination state
const currentPage = ref(1)
const pageSize = ref(10)

// Active Profile Modal state
const showProfileModal = ref(false)
const activeProfileTab = ref<'overview' | 'edit'>('overview')
const selectedEmployee = ref<Employee | null>(null)

// Form fields for editing employee profile
const formBioId = ref('')
const formName = ref('')
const formPreferredName = ref('')
const formDateOfBirth = ref('')
const formGender = ref<string>('')
const formCivilStatus = ref<string>('')
const formMobileNumber = ref('')
const formEmail = ref('')
const formAlternateNumber = ref('')
const formHomeAddress = ref('')
const formEmergencyName = ref('')
const formEmergencyRelationship = ref('')
const formEmergencyNumber = ref('')
const formLocation = ref<EmployeeLocation>('DBB CEBU')
const formWorkGroupId = ref<string>('wg-group-c')
const formDepartment = ref('')
const formPosition = ref('')
const formHireDate = ref('')
const formRegularizationDate = ref('')
const formStatus = ref<'active' | 'inactive' | 'on_leave'>('active')
const formSalaryType = ref<'Monthly' | 'Daily' | 'Hourly'>('Monthly')
const formPayrollStatus = ref<'configured' | 'pending' | 'exempt'>('configured')

const profileSaving = ref(false)
const profileSuccessMsg = ref('')
const profileErrorMsg = ref('')

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

// Unique departments for filter
const availableDepartments = computed(() => {
  const depts = new Set<string>()
  for (const emp of employees.value) {
    if (emp.department && emp.department.trim()) {
      depts.add(emp.department.trim())
    }
  }
  return Array.from(depts).sort()
})

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

let reloadTimer: any = null
let isExecutingReload = false
let hasPendingReload = false

async function executeLoadEmployees() {
  if (isExecutingReload) {
    hasPendingReload = true
    return
  }
  isExecutingReload = true
  hasPendingReload = false
  loading.value = true
  try {
    employees.value = await employeeService.getEmployees()
    // If modal is open, refresh selected employee data
    if (showProfileModal.value && selectedEmployee.value) {
      const refreshed = employees.value.find(e => e.biometric_user_id === selectedEmployee.value?.biometric_user_id)
      if (refreshed) {
        selectedEmployee.value = refreshed
      }
    }
  } finally {
    loading.value = false
    isExecutingReload = false
    if (hasPendingReload) {
      hasPendingReload = false
      executeLoadEmployees()
    }
  }
}

function triggerCoalescedEmployees(immediate = false) {
  if (reloadTimer) {
    clearTimeout(reloadTimer)
    reloadTimer = null
  }
  if (immediate) {
    executeLoadEmployees()
  } else {
    reloadTimer = setTimeout(() => {
      reloadTimer = null
      executeLoadEmployees()
    }, 120)
  }
}

function loadEmployees() {
  triggerCoalescedEmployees(true)
}

watch([selectedLocation, selectedWorkGroup, selectedDepartment, selectedStatus], () => {
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

  if (selectedDepartment.value && selectedDepartment.value !== 'all') {
    list = list.filter(e => (e.department || 'Operations') === selectedDepartment.value)
  }

  if (selectedStatus.value && selectedStatus.value !== 'all') {
    list = list.filter(e => e.status === selectedStatus.value)
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    list = list.filter(e =>
      e.full_name.toLowerCase().includes(q) ||
      e.biometric_user_id.toLowerCase().includes(q) ||
      e.employee_number.toLowerCase().includes(q) ||
      (e.preferred_name && e.preferred_name.toLowerCase().includes(q)) ||
      (e.work_group_name && e.work_group_name.toLowerCase().includes(q)) ||
      (e.work_group_code && e.work_group_code.toLowerCase().includes(q)) ||
      (e.department && e.department.toLowerCase().includes(q)) ||
      (e.position && e.position.toLowerCase().includes(q))
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

function openProfile(emp: Employee, tab: 'overview' | 'edit' = 'overview') {
  selectedEmployee.value = emp
  activeProfileTab.value = tab

  // Initialize form state
  formBioId.value = emp.biometric_user_id
  formName.value = emp.full_name
  formPreferredName.value = emp.preferred_name || ''
  formDateOfBirth.value = emp.date_of_birth || ''
  formGender.value = emp.gender && emp.gender.trim() && emp.gender !== 'not_specified' ? emp.gender : 'not_specified'
  formCivilStatus.value = emp.civil_status && emp.civil_status.trim() && emp.civil_status !== 'not_specified' ? emp.civil_status : 'not_specified'
  formMobileNumber.value = emp.mobile_number || ''
  formEmail.value = emp.email || ''
  formAlternateNumber.value = emp.alternate_number || ''
  formHomeAddress.value = emp.home_address || ''
  formEmergencyName.value = emp.emergency_contact_name || ''
  formEmergencyRelationship.value = emp.emergency_contact_relationship || ''
  formEmergencyNumber.value = emp.emergency_contact_number || ''
  formLocation.value = emp.location || 'DBB CEBU'
  formWorkGroupId.value = emp.work_group_id || 'wg-group-c'
  formDepartment.value = emp.department || 'Operations'
  formPosition.value = emp.position || 'Staff'
  formHireDate.value = emp.hire_date || ''
  formRegularizationDate.value = emp.regularization_date || ''
  formStatus.value = emp.status || 'active'
  formSalaryType.value = (emp.salary_type as any) || 'Monthly'
  formPayrollStatus.value = (emp.payroll_status as any) || 'configured'

  profileSuccessMsg.value = ''
  profileErrorMsg.value = ''
  showProfileModal.value = true
}

function closeProfileModal() {
  showProfileModal.value = false
  profileSuccessMsg.value = ''
  profileErrorMsg.value = ''
}

async function saveProfile() {
  if (!formName.value.trim()) {
    profileErrorMsg.value = 'Employee Full Name is required.'
    return
  }

  profileSaving.value = true
  profileErrorMsg.value = ''
  profileSuccessMsg.value = ''

  try {
    const cleanGender = formGender.value && formGender.value !== 'not_specified' && formGender.value !== 'none'
      ? formGender.value.trim()
      : undefined

    const cleanCivilStatus = formCivilStatus.value && formCivilStatus.value !== 'not_specified' && formCivilStatus.value !== 'none'
      ? formCivilStatus.value.trim()
      : undefined

    const updated = await employeeService.updateEmployee(formBioId.value, {
      full_name: formName.value.trim(),
      preferred_name: formPreferredName.value.trim() || undefined,
      date_of_birth: formDateOfBirth.value.trim() || undefined,
      gender: (cleanGender as any) || undefined,
      civil_status: (cleanCivilStatus as any) || undefined,
      mobile_number: formMobileNumber.value.trim() || undefined,
      email: formEmail.value.trim() || undefined,
      alternate_number: formAlternateNumber.value.trim() || undefined,
      home_address: formHomeAddress.value.trim() || undefined,
      emergency_contact_name: formEmergencyName.value.trim() || undefined,
      emergency_contact_relationship: formEmergencyRelationship.value.trim() || undefined,
      emergency_contact_number: formEmergencyNumber.value.trim() || undefined,
      location: formLocation.value,
      work_group_id: formWorkGroupId.value,
      department: formDepartment.value.trim() || 'Operations',
      position: formPosition.value.trim() || 'Staff',
      hire_date: formHireDate.value.trim() || undefined,
      regularization_date: formRegularizationDate.value.trim() || undefined,
      status: formStatus.value,
      salary_type: formSalaryType.value,
      payroll_status: formPayrollStatus.value
    })

    selectedEmployee.value = updated
    profileSuccessMsg.value = `Employee profile for Bio ID ${formBioId.value} (${updated.full_name}) saved successfully.`
    
    // Auto switch to overview after brief moment
    setTimeout(() => {
      profileSuccessMsg.value = ''
      activeProfileTab.value = 'overview'
    }, 1400)
    
    await executeLoadEmployees()
  } catch (err: any) {
    profileErrorMsg.value = err.message || 'Failed to save employee profile.'
  } finally {
    profileSaving.value = false
  }
}

function navigateToPayrollRecords() {
  showProfileModal.value = false
  router.push('/payroll/records')
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
    const rawPreview = toRaw(importPreview.value)
    const rawRecords = toRaw(rawPreview.recordsToApply).map(r => toRaw(r))
    const result = await employeeService.applyImport({
      ...rawPreview,
      recordsToApply: rawRecords
    })
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
  executeLoadEmployees()
  unSubChange = employeeService.onEmployeesChanged(() => {
    triggerCoalescedEmployees(false)
  })
})

onUnmounted(() => {
  if (reloadTimer) {
    clearTimeout(reloadTimer)
    reloadTimer = null
  }
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
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium font-mono">
            {{ filteredEmployees.length }} Employees
          </span>
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Master central employee profiles linked by permanent Bio ID. Serves as single source of truth for Attendance, Time Management, and Payroll.
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
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 items-center">
      <!-- Search Input -->
      <div class="relative sm:col-span-2 md:col-span-2">
        <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          type="text"
          placeholder="Search by Bio ID, name, position, dept..."
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
                {{ wg.name }} ({{ wg.code }})
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <!-- Department Filter -->
      <div>
        <Select v-model="selectedDepartment">
          <SelectTrigger class="h-8 text-xs w-full bg-card">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All Departments</SelectItem>
              <SelectItem v-for="dept in availableDepartments" :key="dept" :value="dept">
                {{ dept }}
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
            <TableHead class="w-[120px] font-semibold">BIO ID</TableHead>
            <TableHead class="font-semibold">Employee</TableHead>
            <TableHead class="font-semibold">Department & Position</TableHead>
            <TableHead class="font-semibold">Work Group</TableHead>
            <TableHead class="font-semibold">Branch Location</TableHead>
            <TableHead class="font-semibold">Status</TableHead>
            <TableHead class="text-right font-semibold">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <template v-if="loading">
            <TableRow>
              <TableCell colspan="7" class="h-32 text-center text-xs text-muted-foreground">
                <RefreshCw class="size-4 animate-spin mx-auto mb-2 text-primary" />
                Loading employee records...
              </TableCell>
            </TableRow>
          </template>

          <template v-else-if="filteredEmployees.length === 0">
            <TableRow>
              <TableCell colspan="7" class="h-32 text-center text-muted-foreground">
                <div class="flex flex-col items-center justify-center gap-1.5">
                  <Users class="size-6 text-muted-foreground/40" />
                  <span class="font-medium text-foreground text-sm">No employees found</span>
                  <p class="text-xs text-muted-foreground">
                    Try adjusting your filters, or click <strong>Import Employees</strong> to bulk sync names from Excel.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          </template>

          <template v-else>
            <TableRow
              v-for="emp in paginatedEmployees"
              :key="emp.biometric_user_id"
              class="cursor-pointer hover:bg-muted/40 transition-colors"
              @click="openProfile(emp, 'overview')"
            >
              <!-- Bio ID / Employee ID (Immutable Core Identifier) -->
              <TableCell class="font-mono font-semibold text-primary">
                <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-xs font-semibold">
                  <Fingerprint class="size-3.5 text-primary" />
                  <span>{{ emp.biometric_user_id }}</span>
                </div>
              </TableCell>

              <!-- Employee Name & Avatar -->
              <TableCell>
                <div class="flex items-center gap-2.5">
                  <div class="size-7 rounded-full bg-muted flex items-center justify-center font-bold text-xs text-primary shrink-0 border">
                    {{ emp.full_name.charAt(0).toUpperCase() }}
                  </div>
                  <div>
                    <div class="font-semibold text-foreground text-xs leading-snug">
                      {{ emp.full_name }}
                    </div>
                    <div v-if="emp.preferred_name" class="text-[11px] text-muted-foreground">
                      "{{ emp.preferred_name }}"
                    </div>
                  </div>
                </div>
              </TableCell>

              <!-- Department & Position -->
              <TableCell class="text-xs">
                <div class="font-medium text-foreground">{{ emp.department || 'Operations' }}</div>
                <div class="text-[11px] text-muted-foreground">{{ emp.position || 'Staff' }}</div>
              </TableCell>

              <!-- Work Group & Code Badge -->
              <TableCell class="text-xs">
                <div class="flex items-center gap-1.5">
                  <span class="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono font-bold border">
                    {{ emp.work_group_code || (emp.work_group_name?.replace(/^Group\s*/i, '') || 'C') }}
                  </span>
                  <span class="text-xs text-muted-foreground">
                    {{ emp.work_group_name || 'Group C' }}
                  </span>
                </div>
              </TableCell>

              <!-- Branch Location -->
              <TableCell class="text-xs">
                <span class="inline-flex items-center gap-1 font-medium text-foreground">
                  <MapPin class="size-3 text-emerald-600 dark:text-emerald-400" />
                  {{ emp.location }}
                </span>
              </TableCell>

              <!-- Employment Status -->
              <TableCell>
                <Badge
                  :variant="emp.status === 'active' ? 'success' : (emp.status === 'on_leave' ? 'warning' : 'outline')"
                  class="text-[10px] uppercase font-mono"
                >
                  {{ emp.status.replace('_', ' ') }}
                </Badge>
              </TableCell>

              <!-- Actions -->
              <TableCell class="text-right" @click.stop>
                <div class="flex items-center justify-end gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-7 px-2 text-xs gap-1"
                    @click="openProfile(emp, 'edit')"
                  >
                    <UserRoundPen class="size-3 text-primary" />
                    <span>Edit</span>
                  </Button>
                </div>
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
    <!-- CENTRAL MASTER EMPLOYEE PROFILE MODAL (OVERVIEW + EDIT) -->
    <!-- ============================================================= -->
    <div
      v-if="showProfileModal && selectedEmployee"
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
    >
      <div class="bg-card text-card-foreground border rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        <!-- Modal Top Header -->
        <div class="p-4 border-b bg-muted/30 flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="size-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
              {{ selectedEmployee.full_name.charAt(0).toUpperCase() }}
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h2 class="text-base font-bold text-foreground">
                  {{ selectedEmployee.full_name }}
                </h2>
                <Badge
                  :variant="selectedEmployee.status === 'active' ? 'success' : (selectedEmployee.status === 'on_leave' ? 'warning' : 'outline')"
                  class="text-[10px] uppercase font-mono px-2 py-0.5"
                >
                  {{ selectedEmployee.status.replace('_', ' ') }}
                </Badge>
              </div>

              <!-- Core Identifier Display: Employee ID = Bio ID -->
              <div class="flex items-center gap-2 mt-1 flex-wrap text-xs">
                <span class="inline-flex items-center gap-1.5 font-mono px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary font-semibold">
                  <Fingerprint class="size-3.5 text-primary" />
                  <span>Employee ID / Bio ID: {{ selectedEmployee.biometric_user_id }}</span>
                </span>
                <span class="text-muted-foreground text-[11px] flex items-center gap-1 font-mono">
                  <Lock class="size-3 text-muted-foreground/80" />
                  <span>Hardware Key (Read-Only)</span>
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            class="text-muted-foreground hover:text-foreground rounded p-1.5 hover:bg-muted transition-colors"
            @click="closeProfileModal"
          >
            <X class="size-4" />
          </button>
        </div>

        <!-- Tab Toggle Bar -->
        <div class="px-4 py-2 border-b bg-muted/15 flex items-center justify-between gap-2">
          <div class="flex items-center gap-1 text-xs">
            <button
              type="button"
              class="px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5"
              :class="activeProfileTab === 'overview' ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:bg-muted'"
              @click="activeProfileTab = 'overview'"
            >
              <Eye class="size-3.5" />
              <span>Profile Overview</span>
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5"
              :class="activeProfileTab === 'edit' ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:bg-muted'"
              @click="activeProfileTab = 'edit'"
            >
              <UserRoundPen class="size-3.5" />
              <span>Edit Profile</span>
            </button>
          </div>

          <div class="text-[11px] text-muted-foreground hidden sm:block">
            <span>{{ selectedEmployee.department || 'Operations' }}</span> • <span>{{ selectedEmployee.location }}</span>
          </div>
        </div>

        <!-- Success & Error Banners -->
        <div v-if="profileSuccessMsg" class="p-3 mx-4 mt-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 class="size-4 shrink-0 text-emerald-600" />
          <span>{{ profileSuccessMsg }}</span>
        </div>

        <div v-if="profileErrorMsg" class="p-3 mx-4 mt-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
          <AlertCircle class="size-4 shrink-0" />
          <span>{{ profileErrorMsg }}</span>
        </div>

        <!-- Modal Body (Scrollable) -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <!-- ============================================== -->
          <!-- TAB 1: OVERVIEW -->
          <!-- ============================================== -->
          <template v-if="activeProfileTab === 'overview'">
            <!-- Quick Cards Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <!-- Card: Basic Information -->
              <div class="rounded-xl border bg-card p-3.5 space-y-2.5 shadow-2xs">
                <div class="flex items-center justify-between pb-1.5 border-b">
                  <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <User class="size-3.5 text-primary" />
                    <span>Basic Information</span>
                  </div>
                  <span class="text-[10px] text-muted-foreground">Personal</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span class="text-muted-foreground block text-[11px]">Full Name</span>
                    <span class="font-medium text-foreground">{{ selectedEmployee.full_name }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground block text-[11px]">Preferred Name</span>
                    <span class="font-medium text-foreground">{{ selectedEmployee.preferred_name || '—' }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground block text-[11px]">Birthday / Date of Birth</span>
                    <span class="font-medium text-foreground">{{ selectedEmployee.date_of_birth || '—' }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground block text-[11px]">Gender</span>
                    <span class="font-medium text-foreground">
                      {{ (selectedEmployee.gender && selectedEmployee.gender !== 'not_specified') ? selectedEmployee.gender : '—' }}
                    </span>
                  </div>
                  <div class="col-span-2">
                    <span class="text-muted-foreground block text-[11px]">Civil Status</span>
                    <span class="font-medium text-foreground">
                      {{ (selectedEmployee.civil_status && selectedEmployee.civil_status !== 'not_specified') ? selectedEmployee.civil_status : '—' }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Card: Contact Information -->
              <div class="rounded-xl border bg-card p-3.5 space-y-2.5 shadow-2xs">
                <div class="flex items-center justify-between pb-1.5 border-b">
                  <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Phone class="size-3.5 text-primary" />
                    <span>Contact Information</span>
                  </div>
                  <span class="text-[10px] text-muted-foreground">Reachability</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span class="text-muted-foreground block text-[11px]">Mobile Number</span>
                    <span class="font-medium text-foreground font-mono">{{ selectedEmployee.mobile_number || '—' }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground block text-[11px]">Alternate Contact</span>
                    <span class="font-medium text-foreground font-mono">{{ selectedEmployee.alternate_number || '—' }}</span>
                  </div>
                  <div class="col-span-2">
                    <span class="text-muted-foreground block text-[11px]">Email Address</span>
                    <span class="font-medium text-foreground">{{ selectedEmployee.email || '—' }}</span>
                  </div>
                  <div class="col-span-2">
                    <span class="text-muted-foreground block text-[11px]">Home Address</span>
                    <span class="font-medium text-foreground">{{ selectedEmployee.home_address || '—' }}</span>
                  </div>
                </div>
              </div>

              <!-- Card: Employment Information -->
              <div class="rounded-xl border bg-card p-3.5 space-y-2.5 shadow-2xs">
                <div class="flex items-center justify-between pb-1.5 border-b">
                  <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Building class="size-3.5 text-primary" />
                    <span>Employment Information</span>
                  </div>
                  <span class="text-[10px] text-muted-foreground">Organizational</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span class="text-muted-foreground block text-[11px]">Department</span>
                    <span class="font-medium text-foreground">{{ selectedEmployee.department || 'Operations' }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground block text-[11px]">Position / Role</span>
                    <span class="font-medium text-foreground">{{ selectedEmployee.position || 'Staff' }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground block text-[11px]">Work Group Schedule</span>
                    <span class="font-medium text-foreground">
                      {{ selectedEmployee.work_group_name || 'Group C' }} ({{ selectedEmployee.work_group_code || 'C' }})
                    </span>
                  </div>
                  <div>
                    <span class="text-muted-foreground block text-[11px]">Branch Location</span>
                    <span class="font-medium text-foreground">{{ selectedEmployee.location }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground block text-[11px]">Date Hired</span>
                    <span class="font-medium text-foreground">{{ selectedEmployee.hire_date || '—' }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground block text-[11px]">Date Regularized</span>
                    <span class="font-medium text-foreground">{{ selectedEmployee.regularization_date || '—' }}</span>
                  </div>
                </div>
              </div>

              <!-- Card: Emergency Contact -->
              <div class="rounded-xl border bg-card p-3.5 space-y-2.5 shadow-2xs">
                <div class="flex items-center justify-between pb-1.5 border-b">
                  <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ShieldAlert class="size-3.5 text-amber-500" />
                    <span>Emergency Contact</span>
                  </div>
                  <span class="text-[10px] text-muted-foreground">Safety</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-xs">
                  <div class="col-span-2">
                    <span class="text-muted-foreground block text-[11px]">Contact Person</span>
                    <span class="font-medium text-foreground">{{ selectedEmployee.emergency_contact_name || '—' }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground block text-[11px]">Relationship</span>
                    <span class="font-medium text-foreground">{{ selectedEmployee.emergency_contact_relationship || '—' }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground block text-[11px]">Emergency Number</span>
                    <span class="font-medium text-foreground font-mono">{{ selectedEmployee.emergency_contact_number || '—' }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Card: Biometric Hardware Key (Read-Only) -->
            <div class="rounded-xl border bg-muted/20 p-3.5 space-y-2">
              <div class="flex items-center justify-between pb-1 border-b">
                <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Fingerprint class="size-4 text-primary" />
                  <span>Biometric Device Registration</span>
                </div>
                <Badge variant="outline" class="text-[10px] font-mono gap-1">
                  <Lock class="size-2.5" />
                  Read-Only Key
                </Badge>
              </div>
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs pt-1">
                <div class="space-y-0.5">
                  <div class="font-mono font-semibold text-foreground text-sm flex items-center gap-2">
                    <span>Bio ID: {{ selectedEmployee.biometric_user_id }}</span>
                    <span class="text-muted-foreground font-normal text-xs">= Employee ID</span>
                  </div>
                  <p class="text-muted-foreground text-[11px]">
                    Directly maps to the BISBIO B-29b hardware attendance scanner and attendance interpretation engine.
                  </p>
                </div>
                <div class="text-[11px] px-2.5 py-1.5 rounded bg-muted text-muted-foreground font-mono">
                  IndexedDB Key: {{ selectedEmployee.biometric_user_id }}
                </div>
              </div>
            </div>

            <!-- Card: Payroll Profile Section (Separation of Concerns) -->
            <div class="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div class="flex items-center justify-between pb-1.5 border-b border-primary/10">
                <div class="flex items-center gap-2 text-xs font-bold text-foreground">
                  <CreditCard class="size-4 text-primary" />
                  <span>Payroll Profile</span>
                </div>
                <Badge variant="default" class="text-[10px] font-mono uppercase bg-primary text-primary-foreground">
                  {{ selectedEmployee.payroll_status || 'Configured' }}
                </Badge>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span class="text-muted-foreground block text-[11px]">Salary Type</span>
                  <span class="font-semibold text-foreground">{{ selectedEmployee.salary_type || 'Monthly' }} Rate</span>
                </div>
                <div>
                  <span class="text-muted-foreground block text-[11px]">Linked Employee ID</span>
                  <span class="font-mono font-semibold text-primary">{{ selectedEmployee.biometric_user_id }}</span>
                </div>
                <div>
                  <span class="text-muted-foreground block text-[11px]">Payroll Module Link</span>
                  <span class="text-emerald-700 dark:text-emerald-400 font-medium">Ready for Audited Records</span>
                </div>
              </div>
              <p class="text-[11px] text-muted-foreground leading-relaxed">
                Financial calculations, government deductions (SSS, PhilHealth, Pag-IBIG), daily wage rates, and payslips are calculated in the Payroll module using this employee's Bio ID.
              </p>
              <div class="pt-1 flex items-center justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7 text-xs gap-1.5 shadow-xs"
                  @click="navigateToPayrollRecords"
                >
                  <ExternalLink class="size-3 text-primary" />
                  <span>View in Payroll Records</span>
                </Button>
              </div>
            </div>
          </template>

          <!-- ============================================== -->
          <!-- TAB 2: EDIT PROFILE FORM -->
          <!-- ============================================== -->
          <template v-else>
            <form
              id="employee-profile-form"
              @submit.prevent="saveProfile"
              class="space-y-4"
            >
              <!-- Section 1: Immutable Identifier (Bio ID = Employee ID) -->
              <div class="rounded-lg border bg-muted/40 p-3 space-y-1.5">
                <div class="flex items-center justify-between text-xs font-semibold">
                  <span class="flex items-center gap-1.5 text-foreground">
                    <Fingerprint class="size-3.5 text-primary" />
                    <span>Employee ID / Bio ID</span>
                  </span>
                  <span class="text-[10px] text-amber-600 dark:text-amber-400 font-mono flex items-center gap-1">
                    <Lock class="size-2.5" />
                    Permanent Read-Only Identifier
                  </span>
                </div>
                <div class="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-muted font-mono text-xs font-bold text-foreground">
                  <span>{{ formBioId }}</span>
                  <span class="text-muted-foreground font-normal text-[11px]">— Matches Biometric Device User ID</span>
                </div>
              </div>

              <!-- Section 2: Basic Information -->
              <div class="rounded-xl border p-3.5 space-y-3 bg-card">
                <div class="flex items-center gap-1.5 text-xs font-bold text-foreground pb-1 border-b">
                  <User class="size-3.5 text-primary" />
                  <span>Basic Personal Information</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-foreground">
                      Full Name <span class="text-destructive">*</span>
                    </label>
                    <Input
                      v-model="formName"
                      type="text"
                      required
                      placeholder="e.g. Dela Cruz, Juan"
                      class="h-8 text-xs"
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-foreground">Preferred Name</label>
                    <Input
                      v-model="formPreferredName"
                      type="text"
                      placeholder="e.g. Johnny"
                      class="h-8 text-xs"
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-foreground">Birthday / Date of Birth</label>
                    <Input
                      v-model="formDateOfBirth"
                      type="date"
                      class="h-8 text-xs"
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-foreground">Gender</label>
                    <Select v-model="formGender">
                      <SelectTrigger class="h-8 text-xs w-full bg-card">
                        <SelectValue placeholder="Select Gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="not_specified">Not Specified</SelectItem>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div class="space-y-1 sm:col-span-2">
                    <label class="text-xs font-semibold text-foreground">Civil Status</label>
                    <Select v-model="formCivilStatus">
                      <SelectTrigger class="h-8 text-xs w-full bg-card">
                        <SelectValue placeholder="Select Civil Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="not_specified">Not Specified</SelectItem>
                          <SelectItem value="Single">Single</SelectItem>
                          <SelectItem value="Married">Married</SelectItem>
                          <SelectItem value="Widowed">Widowed</SelectItem>
                          <SelectItem value="Separated">Separated</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <!-- Section 3: Contact Details -->
              <div class="rounded-xl border p-3.5 space-y-3 bg-card">
                <div class="flex items-center gap-1.5 text-xs font-bold text-foreground pb-1 border-b">
                  <Phone class="size-3.5 text-primary" />
                  <span>Contact Information</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-foreground">Mobile / Contact Number</label>
                    <Input
                      v-model="formMobileNumber"
                      type="text"
                      placeholder="e.g. 0917-123-4567"
                      class="h-8 text-xs"
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-foreground">Alternate Contact Number</label>
                    <Input
                      v-model="formAlternateNumber"
                      type="text"
                      placeholder="e.g. 032-234-5678"
                      class="h-8 text-xs"
                    />
                  </div>
                  <div class="space-y-1 sm:col-span-2">
                    <label class="text-xs font-semibold text-foreground">Email Address</label>
                    <Input
                      v-model="formEmail"
                      type="email"
                      placeholder="e.g. employee@dmbb.com"
                      class="h-8 text-xs"
                    />
                  </div>
                  <div class="space-y-1 sm:col-span-2">
                    <label class="text-xs font-semibold text-foreground">Home Address</label>
                    <Input
                      v-model="formHomeAddress"
                      type="text"
                      placeholder="e.g. Cebu City, Philippines"
                      class="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>

              <!-- Section 4: Emergency Contact -->
              <div class="rounded-xl border p-3.5 space-y-3 bg-card">
                <div class="flex items-center gap-1.5 text-xs font-bold text-foreground pb-1 border-b">
                  <ShieldAlert class="size-3.5 text-amber-500" />
                  <span>Emergency Contact</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-foreground">Contact Name</label>
                    <Input
                      v-model="formEmergencyName"
                      type="text"
                      placeholder="e.g. Maria Dela Cruz"
                      class="h-8 text-xs"
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-foreground">Relationship</label>
                    <Input
                      v-model="formEmergencyRelationship"
                      type="text"
                      placeholder="e.g. Spouse / Parent"
                      class="h-8 text-xs"
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-foreground">Contact Number</label>
                    <Input
                      v-model="formEmergencyNumber"
                      type="text"
                      placeholder="e.g. 0918-987-6543"
                      class="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>

              <!-- Section 5: Employment Details -->
              <div class="rounded-xl border p-3.5 space-y-3 bg-card">
                <div class="flex items-center gap-1.5 text-xs font-bold text-foreground pb-1 border-b">
                  <Building class="size-3.5 text-primary" />
                  <span>Employment & Schedule</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-foreground">Department</label>
                    <Input
                      v-model="formDepartment"
                      type="text"
                      placeholder="Operations"
                      class="h-8 text-xs"
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-foreground">Position / Role</label>
                    <Input
                      v-model="formPosition"
                      type="text"
                      placeholder="Staff"
                      class="h-8 text-xs"
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-foreground">Branch Location</label>
                    <Select v-model="formLocation">
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
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-foreground">Assigned Work Group</label>
                    <Select v-model="formWorkGroupId">
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
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-foreground">Date Hired</label>
                    <Input
                      v-model="formHireDate"
                      type="date"
                      class="h-8 text-xs"
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-foreground">Date Regularized</label>
                    <Input
                      v-model="formRegularizationDate"
                      type="date"
                      class="h-8 text-xs"
                    />
                  </div>
                  <div class="space-y-1 sm:col-span-2">
                    <label class="text-xs font-semibold text-foreground">Employment Status</label>
                    <Select v-model="formStatus">
                      <SelectTrigger class="h-8 text-xs w-full bg-card">
                        <SelectValue placeholder="Select Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="on_leave">On Leave</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <!-- Section 6: Payroll Configuration -->
              <div class="rounded-xl border p-3.5 space-y-3 bg-card">
                <div class="flex items-center gap-1.5 text-xs font-bold text-foreground pb-1 border-b">
                  <CreditCard class="size-3.5 text-primary" />
                  <span>Payroll Profile Setup</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-foreground">Salary Rate Type</label>
                    <Select v-model="formSalaryType">
                      <SelectTrigger class="h-8 text-xs w-full bg-card">
                        <SelectValue placeholder="Select Salary Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="Monthly">Monthly Salary</SelectItem>
                          <SelectItem value="Daily">Daily Wage</SelectItem>
                          <SelectItem value="Hourly">Hourly Rate</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-foreground">Payroll Status</label>
                    <Select v-model="formPayrollStatus">
                      <SelectTrigger class="h-8 text-xs w-full bg-card">
                        <SelectValue placeholder="Select Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="configured">Configured</SelectItem>
                          <SelectItem value="pending">Pending Setup</SelectItem>
                          <SelectItem value="exempt">Exempt</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </form>
          </template>
        </div>

        <!-- Modal Bottom Footer -->
        <div class="p-3 border-t bg-muted/30 flex items-center justify-between text-xs text-muted-foreground">
          <div class="flex items-center gap-1.5 font-mono text-[11px]">
            <span>Bio ID: {{ selectedEmployee.biometric_user_id }}</span>
            <span>•</span>
            <span>Employee ID: {{ selectedEmployee.biometric_user_id }}</span>
          </div>

          <div class="flex items-center gap-2">
            <!-- Edit -->
            <template v-if="activeProfileTab === 'edit'">
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="h-7 text-xs"
                @click="closeProfileModal"
              >
                Cancel
              </Button>

              <Button
                type="submit"
                form="employee-profile-form"
                size="sm"
                class="h-7 text-xs gap-1.5 font-medium shadow-xs"
                :disabled="profileSaving"
              >
                <RefreshCw
                  v-if="profileSaving"
                  class="size-3 animate-spin"
                />
                <Save
                  v-else
                  class="size-3"
                />
                <span>
                  {{ profileSaving ? 'Saving Changes...' : 'Save Changes' }}
                </span>
              </Button>
            </template>
          </div>
        </div>
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
  </div>
</template>
