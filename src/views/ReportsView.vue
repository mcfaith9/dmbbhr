<script setup lang="ts">
import { FileSpreadsheet, Download } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const reportTypes = [
  {
    title: 'Monthly Biometric Attendance Summary',
    description: 'Comprehensive report showing daily scan times, late counts, and total rendered hours.',
    format: 'Excel / CSV'
  },
  {
    title: 'Tardiness & Undertime Audit',
    description: 'Detailed breakdown of employee late minutes exceeding the 15-minute shift grace period.',
    format: 'Excel'
  },
  {
    title: 'Raw Biometric Device Audit Log',
    description: 'Exact device scan logs including serials, states, types, and device IP for DOLE compliance.',
    format: 'CSV / Excel'
  }
]
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground">
          HR & Attendance Reports
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Generate official HR attendance and payroll verification reports for DBB Cebu.
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div
        v-for="rep in reportTypes"
        :key="rep.title"
        class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs flex flex-col justify-between space-y-4"
      >
        <div>
          <div class="p-2 w-fit rounded-lg bg-primary/10 text-primary mb-3">
            <FileSpreadsheet class="size-5" />
          </div>
          <h3 class="font-semibold text-sm text-foreground">{{ rep.title }}</h3>
          <p class="text-xs text-muted-foreground mt-1">{{ rep.description }}</p>
        </div>

        <div class="pt-3 border-t flex items-center justify-between">
          <span class="text-[11px] text-muted-foreground">Format: {{ rep.format }}</span>
          <router-link to="/attendance/logs">
            <Button size="sm" variant="outline" class="h-7 text-xs gap-1">
              <Download class="size-3" />
              Generate
            </Button>
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>
