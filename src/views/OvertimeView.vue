<script setup lang="ts">
import { Badge } from '@/components/ui/badge'

const overtimeRequests = [
  {
    id: 'ot-1',
    employee: 'Villanueva, John Paul',
    biometric_user_id: '31088',
    date: 'Jun 19, 2026',
    hours: '2.5 hrs',
    status: 'Approved',
    purpose: 'Urgent server maintenance'
  }
]
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground">
          Overtime Requests & Pre-approvals
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Audited pre-approvals paired with raw biometric checkout logs to authorize valid overtime hours.
        </p>
      </div>
    </div>

    <div class="rounded-xl border bg-card p-4 space-y-3 shadow-xs">
      <div class="divide-y text-xs">
        <div v-for="ot in overtimeRequests" :key="ot.id" class="py-3 flex items-center justify-between">
          <div>
            <div class="font-medium text-foreground">{{ ot.employee }} (ID: {{ ot.biometric_user_id }})</div>
            <div class="text-[11px] text-muted-foreground">{{ ot.date }} • {{ ot.hours }} • Purpose: {{ ot.purpose }}</div>
          </div>
          <Badge variant="success" class="text-[10px]">{{ ot.status }}</Badge>
        </div>
      </div>
    </div>
  </div>
</template>
