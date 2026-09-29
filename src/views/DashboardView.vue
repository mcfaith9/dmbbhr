<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  Users,
  Clock,
  Fingerprint,
  ArrowUpRight,
  AlertTriangle,
  RefreshCw,
} from '@lucide/vue'
import { attendanceService } from '@/services/attendance'
import type { AttendanceLog } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const recentLogs = ref<AttendanceLog[]>([])
const loading = ref(false)

const stats = ref({
  totalToday: 6,
  present: 5,
  late: 1,
  currentlyIn: 4,
  currentlyOut: 1,
  activeDevices: 1
})

async function loadDashboard() {
  loading.value = true
  try {
    const res = await attendanceService.getLogs({ page: 1, pageSize: 6 })
    recentLogs.value = res.logs
  } finally {
    loading.value = false
  }
}

function formatTime(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
  } catch {
    return ''
  }
}

onMounted(() => {
  loadDashboard()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-foreground">
          Attendance & Payroll Dashboard
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Local Biometric Attendance Network • Location: <strong>DBB Cebu</strong>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" class="h-8 gap-1.5" @click="loadDashboard">
          <RefreshCw :class="['size-3.5', loading ? 'animate-spin' : '']" />
          <span class="text-xs">Refresh</span>
        </Button>
        <router-link to="/attendance/logs">
          <Button size="sm" class="h-8 text-xs">
            View All Scans
          </Button>
        </router-link>
      </div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between text-muted-foreground text-xs font-medium">
          <span>PRESENT TODAY</span>
          <Users class="size-4" />
        </div>
        <div class="mt-3">
          <div class="text-2xl font-bold tracking-tight text-foreground">{{ stats.present }} Employees</div>
          <p class="text-[11px] text-muted-foreground mt-0.5">Out of 5 scheduled today</p>
        </div>
      </div>

      <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between text-muted-foreground text-xs font-medium">
          <span>CURRENTLY IN</span>
          <Clock class="size-4" />
        </div>
        <div class="mt-3">
          <div class="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
            {{ stats.currentlyIn }} On-site
          </div>
          <p class="text-[11px] text-muted-foreground mt-0.5">DBB Cebu Operations</p>
        </div>
      </div>

      <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between text-muted-foreground text-xs font-medium">
          <span>LATE ARRIVALS</span>
          <AlertTriangle class="size-4 text-amber-500" />
        </div>
        <div class="mt-3">
          <div class="text-2xl font-bold tracking-tight text-foreground">{{ stats.late }} Staff</div>
          <p class="text-[11px] text-muted-foreground mt-0.5">Grace period: 15 minutes</p>
        </div>
      </div>

      <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between text-muted-foreground text-xs font-medium">
          <span>BIOMETRIC READER</span>
          <Fingerprint class="size-4 text-emerald-500" />
        </div>
        <div class="mt-3">
          <div class="text-2xl font-bold tracking-tight text-foreground flex items-center gap-1.5">
            <span class="size-2 rounded-full bg-emerald-500" />
            B-29b Online
          </div>
          <p class="text-[11px] font-mono text-muted-foreground mt-0.5">192.168.1.201:4370</p>
        </div>
      </div>
    </div>

    <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
        <div class="flex items-center gap-2">
          <div class="p-2 rounded-lg bg-primary/10 text-primary">
            <Fingerprint class="size-5" />
          </div>
          <div>
            <h3 class="font-semibold text-sm text-foreground">BISMAC BISBIO B-29b Local Agent</h3>
            <p class="text-xs text-muted-foreground">TCP/IP Listener running on node agent • Target IP: 192.168.1.201</p>
          </div>
        </div>
        <router-link to="/devices">
          <Button variant="outline" size="sm" class="h-7 text-xs">
            Manage Devices & Logs
          </Button>
        </router-link>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div class="p-3 rounded-lg border bg-muted/30">
          <div class="text-muted-foreground text-[11px]">SERIAL NUMBER</div>
          <div class="font-mono font-medium text-foreground mt-0.5">0476141400046</div>
        </div>
        <div class="p-3 rounded-lg border bg-muted/30">
          <div class="text-muted-foreground text-[11px]">REAL-TIME LISTENER</div>
          <div class="font-medium text-emerald-600 mt-0.5 flex items-center gap-1">
            <span class="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            device.getRealTimeLogs() Ready
          </div>
        </div>
        <div class="p-3 rounded-lg border bg-muted/30">
          <div class="text-muted-foreground text-[11px]">TIMEZONE</div>
          <div class="font-medium text-foreground mt-0.5">Asia/Manila (Philippine Standard Time)</div>
        </div>
      </div>
    </div>

    <div class="rounded-xl border bg-card shadow-xs">
      <div class="flex items-center justify-between p-4 border-b">
        <div>
          <h3 class="font-semibold text-sm text-foreground">Recent Biometric Scans</h3>
          <p class="text-xs text-muted-foreground">Live feed from device storage & real-time events</p>
        </div>
        <router-link to="/attendance/logs" class="text-xs text-primary font-medium hover:underline flex items-center gap-1">
          Full Log Table <ArrowUpRight class="size-3" />
        </router-link>
      </div>

      <div class="divide-y text-xs">
        <div
          v-for="log in recentLogs"
          :key="log.id"
          class="p-3.5 flex items-center justify-between hover:bg-muted/30 transition-colors"
        >
          <div class="flex items-center gap-3">
            <div class="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-mono font-semibold text-xs">
              {{ log.user_id.slice(-2) }}
            </div>
            <div>
              <div class="font-medium text-foreground flex items-center gap-2">
                <span>{{ log.employee_name || 'Biometric User ' + log.user_id }}</span>
                <span class="text-[10px] font-mono text-muted-foreground">ID: {{ log.user_id }}</span>
              </div>
              <div class="text-[11px] text-muted-foreground flex items-center gap-2">
                <span>Serial: {{ log.serial_number }}</span>
                <span>•</span>
                <span>Type: {{ log.type }}</span>
                <span>•</span>
                <span>State: {{ log.state }}</span>
              </div>
            </div>
          </div>

          <div class="text-right">
            <div class="font-mono text-xs font-semibold text-foreground">
              {{ formatTime(log.attendance_time) }}
            </div>
            <Badge v-if="log.is_duplicate" variant="warning" class="text-[9px] mt-0.5">
              Duplicate Flag
            </Badge>
            <span v-else class="text-[10px] text-emerald-600 font-medium">
              Verified
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
