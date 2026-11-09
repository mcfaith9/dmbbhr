<script setup lang="ts">
import { computed } from 'vue'
import type { DepartmentAbsencePoint } from '@/services/reportsService'

const props = defineProps<{
  distribution: DepartmentAbsencePoint[]
}>()

const maxAbsents = computed(() => {
  if (!props.distribution.length) return 1
  return Math.max(...props.distribution.map(d => d.absentCount), 1)
})
</script>

<template>
  <div class="space-y-3">
    <div class="border-b pb-2">
      <h4 class="text-xs font-semibold text-foreground uppercase tracking-wider">
        Absence Distribution by Department
      </h4>
      <p class="text-[11px] text-muted-foreground mt-0.5">
        Proportion of missed shifts and absence rate across operational units.
      </p>
    </div>

    <div v-if="distribution.length > 0" class="space-y-2.5">
      <div
        v-for="dept in distribution"
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

    <div v-else class="p-6 text-center text-xs text-muted-foreground border rounded-xl bg-card">
      No departmental absence recorded.
    </div>
  </div>
</template>
