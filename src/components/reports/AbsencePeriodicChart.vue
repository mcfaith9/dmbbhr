<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { CurveType } from '@unovis/ts'
import { VisAxis, VisLine, VisScatter, VisXYContainer } from '@unovis/vue'
import { Button } from '@/components/ui/button'
import {
  ChartContainer,
  ChartCrosshair,
  ChartTooltip,
  ChartTooltipContent,
  componentToString,
  type ChartConfig
} from '@/components/ui/chart'
import type {
  WeeklyAbsenceWindowGroup,
  WeeklyDailyAbsencePoint,
  MonthTrendPoint
} from '@/services/reportsService'

const props = defineProps<{
  weeklyDailyWindows: WeeklyAbsenceWindowGroup[]
  selectedWeekStart: string
  monthlyData: MonthTrendPoint[]
}>()

const activeView = ref<'weekly' | 'monthly'>('weekly')
const hoveredMonthlyIndex = ref<number | null>(null)
const activeWeekStart = ref<string>(props.selectedWeekStart || '')

watch(activeView, () => {
  hoveredMonthlyIndex.value = null
})

watch(
  [() => props.selectedWeekStart, () => props.weeklyDailyWindows],
  ([nextSelectedStart, windows]) => {
    if (nextSelectedStart && windows.some(w => w.weekStart === nextSelectedStart)) {
      activeWeekStart.value = nextSelectedStart
    } else if (windows.length > 0 && !windows.some(w => w.weekStart === activeWeekStart.value)) {
      activeWeekStart.value = windows[windows.length - 1].weekStart
    }
  },
  { immediate: true }
)

const currentWeekIndex = computed(() => {
  if (!props.weeklyDailyWindows.length) return -1
  const idx = props.weeklyDailyWindows.findIndex(w => w.weekStart === activeWeekStart.value)
  return idx >= 0 ? idx : props.weeklyDailyWindows.length - 1
})

const currentWeekWindow = computed<WeeklyAbsenceWindowGroup | null>(() => {
  if (currentWeekIndex.value < 0) return null
  return props.weeklyDailyWindows[currentWeekIndex.value] ?? null
})

const canGoPrevWeek = computed(() => currentWeekIndex.value > 0)
const canGoNextWeek = computed(
  () => currentWeekIndex.value >= 0 && currentWeekIndex.value < props.weeklyDailyWindows.length - 1
)

function goPrevWeek() {
  if (canGoPrevWeek.value) {
    activeWeekStart.value = props.weeklyDailyWindows[currentWeekIndex.value - 1].weekStart
  }
}

function goNextWeek() {
  if (canGoNextWeek.value) {
    activeWeekStart.value = props.weeklyDailyWindows[currentWeekIndex.value + 1].weekStart
  }
}

interface WeeklyChartDatum extends WeeklyDailyAbsencePoint {
  idx: number
}

const weeklyChartData = computed<WeeklyChartDatum[]>(() => {
  if (!currentWeekWindow.value) return []
  return currentWeekWindow.value.days.map((d, idx) => ({
    ...d,
    idx
  }))
})

const weeklyTickValues = computed(() => weeklyChartData.value.map(d => d.idx))

const weeklyYMax = computed(() => {
  const maxVal = Math.max(0, ...weeklyChartData.value.map(d => d.absentCount))
  if (maxVal <= 4) return 4
  return Math.ceil(maxVal * 1.2)
})

const weeklyChartConfig = {
  absentCount: {
    label: 'Absent Employees',
    color: '#ef4444'
  }
} satisfies ChartConfig

const weeklyCrosshairTemplate = componentToString(weeklyChartConfig, ChartTooltipContent, {
  labelKey: 'fullDateLabel'
})

// Monthly bar chart state & geometry
const monthlyPoints = computed(() =>
  props.monthlyData.map(d => ({
    key: d.monthKey,
    label: d.label,
    count: d.absentCount,
    rate: d.absenceRate,
    eligible: d.eligibleWorkdays
  }))
)

const maxMonthlyCount = computed(() => {
  if (!monthlyPoints.value.length) return 10
  const max = Math.max(...monthlyPoints.value.map(p => p.count), 5)
  return Math.ceil(max * 1.25)
})

const viewBoxWidth = 720
const viewBoxHeight = 206
const padding = { top: 20, right: 20, bottom: 40, left: 40 }
const chartWidth = viewBoxWidth - padding.left - padding.right
const chartHeight = viewBoxHeight - padding.top - padding.bottom

function getMonthlyX(index: number): number {
  if (monthlyPoints.value.length <= 1) return padding.left + chartWidth / 2
  const step = chartWidth / monthlyPoints.value.length
  return padding.left + index * step + step / 2
}

function getMonthlyY(val: number): number {
  const ratio = Math.min(val / (maxMonthlyCount.value || 1), 1)
  return padding.top + chartHeight - ratio * chartHeight
}

function getMonthlyBarWidth(): number {
  if (!monthlyPoints.value.length) return 20
  const slotWidth = chartWidth / monthlyPoints.value.length
  return Math.min(44, Math.max(18, slotWidth * 0.45))
}

const hoveredMonthlyItem = computed(() => {
  if (hoveredMonthlyIndex.value === null || !monthlyPoints.value[hoveredMonthlyIndex.value]) return null
  return monthlyPoints.value[hoveredMonthlyIndex.value]
})
</script>

<template>
  <div class="space-y-3">
    <!-- Header with Week Stepper & View Toggle -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <h4 class="text-xs font-semibold text-foreground uppercase tracking-wider">
          {{ activeView === 'weekly' ? 'Weekly Absence Frequency' : 'Monthly Absence Comparison' }}
        </h4>
        <p class="text-[11px] text-muted-foreground mt-0.5">
          {{
            activeView === 'weekly'
              ? `Daily absence counts for the selected week${currentWeekWindow ? ` (${currentWeekWindow.label})` : ''}.`
              : 'Monthly aggregated absenteeism across the last 3 months.'
          }}
        </p>
      </div>

      <div class="flex items-center gap-2 self-start sm:self-auto">
        <!-- Week Navigation (Weekly view only) -->
        <div
          v-if="activeView === 'weekly' && currentWeekWindow"
          class="flex items-center gap-1 bg-muted/40 border rounded-lg px-1 py-0.5 text-[11px]"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-6 rounded-md cursor-pointer"
            :disabled="!canGoPrevWeek"
            aria-label="Previous week"
            @click="goPrevWeek"
          >
            <ChevronLeft class="size-3.5" />
          </Button>
          <span class="px-1.5 font-mono font-medium text-foreground whitespace-nowrap">
            {{ currentWeekWindow.shortRangeLabel }}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-6 rounded-md cursor-pointer"
            :disabled="!canGoNextWeek"
            aria-label="Next week"
            @click="goNextWeek"
          >
            <ChevronRight class="size-3.5" />
          </Button>
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
    </div>

    <!-- WEEKLY VIEW: shadcn-vue Line Chart (7 days of selected week) -->
    <template v-if="activeView === 'weekly'">
      <div v-if="weeklyChartData.length > 0" class="w-full bg-card rounded-xl border p-3 shadow-2xs">
        <ChartContainer :config="weeklyChartConfig" cursor class="h-52 w-full aspect-auto">
          <VisXYContainer
            :data="weeklyChartData"
            :margin="{ top: 14, right: 20, bottom: 26, left: 34 }"
            :x-domain="[-0.25, 6.25]"
            :y-domain="[0, weeklyYMax]"
          >
            <VisLine
              :x="(d: WeeklyChartDatum) => d.idx"
              :y="(d: WeeklyChartDatum) => d.absentCount"
              :color="weeklyChartConfig.absentCount.color"
              :curve-type="CurveType.MonotoneX"
              :line-width="2.5"
            />
            <VisScatter
              :x="(d: WeeklyChartDatum) => d.idx"
              :y="(d: WeeklyChartDatum) => d.absentCount"
              :color="weeklyChartConfig.absentCount.color"
              :size="6"
            />
            <VisAxis
              type="x"
              :x="(d: WeeklyChartDatum) => d.idx"
              :tick-line="false"
              :domain-line="false"
              :grid-line="false"
              :tick-values="weeklyTickValues"
              :tick-format="(val: number) => weeklyChartData[Math.round(val)]?.shortDate ?? ''"
            />
            <VisAxis
              type="y"
              :num-ticks="4"
              :tick-line="false"
              :domain-line="false"
              :grid-line="true"
              :tick-format="(val: number) => (Number.isInteger(val) ? String(val) : '')"
            />
            <ChartTooltip />
            <ChartCrosshair
              :x="(d: WeeklyChartDatum) => d.idx"
              :y="(d: WeeklyChartDatum) => d.absentCount"
              :template="weeklyCrosshairTemplate"
              :color="weeklyChartConfig.absentCount.color"
              :circle-radius="4"
            />
          </VisXYContainer>
        </ChartContainer>
      </div>
      <div v-else class="p-6 text-center text-xs text-muted-foreground border rounded-xl bg-card">
        No daily absence data available for the selected week.
      </div>
    </template>

    <!-- MONTHLY VIEW: 3-month grouped comparison -->
    <template v-else>
      <div v-if="monthlyPoints.length > 0" class="relative w-full overflow-hidden select-none bg-card rounded-xl border p-2 shadow-2xs">
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
                {{ Math.round(maxMonthlyCount * tick) }}
              </text>
            </g>
          </template>

          <!-- Bars -->
          <template v-for="(p, i) in monthlyPoints" :key="p.key">
            <rect
              :x="getMonthlyX(i) - getMonthlyBarWidth() / 2"
              :y="getMonthlyY(p.count)"
              :width="getMonthlyBarWidth()"
              :height="Math.max(2, padding.top + chartHeight - getMonthlyY(p.count))"
              rx="3"
              fill="url(#absentBarGrad)"
              class="transition-opacity duration-150 cursor-pointer"
              :opacity="hoveredMonthlyIndex === i || hoveredMonthlyIndex === null ? 0.9 : 0.45"
              @mouseenter="hoveredMonthlyIndex = i"
              @mouseleave="hoveredMonthlyIndex = null"
            />

            <!-- Value on top of bar -->
            <text
              v-if="p.count > 0"
              :x="getMonthlyX(i)"
              :y="getMonthlyY(p.count) - 4"
              text-anchor="middle"
              class="text-[9.5px] font-mono fill-foreground font-bold"
            >
              {{ p.count }}
            </text>

            <!-- Label below bar -->
            <text
              :x="getMonthlyX(i)"
              :y="padding.top + chartHeight + 16"
              text-anchor="middle"
              class="text-[10px] font-medium"
              :class="hoveredMonthlyIndex === i ? 'fill-primary font-bold' : 'fill-muted-foreground'"
            >
              {{ p.label }}
            </text>
          </template>
        </svg>

        <!-- Hover Tooltip -->
        <div
          v-if="hoveredMonthlyItem"
          class="absolute top-2 right-2 rounded-lg border bg-popover/95 backdrop-blur-xs px-2.5 py-1.5 shadow-md text-xs space-y-0.5 z-10 pointer-events-none"
        >
          <div class="font-bold text-foreground">{{ hoveredMonthlyItem.label }}</div>
          <div class="text-[11px] flex items-center justify-between gap-3 text-muted-foreground">
            <span>Absences:</span>
            <span class="font-mono font-bold text-red-500">{{ hoveredMonthlyItem.count }} occurrences</span>
          </div>
          <div class="text-[11px] flex items-center justify-between gap-3 text-muted-foreground">
            <span>Absence Rate:</span>
            <span class="font-mono font-bold text-foreground">{{ hoveredMonthlyItem.rate }}%</span>
          </div>
        </div>
      </div>

      <div v-else class="p-6 text-center text-xs text-muted-foreground border rounded-xl bg-card">
        No absence occurrences in this time window.
      </div>
    </template>
  </div>
</template>
