<script setup lang="ts">
import { ref } from 'vue'
import { Clock } from '@lucide/vue'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

const dailyData = ref([
  {
    id: 'd-1',
    biometric_user_id: '5009',
    employee_name: 'K Pasana, Dothy Marie',
    date: 'Jun 18, 2026',
    time_in: '08:02 AM',
    break_out: '12:05 PM',
    break_in: '12:58 PM',
    time_out: '05:15 PM',
    total_hours: '8.1 hrs',
    status: 'Regular Day',
    late_minutes: 0,
    undertime_minutes: 0
  },
  {
    id: 'd-2',
    biometric_user_id: '25013',
    employee_name: 'Alvarez, Kenneth',
    date: 'Jun 18, 2026',
    time_in: '08:25 AM',
    break_out: '12:00 PM',
    break_in: '01:00 PM',
    time_out: '05:30 PM',
    total_hours: '8.0 hrs',
    status: 'Late (10 mins past grace)',
    late_minutes: 10,
    undertime_minutes: 0
  },
  {
    id: 'd-3',
    biometric_user_id: '50366',
    employee_name: 'Santos, Roberto',
    date: 'Jun 18, 2026',
    time_in: '07:54 AM',
    break_out: '12:10 PM',
    break_in: '01:05 PM',
    time_out: '05:01 PM',
    total_hours: '8.0 hrs',
    status: 'Regular Day',
    late_minutes: 0,
    undertime_minutes: 0
  }
])
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground">
          Daily Attendance
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Processed day attendance records derived from raw scans (First IN, Break OUT/IN, Final OUT, Hours Worked).
        </p>
      </div>
      <div class="text-xs px-2.5 py-1 rounded bg-muted font-medium text-foreground">
        Branch: DBB Cebu
      </div>
    </div>

    <!-- Notice Card -->
    <div class="rounded-xl border bg-card p-4 text-xs space-y-1 text-muted-foreground">
      <div class="font-semibold text-foreground flex items-center gap-2">
        <Clock class="size-4 text-primary" />
        Auditable Attendance Engine Principle
      </div>
      <p>
        Raw biometric scans in <strong>Attendance Logs</strong> remain immutable. Daily Attendance parses verified in/out sequences against shift schedules without destructive data overwrite.
      </p>
    </div>

    <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow class="bg-muted/40">
            <TableHead class="font-semibold">User ID</TableHead>
            <TableHead class="font-semibold">Employee Name</TableHead>
            <TableHead class="font-semibold">Date</TableHead>
            <TableHead class="font-semibold">First IN</TableHead>
            <TableHead class="font-semibold">Break OUT</TableHead>
            <TableHead class="font-semibold">Break IN</TableHead>
            <TableHead class="font-semibold">Final OUT</TableHead>
            <TableHead class="font-semibold text-center">Total Hours</TableHead>
            <TableHead class="font-semibold text-right">Remarks</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <TableRow v-for="row in dailyData" :key="row.id">
            <TableCell class="font-mono font-medium">{{ row.biometric_user_id }}</TableCell>
            <TableCell class="font-medium text-foreground">{{ row.employee_name }}</TableCell>
            <TableCell class="text-xs">{{ row.date }}</TableCell>
            <TableCell class="font-mono text-xs text-emerald-600">{{ row.time_in }}</TableCell>
            <TableCell class="font-mono text-xs text-muted-foreground">{{ row.break_out }}</TableCell>
            <TableCell class="font-mono text-xs text-muted-foreground">{{ row.break_in }}</TableCell>
            <TableCell class="font-mono text-xs text-blue-600">{{ row.time_out }}</TableCell>
            <TableCell class="text-center font-mono font-semibold">{{ row.total_hours }}</TableCell>
            <TableCell class="text-right">
              <Badge :variant="row.late_minutes > 0 ? 'warning' : 'outline'" class="text-[10px]">
                {{ row.status }}
              </Badge>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
