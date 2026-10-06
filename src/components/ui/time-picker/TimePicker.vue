<script setup lang="ts">
import { ref, computed, watch, nextTick, type HTMLAttributes } from 'vue'
import { Clock, Check, X, ChevronDown } from '@lucide/vue'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'

const props = withDefaults(
  defineProps<{
    modelValue?: string | null
    placeholder?: string
    disabled?: boolean
    clearable?: boolean
    show24hBadge?: boolean
    class?: HTMLAttributes['class']
    align?: 'start' | 'center' | 'end'
  }>(),
  {
    modelValue: '',
    placeholder: 'Select time',
    disabled: false,
    clearable: false,
    show24hBadge: false,
    align: 'start'
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
}>()

// Internal 12-hour state
const selectedHour = ref<number>(8) // 1 - 12
const selectedMinute = ref<number>(0) // 0 - 59
const selectedPeriod = ref<'AM' | 'PM'>('AM')

// Standard hours (1 to 12)
const hours = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

// Base 5-minute interval options
const baseMinutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

// Quick Presets (3 cols x 2 rows)
const presets = [
  { label: '6:00 AM', h24: 6, m: 0 },
  { label: '7:00 AM', h24: 7, m: 0 },
  { label: '8:00 AM', h24: 8, m: 0 },
  { label: '12:00 PM', h24: 12, m: 0 },
  { label: '1:00 PM', h24: 13, m: 0 },
  { label: '5:00 PM', h24: 17, m: 0 }
]

// Refs for scroll containers
const hourScrollRef = ref<HTMLElement | null>(null)
const minuteScrollRef = ref<HTMLElement | null>(null)

// Include current minute if it is an exact odd minute (e.g. from raw punch 8:07 AM)
const displayMinutes = computed(() => {
  if (selectedMinute.value !== undefined && !baseMinutes.includes(selectedMinute.value)) {
    return [...baseMinutes, selectedMinute.value].sort((a, b) => a - b)
  }
  return baseMinutes
})

/**
 * Parses incoming "HH:mm" (24h) or "hh:mm AM/PM" into 12h components
 */
function parseTimeString(timeStr?: string | null) {
  if (!timeStr || !timeStr.trim()) {
    return
  }

  const clean = timeStr.trim().toUpperCase()

  // Match 12h with AM/PM e.g. "8:00 AM" or "08:30 PM"
  const match12 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM))?$/i)
  if (match12) {
    let h = parseInt(match12[1], 10)
    const m = parseInt(match12[2], 10)
    const p = match12[3] as 'AM' | 'PM' | undefined

    if (p) {
      selectedHour.value = h >= 1 && h <= 12 ? h : 12
      selectedMinute.value = m >= 0 && m <= 59 ? m : 0
      selectedPeriod.value = p === 'PM' ? 'PM' : 'AM'
      return
    }

    // Otherwise treated as 24h: e.g. "13:00" -> 1:00 PM
    if (h >= 12) {
      selectedPeriod.value = 'PM'
      selectedHour.value = h === 12 ? 12 : h - 12
    } else {
      selectedPeriod.value = 'AM'
      selectedHour.value = h === 0 ? 12 : h
    }
    selectedMinute.value = m >= 0 && m <= 59 ? m : 0
  }
}

// Initialize from prop
parseTimeString(props.modelValue)

watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal) {
      parseTimeString(newVal)
    }
  }
)

/**
 * Formats current state back to standard 24h "HH:mm" string
 */
function get24hString(): string {
  let h = selectedHour.value
  if (selectedPeriod.value === 'AM') {
    if (h === 12) h = 0
  } else {
    if (h !== 12) h += 12
  }
  const hh = String(h).padStart(2, '0')
  const mm = String(selectedMinute.value).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Formats current state to user-friendly 12h display e.g. "08:00 AM"
 */
const display12h = computed(() => {
  if (!props.modelValue || !props.modelValue.trim()) {
    return ''
  }
  const hh = String(selectedHour.value).padStart(2, '0')
  const mm = String(selectedMinute.value).padStart(2, '0')
  return `${hh}:${mm} ${selectedPeriod.value}`
})

function updateTime() {
  const formatted24h = get24hString()
  emit('update:modelValue', formatted24h)
  emit('change', formatted24h)
}

function selectHour(h: number) {
  selectedHour.value = h
  updateTime()
}

function selectMinute(m: number) {
  selectedMinute.value = m
  updateTime()
}

function selectPeriod(p: 'AM' | 'PM') {
  selectedPeriod.value = p
  updateTime()
}

function applyPreset(h24: number, m: number) {
  if (h24 >= 12) {
    selectedPeriod.value = 'PM'
    selectedHour.value = h24 === 12 ? 12 : h24 - 12
  } else {
    selectedPeriod.value = 'AM'
    selectedHour.value = h24 === 0 ? 12 : h24
  }
  selectedMinute.value = m
  updateTime()
  scrollToActive()
}

function handleClear() {
  emit('update:modelValue', '')
  emit('change', '')
}

function scrollToActive() {
  nextTick(() => {
    setTimeout(() => {
      const activeHourEl = hourScrollRef.value?.querySelector('.is-selected') as HTMLElement | null
      if (activeHourEl && hourScrollRef.value) {
        hourScrollRef.value.scrollTop = activeHourEl.offsetTop - hourScrollRef.value.offsetTop - 40
      }
      const activeMinuteEl = minuteScrollRef.value?.querySelector('.is-selected') as HTMLElement | null
      if (activeMinuteEl && minuteScrollRef.value) {
        minuteScrollRef.value.scrollTop = activeMinuteEl.offsetTop - minuteScrollRef.value.offsetTop - 40
      }
    }, 30)
  })
}

function onOpenChange(open: boolean) {
  if (open) {
    parseTimeString(props.modelValue)
    scrollToActive()
  }
}
</script>

<template>
  <Popover v-slot="{ close }" @update:open="onOpenChange">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        :disabled="disabled"
        :class="cn(
          'w-full justify-between text-left font-mono h-8 text-xs font-normal bg-card hover:bg-accent/50 transition-colors cursor-pointer',
          !modelValue && 'text-muted-foreground',
          props.class
        )"
      >
        <div class="flex items-center gap-1.5 truncate">
          <Clock class="size-3.5 text-muted-foreground shrink-0" />
          <span class="font-medium text-foreground">
            {{ display12h || placeholder }}
          </span>
          <span v-if="modelValue && show24hBadge" class="text-[10px] text-muted-foreground font-sans">
            ({{ get24hString() }})
          </span>
        </div>

        <div class="flex items-center gap-1 shrink-0 ml-1">
          <span
            v-if="clearable && modelValue && !disabled"
            class="p-0.5 rounded-xs hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            title="Clear time"
            @click.stop="handleClear"
          >
            <X class="size-3" />
          </span>
          <ChevronDown class="size-3 text-muted-foreground shrink-0 opacity-70" />
        </div>
      </Button>
    </PopoverTrigger>

    <PopoverContent
      class="w-[280px] p-0 z-[60] bg-popover text-popover-foreground rounded-xl shadow-xl border border-border overflow-hidden"
      :align="align"
    >
      <!-- Header bar with selected time summary -->
      <div class="px-3 py-2 bg-muted/40 border-b border-border flex items-center justify-between">
        <div class="flex items-center gap-1.5">
          <Clock class="size-3.5 text-primary shrink-0" />
          <div class="flex items-baseline gap-1 font-mono">
            <span class="text-sm font-bold text-foreground">
              {{ String(selectedHour).padStart(2, '0') }}:{{ String(selectedMinute).padStart(2, '0') }}
            </span>
            <span class="text-[11px] font-bold text-primary px-1 py-0.2 rounded bg-primary/10">
              {{ selectedPeriod }}
            </span>
            <span class="text-[10px] text-muted-foreground font-sans ml-1">
              ({{ get24hString() }})
            </span>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          class="h-6 text-[11px] px-2 text-primary font-semibold hover:bg-primary/10 cursor-pointer"
          @click="close"
        >
          <Check class="size-3 mr-1" />
          Done
        </Button>
      </div>

      <!-- Main Content Area -->
      <div class="p-3">
        <!-- Three Balanced Columns (Hour, Minute, Period) -->
        <div class="grid grid-cols-3 gap-2">
          <!-- 1. Hour Column -->
          <div class="flex flex-col">
            <div class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center pb-1.5">
              Hour
            </div>
            <div
              ref="hourScrollRef"
              class="h-[180px] overflow-y-auto pr-0.5 [scrollbar-width:thin] [scrollbar-color:hsl(var(--muted-foreground)/0.25)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/25 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/45"
            >
              <button
                v-for="h in hours"
                :key="h"
                type="button"
                :class="cn(
                  'w-full h-6 rounded-md text-xs font-mono font-medium flex items-center justify-center transition-colors cursor-pointer select-none',
                  selectedHour === h
                    ? 'is-selected bg-primary text-primary-foreground font-bold shadow-2xs'
                    : 'text-foreground hover:bg-muted'
                )"
                @click="selectHour(h)"
              >
                {{ String(h).padStart(2, '0') }}
              </button>
            </div>
          </div>

          <!-- 2. Minute Column -->
          <div class="flex flex-col">
            <div class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center pb-1.5">
              Minute
            </div>
            <div
              ref="minuteScrollRef"
              class="h-[180px] overflow-y-auto pr-0.5 [scrollbar-width:thin] [scrollbar-color:hsl(var(--muted-foreground)/0.25)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/25 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/45"
            >
              <button
                v-for="m in displayMinutes"
                :key="m"
                type="button"
                :class="cn(
                  'w-full h-6 rounded-md text-xs font-mono font-medium flex items-center justify-center transition-colors cursor-pointer select-none',
                  selectedMinute === m
                    ? 'is-selected bg-primary text-primary-foreground font-bold shadow-2xs'
                    : 'text-foreground hover:bg-muted'
                )"
                @click="selectMinute(m)"
              >
                {{ String(m).padStart(2, '0') }}
              </button>
            </div>
          </div>

          <!-- 3. Period Column (AM/PM) -->
          <div class="flex flex-col">
            <div class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center pb-1.5">
              Period
            </div>
            <div class="space-y-2">
              <button
                type="button"
                :class="cn(
                  'w-full h-9 rounded-md text-xs font-bold flex items-center justify-center transition-all cursor-pointer select-none',
                  selectedPeriod === 'AM'
                    ? 'bg-primary text-primary-foreground shadow-2xs font-bold'
                    : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60'
                )"
                @click="selectPeriod('AM')"
              >
                AM
              </button>
              <button
                type="button"
                :class="cn(
                  'w-full h-9 rounded-md text-xs font-bold flex items-center justify-center transition-all cursor-pointer select-none',
                  selectedPeriod === 'PM'
                    ? 'bg-primary text-primary-foreground shadow-2xs font-bold'
                    : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60'
                )"
                @click="selectPeriod('PM')"
              >
                PM
              </button>
            </div>
          </div>
        </div>

        <!-- Quick Presets below the 3 columns -->
        <div class="border-t border-border pt-2.5 mt-3">
          <div class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Quick Presets
          </div>
          <div class="grid grid-cols-3 gap-1.5">
            <button
              v-for="p in presets"
              :key="p.label"
              type="button"
              class="h-6 px-1.5 text-[11px] font-mono font-medium rounded-md border border-border/70 bg-muted/40 hover:bg-accent hover:text-accent-foreground text-foreground transition-colors cursor-pointer flex items-center justify-center shadow-2xs"
              @click="applyPreset(p.h24, p.m)"
            >
              {{ p.label }}
            </button>
          </div>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
