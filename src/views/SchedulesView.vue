<script setup lang="ts">
import { Badge } from '@/components/ui/badge'

const schedules = [
  {
    id: 's-1',
    name: 'Standard Office Shift',
    code: 'SH-STD',
    start_time: '08:00 AM',
    end_time: '05:00 PM',
    grace_period_mins: 15,
    break_hours: 1,
    assigned_count: 5,
    location: 'DBB Cebu'
  },
  {
    id: 's-2',
    name: 'Morning Operations Shift',
    code: 'SH-OPS-M',
    start_time: '06:00 AM',
    end_time: '03:00 PM',
    grace_period_mins: 15,
    break_hours: 1,
    assigned_count: 0,
    location: 'DBB Cebu'
  }
]
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground">
          Shift Schedules
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Define work shifts, lunch breaks, and grace period thresholds used for calculating late and undertime.
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        v-for="s in schedules"
        :key="s.id"
        class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3"
      >
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-base text-foreground">{{ s.name }}</h3>
          <Badge variant="outline" class="font-mono text-xs">{{ s.code }}</Badge>
        </div>

        <div class="grid grid-cols-2 gap-3 text-xs border-t pt-3">
          <div>
            <span class="text-muted-foreground text-[11px]">WORKING HOURS</span>
            <div class="font-medium text-foreground mt-0.5">{{ s.start_time }} – {{ s.end_time }}</div>
          </div>
          <div>
            <span class="text-muted-foreground text-[11px]">GRACE PERIOD</span>
            <div class="font-medium text-foreground mt-0.5">{{ s.grace_period_mins }} minutes</div>
          </div>
          <div>
            <span class="text-muted-foreground text-[11px]">LUNCH BREAK</span>
            <div class="font-medium text-foreground mt-0.5">{{ s.break_hours }} hour (Unpaid)</div>
          </div>
          <div>
            <span class="text-muted-foreground text-[11px]">BRANCH</span>
            <div class="font-medium text-foreground mt-0.5">{{ s.location }}</div>
          </div>
        </div>

        <div class="text-[11px] text-muted-foreground pt-1 flex items-center justify-between border-t">
          <span>Assigned Employees: <strong class="text-foreground">{{ s.assigned_count }}</strong></span>
          <span class="text-emerald-600 font-medium">Active Policy</span>
        </div>
      </div>
    </div>
  </div>
</template>
