<script setup lang="ts">
import { computed } from 'vue'
import type { AttendanceStatusBreakdown } from '@/services/reportsService'

const props = defineProps<{
  breakdown: AttendanceStatusBreakdown[]
  attendanceRate: number
  totalCount: number
}>()

// SVG Donut metrics
const size = 160
const strokeWidth = 24
const radius = (size - strokeWidth) / 2
const circumference = 2 * Math.PI * radius

// Compute stroke dash offsets for each slice
const slices = computed(() => {
  const total = props.breakdown.reduce((sum, item) => sum + item.count, 0) || 1
  let cumulativePercentage = 0

  return props.breakdown.map(item => {
    const ratio = item.count / total
    const strokeDasharray = `${ratio * circumference} ${circumference}`
    const strokeDashoffset = -cumulativePercentage * circumference
    cumulativePercentage += ratio

    return {
      ...item,
      strokeDasharray,
      strokeDashoffset,
      ratio
    }
  })
})
</script>

<template>
  <div class="flex flex-col sm:flex-row items-center justify-between gap-4 p-1">
    <!-- SVG Donut -->
    <div class="relative flex items-center justify-center shrink-0">
      <svg
        :width="size"
        :height="size"
        class="transform -rotate-90 overflow-visible"
      >
        <!-- Background track circle -->
        <circle
          :cx="size / 2"
          :cy="size / 2"
          :r="radius"
          fill="transparent"
          stroke="currentColor"
          class="text-muted/20"
          :stroke-width="strokeWidth"
        />

        <!-- Segment arcs -->
        <circle
          v-for="slice in slices"
          :key="slice.label"
          :cx="size / 2"
          :cy="size / 2"
          :r="radius"
          fill="transparent"
          :stroke="slice.color"
          :stroke-width="strokeWidth"
          :stroke-dasharray="slice.strokeDasharray"
          :stroke-dashoffset="slice.strokeDashoffset"
          class="transition-all duration-300 hover:opacity-90"
        />
      </svg>

      <!-- Center text -->
      <div class="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <span class="text-2xl font-bold font-mono tracking-tight text-foreground">
          {{ attendanceRate }}%
        </span>
        <span class="text-[10px] text-muted-foreground uppercase font-medium tracking-wider">
          Rate
        </span>
      </div>
    </div>

    <!-- Status Legend Breakdown List -->
    <div class="space-y-2.5 w-full text-xs">
      <div
        v-for="item in breakdown"
        :key="item.label"
        class="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-muted/50"
      >
        <div class="flex items-center gap-2">
          <span
            class="size-2.5 rounded-full shrink-0"
            :style="{ backgroundColor: item.color }"
          />
          <span class="font-medium text-foreground text-[11px]">{{ item.label }}</span>
        </div>
        <div class="flex items-center gap-2 font-mono text-[11px]">
          <span class="font-bold text-foreground">{{ item.count }}</span>
          <span class="text-muted-foreground">({{ item.percentage }}%)</span>
        </div>
      </div>
    </div>
  </div>
</template>
