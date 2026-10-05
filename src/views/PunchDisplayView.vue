<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import {
  Fingerprint,
  Clock,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Sliders,
  Calendar as CalendarIcon,
  Play,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Server,
  User,
  History,
  PowerOff
} from '@lucide/vue'
import { punchDisplayService, normalizeBioId } from '@/services/punchDisplay'
import { liveAttendanceService } from '@/services/liveAttendance'
import { employeeService } from '@/services/employees'
import type { Employee, WorkGroup, AttendanceLog } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

const currentPunch = punchDisplayService.currentPunch
const recentPunches = punchDisplayService.recentPunches
const settings = punchDisplayService.settings
const isFullscreen = ref(false)
const showSettingsDialog = ref(false)

const employees = ref<Employee[]>([])
const workGroups = ref<WorkGroup[]>([])

// Temporary form settings for Dialog
const formEnabled = ref(settings.value.enabled)
const formDuration = ref(String(settings.value.displayDurationSeconds || 5))
const formSound = ref(settings.value.soundEnabled)
const formConfetti = ref(settings.value.confettiEnabled)
const formLateVisual = ref(settings.value.lateVisualEnabled)
const formLateImageUrl = ref(settings.value.customLateImageUrl)

// Real-time Clock in Manila / Local Time
const currentTimeStr = ref('')
const currentDateStr = ref('')
let clockTimer: any = null

// Auto-dismiss timer & progress bar
let dismissTimer: any = null
const dismissProgress = ref(100)
let dismissProgressInterval: any = null
const photoLoadError = ref(false)

// Canvas Confetti
const canvasRef = ref<HTMLCanvasElement | null>(null)
let confettiAnimationId: any = null

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

function toggleSound() {
  const nextVal = !settings.value.soundEnabled
  punchDisplayService.saveSettings({ soundEnabled: nextVal })
  if (nextVal) {
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

function openSettings() {
  formEnabled.value = settings.value.enabled
  formDuration.value = String(settings.value.displayDurationSeconds || 5)
  formSound.value = settings.value.soundEnabled
  formConfetti.value = settings.value.confettiEnabled
  formLateVisual.value = settings.value.lateVisualEnabled
  formLateImageUrl.value = settings.value.customLateImageUrl
  showSettingsDialog.value = true
}

function saveSettings() {
  punchDisplayService.saveSettings({
    enabled: formEnabled.value,
    displayDurationSeconds: parseInt(formDuration.value, 10) || 5,
    soundEnabled: formSound.value,
    confettiEnabled: formConfetti.value,
    lateVisualEnabled: formLateVisual.value,
    customLateImageUrl: formLateImageUrl.value.trim()
  })
  showSettingsDialog.value = false
}

function formatPunchTime(isoStr: string) {
  try {
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(new Date(isoStr))
  } catch {
    return isoStr
  }
}

function formatPunchDate(isoStr: string) {
  try {
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(isoStr))
  } catch {
    return isoStr
  }
}

// Lightweight, graceful confetti burst for qualifying on-time/early IN punches
function triggerSubtleConfetti() {
  if (!settings.value.confettiEnabled || !canvasRef.value) return

  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = window.innerWidth
  canvas.height = window.innerHeight

  const particles: Array<{
    x: number
    y: number
    vx: number
    vy: number
    color: string
    size: number
    rotation: number
    vRot: number
    opacity: number
  }> = []

  const colors = ['#10b981', '#34d399', '#059669', '#3b82f6', '#f59e0b', '#6366f1']
  const count = 35

  for (let i = 0; i < count; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height * 0.45 + (Math.random() - 0.5) * 50,
      vx: (Math.random() - 0.5) * 8,
      vy: -Math.random() * 7 - 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 6 + 4,
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 10,
      opacity: 1
    })
  }

  const startTime = Date.now()
  const duration = 2200 // 2.2 seconds

  function animate() {
    if (!ctx || !canvas) return
    const elapsed = Date.now() - startTime
    if (elapsed > duration) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const progress = elapsed / duration
    const globalAlpha = 1 - progress

    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.2 // gravity
      p.rotation += p.vRot

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate((p.rotation * Math.PI) / 180)
      ctx.globalAlpha = Math.max(0, globalAlpha * p.opacity)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7)
      ctx.restore()
    }

    confettiAnimationId = requestAnimationFrame(animate)
  }

  if (confettiAnimationId) {
    cancelAnimationFrame(confettiAnimationId)
  }
  confettiAnimationId = requestAnimationFrame(animate)
}

function cancelDisplayTimer() {
  if (dismissTimer) {
    clearTimeout(dismissTimer)
    dismissTimer = null
  }
  if (dismissProgressInterval) {
    clearInterval(dismissProgressInterval)
    dismissProgressInterval = null
  }
}

function startDisplayTimer() {
  cancelDisplayTimer()

  const durationSec = settings.value.displayDurationSeconds || 5
  if (durationSec > 0 && currentPunch.value) {
    const totalMs = durationSec * 1000
    const start = Date.now()
    dismissProgress.value = 100

    dismissProgressInterval = setInterval(() => {
      const elapsed = Date.now() - start
      dismissProgress.value = Math.max(0, 100 - (elapsed / totalMs) * 100)
    }, 50)

    dismissTimer = setTimeout(() => {
      currentPunch.value = null
      cancelDisplayTimer()
    }, totalMs)
  }
}

// Watch incoming punch to handle immediate replacement and timer reset
watch(
  () => currentPunch.value?.eventId || currentPunch.value?.id,
  (newEventId) => {
    cancelDisplayTimer()
    photoLoadError.value = false

    if (!newEventId || !currentPunch.value) {
      dismissProgress.value = 100
      return
    }

    const punch = currentPunch.value

    // Trigger celebration only for qualifying positive IN (early / on-time)
    if (
      settings.value.confettiEnabled &&
      !punch.isLate &&
      (punch.statusCategory === 'early' || punch.statusCategory === 'on_time') &&
      punch.direction === 'IN'
    ) {
      triggerSubtleConfetti()
    }

    // Start fresh display timer for this punch
    startDisplayTimer()
  }
)

// Internal test counter to produce incrementing seconds for demo tests
let testSeq = 0

// Interactive Test Punch simulation for demo & comprehensive test verification
async function triggerTestPunch(
  scenario: 'late_in' | 'ontime_in' | 'early_in' | 'normal_out' | 'early_out' | 'late_then_out' | 'same_employee' | 'unknown',
  rawUserId: string = 'user25065'
) {
  if (employees.value.length === 0) {
    employees.value = await employeeService.getEmployees()
  }

  const normalizedId = normalizeBioId(rawUserId)
  const foundEmp = employees.value.find(e => e.biometric_user_id === normalizedId)
  
  const empWorkGroup = foundEmp?.work_group_name || 'Group C'
  const empWorkGroupCode = foundEmp?.work_group_code || 'C'
  const empDept = foundEmp?.department || 'Operations'
  const empLoc = foundEmp?.location || 'DBB CEBU'

  const mockDate = new Date()
  let direction: 'IN' | 'OUT' = 'IN'
  testSeq++

  switch (scenario) {
    case 'same_employee':
      // Dynamic advancing seconds: 8:05:01, 8:05:08, 8:05:15...
      mockDate.setHours(8, 5, (testSeq * 7) % 60, 0)
      direction = 'IN'
      break
    case 'late_in':
      mockDate.setHours(8, 35, (testSeq * 3) % 60, 0) // 8:35 AM -> LATE IN
      direction = 'IN'
      break
    case 'ontime_in':
      mockDate.setHours(8, 5, (testSeq * 4) % 60, 0) // 8:05 AM -> ON TIME IN
      direction = 'IN'
      break
    case 'early_in':
      mockDate.setHours(7, 48, (testSeq * 5) % 60, 0) // 7:48 AM -> EARLY IN
      direction = 'IN'
      break
    case 'normal_out':
      mockDate.setHours(17, 10, (testSeq * 2) % 60, 0) // 5:10 PM -> TIME OUT (Normal OUT on or after 5pm)
      direction = 'OUT'
      break
    case 'early_out':
      mockDate.setHours(16, 30, (testSeq * 2) % 60, 0) // 4:30 PM -> EARLY OUT (Before 5pm)
      direction = 'OUT'
      break
    case 'late_then_out':
      // Test scenario F: employee was late in morning, now punches OUT at 5:10 PM
      mockDate.setHours(17, 10, (testSeq * 3) % 60, 0)
      direction = 'OUT'
      break
    case 'unknown':
      mockDate.setHours(8, 2, (testSeq * 6) % 60, 0)
      direction = 'IN'
      break
  }

  const log: AttendanceLog = {
    id: `test-punch-${normalizedId}-${Date.now()}-${testSeq}`,
    user_id: rawUserId,
    employee_name: rawUserId,
    employee_id: normalizedId,
    attendance_time: mockDate.toISOString(),
    type: 1,
    state: direction === 'OUT' ? 4 : 1,
    serial_number: '0476141400046',
    device_id: 'dev-1',
    device_name: 'BISMAC BISBIO B-29b',
    device_ip: '192.168.1.201',
    location_id: 'loc-dbb-cebu',
    location_name: empLoc,
    created_at: new Date().toISOString()
  }

  await punchDisplayService.broadcastPunchFromLog(log, {
    direction,
    workGroup: empWorkGroup,
    workGroupCode: empWorkGroupCode,
    department: empDept,
    standardIn: '08:00',
    gracePeriod: 15,
    expectedOut: '17:00'
  })
}

onMounted(async () => {
  updateClock()
  clockTimer = setInterval(updateClock, 1000)
  try {
    const [empList, wgList] = await Promise.all([
      employeeService.getEmployees(),
      employeeService.getWorkGroups()
    ])
    employees.value = empList
    workGroups.value = wgList
  } catch {
    // ignore
  }

  // Auto-connect to agent if available
  liveAttendanceService.connect()
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  cancelDisplayTimer()
  if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId)
})
</script>

<template>
  <div class="min-h-screen bg-background text-foreground flex flex-col select-none font-sans overflow-x-hidden relative">
    <!-- Overlay Confetti Canvas -->
    <canvas ref="canvasRef" class="pointer-events-none fixed inset-0 z-50 size-full"></canvas>

    <!-- Top Bar / Kiosk Header (Native DMBBHR Style) -->
    <header class="border-b bg-card px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-2xs">
      <div class="flex items-center gap-3">
        <div class="size-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-2xs">
          <Fingerprint class="size-5 text-primary" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-sm tracking-tight text-foreground">
              DMBBHR Biometrics
            </span>
            <Badge variant="outline" class="text-[10px] font-mono px-2 py-0.5 bg-muted/40">
              Live Terminal
            </Badge>
          </div>
          <p class="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <Server class="size-3 text-muted-foreground" />
            <span>BISMAC BISBIO B-29b • 192.168.1.201:4370</span>
          </p>
        </div>
      </div>

      <!-- Live Clock Display (Clean Neutral DMBBHR Style) -->
      <div class="flex flex-col items-center justify-center px-4 py-1.5 rounded-lg bg-muted/40 border shadow-2xs">
        <div class="font-mono text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          {{ currentTimeStr }}
        </div>
        <div class="text-xs text-muted-foreground font-medium flex items-center gap-1 mt-0.5">
          <CalendarIcon class="size-3 text-muted-foreground" />
          {{ currentDateStr }}
        </div>
      </div>

      <!-- Actions & Controls -->
      <div class="flex items-center gap-2">
        <!-- Live Status Badge -->
        <div
          v-if="settings.enabled"
          class="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 border text-xs"
        >
          <span class="relative flex size-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
          </span>
          <span class="text-foreground font-mono text-[11px] font-medium">LISTENING</span>
        </div>
        <div
          v-else
          class="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300"
        >
          <PowerOff class="size-3 text-amber-600" />
          <span class="font-mono text-[11px] font-medium">DISABLED</span>
        </div>

        <!-- Audio Toggle -->
        <Button
          variant="outline"
          size="sm"
          class="size-8 p-0 cursor-pointer"
          :title="settings.soundEnabled ? 'Mute Chime' : 'Unmute Chime'"
          @click="toggleSound"
        >
          <Volume2 v-if="settings.soundEnabled" class="size-4 text-primary" />
          <VolumeX v-else class="size-4 text-muted-foreground" />
        </Button>

        <!-- Display Settings Dialog Trigger -->
        <Button
          variant="outline"
          size="sm"
          class="size-8 p-0 cursor-pointer"
          title="Display Preferences"
          @click="openSettings"
        >
          <Sliders class="size-4 text-muted-foreground" />
        </Button>

        <!-- Fullscreen Toggle -->
        <Button
          variant="outline"
          size="sm"
          class="size-8 p-0 cursor-pointer"
          :title="isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'"
          @click="toggleFullscreen"
        >
          <Minimize2 v-if="isFullscreen" class="size-4" />
          <Maximize2 v-else class="size-4" />
        </Button>
      </div>
    </header>

    <!-- Disabled State Alert Banner if OFF -->
    <div
      v-if="!settings.enabled"
      class="bg-amber-500/15 border-b border-amber-500/30 text-amber-900 dark:text-amber-200 px-4 py-2 text-center text-xs flex items-center justify-center gap-2"
    >
      <PowerOff class="size-3.5 text-amber-600" />
      <span>
        Punch Display is currently disabled in Preferences. Open preferences (<Sliders class="size-3 inline mx-0.5" />) to turn it ON.
      </span>
    </div>

    <!-- Main Content Area -->
    <main class="flex-1 p-4 sm:p-6 md:p-8 flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto w-full items-start justify-center">
      
      <!-- Primary Active Punch / Idle Display Card -->
      <section class="flex-1 w-full max-w-2xl mx-auto">
        <!-- CURRENT PUNCH CARD (Keyed by unique eventId so consecutive punches for the same employee visibly refresh!) -->
        <div
          v-if="currentPunch && settings.enabled"
          :key="currentPunch.eventId || currentPunch.id"
          class="bg-card text-card-foreground border rounded-xl md:rounded-2xl shadow-xs overflow-hidden transition-all animate-in fade-in zoom-in-95 duration-200"
        >
          <!-- Card Header Banner -->
          <div class="px-6 py-4 border-b bg-muted/20 flex items-center justify-between">
            <div class="space-y-0.5">
              <span class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-mono block">
                BIOMETRIC ATTENDANCE
              </span>
              <h3 class="text-sm font-semibold text-foreground">
                Real-Time Punch
              </h3>
            </div>
            <Badge
              :variant="currentPunch.isLate && settings.lateVisualEnabled ? 'destructive' : (currentPunch.statusCategory === 'undertime' ? 'warning' : 'success')"
              class="text-xs uppercase font-mono px-3 py-1 gap-1"
            >
              <CheckCircle2 v-if="!currentPunch.isLate && currentPunch.statusCategory !== 'undertime'" class="size-3.5" />
              <AlertTriangle v-else-if="currentPunch.statusCategory === 'undertime'" class="size-3.5" />
              <AlertCircle v-else class="size-3.5" />
              <span>{{ currentPunch.statusLabel }}</span>
            </Badge>
          </div>

          <!-- Main Punch Body -->
          <div class="p-6 sm:p-8 flex flex-col items-center text-center space-y-5">
            
            <!-- Employee Photo / Avatar Placeholder (Prominent & Ready for Future Photos) -->
            <div class="relative">
              <div class="size-28 sm:size-32 rounded-xl border border-border overflow-hidden bg-muted/40 shadow-xs flex items-center justify-center">
                <!-- If actual photo URL exists and hasn't errored -->
                <img
                  v-if="currentPunch.photoUrl && !photoLoadError"
                  :src="currentPunch.photoUrl"
                  :alt="currentPunch.employeeName"
                  class="size-full object-cover"
                  @error="photoLoadError = true"
                />
                <!-- Native Avatar Placeholder -->
                <div
                  v-else
                  class="size-full flex items-center justify-center bg-primary/10 text-primary"
                >
                  <User class="size-14 text-muted-foreground/60" />
                </div>
              </div>

              <!-- Direction Badge Pin -->
              <div class="absolute -bottom-2.5 left-1/2 -translate-x-1/2">
                <span
                  class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider shadow-xs border"
                  :class="[
                    currentPunch.direction === 'OUT' ? 'bg-rose-500 text-white border-rose-600' :
                    currentPunch.direction === 'BREAK_OUT' ? 'bg-amber-500 text-white border-amber-600' :
                    'bg-emerald-500 text-white border-emerald-600'
                  ]"
                >
                  {{ currentPunch.stateLabel }}
                </span>
              </div>
            </div>

            <!-- Employee Details -->
            <div class="space-y-1 pt-1">
              <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {{ currentPunch.employeeName }}
              </h2>
              <div class="text-sm text-muted-foreground font-mono font-medium flex items-center justify-center gap-2 flex-wrap">
                <span>Bio ID: {{ currentPunch.userId }}</span>
                <span class="text-border">•</span>
                <span>{{ currentPunch.workGroup || 'Standard Crew' }}</span>
                <span class="text-border">•</span>
                <span>{{ currentPunch.locationName || 'DBB Cebu' }}</span>
              </div>
            </div>

            <Separator class="my-1 max-w-md" />

            <!-- Time & Date Display -->
            <div class="space-y-1">
              <div class="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-foreground">
                {{ formatPunchTime(currentPunch.timestamp) }}
              </div>
              <div class="text-xs sm:text-sm text-muted-foreground font-medium">
                {{ formatPunchDate(currentPunch.timestamp) }}
              </div>
            </div>

            <!-- Detailed Status Feedback Callout -->
            <div
              class="w-full max-w-md rounded-xl border p-3 text-xs flex items-center justify-center gap-2 shadow-2xs"
              :class="[
                currentPunch.isLate && settings.lateVisualEnabled
                  ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20 font-medium'
                  : currentPunch.statusCategory === 'undertime'
                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 font-medium'
                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-medium'
              ]"
            >
              <CheckCircle2 v-if="!currentPunch.isLate && currentPunch.statusCategory !== 'undertime'" class="size-4 text-emerald-600 shrink-0" />
              <AlertTriangle v-else-if="currentPunch.statusCategory === 'undertime'" class="size-4 text-amber-600 shrink-0" />
              <AlertCircle v-else class="size-4 text-rose-600 shrink-0" />
              <span>{{ currentPunch.statusDetail }}</span>
            </div>

            <!-- Optional Configured Late Image (Only if lateVisualEnabled and customLateImageUrl is set) -->
            <div
              v-if="currentPunch.isLate && settings.lateVisualEnabled && settings.customLateImageUrl"
              class="pt-1 w-full flex flex-col items-center"
            >
              <img
                :src="settings.customLateImageUrl"
                alt="Late Reminder"
                class="max-h-24 sm:max-h-28 rounded-lg border border-border object-contain shadow-2xs"
              />
            </div>
          </div>

          <!-- Bottom Auto-Dismiss Progress Bar -->
          <div v-if="(settings.displayDurationSeconds || 5) > 0" class="w-full bg-muted/40 h-1 overflow-hidden">
            <div
              class="bg-primary h-full transition-all ease-linear"
              :style="{ width: `${dismissProgress}%` }"
            ></div>
          </div>
        </div>

        <!-- IDLE / WAITING STATE CARD (Matches DMBBHR Visual Hierarchy) -->
        <div
          v-else
          class="bg-card text-card-foreground border rounded-xl md:rounded-2xl shadow-xs p-8 sm:p-12 text-center flex flex-col items-center justify-center space-y-6"
        >
          <div class="size-16 rounded-2xl bg-muted/60 border flex items-center justify-center text-muted-foreground shadow-2xs">
            <Fingerprint class="size-8 text-primary/80 animate-pulse" />
          </div>

          <div class="space-y-1.5 max-w-md mx-auto">
            <span class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-mono block">
              BIOMETRIC ATTENDANCE
            </span>
            <h2 class="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Ready for biometric scan
            </h2>
            <p class="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Please scan your fingerprint on the terminal.
            </p>
          </div>

          <!-- Test scan triggers for thorough verification of all test cases -->
          <div class="pt-2 flex flex-col items-center gap-2.5 max-w-xl">
            <div class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
              Verification Scenarios
            </div>
            <div class="flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="default"
                size="sm"
                class="h-8 text-xs gap-1.5 cursor-pointer shadow-xs"
                title="Test same employee punching repeatedly - verifies immediate refresh with advancing time"
                @click="triggerTestPunch('same_employee', 'user25065')"
              >
                <Play class="size-3" />
                <span>Simulate 25065 (Cantillas) Punch</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs gap-1.5 cursor-pointer"
                title="Test Person B punching - verifies immediate replacement from Person A to Person B"
                @click="triggerTestPunch('same_employee', 'user25069')"
              >
                <Play class="size-3 text-blue-600" />
                <span>Simulate 25069 (Alfanta) Punch</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs gap-1.5 cursor-pointer"
                title="Test A: Arrives after standard IN + grace period"
                @click="triggerTestPunch('late_in', 'user25065')"
              >
                <Play class="size-3 text-rose-600" />
                <span>Test A: Late IN (8:35 AM)</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs gap-1.5 cursor-pointer"
                title="Test B: Arrives within grace period"
                @click="triggerTestPunch('ontime_in', 'user25065')"
              >
                <Play class="size-3 text-emerald-600" />
                <span>Test B: Normal IN (8:05 AM)</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs gap-1.5 cursor-pointer"
                title="Test C: Arrives before standard IN"
                @click="triggerTestPunch('early_in', 'user25065')"
              >
                <Play class="size-3 text-emerald-600" />
                <span>Test C: Early IN (7:48 AM)</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs gap-1.5 cursor-pointer"
                title="Test D: Leaves at or after expected OUT time"
                @click="triggerTestPunch('normal_out', 'user25065')"
              >
                <Play class="size-3 text-primary" />
                <span>Test D: Normal OUT (5:10 PM)</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs gap-1.5 cursor-pointer"
                title="Test E: Leaves before expected OUT time"
                @click="triggerTestPunch('early_out', 'user25065')"
              >
                <Play class="size-3 text-amber-600" />
                <span>Test E: Early OUT (4:30 PM)</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs gap-1.5 cursor-pointer"
                title="Test F: Late in morning followed by normal OUT at 5:10 PM (OUT must not show LATE)"
                @click="triggerTestPunch('late_then_out', 'user25065')"
              >
                <Play class="size-3 text-purple-600" />
                <span>Test F: OUT after Late IN</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs gap-1.5 cursor-pointer"
                title="Unknown Bio ID fallback"
                @click="triggerTestPunch('unknown', 'user99999')"
              >
                <Play class="size-3 text-muted-foreground" />
                <span>Unknown Bio ID</span>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <!-- Right / Session Stream: Recent Punches List (Maximum 10 Recent Punches) -->
      <aside class="w-full lg:w-96 bg-card text-card-foreground border rounded-xl shadow-xs p-5 shrink-0 space-y-3">
        <div class="flex items-center justify-between pb-3 border-b">
          <div class="flex items-center gap-2">
            <History class="size-4 text-primary" />
            <h4 class="text-sm font-semibold text-foreground">
              Recent Punches
            </h4>
          </div>
          <Badge variant="outline" class="text-[10px] font-mono">
            {{ recentPunches.length }} / 10
          </Badge>
        </div>

        <div v-if="recentPunches.length === 0" class="py-10 text-center text-muted-foreground space-y-1">
          <Clock class="size-6 mx-auto stroke-1 text-muted-foreground/60" />
          <p class="text-xs">No recent punches yet.</p>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="punch in recentPunches"
            :key="punch.eventId || punch.id"
            class="p-2.5 rounded-lg border bg-muted/20 hover:bg-muted/30 transition-colors flex items-center justify-between gap-3 text-xs"
          >
            <div class="min-w-0">
              <div class="font-semibold text-foreground truncate">
                {{ punch.employeeName }}
              </div>
              <div class="text-[11px] text-muted-foreground flex items-center gap-1.5 font-mono mt-0.5">
                <span>Bio ID: {{ punch.bioId }}</span>
                <span>•</span>
                <span class="text-foreground font-medium">{{ punch.time }}</span>
              </div>
            </div>

            <div class="text-right shrink-0">
              <Badge
                :variant="punch.statusVariant === 'destructive' && settings.lateVisualEnabled ? 'destructive' : (punch.statusVariant === 'warning' ? 'warning' : 'success')"
                class="text-[10px] uppercase font-mono px-2 py-0.5"
              >
                {{ punch.status }}
              </Badge>
            </div>
          </div>
        </div>
      </aside>
    </main>

    <!-- Footer Bar -->
    <footer class="border-t bg-card px-6 py-2.5 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2 shrink-0">
      <div class="flex items-center gap-2">
        <span class="size-2 rounded-full" :class="settings.enabled ? 'bg-emerald-500' : 'bg-amber-500'"></span>
        <span class="font-mono text-[11px]">
          {{ settings.enabled ? 'Hardware Bridge Active' : 'Punch Display Disabled' }}
        </span>
      </div>
      <div class="text-[11px] text-muted-foreground">
        DMBBHR Real-Time Biometric Attendance Monitor
      </div>
    </footer>

    <!-- SETTINGS & PREFERENCES DIALOG (Native shadcn Dialog) -->
    <Dialog :open="showSettingsDialog" @update:open="showSettingsDialog = $event">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-base font-bold">
            <Sliders class="size-4 text-primary" />
            <span>Punch Display Preferences</span>
          </DialogTitle>
          <DialogDescription class="text-xs text-muted-foreground">
            Configure display timing, audio notifications, and visual feedback for the live terminal.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4 py-2 text-xs">
          <!-- Enable Punch Display -->
          <div class="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
            <div class="space-y-0.5">
              <Label class="text-xs font-semibold text-foreground">Enable Punch Display</Label>
              <p class="text-[11px] text-muted-foreground">Allow receiving and displaying real-time biometric scans.</p>
            </div>
            <Switch v-model="formEnabled" />
          </div>

          <!-- Display Duration (Includes 2 seconds, 3 seconds, 5 seconds, 8 seconds, 10 seconds) -->
          <div class="space-y-1.5">
            <Label class="text-xs font-semibold text-foreground">Screen Display Duration</Label>
            <Select v-model="formDuration">
              <SelectTrigger class="h-8 text-xs">
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="2">2 seconds</SelectItem>
                  <SelectItem value="3">3 seconds</SelectItem>
                  <SelectItem value="5">5 seconds (Default)</SelectItem>
                  <SelectItem value="8">8 seconds</SelectItem>
                  <SelectItem value="10">10 seconds</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <p class="text-[11px] text-muted-foreground">
              Minimum duration to hold screen when no new punch arrives. Any new punch immediately replaces the screen.
            </p>
          </div>

          <!-- Sound Feedback Toggle -->
          <div class="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
            <div class="space-y-0.5">
              <Label class="text-xs font-semibold text-foreground">Audio Chime</Label>
              <p class="text-[11px] text-muted-foreground">Play a verification chime when a scan is recorded.</p>
            </div>
            <Switch v-model="formSound" />
          </div>

          <!-- Confetti Toggle -->
          <div class="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
            <div class="space-y-0.5">
              <Label class="text-xs font-semibold text-foreground">Confetti Celebration</Label>
              <p class="text-[11px] text-muted-foreground">Show subtle celebration burst for on-time / early arrivals.</p>
            </div>
            <Switch v-model="formConfetti" />
          </div>

          <!-- Late Visual Toggle -->
          <div class="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
            <div class="space-y-0.5">
              <Label class="text-xs font-semibold text-foreground">Late Visual</Label>
              <p class="text-[11px] text-muted-foreground">Apply distinctive visual warning treatment when an IN punch is late.</p>
            </div>
            <Switch v-model="formLateVisual" />
          </div>

          <!-- Custom Late Image URL -->
          <div v-if="formLateVisual" class="space-y-1.5 p-2.5 rounded-lg border bg-muted/20">
            <Label class="text-[11px] text-muted-foreground">Custom Late Reminder Graphic URL (Optional)</Label>
            <Input
              v-model="formLateImageUrl"
              placeholder="https://example.com/late-notice.png"
              class="h-8 text-xs font-mono"
            />
          </div>
        </div>

        <DialogFooter class="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" class="h-8 text-xs" @click="showSettingsDialog = false">
            Cancel
          </Button>
          <Button size="sm" class="h-8 text-xs" @click="saveSettings">
            Save Preferences
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
