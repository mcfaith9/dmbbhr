<script setup lang="ts">
import { Download } from '@lucide/vue'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'

const records = [
  {
    employee: 'Cabigas Marc Louie',
    id: '25065',
    basic_pay: '₱180,000.00',
    worked_days: '11 days',
    late_deduction: '₱0.00',
    gross_pay: '₱180,000.00',
    net_pay: '₱160,740.00',
    status: 'Audited'
  },
]
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground">
          Payroll Records
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Audited payroll summaries computed in the Laravel backend from approved daily attendance hours.
        </p>
      </div>
      <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs">
        <Download class="size-3.5" />
        Export Payslips
      </Button>
    </div>

    <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow class="bg-muted/40">
            <TableHead class="font-semibold">User ID</TableHead>
            <TableHead class="font-semibold">Employee Name</TableHead>
            <TableHead class="font-semibold">Basic Pay (Period)</TableHead>
            <TableHead class="font-semibold">Attendance Days</TableHead>
            <TableHead class="font-semibold">Tardiness / Late</TableHead>
            <TableHead class="font-semibold">Gross Pay</TableHead>
            <TableHead class="font-semibold text-right">Net Pay</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <TableRow v-for="r in records" :key="r.id">
            <TableCell class="font-mono text-xs">{{ r.id }}</TableCell>
            <TableCell class="font-medium text-foreground">{{ r.employee }}</TableCell>
            <TableCell class="font-mono text-xs">{{ r.basic_pay }}</TableCell>
            <TableCell class="text-xs">{{ r.worked_days }}</TableCell>
            <TableCell class="font-mono text-xs text-destructive">{{ r.late_deduction }}</TableCell>
            <TableCell class="font-mono text-xs">{{ r.gross_pay }}</TableCell>
            <TableCell class="font-mono text-xs font-bold text-right text-emerald-600">{{ r.net_pay }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
