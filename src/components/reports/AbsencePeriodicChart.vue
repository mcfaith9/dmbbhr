<script setup lang="ts">
import { ref, computed } from 'vue'
import type { WeekTrendPoint, MonthTrendPoint } from '@/services/reportsService'

const props = defineProps<{
  weeklyData: WeekTrendPoint[]
  monthlyData: MonthTrendPoint[]
}>()

const activeView = ref<'weekly' | 'monthly'>('weekly')
const hoveredIndex = ref<number | null>(null)

const activePoints = computed(() => {
  if (activeView.value === 'weekly') {
    return props.weeklyData.map(d => ({
      key: d.weekKey,
      label: d.label,
      count: d.absentCount,
      rate: d.absenceRate,
      eligible: d.eligibleWorkdays
    }))
  }
  return props.monthlyData.map(d => ({
    key: d.monthKey,
    label: d.label,
    count: d.absentCount,
    rate: d.absenceRate,
    eligible: d.eligibleWorkdays
  }))
})

const maxCount = computed(() => {
  if (!activePoints.value.length) return 10
  const max = Math.max(...activePoints.value.map(p => p.count), 5)
  return Math.ceil(max * 1.25)
})

// SVG Dimensions
const viewBoxWidth = 600
const viewBoxHeight = 200
const padding = { top: 20, right: 20, bottom: 40, left: 40 }
const chartWidth = viewBoxWidth - padding.left - padding.right
const chartHeight = viewBoxHeight - padding.top - padding.bottom

function getX(index: number): number {
  if (activePoints.value.length <= 1) return padding.left + chartWidth / 2
  const step = chartWidth / activePoints.value.length
  return padding.left + index * step + step / 2
}

function getY(val: number): number {
  const ratio = Math.min(val / (maxCount.value || 1), 1)
  return padding.top + chartHeight - ratio * chartHeight
}

function getBarWidth(): number {
  if (!activePoints.value.length) return 20
  const slotWidth = chartWidth / activePoints.value.length
  return Math.min(36, Math.max(14, slotWidth * 0.6))
}

const hoveredItem = computed(() => {
  if (hoveredIndex.value === null || !activePoints.value[hoveredIndex.value]) return null
  return activePoints.value[hoveredIndex.value]
})
</script>

<template>
  <div class="space-y-3">
    <!-- Header with Toggle -->
    <div class="flex items-center justify-between">
      <div>
        <h4 class="text-xs font-semibold text-foreground uppercase tracking-wider">
          {{ activeView === 'weekly' ? 'Weekly Absence Frequency' : 'Monthly Absence Comparison' }}
        </h4>
        <p class="text-[11px] text-muted-foreground mt-0.5">
          {{ activeView === 'weekly' ? 'Absence occurrences grouped by standard working weeks.' : 'Monthly aggregated absenteeism across billing periods.' }}
        </p>
      </div>

      <!-- Toggle Buttons -->
      <div class="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border text-xs">
        <button
          type="button"
          class="px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer"
          :class="activeView === 'weekly' ? 'bg-card text-foreground shadow-2xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
          @click="activeView = 'weekly'"
        >
          Weekly
        </button>
        <button
          type="button"
          class="px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer"
          :class="activeView === 'monthly' ? 'bg-card text-foreground shadow-2xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
          @click="activeView = 'monthly'"
        >
          Monthly
        </button>
      </div>
    </div>

    <!-- Chart -->
    <div v-if="activePoints.length > 0" class="relative w-full overflow-hidden select-none bg-card rounded-xl border p-2 shadow-2xs">
      <svg
        :viewBox="`0 0 ${viewBoxWidth} ${viewBoxHeight}`"
        class="w-full h-44 overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="absentBarGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ef4444" stop-opacity="0.85" />
            <stop offset="100%" stop-color="#b91c1c" stop-opacity="0.65" />
          </linearGradient>
        </defs>

        <!-- Horizontal Grid Lines -->
        <template v-for="tick in [0, 0.33, 0.66, 1]" :key="tick">
          <g>
            <line
              :x1="padding.left"
              :y1="padding.top + chartHeight * (1 - tick)"
              :x2="viewBoxWidth - padding.right"
              :y2="padding.top + chartHeight * (1 - tick)"
              stroke="currentColor"
              class="text-muted/30 dark:text-muted/20"
              stroke-width="1"
              stroke-dasharray="3,3"
            />
            <text
              :x="padding.left - 6"
              :y="padding.top + chartHeight * (1 - tick) + 3.5"
              text-anchor="end"
              class="text-[9.5px] fill-muted-foreground font-mono"
            >
              {{ Math.round(maxCount * tick) }}
            </text>
          </g>
        </template>

        <!-- Bars -->
        <template v-for="(p, i) in activePoints" :key="p.key">
          <rect
            :x="getX(i) - getBarWidth() / 2"
            :y="getY(p.count)"
            :width="getBarWidth()"
            :height="Math.max(2, padding.top + chartHeight - getY(p.count))"
            rx="3"
            fill="url(#absentBarGrad)"
            class="transition-opacity duration-150 cursor-pointer"
            :opacity="hoveredIndex === i || hoveredIndex === null ? 0.9 : 0.45"
            @mouseenter="hoveredIndex = i"
            @mouseleave="hoveredIndex = null"
          />

          <!-- Value on top of bar -->
          <text
            v-if="p.count > 0"
            :x="getX(i)"
            :y="getY(p.count) - 4"
            text-anchor="middle"
            class="text-[9.5px] font-mono fill-foreground font-bold"
          >
            {{ p.count }}
          </text>

          <!-- Label below bar -->
          <text
            :x="getX(i)"
            :y="padding.top + chartHeight + 16"
            text-anchor="middle"
            class="text-[10px] font-medium truncate"
            :class="hoveredIndex === i ? 'fill-primary font-bold' : 'fill-muted-foreground'"
          >
            {{ p.label }}
          </text>
        </template>
      </svg>

      <!-- Hover Tooltip -->
      <div
        v-if="hoveredItem"
        class="absolute top-2 right-2 rounded-lg border bg-popover/95 backdrop-blur-xs px-2.5 py-1.5 shadow-md text-xs space-y-0.5 z-10 pointer-events-none"
      >
        <div class="font-bold text-foreground">{{ hoveredItem.label }}</div>
        <div class="text-[11px] flex items-center justify-between gap-3 text-muted-foreground">
          <span>Absences:</span>
          <span class="font-mono font-bold text-red-500">{{ hoveredItem.count }} occurrences</span>
        </div>
        <div class="text-[11px] flex items-center justify-between gap-3 text-muted-foreground">
          <span>Absence Rate:</span>
          <span class="font-mono font-bold text-foreground">{{ hoveredItem.rate }}%</span>
        </div>
      </div>
    </div>

    <div v-else class="p-6 text-center text-xs text-muted-foreground border rounded-xl bg-card">
      No absence occurrences in this time window.
    </div>
  </div>
</template>
