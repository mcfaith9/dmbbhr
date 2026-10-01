<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import {
  Search,
  Fingerprint,
  Users,
  Edit2,
  X,
  CheckCircle2,
  MapPin,
  Building,
  Save,
  Layers
} from '@lucide/vue'
import { employeeService, VALID_LOCATIONS } from '@/services/employees'
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

// Modal state
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
    editErrorMsg.value = 'Employee Name is required.'
    return
  }

  editSaving.value = true
  editErrorMsg.value = ''
  try {
    await employeeService.updateEmployee(editBioId.value, {
      full_name: editName.value.trim(),
      location: editLocation.value,
      work_group_id: editWorkGroupId.value,
      department: editDepartment.value.trim(),
      position: editPosition.value.trim()
    })

    editSuccessMsg.value = 'Employee profile saved successfully.'
    await loadEmployees()

    setTimeout(() => {
      showEditModal.value = false
      editSuccessMsg.value = ''
    }, 600)
  } catch (err: any) {
    editErrorMsg.value = err.message || 'Failed to update employee.'
  } finally {
    editSaving.value = false
  }
}

let unSubChange: (() => void) | null = null

onMounted(async () => {
  await loadLookups()
  await loadEmployees()
  unSubChange = employeeService.onEmployeesChanged(() => {
    loadEmployees()
  })
})

onUnmounted(() => {
  if (unSubChange) unSubChange()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>Employee Directory</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-muted font-normal text-muted-foreground font-mono">
            {{ filteredEmployees.length }} Profiles
          </span>
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Master employee records linked by permanent Bio ID. Editable Name, Location, and Work Group schedule.
        </p>
      </div>
    </div>

    <!-- Filter and Search Bar -->
    <div class="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-2 items-center">
      <div class="relative sm:col-span-2">
        <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          type="text"
          placeholder="Search by Bio ID, name, or role..."
          class="pl-8 h-8 text-xs"
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
                {{ wg.name }} ({{ wg.standard_in }}–{{ wg.expected_out }})
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>

    <!-- Table -->
    <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow class="bg-muted/40">
            <TableHead class="font-semibold w-[130px]">Bio ID (Permanent)</TableHead>
            <TableHead class="font-semibold">Employee Name</TableHead>
            <TableHead class="font-semibold">Location</TableHead>
            <TableHead class="font-semibold">Work Group</TableHead>
            <TableHead class="font-semibold">Department</TableHead>
            <TableHead class="font-semibold">Position</TableHead>
            <TableHead class="font-semibold">Status</TableHead>
            <TableHead class="font-semibold text-right w-[90px]">Action</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <template v-if="loading">
            <TableRow>
              <TableCell colspan="8" class="h-32 text-center text-xs text-muted-foreground">
                Loading employee records...
              </TableCell>
            </TableRow>
          </template>

          <template v-else-if="filteredEmployees.length === 0">
            <TableRow>
              <TableCell colspan="8" class="h-32 text-center text-muted-foreground">
                <div class="flex flex-col items-center justify-center gap-1.5">
                  <Users class="size-6 text-muted-foreground/40" />
                  <span class="font-medium text-foreground text-sm">No employees found</span>
                  <p class="text-xs text-muted-foreground">
                    Try adjusting your search query or filters.
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
                <Badge variant="outline" class="font-mono text-[10px] gap-1 bg-muted/40">
                  <Layers class="size-2.5 text-primary" />
                  {{ emp.work_group_name || 'GROUP C' }}
                </Badge>
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

    <!-- Edit Employee Modal -->
    <div
      v-if="showEditModal"
      class="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
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

        <form @submit.prevent="saveEmployee" class="p-5 space-y-4 text-xs">
          <!-- Bio ID (Read-only & Disabled) -->
          <div class="space-y-1.5">
            <label class="font-medium text-foreground flex items-center justify-between">
              <span>Bio ID (Permanent Biometric Identifier)</span>
              <span class="text-[10px] font-mono text-muted-foreground">Read-only / Fixed</span>
            </label>
            <Input
              :value="editBioId"
              disabled
              readonly
              class="h-8 text-xs font-mono font-bold bg-muted/70 cursor-not-allowed text-muted-foreground"
            />
            <p class="text-[10px] text-muted-foreground">
              Bio ID connects hardware scans to this employee and cannot be altered.
            </p>
          </div>

          <!-- Employee Name (Editable) -->
          <div class="space-y-1.5">
            <label class="font-medium text-foreground">
              Employee Name <span class="text-destructive">*</span>
            </label>
            <Input
              v-model="editName"
              placeholder="e.g. B Basalo, Randy"
              required
              class="h-8 text-xs"
            />
          </div>

          <!-- Location (Editable with Shadcn Select) -->
          <div class="space-y-1.5">
            <label class="font-medium text-foreground">
              Location <span class="text-destructive">*</span>
            </label>
            <Select v-model="editLocation">
              <SelectTrigger class="h-8 text-xs w-full bg-background">
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

          <!-- Work Group (Editable with Shadcn Select) -->
          <div class="space-y-1.5">
            <label class="font-medium text-foreground">
              Work Group Schedule <span class="text-destructive">*</span>
            </label>
            <Select v-model="editWorkGroupId">
              <SelectTrigger class="h-8 text-xs w-full bg-background">
                <SelectValue placeholder="Select Work Group" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="wg in workGroups" :key="wg.id" :value="wg.id">
                    {{ wg.name }} ({{ wg.standard_in }} IN → {{ wg.expected_out }} OUT)
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <p class="text-[10px] text-muted-foreground">
              Determines Standard IN, 8 required working hours, and unpaid lunch window (12pm-1pm).
            </p>
          </div>

          <!-- Department & Position -->
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class="font-medium text-foreground">Department</label>
              <Input
                v-model="editDepartment"
                placeholder="e.g. Operations"
                class="h-8 text-xs"
              />
            </div>
            <div class="space-y-1.5">
              <label class="font-medium text-foreground">Position</label>
              <Input
                v-model="editPosition"
                placeholder="e.g. Staff"
                class="h-8 text-xs"
              />
            </div>
          </div>

          <!-- Success/Error Alerts -->
          <div v-if="editSuccessMsg" class="p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 class="size-4 shrink-0" />
            <span>{{ editSuccessMsg }}</span>
          </div>

          <div v-if="editErrorMsg" class="p-2.5 rounded-md bg-destructive/10 border border-destructive/30 text-destructive flex items-center gap-2">
            <X class="size-4 shrink-0" />
            <span>{{ editErrorMsg }}</span>
          </div>

          <!-- Actions -->
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
              variant="default"
              size="sm"
              class="h-8 text-xs gap-1.5 font-medium shadow-xs"
              :disabled="editSaving"
            >
              <Save class="size-3.5" />
              <span>{{ editSaving ? 'Saving...' : 'Save Changes' }}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
