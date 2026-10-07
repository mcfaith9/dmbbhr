<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import {
  Fingerprint,
  Clock,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
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
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'

const currentPunch = punchDisplayService.currentPunch
const recentPunches = punchDisplayService.recentPunches
const settings = punchDisplayService.settings
const isFullscreen = ref(false)

const employees = ref<Employee[]>([])
const workGroups = ref<WorkGroup[]>([])

// Real-time Clock in Manila / Local Time
const currentTimeStr = ref('')
const currentDateStr = ref('')
let clockTimer: any = null

// Auto-dismiss timer & progress bar
let dismissTimer: any = null
const dismissProgress = ref(100)
let dismissProgressInterval: any = null
// Temporary UI-only pause; does not stop or disconnect the biometric pipeline.
const isDisplayPaused = ref(false)
const photoLoadError = ref(false)

// Custom late reminder graphic error tracking & validation (supports JPG/JPEG, PNG, data URIs, local paths)
const lateGraphicLoadError = ref(false)

function testLateGraphicImage(url?: string) {
  if (!url || !url.trim()) {
    lateGraphicLoadError.value = false
    return
  }
  const clean = url.trim()
  // Allow all valid web URLs, base64 data URIs, and local asset paths without restricting extension
  if (
    !clean.startsWith('http://') &&
    !clean.startsWith('https://') &&
    !clean.startsWith('data:') &&
    !clean.startsWith('/') &&
    !clean.startsWith('./')
  ) {
    lateGraphicLoadError.value = true
    return
  }
  if (typeof Image === 'undefined') {
    lateGraphicLoadError.value = false
    return
  }
  const img = new Image()
  img.onload = () => {
    lateGraphicLoadError.value = false
  }
  img.onerror = () => {
    lateGraphicLoadError.value = true
  }
  img.src = clean
}

watch(
  () => settings.value.customLateImageUrl,
  (newUrl) => {
    testLateGraphicImage(newUrl)
  },
  { immediate: true }
)

const hasCustomLateGraphic = computed(() => {
  return (
    Boolean(currentPunch.value?.isLate) &&
    Boolean(settings.value.lateVisualEnabled) &&
    Boolean(settings.value.customLateImageUrl?.trim()) &&
    !lateGraphicLoadError.value
  )
})

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

function formatHHMM(timeStr?: string) {
  if (!timeStr) return ''
  const [hStr, mStr] = timeStr.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  if (isNaN(h)) return timeStr
  const hour12 = h % 12 || 12
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${hour12}:${String(m || 0).padStart(2, '0')} ${ampm}`
}

const currentSchedule = computed(() => {
  if (!currentPunch.value) return null
  const punchWg = currentPunch.value.workGroup
  const punchWgCode = currentPunch.value.workGroupCode
  const wg = workGroups.value.find(
    g => g.name === punchWg || g.code === punchWgCode || g.id === punchWg
  )
  if (wg) {
    return {
      standardIn: wg.standard_in ? formatHHMM(wg.standard_in) : '8:00 AM',
      expectedOut: wg.expected_out ? formatHHMM(wg.expected_out) : '5:00 PM',
      gracePeriod: wg.grace_period_minutes ?? 15
    }
  }
  return {
    standardIn: '8:00 AM',
    expectedOut: '5:00 PM',
    gracePeriod: 15
  }
})

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
  if (isDisplayPaused.value) return

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

function pauseDisplay() {
  if (isDisplayPaused.value) return

  isDisplayPaused.value = true
  cancelDisplayTimer()
}

function resumeDisplay() {
  if (!isDisplayPaused.value) return

  isDisplayPaused.value = false

  if (currentPunch.value) {
    startDisplayTimer()
  }
}

function toggleDisplayPause() {
  if (isDisplayPaused.value) {
    resumeDisplay()
  } else {
    pauseDisplay()
  }
}

function handleDisplayKeyboard(event: KeyboardEvent) {
  if (event.key.toLowerCase() !== 'p') return

  const target = event.target as HTMLElement | null

  if (
    target?.tagName === 'INPUT' ||
    target?.tagName === 'TEXTAREA' ||
    target?.isContentEditable
  ) {
    return
  }

  toggleDisplayPause()
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

    // Start fresh display timer for this punch unless the display is temporarily paused
    if (!isDisplayPaused.value) {
      startDisplayTimer()
    }
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

  // Development/UI adjustment shortcut: P = Pause/Resume display timer
  window.addEventListener('keydown', handleDisplayKeyboard)
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  cancelDisplayTimer()
  window.removeEventListener('keydown', handleDisplayKeyboard)
  if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId)
})
</script>

<template>
  <div class="h-screen max-h-screen bg-background text-foreground flex flex-col select-none font-sans overflow-hidden relative">
    <!-- Overlay Confetti Canvas -->
    <canvas ref="canvasRef" class="pointer-events-none fixed inset-0 z-50 size-full"></canvas>

    <!-- Top Bar / Kiosk Header (Native DMBBHR Style) -->
    <header class="border-b bg-card px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 shrink-0 shadow-2xs">
      <div class="flex items-center gap-2.5">
        <div class="flex flex-row flex-wrap items-center gap-12">
          <div class="*:data-[slot=avatar]:ring-background flex -space-x-2 *:data-[slot=avatar]:ring-2">
            <Avatar class="size-9 border-2 border-slate-500 bg-white">
              <AvatarImage src="/dmbblogo.png" alt="DMBB Logo" />
              <AvatarFallback>DMBB</AvatarFallback>
            </Avatar>

            <Avatar class="size-9 border-2 border-slate-500 bg-white">
              <AvatarImage src="/dbblogo.png" alt="DBB Logo" />
              <AvatarFallback>DBB</AvatarFallback>
            </Avatar>
          </div>
        </div>
        <div>
          <div class="flex items-center gap-1.5">
            <span class="font-bold text-sm tracking-tight text-foreground">
              DMBB / DBB Biometrics
            </span>
            <Badge variant="outline" class="text-[9px] font-mono px-1.5 py-0 bg-muted/40">
              Live Kiosk
            </Badge>
          </div>
          <p class="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <Server class="size-2.5 text-muted-foreground" />
            <span>BISMAC BISBIO B-29b • 192.168.1.201:4370</span>
          </p>
        </div>
      </div>

      <!-- Live Clock Display (Clean Neutral DMBBHR Style) -->
      <div class="flex flex-col items-center justify-center px-3.5 py-1 rounded-lg bg-muted/40 border shadow-2xs">
        <div class="font-mono text-xl sm:text-xl font-bold tracking-tight text-foreground leading-none">
          {{ currentTimeStr }}
        </div>
        <div class="text-[12px] text-muted-foreground font-medium flex items-center gap-1 mt-0.5 leading-none">
          <CalendarIcon class="size-3 text-muted-foreground" />
          {{ currentDateStr }}
        </div>
      </div>

      <!-- Actions & Controls -->
      <div class="flex items-center gap-2">
        <!-- Live Status Badge -->
        <div
          v-if="settings.enabled"
          class="hidden sm:flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-muted/50 border text-xs"
        >
          <span class="relative flex size-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
          </span>
          <span class="text-foreground font-mono text-[10px] font-medium">LISTENING</span>
        </div>
        <div
          v-else
          class="hidden sm:flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300"
        >
          <PowerOff class="size-3 text-amber-600" />
          <span class="font-mono text-[10px] font-medium">DISABLED</span>
        </div>

        <!-- Temporary Development Pause Indicator -->
        <Badge
          v-if="isDisplayPaused"
          variant="outline"
          class="hidden sm:flex items-center gap-1 text-[10px] py-1.5 font-mono font-bold text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10"
        >
          <span class="size-1.5 rounded-full bg-amber-500"></span>
          PAUSED
        </Badge>

        <!-- Audio Toggle -->
        <Button
          variant="outline"
          size="sm"
          class="size-7.5 p-0 cursor-pointer"
          :title="settings.soundEnabled ? 'Mute Chime' : 'Unmute Chime'"
          @click="toggleSound"
        >
          <Volume2 v-if="settings.soundEnabled" class="size-3.5 text-primary" />
          <VolumeX v-else class="size-3.5 text-muted-foreground" />
        </Button>

        <!-- Fullscreen Toggle -->
        <Button
          variant="outline"
          size="sm"
          class="size-7.5 p-0 cursor-pointer"
          :title="isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'"
          @click="toggleFullscreen"
        >
          <Minimize2 v-if="isFullscreen" class="size-3.5" />
          <Maximize2 v-else class="size-3.5" />
        </Button>
      </div>
    </header>

    <!-- Disabled State Alert Banner if OFF -->
    <div
      v-if="!settings.enabled"
      class="bg-amber-500/15 border-b border-amber-500/30 text-amber-900 dark:text-amber-200 px-4 py-1.5 text-center text-xs flex items-center justify-center gap-2 shrink-0"
    >
      <PowerOff class="size-3 text-amber-600" />
      <span>
        Punch Display is currently disabled in System Settings (Settings → System & Integrations → Punch Display).
      </span>
    </div>

    <!-- Main Content Area: Kiosk Viewport Centered without Unnecessary Scrollbar -->
    <main class="flex-1 min-h-0 px-3 sm:px-6 py-2.5 sm:py-3.5 flex flex-col lg:flex-row gap-4 max-w-7xl mx-auto w-full items-stretch justify-center overflow-hidden">
      
      <!-- Primary Active Punch / Idle Display Card -->
      <section class="flex-1 min-h-0 flex flex-col justify-center max-w-2xl mx-auto w-full h-full">
        <!-- CURRENT PUNCH CARD (Modern Profile/Post Card Composition) -->
        <div
          v-if="currentPunch && settings.enabled"
          :key="currentPunch.eventId || currentPunch.id"
          class="relative text-card-foreground border rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between transition-all animate-in fade-in zoom-in-95 duration-200 h-full"
          :class="[
            hasCustomLateGraphic
              ? 'border-destructive/40 shadow-xl bg-transparent'
              : (currentPunch.isLate && settings.lateVisualEnabled ? 'border-destructive/30 bg-card' : 'bg-card border-border/80')
          ]"
        >
          <!-- Full-Card/Cover Wallpaper for Late IN Punches when Custom Graphic Configured (supports JPG/JPEG, PNG) -->
          <template v-if="hasCustomLateGraphic">
            <div
              class="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-700 pointer-events-none"
              :style="{ backgroundImage: `url('${settings.customLateImageUrl.trim()}')` }"
            ></div>
            <!-- Subtle readability overlay so wallpaper is clearly visible while text stays crisp -->
            <div class="absolute inset-0 bg-black/50 dark:bg-black/60 pointer-events-none"></div>
          </template>

          <!-- 1. Profile Cover Area Header -->
          <div
            class="relative w-full h-28 sm:h-36 md:h-40 shrink-0 overflow-hidden flex items-start justify-between p-3.5 sm:p-4"
          >
            <!-- Decorative pattern on clean cover -->
            <div
              v-if="!hasCustomLateGraphic"
              class="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_30%,_var(--tw-gradient-stops))] from-primary/40 via-transparent to-transparent pointer-events-none"
            ></div>

            <!-- Cover Left: Biometric Terminal Badge -->
            <div
              class="relative z-10 flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-mono font-bold uppercase tracking-wider"
              :class="
                hasCustomLateGraphic
                  ? 'bg-black/60 text-white backdrop-blur-md border border-white/20'
                  : (currentPunch.isLate && settings.lateVisualEnabled
                      ? 'bg-destructive/90 text-white border border-destructive/40'
                      : 'bg-card/85 text-foreground border border-border/70 backdrop-blur-xs')
              "
            >
              <Fingerprint
                class="size-3.5"
                :class="hasCustomLateGraphic || (currentPunch.isLate && settings.lateVisualEnabled) ? 'text-white' : 'text-primary'"
              />
              <span>{{ currentPunch.deviceName || 'Biometric Terminal' }}</span>
            </div>

            <!-- Cover Right: Status Indicator Badge -->
            <Badge
              :variant="
                currentPunch.isLate && settings.lateVisualEnabled
                  ? 'destructive'
                  : currentPunch.statusCategory === 'undertime'
                    ? 'warning'
                    : 'success'
              "
              class="px-3 py-1 text-xs font-semibold uppercase text-[11px]"
            >
              {{ currentPunch.statusLabel }}
            </Badge>
          </div>

          <!-- 2. Circular Employee Photo (Centered Overlapping Bottom Edge of Cover) -->
          <div class="flex justify-center -mt-14 sm:-mt-16 md:-mt-18 relative z-20 shrink-0">
            <div class="relative">
              <div
                class="size-28 sm:size-32 md:size-36 rounded-full border-4 shadow-xl overflow-hidden flex items-center justify-center transition-transform"
                :class="[
                  hasCustomLateGraphic
                    ? 'border-slate-900 ring-4 ring-rose-500/40 bg-zinc-950 shadow-2xl'
                    : (currentPunch.isLate && settings.lateVisualEnabled
                        ? 'border-card ring-4 ring-rose-500/40 bg-zinc-900 shadow-xl'
                        : 'border-card ring-4 ring-card/90 dark:ring-background/90 bg-white shadow-xl')
                ]"
              >
                <!-- Real photo if available and not errored -->
                <img
                  v-if="currentPunch.photoUrl && !photoLoadError"
                  :src="currentPunch.photoUrl"
                  :alt="currentPunch.employeeName"
                  class="size-full object-cover"
                  @error="photoLoadError = true"
                />
                <!-- Avatar fallback placeholder -->
                <div
                  v-else
                  class="size-full flex items-center justify-center bg-primary/10 text-primary"
                >
                  <User class="size-14 sm:size-16 text-muted-foreground/70" />
                </div>
              </div>

              <!-- Direction Badge Pin anchored to the circular avatar -->
              <div class="absolute -bottom-2.5 left-0 right-0 flex justify-center">
                <span
                  class="px-3 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-black uppercase tracking-wider border text-center"
                  :class="[
                    currentPunch.direction === 'OUT'
                      ? 'bg-rose-500 text-white border-rose-600'
                      : currentPunch.direction === 'BREAK_OUT'
                        ? 'bg-amber-500 text-white border-amber-600'
                        : currentPunch.direction === 'BREAK_IN'
                          ? 'bg-blue-500 text-white border-blue-600'
                          : 'bg-emerald-500 text-white border-emerald-600'
                  ]"
                >
                  {{ currentPunch.stateLabel }}
                </span>
              </div>
            </div>
          </div>

          <!-- 3. Profile Content Area (Identity + Punch Card + Schedule) -->
          <div class="flex-1 flex flex-col justify-between px-4 sm:px-6 md:px-8 pt-4 pb-2 min-h-0 relative z-10">
            <!-- A. Employee Identity -->
            <div class="text-center space-y-1">
              <h2
                class="text-2xl sm:text-3xl font-extrabold tracking-tight truncate leading-tight"
                :class="hasCustomLateGraphic ? 'text-white' : 'text-foreground'"
              >
                {{ currentPunch.employeeName }}
              </h2>

              <!-- BIO ID and Department -->
              <div
                class="flex items-center justify-center gap-2 text-xs sm:text-sm font-medium flex-wrap"
                :class="hasCustomLateGraphic ? 'text-zinc-200' : 'text-muted-foreground'"
              >
                <span
                  class="font-mono font-bold px-2 py-0.5 rounded border"
                  :class="hasCustomLateGraphic ? 'bg-black/50 border-white/20 text-white' : 'bg-muted/70 border-border/70 text-foreground'"
                >
                  BIO ID: {{ currentPunch.userId || currentPunch.bioId }}
                </span>
                <span :class="hasCustomLateGraphic ? 'text-zinc-400' : 'text-border'">•</span>
                <span class="font-semibold">{{ currentPunch.department || 'Operations' }}</span>
              </div>

              <!-- Work Group and Location -->
              <div
                class="flex items-center justify-center gap-2 text-xs font-medium"
                :class="hasCustomLateGraphic ? 'text-zinc-300' : 'text-muted-foreground/90'"
              >
                <span class="uppercase font-semibold">{{ currentPunch.workGroup || 'Group C' }}</span>
                <span :class="hasCustomLateGraphic ? 'text-zinc-400' : 'text-border'">•</span>
                <span>{{ currentPunch.locationName || 'DBB CEBU' }}</span>
              </div>
            </div>

            <!-- B. Punch Information Card -->
            <div
              class="w-full max-w-lg mx-auto rounded-2xl border p-4 sm:p-5 flex flex-col items-center text-center shadow-xs transition-all my-2"
              :class="[
                hasCustomLateGraphic
                  ? 'text-white shadow-xl border-none'
                  : (currentPunch.isLate && settings.lateVisualEnabled
                      ? 'bg-rose-500/10 dark:bg-rose-950/20 border-rose-500/30 text-foreground'
                      : 'bg-muted/35 dark:bg-muted/20 border-border/70 text-foreground')
              ]"
            >
              <div
                class="text-[11px] font-mono uppercase tracking-widest font-bold mb-1"
                :class="hasCustomLateGraphic ? 'text-zinc-300' : 'text-muted-foreground'"
              >
                {{ currentPunch.direction === 'OUT' ? 'Departure Time' : 'Arrival Time' }}
              </div>

              <!-- Exact Punch Time -->
              <div
                class="text-4xl sm:text-5xl font-mono font-black tracking-tight leading-none my-1"
                :class="hasCustomLateGraphic ? 'text-white' : 'text-foreground'"
              >
                {{ formatPunchTime(currentPunch.timestamp) }}
              </div>

              <!-- Punch Date -->
              <div
                class="text-xs sm:text-sm font-medium mt-1 mb-3.5 flex items-center gap-1.5"
                :class="hasCustomLateGraphic ? 'text-zinc-300' : 'text-muted-foreground'"
              >
                <CalendarIcon class="size-3.5" />
                <span>{{ formatPunchDate(currentPunch.timestamp) }}</span>
              </div>

              <!-- Attendance Result Strip -->
              <div
                class="w-full rounded-xl py-2 px-3 flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold border shadow-2xs"
                :class="[
                  currentPunch.isLate && settings.lateVisualEnabled
                    ? 'bg-rose-600 text-white border-rose-700'
                    : currentPunch.statusCategory === 'undertime'
                      ? 'bg-amber-500 text-slate-950 border-amber-600'
                      : 'bg-emerald-600 text-white border-emerald-700'
                ]"
              >
                <span class="font-medium truncate">
                  {{ currentPunch.statusDetail }}
                </span>
              </div>
            </div>

            <!-- C. Supporting Schedule Context -->
            <div
              v-if="currentSchedule"
              class="w-full max-w-lg mx-auto grid grid-cols-3 gap-2 sm:gap-3 text-center text-xs"
            >
              <div
                class="p-2 sm:p-2.5 rounded-xl border flex flex-col items-center justify-center shadow-2xs"
                :class="hasCustomLateGraphic ? 'border-white/15 text-zinc-200 backdrop-blur-xs' : 'bg-muted/25 border-border/60 text-muted-foreground'"
              >
                <span class="text-[10px] font-mono uppercase tracking-wider font-medium opacity-80">Scheduled In</span>
                <span
                  class="font-mono font-bold text-xs sm:text-sm mt-0.5"
                  :class="hasCustomLateGraphic ? 'text-white' : 'text-foreground'"
                >
                  {{ currentSchedule.standardIn }}
                </span>
              </div>

              <div
                class="p-2 sm:p-2.5 rounded-xl border flex flex-col items-center justify-center shadow-2xs"
                :class="hasCustomLateGraphic ? 'border-white/15 text-zinc-200 backdrop-blur-xs' : 'bg-muted/25 border-border/60 text-muted-foreground'"
              >
                <span class="text-[10px] font-mono uppercase tracking-wider font-medium opacity-80">Expected Out</span>
                <span
                  class="font-mono font-bold text-xs sm:text-sm mt-0.5"
                  :class="hasCustomLateGraphic ? 'text-white' : 'text-foreground'"
                >
                  {{ currentSchedule.expectedOut }}
                </span>
              </div>

              <div
                class="p-2 sm:p-2.5 rounded-xl border flex flex-col items-center justify-center shadow-2xs"
                :class="hasCustomLateGraphic ? 'border-white/15 text-zinc-200 backdrop-blur-xs' : 'bg-muted/25 border-border/60 text-muted-foreground'"
              >
                <span class="text-[10px] font-mono uppercase tracking-wider font-medium opacity-80">Grace Period</span>
                <span
                  class="font-mono font-bold text-xs sm:text-sm mt-0.5"
                  :class="hasCustomLateGraphic ? 'text-white' : 'text-foreground'"
                >
                  {{ currentSchedule.gracePeriod }} mins
                </span>
              </div>
            </div>
          </div>

          <!-- Bottom Auto-Dismiss Progress Bar -->
          <div v-if="(settings.displayDurationSeconds || 5) > 0" class="w-full bg-muted/40 h-1 overflow-hidden shrink-0 relative z-10">
            <div
              class="bg-primary h-full transition-all ease-linear"
              :style="{ width: `${isDisplayPaused ? 100 : dismissProgress}%` }"
            ></div>
          </div>
        </div>

        <!-- IDLE / WAITING STATE CARD (Profile-Style Kiosk Design) -->
        <div
          v-else
          class="relative text-card-foreground border rounded-2xl shadow-sm overflow-hidden flex flex-col bg-card h-full justify-between"
        >
          <!-- Idle Cover Banner -->
          <div
            class="h-28 sm:h-36 md:h-40 w-full bg-cover bg-center border-b border-red-900/40 shrink-0 flex items-start justify-between p-3.5 sm:p-4 relative"
            style="background-image: url('/liquid-cheese.svg');"
          >
            <div class="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-semibold tracking-wider uppercase bg-card/80 border text-foreground shadow-2xs backdrop-blur-xs">
              <Fingerprint class="size-3.5 text-primary" />
              <span>Terminal Standby</span>
            </div>
            <div class="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 font-bold shadow-2xs">
              <span class="size-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>READY</span>
            </div>
          </div>

          <!-- Idle Avatar Centered Overlapping Cover -->
          <div class="flex justify-center -mt-14 sm:-mt-16 md:-mt-18 relative z-20 shrink-0">
            <div class="size-28 sm:size-32 md:size-36 rounded-full border-4 border-card ring-4 ring-card/80 dark:ring-background/80 shadow-xl bg-primary/20 bg-white text-primary flex items-center justify-center">
              <Fingerprint class="size-14 sm:size-16 text-primary animate-pulse" />
            </div>
          </div>

          <!-- Idle Instructions Body -->
          <div class="-mt-14 flex-1 flex flex-col justify-center items-center text-center px-6 py-4 space-y-2 min-h-0">
            <h2 class="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Ready for Biometric Scan
            </h2>
            <p class="text-xs sm:text-sm text-muted-foreground max-w-sm leading-relaxed">
              Place your registered finger on the optical sensor to record your attendance punch.
            </p>
            <div class="pt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground font-mono">
              <Server class="size-3 text-muted-foreground" />
              <span>BISMAC BISBIO B-29b • Port 4370</span>
            </div>
          </div>

          <!-- Standby footer line -->
          <div class="h-1.5 w-full bg-muted/40 shrink-0"></div>
        </div>
      </section>

      <!-- Right / Session Stream: Recent Punches List (Maximum 7 Recent Punches) -->
      <aside class="w-full lg:w-80 xl:w-96 bg-card text-card-foreground border rounded-2xl shadow-sm p-3.5 sm:p-4 shrink-0 flex flex-col min-h-0 max-h-full">
        <div class="flex items-center justify-between pb-2.5 border-b shrink-0">
          <div class="flex items-center gap-2">
            <History class="size-4 text-primary" />
            <h4 class="text-sm font-semibold text-foreground">
              Recent Punches
            </h4>
          </div>
          <Badge variant="outline" class="text-[10px] font-mono font-bold">
            {{ recentPunches.length }} / 7
          </Badge>
        </div>

        <div v-if="recentPunches.length === 0" class="py-10 text-center text-muted-foreground space-y-1">
          <Clock class="size-6 mx-auto stroke-1 text-muted-foreground/60" />
          <p class="text-xs">No recent punches yet.</p>
        </div>

        <div v-else class="flex-1 min-h-0 overflow-y-auto space-y-1.5 pt-2 pr-0.5">
          <div
            v-for="punch in recentPunches"
            :key="punch.eventId || punch.id"
            class="p-2 sm:p-2.5 rounded-xl border bg-muted/20 hover:bg-muted/30 transition-colors flex items-center justify-between gap-2.5 text-xs"
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
                class="text-[10px] uppercase font-mono px-2 py-0.5 font-bold"
              >
                {{ punch.status }}
              </Badge>
            </div>
          </div>
        </div>
      </aside>
    </main>

    <!-- Footer Bar with Subtle Development/Testing Controls -->
    <footer class="border-t bg-card px-4 sm:px-6 py-2 text-xs text-muted-foreground flex flex-col md:flex-row items-center justify-between gap-2 shrink-0 shadow-2xs">
      <!-- Status Info -->
      <div class="flex items-center gap-2">
        <span class="size-2 rounded-full" :class="settings.enabled ? 'bg-emerald-500' : 'bg-amber-500'"></span>
        <span class="font-mono text-[11px]">
          {{ settings.enabled ? 'Hardware Bridge Active' : 'Punch Display Disabled' }}
        </span>
        <span class="text-border hidden sm:inline">·</span>
        <span class="text-[11px] text-muted-foreground hidden sm:inline">
          DMBBHR Real-Time Biometric Terminal
        </span>
      </div>

      <!-- Secondary Development / Testing Controls -->
      <div class="flex items-center gap-1.5 flex-wrap justify-center md:justify-end text-[11px]">
        <span class="text-[10px] font-mono uppercase text-muted-foreground/70 font-semibold mr-1">
          TEST:
        </span>
        <Button
          variant="ghost"
          size="sm"
          class="h-6 px-2 text-[11px] font-mono cursor-pointer"
          :class="isDisplayPaused
            ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'"
          :title="isDisplayPaused ? 'Resume automatic punch display' : 'Pause automatic punch display'"
          @click="toggleDisplayPause"
        >
          <Play class="size-2.5 mr-1" />
          <span>{{ isDisplayPaused ? 'Resume Display' : 'Pause Display' }}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          class="h-6 px-2 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/80 cursor-pointer"
          title="Simulate standard punch (Cantillas)"
          @click="triggerTestPunch('same_employee', 'user25065')"
        >
          <Play class="size-2.5 mr-1 text-primary" />
          <span>Simulate Punch</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-6 px-2 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
          title="Simulate early arrival"
          @click="triggerTestPunch('early_in', 'user25065')"
        >
          <Play class="size-2.5 mr-1 text-emerald-600" />
          <span>Simulate Early</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-6 px-2 text-[11px] font-mono text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
          title="Simulate late arrival (triggers late visual and background graphic if configured)"
          @click="triggerTestPunch('late_in', 'user25065')"
        >
          <Play class="size-2.5 mr-1 text-rose-600" />
          <span>Simulate Late</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-6 px-2 text-[11px] font-mono text-primary hover:bg-primary/10 cursor-pointer"
          title="Simulate standard departure"
          @click="triggerTestPunch('normal_out', 'user25065')"
        >
          <Play class="size-2.5 mr-1 text-primary" />
          <span>Simulate OUT</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-6 px-2 text-[11px] font-mono text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 cursor-pointer"
          title="Simulate early departure"
          @click="triggerTestPunch('early_out', 'user25065')"
        >
          <Play class="size-2.5 mr-1 text-amber-600" />
          <span>Simulate Early OUT</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-6 px-2 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/80 cursor-pointer"
          title="Simulate unrecognized Bio ID"
          @click="triggerTestPunch('unknown', 'user99999')"
        >
          <span>Simulate Unknown</span>
        </Button>
      </div>
    </footer>
  </div>
</template>
