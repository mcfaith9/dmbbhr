<script setup lang="ts">
import { Badge } from '@/components/ui/badge'

const periods = [
  {
    id: 'pp-1',
    name: 'June 2026 - First Half (1-15)',
    start_date: 'Jun 1, 2026',
    end_date: 'Jun 15, 2026',
    status: 'Closed & Audited',
    payout_date: 'Jun 20, 2026',
    total_net: '₱142,500.00'
  },
  {
    id: 'pp-2',
    name: 'June 2026 - Second Half (16-30)',
    start_date: 'Jun 16, 2026',
    end_date: 'Jun 30, 2026',
    status: 'Ready for Processing',
    payout_date: 'Jul 5, 2026',
    total_net: 'Pending Batch Run'
  }
]
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground">
          Payroll Cut-Off Periods
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Semi-monthly cutoff dates linking Daily Attendance, Late/Undertime, and Overtime directly into payroll batches.
        </p>
      </div>
    </div>

    <div class="rounded-xl border bg-card p-4 space-y-3 shadow-xs">
      <div class="divide-y text-xs">
        <div v-for="p in periods" :key="p.id" class="py-3 flex items-center justify-between">
          <div>
            <div class="font-medium text-foreground text-sm">{{ p.name }}</div>
            <div class="text-[11px] text-muted-foreground mt-0.5">
              Period: {{ p.start_date }} → {{ p.end_date }} • Payout: {{ p.payout_date }}
            </div>
          </div>
          <div class="text-right space-y-1">
            <Badge :variant="p.status.includes('Closed') ? 'secondary' : 'default'" class="text-[10px]">
              {{ p.status }}
            </Badge>
            <div class="font-mono text-xs font-semibold text-foreground">{{ p.total_net }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
