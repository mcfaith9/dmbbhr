<script setup lang="ts">
import { Calendar } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'

const holidays = [
  { id: 'h-1', name: 'Independence Day', date: 'Jun 12, 2026', type: 'Regular Holiday (100% / 200%)' },
  { id: 'h-2', name: 'Ninoy Aquino Day', date: 'Aug 21, 2026', type: 'Special Non-Working (130%)' },
  { id: 'h-3', name: 'National Heroes Day', date: 'Aug 31, 2026', type: 'Regular Holiday (100% / 200%)' },
]
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground">
          Philippine Holiday Calendar
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Regular and Special Non-Working holidays used for payroll overtime premium and unworked holiday pay.
        </p>
      </div>
    </div>

    <div class="rounded-xl border bg-card p-4 space-y-3 shadow-xs">
      <div class="divide-y text-xs">
        <div v-for="h in holidays" :key="h.id" class="py-3 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded bg-muted">
              <Calendar class="size-4 text-foreground" />
            </div>
            <div>
              <div class="font-medium text-foreground">{{ h.name }}</div>
              <div class="text-[11px] text-muted-foreground">{{ h.date }}</div>
            </div>
          </div>
          <Badge variant="outline" class="text-xs">{{ h.type }}</Badge>
        </div>
      </div>
    </div>
  </div>
</template>
