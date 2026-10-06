<script setup lang="ts">
import { ref, computed, watch, type HTMLAttributes } from 'vue'
import { Clock, Check, X } from '@lucide/vue'
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
    class?: HTMLAttributes['class']
    align?: 'start' | 'center' | 'end'
  }>(),
  {
    modelValue: '',
    placeholder: 'Select time',
    disabled: false,
    clearable: false,
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

// Standard hours & 5-minute interval options
const hours = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

/**
 * Parses incoming "HH:mm" (24h) or "hh:mm AM/PM" into 12h components
 */
function parseTimeString(timeStr?: string | null) {
  if (!timeStr || !timeStr.trim()) {
    return
  }

  const clean = timeStr.trim().toUpperCase()

  // Match 12h with AM/PM e.g. "8:00 AM" or "08:30 PM"
  const match12 = clean.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i)
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

function setPreset(h24: number, m: number) {
  if (h24 >= 12) {
    selectedPeriod.value = 'PM'
    selectedHour.value = h24 === 12 ? 12 : h24 - 12
  } else {
    selectedPeriod.value = 'AM'
    selectedHour.value = h24 === 0 ? 12 : h24
  }
  selectedMinute.value = m
  updateTime()
}

function handleClear() {
  emit('update:modelValue', '')
  emit('change', '')
}
</script>

<template>
  <Popover v-slot="{ close }">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        :disabled="disabled"
        :class="cn(
          'w-full justify-between text-left font-mono h-8 text-xs font-normal bg-card hover:bg-accent/50 transition-colors',
          !modelValue && 'text-muted-foreground',
          props.class
        )"
      >
        <div class="flex items-center gap-1.5 truncate">
          <Clock class="size-3.5 text-muted-foreground shrink-0" />
          <span class="font-medium text-foreground">
            {{ display12h || placeholder }}
          </span>
          <span v-if="modelValue" class="text-[10px] text-muted-foreground font-sans">
            ({{ get24hString() }})
          </span>
        </div>

        <div class="flex items-center gap-1 shrink-0 ml-1">
          <span
            v-if="clearable && modelValue && !disabled"
            class="p-0.5 rounded-xs hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Clear time"
            @click.stop="handleClear"
          >
            <X class="size-3" />
          </span>
        </div>
      </Button>
    </PopoverTrigger>

    <PopoverContent
      class="w-[280px] p-0 z-[60] bg-popover text-popover-foreground rounded-xl shadow-xl border border-border"
      :align="align"
    >
      <!-- Header display -->
      <div class="p-3 bg-muted/30 border-b border-border flex items-center justify-between">
        <div>
          <div class="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
            Selected Time
          </div>
          <div class="text-lg font-bold font-mono text-foreground flex items-baseline gap-1 mt-0.5">
            <span>{{ String(selectedHour).padStart(2, '0') }}:{{ String(selectedMinute).padStart(2, '0') }}</span>
            <span class="text-xs font-semibold px-1 py-0.5 rounded bg-primary/10 text-primary">
              {{ selectedPeriod }}
            </span>
            <span class="text-[11px] text-muted-foreground font-normal ml-1">
              ({{ get24hString() }} 24h)
            </span>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          class="h-7 text-xs px-2 text-primary font-medium hover:bg-primary/10 cursor-pointer"
          @click="close"
        >
          <Check class="size-3.5 mr-1" />
          Done
        </Button>
      </div>

      <!-- Time Pickers Grid -->
      <div class="p-3 grid grid-cols-3 gap-2">
        <!-- Hours column -->
        <div class="space-y-1">
          <div class="text-[10px] font-semibold text-muted-foreground text-center pb-1">
            HOUR
          </div>
          <div class="h-44 overflow-y-auto pr-1 space-y-1 scrollbar-thin">
            <button
              v-for="h in hours"
              :key="h"
              type="button"
              :class="cn(
                'w-full py-1 rounded-md text-xs font-mono text-center transition-all cursor-pointer',
                selectedHour === h
                  ? 'bg-primary text-primary-foreground font-bold shadow-2xs'
                  : 'text-foreground hover:bg-accent hover:text-accent-foreground'
              )"
              @click="selectHour(h)"
            >
              {{ String(h).padStart(2, '0') }}
            </button>
          </div>
        </div>

        <!-- Minutes column -->
        <div class="space-y-1">
          <div class="text-[10px] font-semibold text-muted-foreground text-center pb-1">
            MINUTE
          </div>
          <div class="h-44 overflow-y-auto pr-1 space-y-1 scrollbar-thin">
            <button
              v-for="m in minutes"
              :key="m"
              type="button"
              :class="cn(
                'w-full py-1 rounded-md text-xs font-mono text-center transition-all cursor-pointer',
                selectedMinute === m
                  ? 'bg-primary text-primary-foreground font-bold shadow-2xs'
                  : 'text-foreground hover:bg-accent hover:text-accent-foreground'
              )"
              @click="selectMinute(m)"
            >
              {{ String(m).padStart(2, '0') }}
            </button>
          </div>
        </div>

        <!-- AM/PM column -->
        <div class="space-y-1 flex flex-col justify-start">
          <div class="text-[10px] font-semibold text-muted-foreground text-center pb-1">
            PERIOD
          </div>
          <div class="space-y-1.5 pt-1">
            <button
              type="button"
              :class="cn(
                'w-full py-2.5 rounded-lg text-xs font-bold text-center transition-all cursor-pointer',
                selectedPeriod === 'AM'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'bg-muted/50 text-muted-foreground hover:bg-accent hover:text-accent-foreground border border-border/50'
              )"
              @click="selectPeriod('AM')"
            >
              AM
            </button>
            <button
              type="button"
              :class="cn(
                'w-full py-2.5 rounded-lg text-xs font-bold text-center transition-all cursor-pointer',
                selectedPeriod === 'PM'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'bg-muted/50 text-muted-foreground hover:bg-accent hover:text-accent-foreground border border-border/50'
              )"
              @click="selectPeriod('PM')"
            >
              PM
            </button>
          </div>

          <!-- Quick Presets -->
          <div class="mt-auto pt-2 border-t border-border space-y-1">
            <div class="text-[9px] text-muted-foreground uppercase font-semibold text-center">
              Quick Presets
            </div>
            <button
              type="button"
              class="w-full py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer"
              @click="setPreset(6, 0)"
            >
              6:00 AM
            </button>
            <button
              type="button"
              class="w-full py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer"
              @click="setPreset(7, 0)"
            >
              7:00 AM
            </button>
            <button
              type="button"
              class="w-full py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer"
              @click="setPreset(8, 0)"
            >
              8:00 AM
            </button>
            <button
              type="button"
              class="w-full py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer"
              @click="setPreset(12, 0)"
            >
              12:00 PM
            </button>
            <button
              type="button"
              class="w-full py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer"
              @click="setPreset(13, 0)"
            >
              1:00 PM
            </button>
            <button
              type="button"
              class="w-full py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer"
              @click="setPreset(17, 0)"
            >
              5:00 PM
            </button>
          </div>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
