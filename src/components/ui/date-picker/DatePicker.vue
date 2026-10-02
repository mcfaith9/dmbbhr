<script setup lang="ts">
import type { DateValue } from '@internationalized/date'
import { DateFormatter, getLocalTimeZone, parseDate, today } from '@internationalized/date'
import { CalendarIcon, X } from '@lucide/vue'
import { ref, watch, type Ref, type HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

const props = withDefaults(defineProps<{
  modelValue?: string | null
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
  class?: HTMLAttributes['class']
  align?: 'start' | 'center' | 'end'
}>(), {
  modelValue: '',
  placeholder: 'Pick a date',
  disabled: false,
  clearable: true,
  align: 'start'
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
}>()

const defaultPlaceholder = today(getLocalTimeZone())
const date = ref() as Ref<DateValue>

if (props.modelValue && props.modelValue.trim()) {
  try {
    date.value = parseDate(props.modelValue.trim())
  } catch {
    // fallback
  }
}

watch(() => props.modelValue, (newVal) => {
  if (!newVal || !newVal.trim()) {
    date.value = undefined as unknown as DateValue
    return
  }
  const currentStr = date.value ? `${date.value.year}-${String(date.value.month).padStart(2, '0')}-${String(date.value.day).padStart(2, '0')}` : ''
  if (currentStr !== newVal.trim()) {
    try {
      date.value = parseDate(newVal.trim())
    } catch {
      // fallback
    }
  }
})

watch(date, (newDate) => {
  const formatted = newDate ? `${newDate.year}-${String(newDate.month).padStart(2, '0')}-${String(newDate.day).padStart(2, '0')}` : ''
  if (formatted !== (props.modelValue || '')) {
    emit('update:modelValue', formatted)
    emit('change', formatted)
  }
})

function handleClear() {
  date.value = undefined as unknown as DateValue
  emit('update:modelValue', '')
  emit('change', '')
}

const df = new DateFormatter('en-US', {
  dateStyle: 'long',
  timeZone: getLocalTimeZone()
})
</script>

<template>
  <Popover v-slot="{ close }">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        :disabled="disabled"
        :class="cn(
          'w-full justify-start text-left font-normal h-8 text-xs shrink-0',
          !date && 'text-muted-foreground',
          props.class
        )"
      >
        <CalendarIcon class="size-3.5 shrink-0 mr-1.5" />
        <span class="truncate flex-1">
          {{ date ? df.format(date.toDate(getLocalTimeZone())) : placeholder }}
        </span>
        <span
          v-if="clearable && date && !disabled"
          class="ml-1 p-0.5 rounded-xs hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
          title="Clear date"
          @click.stop="handleClear"
        >
          <X class="size-3" />
        </span>
      </Button>
    </PopoverTrigger>

    <PopoverContent class="w-auto p-0 z-[60]" :align="align">
      <Calendar
        v-model="date"
        :default-placeholder="defaultPlaceholder"
        layout="month-and-year"
        initial-focus
        @update:model-value="close"
      />
      <div v-if="clearable && date" class="p-1.5 border-t flex justify-end bg-muted/20">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
          @click="handleClear(); close()"
        >
          Clear Date
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
