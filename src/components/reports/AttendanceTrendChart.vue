<script setup lang="ts">
import { ref, computed } from 'vue'
import type { DayTrendPoint } from '@/services/reportsService'

const props = defineProps<{
  data: DayTrendPoint[]
  title?: string
}>()

const chartMode = ref<'headcount' | 'hours'>('headcount')
const hoveredIndex = ref<number | null>(null)

// Max values for scaling
const maxHeadcount = computed(() => {
  if (!props.data || props.data.length === 0) return 10
  const max = Math.max(...props.data.map(d => Math.max(d.present, d.late, d.absent, 1)))
  // Round up to nice number
  return Math.ceil(max * 1.15)
})

const maxHours = computed(() => {
  if (!props.data || props.data.length === 0) return 10
  const max = Math.max(...props.data.map(d => d.renderedHours || 1))
  return Math.ceil(max * 1.15)
})

// SVG dimensions & margins
const viewBoxWidth = 800
const viewBoxHeight = 240
const padding = { top: 25, right: 20, bottom: 40, left: 45 }

const chartWidth = viewBoxWidth - padding.left - padding.right
const chartHeight = viewBoxHeight - padding.top - padding.bottom

// Coordinate calculations
const xStep = computed(() => {
  if (!props.data || props.data.length <= 1) return chartWidth / 2
  return chartWidth / (props.data.length - 1)
})

function getX(index: number): number {
  if (props.data.length === 1) return padding.left + chartWidth / 2
  return padding.left + index * xStep.value
}

function getYHeadcount(val: number): number {
  const ratio = val / (maxHeadcount.value || 1)
  return padding.top + chartHeight - ratio * chartHeight
}

function getYHours(val: number): number {
  const ratio = val / (maxHours.value || 1)
  return padding.top + chartHeight - ratio * chartHeight
}

// Generate smooth SVG path for a line series
function makeLinePath(getter: (d: DayTrendPoint) => number): string {
  if (!props.data || props.data.length === 0) return ''
  if (props.data.length === 1) {
    const x = getX(0)
    const y = getYHeadcount(getter(props.data[0]))
    return `M ${x - 20},${y} L ${x + 20},${y}`
  }

  return props.data.reduce((acc, d, i) => {
    const x = getX(i)
    const y = getYHeadcount(getter(d))
    return i === 0 ? `M ${x},${y}` : `${acc} L ${x},${y}`
  }, '')
}

// Generate area path for subtle gradient fill under present line
const presentAreaPath = computed(() => {
  if (!props.data || props.data.length <= 1) return ''
  const linePart = makeLinePath(d => d.present)
  const lastX = getX(props.data.length - 1)
  const firstX = getX(0)
  const bottomY = padding.top + chartHeight
  return `${linePart} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`
})

const presentLinePath = computed(() => makeLinePath(d => d.present))
const lateLinePath = computed(() => makeLinePath(d => d.late))
const absentLinePath = computed(() => makeLinePath(d => d.absent))

const hoveredItem = computed(() => {
  if (hoveredIndex.value === null || !props.data[hoveredIndex.value]) return null
  return props.data[hoveredIndex.value]
})
</script>

<template>
  <div class="space-y-3">
    <!-- Chart Header & Mode Switcher -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <h3 class="text-xs font-semibold text-foreground uppercase tracking-wider">
          {{ title || 'Attendance Trends' }}
        </h3>
        <span class="text-[11px] text-muted-foreground">
          ({{ data.length }} daily observation{{ data.length > 1 ? 's' : '' }})
        </span>
      </div>

      <!-- Mode Pill Switcher -->
      <div class="flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg border text-xs">
        <button
          type="button"
          class="px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer"
          :class="chartMode === 'headcount' ? 'bg-card text-foreground shadow-2xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
          @click="chartMode = 'headcount'"
        >
          Headcount
        </button>
        <button
          type="button"
          class="px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer"
          :class="chartMode === 'hours' ? 'bg-card text-foreground shadow-2xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
          @click="chartMode = 'hours'"
        >
          Rendered Hours
        </button>
      </div>
    </div>

    <!-- SVG Chart Container -->
    <div class="relative w-full overflow-hidden select-none bg-card rounded-xl border p-2 shadow-2xs">
      <svg
        :viewBox="`0 0 ${viewBoxWidth} ${viewBoxHeight}`"
        class="w-full h-48 md:h-56 overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <!-- Gradient for Present Line Fill -->
          <linearGradient id="presentGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#10b981" stop-opacity="0.25" />
            <stop offset="100%" stop-color="#10b981" stop-opacity="0.0" />
          </linearGradient>

          <!-- Gradient for Rendered Hours Bars -->
          <linearGradient id="hoursGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.85" />
            <stop offset="100%" stop-color="#2563eb" stop-opacity="0.4" />
          </linearGradient>
        </defs>

        <!-- Y-Axis Gridlines & Ticks -->
        <template v-for="tick in [0, 0.25, 0.5, 0.75, 1]" :key="tick">
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
              :x="padding.left - 8"
              :y="padding.top + chartHeight * (1 - tick) + 3.5"
              text-anchor="end"
              class="text-[10px] fill-muted-foreground font-mono"
            >
              {{ chartMode === 'headcount' ? Math.round(maxHeadcount * tick) : Math.round(maxHours * tick) }}
            </text>
          </g>
        </template>

        <!-- MODE 1: HEADCOUNT (Present / Late / Absent) -->
        <template v-if="chartMode === 'headcount'">
          <!-- Area Fill for Present -->
          <path
            v-if="presentAreaPath"
            :d="presentAreaPath"
            fill="url(#presentGrad)"
          />

          <!-- Present Line (Emerald) -->
          <path
            :d="presentLinePath"
            fill="none"
            stroke="#10b981"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />

          <!-- Late Line (Amber) -->
          <path
            :d="lateLinePath"
            fill="none"
            stroke="#f59e0b"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />

          <!-- Absent Line (Red) -->
          <path
            :d="absentLinePath"
            fill="none"
            stroke="#ef4444"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-dasharray="4,3"
          />

          <!-- Data Points -->
          <template v-for="(d, i) in data" :key="d.date">
            <circle
              :cx="getX(i)"
              :cy="getYHeadcount(d.present)"
              r="3.5"
              fill="#10b981"
              stroke="#ffffff"
              stroke-width="1.5"
              class="transition-transform duration-150 cursor-pointer hover:scale-125"
            />
            <circle
              v-if="d.late > 0"
              :cx="getX(i)"
              :cy="getYHeadcount(d.late)"
              r="3"
              fill="#f59e0b"
              stroke="#ffffff"
              stroke-width="1"
            />
          </template>
        </template>

        <!-- MODE 2: RENDERED HOURS BARS -->
        <template v-else>
          <template v-for="(d, i) in data" :key="d.date">
            <rect
              :x="getX(i) - (chartWidth / (data.length * 2.2))"
              :y="getYHours(d.renderedHours)"
              :width="Math.max(6, chartWidth / (data.length * 1.4))"
              :height="Math.max(0, padding.top + chartHeight - getYHours(d.renderedHours))"
              rx="3"
              fill="url(#hoursGrad)"
              class="transition-opacity duration-150 hover:opacity-100 cursor-pointer"
              :opacity="hoveredIndex === i || hoveredIndex === null ? 0.9 : 0.4"
            />
            <!-- Value label on top of bar if <= 14 days -->
            <text
              v-if="data.length <= 14 && d.renderedHours > 0"
              :x="getX(i)"
              :y="getYHours(d.renderedHours) - 5"
              text-anchor="middle"
              class="text-[9px] font-mono fill-foreground font-semibold"
            >
              {{ d.renderedHours }}h
            </text>
          </template>
        </template>

        <!-- Interactive Hover Detection Columns -->
        <template v-for="(d, i) in data" :key="'col-' + d.date">
          <rect
            :x="getX(i) - (chartWidth / (data.length * 2))"
            :y="padding.top"
            :width="Math.max(10, chartWidth / data.length)"
            :height="chartHeight"
            fill="transparent"
            class="cursor-pointer"
            @mouseenter="hoveredIndex = i"
            @mouseleave="hoveredIndex = null"
          />

          <!-- Vertical guide line on hover -->
          <line
            v-if="hoveredIndex === i"
            :x1="getX(i)"
            :y1="padding.top"
            :x2="getX(i)"
            :y2="padding.top + chartHeight"
            stroke="currentColor"
            class="text-foreground/40"
            stroke-width="1"
            stroke-dasharray="2,2"
          />

          <!-- X-Axis Labels (Date / Day) -->
          <text
            v-if="data.length <= 16 || i % Math.ceil(data.length / 10) === 0 || i === data.length - 1"
            :x="getX(i)"
            :y="padding.top + chartHeight + 16"
            text-anchor="middle"
            class="text-[10px] font-medium"
            :class="hoveredIndex === i ? 'fill-primary font-bold' : 'fill-muted-foreground'"
          >
            {{ d.shortLabel }}
          </text>
          <text
            v-if="data.length <= 16 || i % Math.ceil(data.length / 10) === 0 || i === data.length - 1"
            :x="getX(i)"
            :y="padding.top + chartHeight + 28"
            text-anchor="middle"
            class="text-[9px] fill-muted-foreground/70"
          >
            {{ d.dayName }}
          </text>
        </template>
      </svg>

      <!-- Interactive Hover Tooltip Box -->
      <div
        v-if="hoveredItem"
        class="absolute top-3 right-3 rounded-lg border bg-popover/95 backdrop-blur-xs p-2.5 shadow-md text-xs space-y-1 z-10 pointer-events-none transition-all duration-150 animate-in fade-in"
      >
        <div class="font-bold text-foreground border-b pb-1 flex items-center justify-between gap-3">
          <span>{{ hoveredItem.date }}</span>
          <span class="text-[10px] font-mono text-muted-foreground">({{ hoveredItem.dayName }})</span>
        </div>
        <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] pt-0.5">
          <span class="text-emerald-600 font-medium">Present:</span>
          <span class="font-mono font-bold text-foreground text-right">{{ hoveredItem.present }}</span>

          <span class="text-amber-600 font-medium">Late:</span>
          <span class="font-mono font-bold text-foreground text-right">{{ hoveredItem.late }}</span>

          <span class="text-red-500 font-medium">Absent:</span>
          <span class="font-mono font-bold text-foreground text-right">{{ hoveredItem.absent }}</span>

          <span class="text-indigo-500 font-medium">Missing OUT:</span>
          <span class="font-mono font-bold text-foreground text-right">{{ hoveredItem.missingOut }}</span>

          <span class="text-blue-500 font-medium">Hours:</span>
          <span class="font-mono font-bold text-foreground text-right">{{ hoveredItem.renderedHours }}h</span>
        </div>
      </div>
    </div>

    <!-- Chart Legend -->
    <div class="flex items-center justify-center gap-4 text-xs pt-1">
      <div v-if="chartMode === 'headcount'" class="flex items-center gap-4 text-[11px]">
        <div class="flex items-center gap-1.5">
          <span class="size-2.5 rounded-full bg-emerald-500" />
          <span class="text-muted-foreground">Present</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="size-2.5 rounded-full bg-amber-500" />
          <span class="text-muted-foreground">Late (After Shift Start)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="size-2.5 rounded-full bg-red-500" />
          <span class="text-muted-foreground">Absent</span>
        </div>
      </div>
      <div v-else class="flex items-center gap-1.5 text-[11px]">
        <span class="size-2.5 rounded-sm bg-blue-500" />
        <span class="text-muted-foreground">Rendered Working Hours (Actual Daily Scans)</span>
      </div>
    </div>
  </div>
</template>
