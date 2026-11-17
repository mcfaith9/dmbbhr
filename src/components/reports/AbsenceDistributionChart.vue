<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { DepartmentAbsencePoint } from '@/services/reportsService'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  distribution: DepartmentAbsencePoint[]
}>()

const pageSize = 6
const currentPage = ref(1)

watch(
  () => props.distribution,
  () => {
    currentPage.value = 1
  }
)

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(props.distribution.length / pageSize))
})

const paginatedDistribution = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return props.distribution.slice(start, start + pageSize)
})

const maxAbsents = computed(() => {
  if (!props.distribution.length) return 1
  return Math.max(...props.distribution.map(d => d.absentCount), 1)
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2 border-b pb-3">
      <div>
        <h3 class="text-xs font-semibold text-foreground uppercase tracking-wider">
          Absence Distribution by Department
        </h3>
        <p class="text-[11px] text-muted-foreground mt-0.5">
          Proportion of missed shifts and absence rate across operational units.
        </p>
      </div>
      <Badge variant="outline" class="text-[11px] font-mono shrink-0">
        {{ distribution.length }} {{ distribution.length === 1 ? 'Department' : 'Departments' }}
      </Badge>
    </div>

    <div v-if="distribution.length > 0" class="space-y-4">
      <div class="space-y-2.5">
        <div
          v-for="dept in paginatedDistribution"
          :key="dept.department"
          class="space-y-1 p-2 rounded-lg bg-muted/30 border border-muted/50 text-xs"
        >
          <div class="flex items-center justify-between">
            <span class="font-medium text-foreground truncate pr-2">
              {{ dept.department }}
            </span>
            <div class="flex items-center gap-2 font-mono text-[11px] shrink-0">
              <span class="font-bold text-red-500">{{ dept.absentCount }} absent</span>
              <span class="text-muted-foreground">({{ dept.uniqueEmployees }} emp · {{ dept.absenceRate }}%)</span>
            </div>
          </div>

          <!-- Progress Track -->
          <div class="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              class="h-full bg-red-500 rounded-full transition-all duration-300"
              :style="{ width: `${Math.min(100, (dept.absentCount / maxAbsents) * 100)}%` }"
            />
          </div>
        </div>
      </div>

      <!-- Pagination Bar (6 departments per page) -->
      <div class="pt-3 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <span class="text-muted-foreground">
          Showing {{ (currentPage - 1) * pageSize + 1 }} to
          {{ Math.min(currentPage * pageSize, distribution.length) }} of
          {{ distribution.length }} departments
        </span>

        <div class="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            class="h-7 text-xs px-2.5 cursor-pointer"
            :disabled="currentPage <= 1"
            @click="currentPage--"
          >
            Previous
          </Button>
          <span class="px-2 font-mono text-[11px] text-muted-foreground">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <Button
            variant="outline"
            size="sm"
            class="h-7 text-xs px-2.5 cursor-pointer"
            :disabled="currentPage >= totalPages"
            @click="currentPage++"
          >
            Next
          </Button>
        </div>
      </div>
    </div>

    <div v-else class="p-6 text-center text-xs text-muted-foreground border rounded-xl bg-card">
      No departmental absence recorded.
    </div>
  </div>
</template>
