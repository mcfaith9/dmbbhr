<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  Users,
  Clock,
  Fingerprint,
  RefreshCw,
  Radio,
} from '@lucide/vue'
import { attendanceService } from '@/services/attendance'
import { liveAttendanceService } from '@/services/liveAttendance'
import type { AttendanceLog } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const recentLogs = ref<AttendanceLog[]>([])
const loading = ref(false)

// Real hardware status from Node agent
const deviceStatus = liveAttendanceService.deviceStatus

// Computed statistics derived dynamically from real attendance logs today
const todayLogs = computed(() => {
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())

  return recentLogs.value.filter(l => {
    const d = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(l.attendance_time))
    return d === todayStr
  })
})

const uniqueUsersToday = computed(() => {
  const set = new Set(todayLogs.value.map(l => l.user_id))
  return set.size
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
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
  } catch {
    return ''
  }
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  } catch {
    return ''
  }
}

let unSubLogs: (() => void) | null = null
let unSubScan: (() => void) | null = null

onMounted(() => {
  loadDashboard()
  liveAttendanceService.connect()
  unSubScan = liveAttendanceService.onScan((scan) => {
    if (!recentLogs.value.some(l => l.id === scan.id)) {
      recentLogs.value.unshift(scan)
    }
  })
  unSubLogs = liveAttendanceService.onLogs(() => {
    loadDashboard()
  })
})

onUnmounted(() => {
  if (unSubScan) unSubScan()
  if (unSubLogs) unSubLogs()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-foreground">
          Biometric Attendance Overview
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

    <!-- Live Hardware & Real Activity Cards (NO FABRICATED NUMBERS) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <!-- Card 1: Real Biometric Hardware Status -->
      <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between text-muted-foreground text-xs font-medium">
          <span>HARDWARE DEVICE STATUS</span>
          <Radio
            class="size-4"
            :class="[
              deviceStatus.status === 'online' ? 'text-emerald-500 animate-pulse' : (deviceStatus.status === 'connecting' ? 'text-amber-500 animate-spin' : 'text-muted-foreground')
            ]"
          />
        </div>
        <div class="mt-3">
          <div class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <span
              :class="[
                'size-2 rounded-full',
                deviceStatus.status === 'online' ? 'bg-emerald-500' : (deviceStatus.status === 'connecting' ? 'bg-amber-500' : 'bg-destructive')
              ]"
            />
            <span>{{ deviceStatus.status === 'online' ? 'B-29b Online' : (deviceStatus.status === 'connecting' ? 'Connecting...' : 'Device Offline') }}</span>
          </div>
          <p class="text-[11px] font-mono text-muted-foreground mt-0.5">
            {{ deviceStatus.ip }}:{{ deviceStatus.port }} • {{ deviceStatus.reason }}
          </p>
        </div>
      </div>

      <!-- Card 2: Real Scans Logged Today -->
      <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between text-muted-foreground text-xs font-medium">
          <span>SCANS LOGGED TODAY</span>
          <Clock class="size-4" />
        </div>
        <div class="mt-3">
          <div class="text-2xl font-bold tracking-tight text-foreground">
            {{ todayLogs.length }}
          </div>
          <p class="text-[11px] text-muted-foreground mt-0.5">
            {{ todayLogs.length === 0 ? 'No attendance records today' : `${todayLogs.length} real scan event(s) recorded` }}
          </p>
        </div>
      </div>

      <!-- Card 3: Unique Users Detected Today -->
      <div class="rounded-xl border bg-card p-4 text-card-foreground shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between text-muted-foreground text-xs font-medium">
          <span>ACTIVE USERS TODAY</span>
          <Users class="size-4" />
        </div>
        <div class="mt-3">
          <div class="text-2xl font-bold tracking-tight text-foreground">
            {{ uniqueUsersToday }}
          </div>
          <p class="text-[11px] text-muted-foreground mt-0.5">
            {{ uniqueUsersToday === 0 ? 'No active users recorded today' : `${uniqueUsersToday} distinct user(s) verified` }}
          </p>
        </div>
      </div>
    </div>

    <!-- Live Real-Time Activity Feed -->
    <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-4">
      <div class="flex items-center justify-between border-b pb-3">
        <div class="flex items-center gap-2">
          <Fingerprint class="size-5 text-primary" />
          <div>
            <h2 class="font-semibold text-sm text-foreground">Recent Biometric Scans</h2>
            <p class="text-xs text-muted-foreground">Live real-time feed from BISMAC BISBIO B-29b</p>
          </div>
        </div>
        <router-link to="/attendance/logs">
          <Button variant="ghost" size="sm" class="h-7 text-xs">
            Open Attendance Logs
          </Button>
        </router-link>
      </div>

      <!-- Empty state when no real scans exist -->
      <div v-if="recentLogs.length === 0" class="py-12 text-center text-muted-foreground space-y-2">
        <Fingerprint class="size-8 mx-auto text-muted-foreground/40" />
        <div class="text-sm font-medium text-foreground">No recent activity</div>
        <p class="text-xs text-muted-foreground max-w-sm mx-auto">
          No attendance records found. Place a finger on the B-29b sensor (192.168.1.201) while the Node.js agent is running to see live events.
        </p>
      </div>

      <!-- Real Scans List -->
      <div v-else class="divide-y text-xs">
        <div
          v-for="log in recentLogs.slice(0, 5)"
          :key="log.id"
          class="py-2.5 flex items-center justify-between"
        >
          <div class="flex items-center gap-3">
            <div class="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-mono font-bold text-xs">
              {{ log.user_id.slice(-2) }}
            </div>
            <div>
              <div class="font-medium text-foreground font-mono">
                User ID: {{ log.user_id }}
                <span v-if="log.employee_name" class="font-sans text-muted-foreground font-normal"> • {{ log.employee_name }}</span>
              </div>
              <div class="text-[11px] text-muted-foreground">
                {{ formatDate(log.attendance_time) }} • {{ formatTime(log.attendance_time) }}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <Badge variant="outline" class="font-mono text-[10px]">
              State: {{ log.state }}
            </Badge>
            <Badge :variant="log.is_duplicate ? 'warning' : 'success'" class="text-[10px]">
              {{ log.is_duplicate ? 'Duplicate' : 'Verified' }}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
