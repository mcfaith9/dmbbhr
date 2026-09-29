<script setup lang="ts">
import { Badge } from '@/components/ui/badge'

const leaves = [
  {
    id: 'lv-1',
    employee: 'Santos, Roberto',
    biometric_user_id: '50366',
    leave_type: 'Vacation Leave',
    dates: 'Jul 15, 2026 – Jul 17, 2026',
    days: 3,
    status: 'Approved',
    reason: 'Family event'
  },
  {
    id: 'lv-2',
    employee: 'Cruz, Maria Elena',
    biometric_user_id: '10244',
    leave_type: 'Sick Leave',
    dates: 'Jun 22, 2026',
    days: 1,
    status: 'Approved',
    reason: 'Medical checkup'
  }
]
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground">
          Leave Management
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Record approved leaves to automatically reconcile absences in daily attendance and payroll periods.
        </p>
      </div>
    </div>

    <div class="rounded-xl border bg-card p-4 space-y-3 shadow-xs">
      <div class="font-semibold text-sm text-foreground">Recent Approved & Pending Leave Requests</div>
      <div class="divide-y text-xs">
        <div v-for="l in leaves" :key="l.id" class="py-3 flex items-center justify-between">
          <div>
            <div class="font-medium text-foreground">{{ l.employee }} (ID: {{ l.biometric_user_id }})</div>
            <div class="text-[11px] text-muted-foreground">{{ l.leave_type }} • {{ l.dates }} ({{ l.days }} day)</div>
            <div class="text-[11px] text-muted-foreground italic mt-0.5">Reason: {{ l.reason }}</div>
          </div>
          <Badge variant="success" class="text-[10px]">{{ l.status }}</Badge>
        </div>
      </div>
    </div>
  </div>
</template>
