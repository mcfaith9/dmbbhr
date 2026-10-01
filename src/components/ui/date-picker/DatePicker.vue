<script setup lang="ts">
import type { DateValue } from '@internationalized/date'
import { DateFormatter, getLocalTimeZone, parseDate, today } from '@internationalized/date'
import { CalendarIcon } from '@lucide/vue'
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
  class?: HTMLAttributes['class']
  align?: 'start' | 'center' | 'end'
}>(), {
  modelValue: '',
  placeholder: 'Pick a date',
  disabled: false,
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

const df = new DateFormatter('en-US', {
  dateStyle: 'long',
})
</script>

<template>
  <Popover v-slot="{ close }">
    <PopoverTrigger as-child>
      <Button
        variant="outline"
        :disabled="disabled"
        :class="cn(
          'w-[220px] max-w-full justify-start text-left font-normal h-8 text-xs shrink-0',
          !date && 'text-muted-foreground',
          props.class
        )"
      >
        <CalendarIcon class="size-3.5 shrink-0 mr-1.5" />
        <span class="truncate">
          {{ date ? df.format(date.toDate(getLocalTimeZone())) : placeholder }}
        </span>
      </Button>
    </PopoverTrigger>

    <PopoverContent class="w-auto p-0" :align="align">
      <Calendar
        v-model="date"
        :default-placeholder="defaultPlaceholder"
        layout="month-and-year"
        initial-focus
        @update:model-value="close"
      />
    </PopoverContent>
  </Popover>
</template>
