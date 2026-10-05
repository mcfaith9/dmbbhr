<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import {
  Fingerprint,
  Clock,
  CheckCircle2,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Sparkles,
  UserCheck,
  HardDrive,
  Calendar as CalendarIcon,
  Play
} from '@lucide/vue'
import { punchDisplayService, type PunchDisplayEvent } from '@/services/punchDisplay'
import { liveAttendanceService } from '@/services/liveAttendance'
import { employeeService } from '@/services/employees'
import type { Employee } from '@/types'
import { Button } from '@/components/ui/button'

const currentPunch = punchDisplayService.currentPunch
const punchHistory = punchDisplayService.punchHistory
const isMuted = punchDisplayService.isMuted
const isFullscreen = ref(false)
const employees = ref<Employee[]>([])

// Real-time Manila Clock
const currentTimeStr = ref('')
const currentDateStr = ref('')
let clockTimer: any = null

function updateClock() {
  const now = new Date()
  currentTimeStr.value = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(now)

  currentDateStr.value = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(now)
}

function toggleMute() {
  isMuted.value = !isMuted.value
  if (!isMuted.value) {
    punchDisplayService.playChime()
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().then(() => {
      isFullscreen.value = true
    }).catch(() => {})
  } else {
    document.exitFullscreen().then(() => {
      isFullscreen.value = false
    }).catch(() => {})
  }
}

function formatPunchTime(isoStr: string) {
  try {
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(new Date(isoStr))
  } catch {
    return isoStr
  }
}

function getInitials(name: string): string {
  if (!name) return 'EMP'
  const parts = name.replace(/,/g, '').trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Interactive Test Punch simulation for demo / kiosk testing
async function triggerTestPunch(stateType: number = 1) {
  if (employees.value.length === 0) {
    employees.value = await employeeService.getEmployees()
  }
  
  const pool = employees.value.length > 0 ? employees.value : [
    { biometric_user_id: '50044', employee_number: 'EMP-001', full_name: 'B Basalo, Randy', work_group_id: 'Group A', location: 'DBB Cebu' },
    { biometric_user_id: '50012', employee_number: 'EMP-002', full_name: 'Alfanta, Cristine', work_group_id: 'Normal Crew', location: 'DBB Cebu' },
    { biometric_user_id: '50089', employee_number: 'EMP-003', full_name: 'Dela Cruz, Juan', work_group_id: 'Special Team', location: 'DBB Cebu' }
  ]

  const randomEmp = pool[Math.floor(Math.random() * pool.length)]
  const { label, color } = punchDisplayService.getStateLabelAndColor(stateType)

  const testEvent: PunchDisplayEvent = {
    id: `test-punch-${Date.now()}`,
    userId: String(randomEmp.biometric_user_id),
    employeeName: randomEmp.full_name,
    employeeId: randomEmp.employee_number,
    workGroup: randomEmp.work_group_id || 'Normal Crew',
    department: 'Operations',
    locationName: randomEmp.location || 'DBB Cebu Main',
    deviceName: 'BISMAC BISBIO B-29b',
    timestamp: new Date().toISOString(),
    type: 1, // Fingerprint
    state: stateType,
    stateLabel: label,
    stateColor: color
  }

  punchDisplayService.handleIncomingPunch(testEvent)
}

onMounted(async () => {
  updateClock()
  clockTimer = setInterval(updateClock, 1000)
  try {
    employees.value = await employeeService.getEmployees()
  } catch {
    // ignore
  }

  // Auto-connect to agent if available
  liveAttendanceService.connect()
})

onUnmounted(() => {
  if (clockTimer) {
    clearInterval(clockTimer)
  }
})
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none font-sans overflow-x-hidden">
    <!-- Top Bar / Kiosk Header -->
    <header class="border-b border-slate-800 bg-slate-900/90 backdrop-blur px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-lg">
      <div class="flex items-center gap-3">
        <div class="size-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shadow-inner">
          <Fingerprint class="size-6 text-emerald-400" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="font-black tracking-wider text-base uppercase bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              DMBBHR Biometrics
            </span>
            <span class="text-[10px] uppercase font-mono font-bold tracking-widest px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/80">
              Live Terminal
            </span>
          </div>
          <p class="text-xs text-slate-400 flex items-center gap-1.5">
            <HardDrive class="size-3 text-slate-500" />
            <span>BISMAC BISBIO B-29b • 192.168.1.201:4370</span>
          </p>
        </div>
      </div>

      <!-- Live Clock Display -->
      <div class="flex flex-col items-center justify-center px-4 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 shadow-inner">
        <div class="font-mono text-2xl font-black tracking-widest text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.3)]">
          {{ currentTimeStr }}
        </div>
        <div class="text-[11px] text-slate-400 font-medium tracking-wide flex items-center gap-1">
          <CalendarIcon class="size-3 text-slate-500" />
          {{ currentDateStr }}
        </div>
      </div>

      <!-- Actions & Controls -->
      <div class="flex items-center gap-2">
        <!-- Agent / Channel Status Indicator -->
        <div class="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs">
          <span class="relative flex size-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
          </span>
          <span class="text-slate-300 font-medium font-mono text-[11px]">BROADCAST ACTIVE</span>
        </div>

        <!-- Audio Toggle -->
        <Button
          variant="outline"
          size="sm"
          class="border-slate-700 bg-slate-800/60 hover:bg-slate-700 text-slate-200 hover:text-white size-9 p-0"
          :title="isMuted ? 'Unmute Chime' : 'Mute Chime'"
          @click="toggleMute"
        >
          <Volume2 v-if="!isMuted" class="size-4 text-emerald-400" />
          <VolumeX v-else class="size-4 text-slate-400" />
        </Button>

        <!-- Fullscreen Toggle -->
        <Button
          variant="outline"
          size="sm"
          class="border-slate-700 bg-slate-800/60 hover:bg-slate-700 text-slate-200 hover:text-white size-9 p-0"
          :title="isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'"
          @click="toggleFullscreen"
        >
          <Minimize2 v-if="isFullscreen" class="size-4" />
          <Maximize2 v-else class="size-4" />
        </Button>

        <!-- Demo Test Trigger -->
        <div class="flex items-center gap-1 pl-1">
          <Button
            size="sm"
            class="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-xs gap-1.5 h-9 px-3"
            @click="triggerTestPunch(1)"
          >
            <Sparkles class="size-3.5" />
            <span>Test Punch</span>
          </Button>
        </div>
      </div>
    </header>

    <!-- Main Content Grid -->
    <main class="flex-1 p-6 md:p-8 flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto w-full">
      <!-- Left / Center: Active Real-Time Punch Notification Card -->
      <section class="flex-1 flex flex-col justify-center">
        <!-- Punch Card Active -->
        <div
          v-if="currentPunch"
          class="relative overflow-hidden rounded-3xl border-2 border-emerald-500/50 bg-gradient-to-b from-slate-900/90 via-slate-900/80 to-slate-950 p-8 shadow-[0_0_50px_rgba(16,185,129,0.15)] transition-all animate-in fade-in zoom-in-95 duration-200"
        >
          <!-- Top Accent Light -->
          <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500"></div>

          <div class="flex flex-col md:flex-row items-center gap-8">
            <!-- Large Avatar -->
            <div class="relative shrink-0">
              <div class="size-32 md:size-36 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-1 shadow-xl">
                <div class="size-full rounded-[14px] bg-slate-950 flex items-center justify-center text-3xl font-black text-emerald-400 font-mono tracking-wider">
                  {{ getInitials(currentPunch.employeeName) }}
                </div>
              </div>
              <div class="absolute -bottom-2 -right-2 bg-emerald-500 text-slate-950 rounded-full p-1.5 shadow-lg border-2 border-slate-950">
                <CheckCircle2 class="size-6 text-slate-950 stroke-[3]" />
              </div>
            </div>

            <!-- Employee & Punch Details -->
            <div class="flex-1 text-center md:text-left space-y-3">
              <div class="flex flex-wrap items-center justify-center md:justify-start gap-2">
                <span
                  class="px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider shadow-sm border"
                  :class="[
                    currentPunch.stateColor === 'emerald' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                    currentPunch.stateColor === 'amber' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                    currentPunch.stateColor === 'blue' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' :
                    currentPunch.stateColor === 'purple' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' :
                    'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  ]"
                >
                  {{ currentPunch.stateLabel }}
                </span>
                <span class="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                  BIO ID: {{ currentPunch.userId }}
                </span>
                <span v-if="currentPunch.employeeId" class="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-md bg-slate-800/60 text-slate-400 border border-slate-700/60">
                  EMP: {{ currentPunch.employeeId }}
                </span>
              </div>

              <div>
                <h2 class="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
                  {{ currentPunch.employeeName }}
                </h2>
                <p class="text-sm text-slate-400 font-medium mt-1 flex items-center justify-center md:justify-start gap-2">
                  <span>{{ currentPunch.workGroup || 'Standard Crew' }}</span>
                  <span class="text-slate-600">•</span>
                  <span class="text-emerald-400">{{ currentPunch.locationName || 'DBB Cebu Main' }}</span>
                </p>
              </div>

              <!-- Time of Punch Callout -->
              <div class="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-4">
                <div class="bg-slate-950/80 px-4 py-2 rounded-xl border border-slate-800">
                  <span class="text-[10px] text-slate-400 uppercase tracking-widest font-mono block">Punch Time</span>
                  <span class="font-mono text-xl font-black text-emerald-300">
                    {{ formatPunchTime(currentPunch.timestamp) }}
                  </span>
                </div>
                <div class="bg-slate-950/80 px-4 py-2 rounded-xl border border-slate-800">
                  <span class="text-[10px] text-slate-400 uppercase tracking-widest font-mono block">Verification</span>
                  <span class="text-xs font-bold text-slate-200 flex items-center gap-1.5 mt-0.5">
                    <Fingerprint class="size-3.5 text-emerald-400" />
                    Biometric Scanner
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Idle Waiting Screen -->
        <div
          v-else
          class="rounded-3xl border border-slate-800/80 bg-slate-900/40 p-12 text-center flex flex-col items-center justify-center space-y-5"
        >
          <div class="relative size-28 rounded-full bg-slate-800/50 border border-slate-700/80 flex items-center justify-center shadow-inner">
            <Fingerprint class="size-14 text-emerald-500/70 animate-pulse" />
          </div>
          <div class="space-y-1.5">
            <h3 class="text-2xl font-bold text-white tracking-tight">
              Ready for Biometric Punch
            </h3>
            <p class="text-sm text-slate-400 max-w-md mx-auto">
              Place your registered finger on the biometric scanner terminal. The attendance record will instantly appear here.
            </p>
          </div>
          <div class="flex items-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              class="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white text-xs gap-1.5"
              @click="triggerTestPunch(1)"
            >
              <Play class="size-3 text-emerald-400" />
              <span>Simulate Time In</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white text-xs gap-1.5"
              @click="triggerTestPunch(4)"
            >
              <Play class="size-3 text-rose-400" />
              <span>Simulate Time Out</span>
            </Button>
          </div>
        </div>
      </section>

      <!-- Right: Recent Live Punches Session Stream -->
      <aside class="w-full lg:w-96 flex flex-col rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur p-5 shrink-0 shadow-lg">
        <div class="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
          <div class="flex items-center gap-2">
            <Clock class="size-4 text-emerald-400" />
            <h4 class="text-sm font-bold text-white uppercase tracking-wider">
              Recent Punches
            </h4>
          </div>
          <span class="text-[11px] font-mono text-slate-400">
            {{ punchHistory.length }} recorded
          </span>
        </div>

        <div v-if="punchHistory.length === 0" class="flex-1 flex flex-col items-center justify-center py-12 text-center text-slate-500">
          <UserCheck class="size-8 stroke-1 mb-2 opacity-50" />
          <p class="text-xs">No punches in this session yet</p>
        </div>

        <div v-else class="space-y-2 overflow-y-auto max-h-[480px] pr-1">
          <div
            v-for="punch in punchHistory"
            :key="punch.id"
            class="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition-colors flex items-center justify-between gap-3"
          >
            <div class="min-w-0">
              <div class="text-xs font-bold text-white truncate">
                {{ punch.employeeName }}
              </div>
              <div class="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span class="font-mono text-slate-300">#{{ punch.userId }}</span>
                <span>•</span>
                <span>{{ punch.workGroup }}</span>
              </div>
            </div>

            <div class="text-right shrink-0">
              <span
                class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider inline-block mb-1"
                :class="[
                  punch.stateColor === 'emerald' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                  punch.stateColor === 'amber' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                  punch.stateColor === 'blue' ? 'bg-blue-950 text-blue-300 border border-blue-800' :
                  punch.stateColor === 'purple' ? 'bg-purple-950 text-purple-300 border border-purple-800' :
                  'bg-rose-950 text-rose-300 border border-rose-800'
                ]"
              >
                {{ punch.stateLabel }}
              </span>
              <div class="text-[10px] font-mono text-slate-400">
                {{ formatPunchTime(punch.timestamp) }}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </main>

    <!-- Footer Status -->
    <footer class="border-t border-slate-800/80 bg-slate-950 px-6 py-2.5 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2 shrink-0">
      <div class="flex items-center gap-2">
        <span class="size-2 rounded-full bg-emerald-500 inline-block"></span>
        <span>Biometric Punch Channel Connected</span>
      </div>
      <div class="font-mono text-[11px]">
        DMBBHR High-Performance Attendance Engine
      </div>
    </footer>
  </div>
</template>
