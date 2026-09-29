<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Search, Fingerprint } from '@lucide/vue'
import { employeeService } from '@/services/employees'
import type { Employee } from '@/types'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

const employees = ref<Employee[]>([])
const searchQuery = ref('')
const loading = ref(false)

async function loadEmployees() {
  loading.value = true
  try {
    employees.value = await employeeService.getEmployees()
  } finally {
    loading.value = false
  }
}

const filtered = ref<Employee[]>([])

function filterList() {
  if (!searchQuery.value.trim()) {
    filtered.value = employees.value
    return
  }
  const q = searchQuery.value.toLowerCase()
  filtered.value = employees.value.filter(e =>
    e.full_name.toLowerCase().includes(q) ||
    e.biometric_user_id.toLowerCase().includes(q) ||
    e.employee_number.toLowerCase().includes(q) ||
    e.department.toLowerCase().includes(q)
  )
}

onMounted(async () => {
  await loadEmployees()
  filtered.value = employees.value
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground">
          Employee Directory
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Manage employee profiles and mapping to biometric reader User IDs (e.g., 5009, 25013, 50366).
        </p>
      </div>
    </div>

    <!-- Search bar -->
    <div class="flex items-center gap-2">
      <div class="relative w-full max-w-sm">
        <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          type="text"
          placeholder="Search by name, biometric ID, or department..."
          class="pl-8 h-8 text-xs"
          @input="filterList"
        />
      </div>
    </div>

    <!-- Table -->
    <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow class="bg-muted/40">
            <TableHead class="font-semibold w-[120px]">Biometric ID</TableHead>
            <TableHead class="font-semibold">Employee No.</TableHead>
            <TableHead class="font-semibold">Full Name</TableHead>
            <TableHead class="font-semibold">Department</TableHead>
            <TableHead class="font-semibold">Position</TableHead>
            <TableHead class="font-semibold">Location</TableHead>
            <TableHead class="font-semibold text-right">Status</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <TableRow v-for="emp in filtered" :key="emp.id">
            <TableCell class="font-mono font-semibold text-primary">
              <span class="inline-flex items-center gap-1.5">
                <Fingerprint class="size-3.5 text-muted-foreground" />
                {{ emp.biometric_user_id }}
              </span>
            </TableCell>
            <TableCell class="font-mono text-xs text-muted-foreground">
              {{ emp.employee_number }}
            </TableCell>
            <TableCell class="font-medium text-foreground">
              {{ emp.full_name }}
            </TableCell>
            <TableCell class="text-xs">
              {{ emp.department }}
            </TableCell>
            <TableCell class="text-xs text-muted-foreground">
              {{ emp.position }}
            </TableCell>
            <TableCell class="text-xs">
              <span class="inline-flex items-center gap-1">
                <span class="size-1.5 rounded-full bg-emerald-500" />
                DBB Cebu
              </span>
            </TableCell>
            <TableCell class="text-right">
              <Badge variant="success" class="text-[10px] uppercase font-mono">
                {{ emp.status }}
              </Badge>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
