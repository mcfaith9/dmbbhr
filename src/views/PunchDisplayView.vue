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
  Server,
  User,
  History,
  PowerOff,
  Megaphone,
  Bell,
  Cake,
  X,
  Sparkles
} from '@lucide/vue'
import { punchDisplayService, normalizeBioId } from '@/services/punchDisplay'
import { punchVoiceService } from '@/services/punchVoiceService'
import { liveAttendanceService } from '@/services/liveAttendance'
import { employeeService } from '@/services/employees'
import { announcementService, type AnnouncementItem } from '@/services/announcements'
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
  const displayDate = punchDisplayService.getDeviceAlignedDate()
  currentTimeStr.value = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(displayDate)

  currentDateStr.value = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(displayDate)
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
  const wg: any = workGroups.value.find(
    g => g.name === punchWg || g.code === punchWgCode || g.id === punchWg
  )
  if (wg) {
    const stdIn = wg.standard_in || wg.standardIn || '08:00'
    const expOut = wg.expected_out || wg.expectedOut || '17:00'
    const grace = wg.grace_period_minutes ?? wg.gracePeriodMinutes ?? 0
    return {
      standardIn: stdIn ? formatHHMM(stdIn) : '8:00 AM',
      expectedOut: expOut ? formatHHMM(expOut) : '5:00 PM',
      gracePeriod: grace
    }
  }
  return {
    standardIn: '8:00 AM',
    expectedOut: '5:00 PM',
    gracePeriod: 0
  }
})

// Section C: Today's Punch Recap Computed Values
const recapTimeIn = computed(() => {
  if (!currentPunch.value) return '8:00 AM'
  if (currentPunch.value.firstInTime) {
    return currentPunch.value.firstInTime
  }
  const bioId = currentPunch.value.bioId || currentPunch.value.userId
  const prevIn = recentPunches.value.find(
    p => p.bioId === bioId && (p.direction === 'TIME IN' || p.direction === 'IN')
  )
  if (prevIn?.time) {
    return prevIn.time
  }
  // Fallback realistic actual IN for display if no prior punch in memory
  return (currentPunch.value.firstInLate || currentPunch.value.isLate) ? '8:01 AM' : '8:00 AM'
})

const recapResultText = computed(() => {
  if (!currentPunch.value) return 'ON TIME'
  const p = currentPunch.value
  const morningLate = Boolean(p.firstInLate)
  const morningLateMins = p.firstInLateMinutes ?? 0
  const isEarlyOut = p.statusCategory === 'undertime' || p.statusLabel === 'EARLY OUT'
  const earlyMins = isEarlyOut ? (p.diffMinutes || 0) : 0

  if (morningLate && isEarlyOut) {
    const lateStr = morningLateMins > 0 ? `LATE ${morningLateMins}m` : 'LATE'
    const earlyStr = earlyMins > 0 ? `EARLY OUT ${earlyMins}m` : 'EARLY OUT'
    return `${lateStr} • ${earlyStr}`
  }
  if (morningLate) {
    return morningLateMins > 0 ? `LATE ${morningLateMins}m` : 'LATE'
  }
  if (isEarlyOut) {
    return earlyMins > 0 ? `EARLY OUT ${earlyMins}m` : 'EARLY OUT'
  }
  if (p.isLate) {
    return p.diffMinutes ? `LATE ${p.diffMinutes}m` : 'LATE'
  }
  if (p.statusCategory === 'early' || p.statusLabel === 'EARLY' || p.isEarly) {
    return 'EARLY'
  }
  return 'ON TIME'
})

// Static immutable configurations for birthday visual effects (allocated once, zero garbage collection)
const BIRTHDAY_BALLOONS = [
  { id: 'bb-1', left: '6%', color: '#f43f5e', duration: '6.5s', delay: '0s', sway: '18px' },
  { id: 'bb-2', left: '19%', color: '#f59e0b', duration: '7.2s', delay: '0.4s', sway: '-22px' },
  { id: 'bb-3', left: '32%', color: '#0ea5e9', duration: '6.8s', delay: '0.1s', sway: '14px' },
  { id: 'bb-4', left: '50%', color: '#10b981', duration: '7.4s', delay: '0.7s', sway: '-18px' },
  { id: 'bb-5', left: '67%', color: '#a855f7', duration: '6.6s', delay: '0.3s', sway: '20px' },
  { id: 'bb-6', left: '81%', color: '#ec4899', duration: '7.0s', delay: '0.5s', sway: '-16px' },
  { id: 'bb-7', left: '93%', color: '#eab308', duration: '6.4s', delay: '0.2s', sway: '15px' },
] as const

const BIRTHDAY_CONFETTI = [
  { id: 'bc-1', left: '10%', size: '8px', color: '#f43f5e', duration: '4.0s', delay: '0.1s', shape: 'rect', rotation: '420deg', drift: '25px' },
  { id: 'bc-2', left: '22%', size: '6px', color: '#f59e0b', duration: '4.5s', delay: '0.3s', shape: 'strip', rotation: '360deg', drift: '-28px' },
  { id: 'bc-3', left: '35%', size: '9px', color: '#0ea5e9', duration: '3.8s', delay: '0.2s', shape: 'rect', rotation: '540deg', drift: '22px' },
  { id: 'bc-4', left: '48%', size: '7px', color: '#10b981', duration: '4.2s', delay: '0.5s', shape: 'strip', rotation: '480deg', drift: '-24px' },
  { id: 'bc-5', left: '59%', size: '8px', color: '#a855f7', duration: '3.9s', delay: '0.3s', shape: 'rect', rotation: '390deg', drift: '28px' },
  { id: 'bc-6', left: '72%', size: '6px', color: '#ec4899', duration: '4.3s', delay: '0.4s', shape: 'strip', rotation: '450deg', drift: '-20px' },
  { id: 'bc-7', left: '84%', size: '9px', color: '#eab308', duration: '3.7s', delay: '0.2s', shape: 'rect', rotation: '510deg', drift: '20px' },
  { id: 'bc-8', left: '16%', size: '7px', color: '#3b82f6', duration: '4.4s', delay: '0.6s', shape: 'strip', rotation: '380deg', drift: '-16px' },
  { id: 'bc-9', left: '42%', size: '8px', color: '#f43f5e', duration: '3.6s', delay: '0.4s', shape: 'rect', rotation: '460deg', drift: '18px' },
  { id: 'bc-10', left: '68%', size: '7px', color: '#f59e0b', duration: '4.1s', delay: '0.7s', shape: 'strip', rotation: '420deg', drift: '-26px' },
  { id: 'bc-11', left: '79%', size: '8px', color: '#10b981', duration: '4.0s', delay: '0.5s', shape: 'rect', rotation: '500deg', drift: '24px' },
  { id: 'bc-12', left: '28%', size: '6px', color: '#a855f7', duration: '4.3s', delay: '0.8s', shape: 'strip', rotation: '360deg', drift: '-22px' },
  { id: 'bc-13', left: '54%', size: '9px', color: '#ec4899', duration: '3.8s', delay: '0.3s', shape: 'rect', rotation: '480deg', drift: '16px' },
  { id: 'bc-14', left: '91%', size: '7px', color: '#0ea5e9', duration: '4.2s', delay: '0.5s', shape: 'strip', rotation: '400deg', drift: '-18px' },
  { id: 'bc-15', left: '7%', size: '8px', color: '#eab308', duration: '3.6s', delay: '0.7s', shape: 'rect', rotation: '440deg', drift: '24px' },
  { id: 'bc-16', left: '76%', size: '7px', color: '#f43f5e', duration: '4.5s', delay: '0.9s', shape: 'strip', rotation: '520deg', drift: '-22px' }
] as const

// Announcement / Reminder / Birthday Overlay State & Sequential Engine
const isAnnouncementVisible = ref(false)
const currentAnnouncement = ref<AnnouncementItem | null>(null)
const birthdayPhase = ref<'anim' | 'modal'>('modal')
let birthdayStageTimer: any = null
let announcementIndex = 0
let idleTimer: any = null
let announcementDismissTimer: any = null
let announcementDelayTimer: any = null
let isPlayingSequence = false
let previewUnsubscribe: (() => void) | null = null

// Exact calculation: Base configured duration from settings, extended by exactly 3 additional seconds for birthdays
function getAnnouncementDurationMs(item?: AnnouncementItem | null): number {
  const durationSeconds = settings.value.displayDurationSeconds || 5
  const baseDurationMs = Math.max(1, durationSeconds) * 1000
  // Birthday modal gets exactly 3 additional seconds (+3000ms) added to the existing duration
  const isBirthday = item?.type === 'birthday'
  return baseDurationMs + (isBirthday ? 3000 : 0)
}

function setupAnnouncementPresentation(item?: AnnouncementItem | null) {
  if (birthdayStageTimer) {
    clearTimeout(birthdayStageTimer)
    birthdayStageTimer = null
  }

  if (item?.type === 'birthday') {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReducedMotion) {
      birthdayPhase.value = 'modal'
    } else {
      // Step 1: Birthday animation plays first for 2.5 seconds
      birthdayPhase.value = 'anim'
      // Step 2: Birthday information modal appears as overlay after animation
      birthdayStageTimer = setTimeout(() => {
        birthdayStageTimer = null
        if (isAnnouncementVisible.value && currentAnnouncement.value?.type === 'birthday') {
          birthdayPhase.value = 'modal'
        }
      }, 2500)
    }
  } else {
    birthdayPhase.value = 'modal'
  }
}

const activeAnnouncements = computed(() => {
  return announcementService.announcements.value.filter(a => a.enabled)
})

function stopAnnouncementSequence() {
  isPlayingSequence = false
  isAnnouncementVisible.value = false
  currentAnnouncement.value = null
  birthdayPhase.value = 'modal'
  if (birthdayStageTimer) {
    clearTimeout(birthdayStageTimer)
    birthdayStageTimer = null
  }
  if (announcementDismissTimer) {
    clearTimeout(announcementDismissTimer)
    announcementDismissTimer = null
  }
  if (announcementDelayTimer) {
    clearTimeout(announcementDelayTimer)
    announcementDelayTimer = null
  }
}

function hideAnnouncement() {
  stopAnnouncementSequence()
  resetIdleTimer()
}

const IDLE_TIMEOUT_MS = 1 * 60 * 1000 // 1 minutes idle time

function resetIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  idleTimer = setTimeout(() => {
    triggerIdleAnnouncement()
  }, IDLE_TIMEOUT_MS)
}

function triggerIdleAnnouncement() {
  // If punch is actively displayed on screen, do not interrupt; wait
  if (currentPunch.value) {
    resetIdleTimer()
    return
  }
  startAnnouncementSequence()
}

function enrichBirthdayCelebrant(item?: AnnouncementItem | null) {
  if (!item || item.type !== 'birthday') return
  const today = new Date()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  const mmdd = `${m}-${d}`

  const celebrant = employees.value.find(e => e.date_of_birth && e.date_of_birth.endsWith(mmdd))
  if (celebrant) {
    item.employeeName = celebrant.full_name
    item.bioId = celebrant.biometric_user_id
    item.department = celebrant.department || 'Operations'
    item.photoUrl = celebrant.photo || `/employee-photos/${celebrant.biometric_user_id}.jpg`
  }
}

function startAnnouncementSequence(startingItem?: AnnouncementItem | null) {
  // Biometric punch ALWAYS has immediate priority
  if (currentPunch.value) {
    return
  }

  // Clear existing announcement timers
  if (announcementDismissTimer) {
    clearTimeout(announcementDismissTimer)
    announcementDismissTimer = null
  }
  if (announcementDelayTimer) {
    clearTimeout(announcementDelayTimer)
    announcementDelayTimer = null
  }

  const list = activeAnnouncements.value

  if (list.length === 0) {
    // If no enabled announcements, but user specifically previewed an item:
    if (startingItem) {
      const singleItem = { ...startingItem }
      enrichBirthdayCelebrant(singleItem)
      currentAnnouncement.value = singleItem
      isAnnouncementVisible.value = true
      isPlayingSequence = true
      setupAnnouncementPresentation(singleItem)

      const displayDurationMs = getAnnouncementDurationMs(singleItem)

      announcementDismissTimer = setTimeout(() => {
        stopAnnouncementSequence()
        resetIdleTimer()
      }, displayDurationMs)
      return
    }

    // Nothing to display if no announcements enabled
    stopAnnouncementSequence()
    resetIdleTimer()
    return
  }

  // If a specific startingItem was provided, find its index in the enabled list
  if (startingItem) {
    const foundIdx = list.findIndex(a => a.id === startingItem.id)
    if (foundIdx !== -1) {
      announcementIndex = foundIdx
    } else {
      // Previewing a specific item not in enabled list: play it first, then continue sequence after 1s
      const customItem = { ...startingItem }
      enrichBirthdayCelebrant(customItem)
      currentAnnouncement.value = customItem
      isAnnouncementVisible.value = true
      isPlayingSequence = true
      setupAnnouncementPresentation(customItem)

      const displayDurationMs = getAnnouncementDurationMs(customItem)

      announcementDismissTimer = setTimeout(() => {
        isAnnouncementVisible.value = false
        // 1-second delay before playing active enabled sequence
        announcementDelayTimer = setTimeout(() => {
          announcementDelayTimer = null
          if (currentPunch.value || !isPlayingSequence) {
            stopAnnouncementSequence()
            return
          }
          announcementIndex = 0
          playSequentialStep()
        }, 1000)
      }, displayDurationMs)
      return
    }
  }

  isPlayingSequence = true
  playSequentialStep()
}

function playSequentialStep() {
  // Biometric punch ALWAYS has immediate absolute priority!
  if (currentPunch.value || !isPlayingSequence) {
    stopAnnouncementSequence()
    return
  }

  const list = activeAnnouncements.value
  if (list.length === 0) {
    stopAnnouncementSequence()
    resetIdleTimer()
    return
  }

  const item = { ...list[announcementIndex % list.length] }
  enrichBirthdayCelebrant(item)

  currentAnnouncement.value = item
  isAnnouncementVisible.value = true
  setupAnnouncementPresentation(item)

  // Use configured display duration from existing Punch Display settings (+3s for birthdays)
  const displayDurationMs = getAnnouncementDurationMs(item)

  if (announcementDismissTimer) clearTimeout(announcementDismissTimer)
  announcementDismissTimer = setTimeout(() => {
    onAnnouncementStepFinished()
  }, displayDurationMs)
}

function onAnnouncementStepFinished() {
  // Biometric punch interrupt check
  if (currentPunch.value || !isPlayingSequence) {
    stopAnnouncementSequence()
    return
  }

  if (birthdayStageTimer) {
    clearTimeout(birthdayStageTimer)
    birthdayStageTimer = null
  }
  birthdayPhase.value = 'modal'

  // Slide announcement out
  isAnnouncementVisible.value = false

  const list = activeAnnouncements.value
  if (list.length === 0) {
    stopAnnouncementSequence()
    resetIdleTimer()
    return
  }

  // Advance to next enabled announcement in rotation
  announcementIndex = (announcementIndex + 1) % list.length

  // WAIT 1 SECOND (1000 ms) before showing next enabled announcement
  const DELAY_BETWEEN_ANNOUNCEMENTS_MS = 1000
  if (announcementDelayTimer) clearTimeout(announcementDelayTimer)
  announcementDelayTimer = setTimeout(() => {
    announcementDelayTimer = null
    // If a biometric punch arrived during the 1-second delay, cancel immediately
    if (currentPunch.value || !isPlayingSequence) {
      stopAnnouncementSequence()
      return
    }
    // Show next enabled announcement
    playSequentialStep()
  }, DELAY_BETWEEN_ANNOUNCEMENTS_MS)
}

function showAnnouncementPreview(item?: AnnouncementItem | null) {
  // If punch is visible, dismiss it so preview can be viewed
  if (currentPunch.value) {
    currentPunch.value = null
    cancelDisplayTimer()
  }

  startAnnouncementSequence(item)
}

function triggerBirthdayPreview() {
  const bdayItem = announcementService.announcements.value.find(a => a.type === 'birthday') || {
    id: 'bday-test-preview',
    type: 'birthday' as const,
    title: 'HAPPY BIRTHDAY!',
    employeeName: 'Juan Dela Cruz',
    bioId: '25065',
    department: 'Operations',
    photoUrl: '/employee-photos/25065.jpg',
    message: 'Wishing you a wonderful birthday and continued success with the DMBB family!',
    enabled: true
  }
  showAnnouncementPreview(bdayItem)
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
      resetIdleTimer()
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
    // PUNCH ALWAYS HAS PRIORITY: Immediately hide any active announcement and reset idle timer!
    hideAnnouncement()
    resetIdleTimer()

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

    // Optional voice announcement (TTS) for the detected punch event
    punchVoiceService.announcePunch(punch, settings.value)

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
  scenario: 'late_in' | 'ontime_in' | 'early_in' | 'lunch_out' | 'lunch_in' | 'normal_out' | 'early_out' | 'late_then_out' | 'same_employee' | 'unknown' | 'full_day_sequence',
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

  if (scenario === 'full_day_sequence') {
    // 1. Morning Late IN: 8:01:23 AM (Late by 1m)
    await triggerTestPunch('late_in', rawUserId)
    // 2. Lunch OUT: 12:02:12 PM (BREAK OUT)
    setTimeout(() => {
      triggerTestPunch('lunch_out', rawUserId)
    }, 1500)
    // 3. Lunch IN: 12:57:29 PM (BREAK IN)
    setTimeout(() => {
      triggerTestPunch('lunch_in', rawUserId)
    }, 3000)
    // 4. Shift Final OUT: 5:00:00 PM (TIME OUT, recap preserves LATE 1m)
    setTimeout(() => {
      triggerTestPunch('normal_out', rawUserId)
    }, 4500)
    return
  }

  const mockDate = new Date()
  let direction: 'IN' | 'OUT' | 'BREAK_OUT' | 'BREAK_IN' = 'IN'
  let testFirstInTime: string | undefined = undefined
  let testFirstInLate: boolean | undefined = undefined
  let testFirstInLateMinutes: number | undefined = undefined
  testSeq++

  switch (scenario) {
    case 'same_employee':
      // Progresses employee across workday sequence: 8:00 AM (IN), 12:05 PM (LUNCH OUT), 12:55 PM (LUNCH IN), 5:00 PM (OUT)
      if (testSeq % 4 === 1) {
        mockDate.setHours(8, 0, (testSeq * 7) % 60, 0)
      } else if (testSeq % 4 === 2) {
        mockDate.setHours(12, 5, (testSeq * 7) % 60, 0)
      } else if (testSeq % 4 === 3) {
        mockDate.setHours(12, 55, (testSeq * 7) % 60, 0)
      } else {
        mockDate.setHours(17, 0, (testSeq * 7) % 60, 0)
      }
      direction = undefined as any
      break
    case 'late_in':
      mockDate.setHours(8, 1, 23, 0) // 8:01:23 AM -> LATE IN (1m late)
      direction = 'IN'
      testFirstInTime = '8:01:23 AM'
      testFirstInLate = true
      testFirstInLateMinutes = 1
      break
    case 'ontime_in':
      mockDate.setHours(8, 0, (testSeq * 4) % 60, 0) // 8:00 AM -> ON TIME IN (Minute precision: 8:00:xx AM is ON TIME)
      direction = 'IN'
      testFirstInTime = '8:00:00 AM'
      testFirstInLate = false
      testFirstInLateMinutes = 0
      break
    case 'early_in':
      mockDate.setHours(7, 48, (testSeq * 5) % 60, 0) // 7:48 AM -> EARLY IN
      direction = 'IN'
      testFirstInTime = '7:48:00 AM'
      testFirstInLate = false
      testFirstInLateMinutes = 0
      break
    case 'lunch_out':
      mockDate.setHours(12, 2, 12, 0) // 12:02:12 PM -> BREAK OUT (Lunch OUT)
      direction = 'BREAK_OUT'
      testFirstInTime = '8:01:23 AM'
      testFirstInLate = true
      testFirstInLateMinutes = 1
      break
    case 'lunch_in':
      mockDate.setHours(12, 57, 29, 0) // 12:57:29 PM -> BREAK IN (Lunch IN)
      direction = 'BREAK_IN'
      testFirstInTime = '8:01:23 AM'
      testFirstInLate = true
      testFirstInLateMinutes = 1
      break
    case 'normal_out':
      mockDate.setHours(17, 0, 0, 0) // 5:00:00 PM -> TIME OUT (Normal OUT on or after 5pm)
      direction = 'OUT'
      testFirstInTime = '8:01:23 AM' // Morning arrival preserved
      testFirstInLate = true
      testFirstInLateMinutes = 1
      break
    case 'early_out':
      mockDate.setHours(16, 30, (testSeq * 2) % 60, 0) // 4:30 PM -> EARLY OUT (Before 5pm)
      direction = 'OUT'
      testFirstInTime = '7:55 AM' // Actual morning arrival
      testFirstInLate = false
      testFirstInLateMinutes = 0
      break
    case 'late_then_out':
      // Test scenario F: employee was late in morning (8:17 AM), now punches OUT at 5:02 PM
      mockDate.setHours(17, 2, (testSeq * 3) % 60, 0)
      direction = 'OUT'
      testFirstInTime = '8:17 AM'
      testFirstInLate = true
      testFirstInLateMinutes = 17
      break
    case 'unknown':
      mockDate.setHours(8, 2, (testSeq * 6) % 60, 0)
      direction = 'IN'
      break
  }

  const logState = direction === 'OUT' ? 4 : (direction === 'BREAK_OUT' ? 2 : (direction === 'BREAK_IN' ? 3 : 1))

  const log: AttendanceLog = {
    id: `test-punch-${normalizedId}-${Date.now()}-${testSeq}`,
    user_id: rawUserId,
    employee_name: rawUserId,
    employee_id: normalizedId,
    attendance_time: mockDate.toISOString(),
    type: 1,
    state: logState,
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
    gracePeriod: 0,
    expectedOut: '17:00',
    firstInTime: testFirstInTime,
    firstInLate: testFirstInLate,
    firstInLateMinutes: testFirstInLateMinutes
  })
}

onMounted(async () => {
  punchDisplayService.resetDeviceTimeOffset()
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

  // Hydrate session recent punches from IndexedDB for today's date if empty
  await punchDisplayService.hydrateRecentPunches()

  // Auto-connect to agent if available
  liveAttendanceService.connect()

  // Initialize 3-minute idle timer
  resetIdleTimer()

  // Listen for announcement preview requests (from Settings tab or test controls)
  previewUnsubscribe = announcementService.onPreview((item) => {
    showAnnouncementPreview(item)
  })

  // Development/UI adjustment shortcut: P = Pause/Resume display timer
  window.addEventListener('keydown', handleDisplayKeyboard)
})

onUnmounted(() => {
  punchVoiceService.cancelSpeech()
  if (clockTimer) clearInterval(clockTimer)
  cancelDisplayTimer()
  if (idleTimer) clearTimeout(idleTimer)
  hideAnnouncement()
  if (birthdayStageTimer) clearTimeout(birthdayStageTimer)
  if (previewUnsubscribe) previewUnsubscribe()
  window.removeEventListener('keydown', handleDisplayKeyboard)
  if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId)
})
</script>

<template>
  <div class="min-h-screen h-screen h-[100dvh] max-h-[100dvh] w-screen max-w-[100vw] bg-background text-foreground flex flex-col select-none font-sans overflow-hidden relative">
    <!-- Overlay Confetti Canvas -->
    <canvas ref="canvasRef" class="pointer-events-none fixed inset-0 z-50 size-full"></canvas>

    <!-- Announcement / Reminder / Birthday Overlay System (High-Visibility TV / Monitor Display) -->
    <Transition name="announcement-slide">
      <div
        v-if="isAnnouncementVisible && currentAnnouncement && !currentPunch"
        class="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-8 md:p-12 bg-black/55 backdrop-blur-xs select-none"
      >
        <!-- Celebratory Flying Balloons and Lightweight Confetti Layer (Celebration for Birthday) -->
        <div
          v-if="currentAnnouncement.type === 'birthday'"
          class="pointer-events-none fixed inset-0 z-30 overflow-hidden"
          aria-hidden="true"
        >
          <!-- Flying Balloons: Float gently upward from bottom of screen beyond top -->
          <div
            v-for="balloon in BIRTHDAY_BALLOONS"
            :key="balloon.id"
            class="birthday-balloon"
            :style="{
              left: balloon.left,
              bottom: '-140px',
              animationDuration: balloon.duration,
              animationDelay: balloon.delay,
              '--balloon-sway': balloon.sway
            }"
          >
            <svg
              class="w-10 sm:w-12 md:w-14 h-16 sm:h-20 drop-shadow-lg opacity-90"
              viewBox="0 0 44 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <!-- Balloon body -->
              <ellipse cx="22" cy="22" rx="20" ry="22" :fill="balloon.color" />
              <!-- Highlight gloss -->
              <ellipse cx="15" cy="14" rx="5" ry="7" fill="#ffffff" fill-opacity="0.32" transform="rotate(-25 15 14)" />
              <!-- Knot -->
              <polygon points="19,43 25,43 22,46" :fill="balloon.color" />
              <!-- String -->
              <path d="M22 46 Q19 54, 23 60 T21 64" stroke="rgba(255,255,255,0.45)" stroke-width="1.5" stroke-linecap="round" fill="none" />
            </svg>
          </div>

          <!-- Confetti: Lightweight festive pieces fluttering around celebratory scene -->
          <div
            v-for="confetto in BIRTHDAY_CONFETTI"
            :key="confetto.id"
            class="birthday-confetti"
            :style="{
              left: confetto.left,
              top: '-24px',
              width: confetto.size,
              height: confetto.shape === 'strip' ? (parseInt(confetto.size) * 1.8) + 'px' : confetto.size,
              backgroundColor: confetto.color,
              animationDuration: confetto.duration,
              animationDelay: confetto.delay,
              '--confetti-rot': confetto.rotation,
              '--confetti-drift': confetto.drift
            }"
          ></div>
        </div>

        <!-- Main Modal Container Card (Z-index 40 so it stays above floating balloons) -->
        <div
          class="relative z-40 w-[94%] sm:w-[86%] md:w-[76%] lg:w-[68%] max-w-5xl mx-auto rounded-3xl border shadow-2xl p-6 sm:p-10 md:p-12 backdrop-blur-md overflow-hidden text-card-foreground bg-card/95 border-border/80 transition-colors duration-200"
          :class="[
            currentAnnouncement.type === 'birthday'
              ? 'border-rose-500/40 bg-gradient-to-b from-card via-card to-rose-500/10 shadow-rose-950/25 h-[580px] sm:h-[620px] md:h-[660px] max-h-[calc(100vh-2rem)] flex flex-col justify-between'
              : currentAnnouncement.type === 'reminder'
                ? 'border-amber-500/40 bg-gradient-to-b from-card via-card to-amber-500/10 shadow-amber-950/25'
                : 'border-primary/40 bg-gradient-to-b from-card via-card to-primary/10 shadow-primary/15'
          ]"
        >
          <!-- Subtle Top Accent Glow Bar -->
          <div
            class="absolute top-0 left-0 right-0 h-2"
            :class="[
              currentAnnouncement.type === 'birthday'
                ? 'bg-gradient-to-r from-rose-500 via-pink-400 to-amber-400'
                : currentAnnouncement.type === 'reminder'
                  ? 'bg-gradient-to-r from-amber-500 via-orange-400 to-amber-300'
                  : 'bg-gradient-to-r from-primary via-blue-500 to-emerald-400'
            ]"
          ></div>

          <!-- Close button -->
          <button
            type="button"
            class="absolute top-4 right-4 sm:top-5 sm:right-5 size-9 sm:size-10 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer shadow-xs z-50"
            title="Dismiss Announcement"
            @click="hideAnnouncement"
          >
            <X class="size-5" />
          </button>

          <!-- Type Header Badge (Large TV Scale) -->
          <div class="flex items-center justify-center mb-4 sm:mb-6 shrink-0">
            <span
              class="px-5 sm:px-6 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm md:text-base font-mono font-black uppercase tracking-widest flex items-center gap-2 sm:gap-2.5 border shadow-sm"
              :class="[
                currentAnnouncement.type === 'birthday'
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                  : currentAnnouncement.type === 'reminder'
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
                    : 'bg-primary/15 text-primary border-primary/30'
              ]"
            >
              <Cake v-if="currentAnnouncement.type === 'birthday'" class="size-5 sm:size-6" />
              <Bell v-else-if="currentAnnouncement.type === 'reminder'" class="size-5 sm:size-6" />
              <Megaphone v-else class="size-5 sm:size-6" />
              <span>{{ currentAnnouncement.type === 'birthday' ? 'HAPPY BIRTHDAY!' : currentAnnouncement.type.toUpperCase() }}</span>
            </span>
          </div>

          <!-- Birthday Specific Presentation: Animation Sequence Plays First -> Information Modal Appears After -->
          <div
            v-if="currentAnnouncement.type === 'birthday'"
            class="relative w-full flex-1 min-h-0 overflow-hidden grid grid-cols-1 grid-rows-1 place-items-center"
          >
            <Transition name="fade-stage" mode="out-in">
              <!-- Step 1: Celebratory Birthday Animation (plays first) -->
              <div
                v-if="birthdayPhase === 'anim'"
                key="birthday-anim-stage"
                class="col-start-1 row-start-1 w-full h-full flex flex-col items-center justify-center text-center space-y-3 sm:space-y-4 px-2"
              >
                <!-- Animated Spotlight Ring -->
                <div class="relative py-1 shrink-0">
                  <Avatar class="size-32 sm:size-40 md:size-44 border-4 sm:border-8 border-rose-400/50 shadow-2xl ring-8 ring-rose-500/20 animate-pulse-gentle">
                    <AvatarImage
                      v-if="currentAnnouncement.photoUrl"
                      :src="currentAnnouncement.photoUrl"
                      :alt="currentAnnouncement.employeeName"
                    />
                    <AvatarFallback class="bg-rose-500/20 text-rose-500 text-4xl sm:text-5xl font-black">
                      {{ (currentAnnouncement.employeeName || 'B').charAt(0) }}
                    </AvatarFallback>
                  </Avatar>
                  <div class="absolute -bottom-1 -right-1 bg-amber-400 text-slate-950 p-2 sm:p-2.5 rounded-full shadow-lg">
                    <Sparkles class="size-5 sm:size-6 text-slate-950" />
                  </div>
                </div>

                <div class="space-y-1 sm:space-y-1.5 max-w-2xl shrink-0">
                  <div class="text-xs sm:text-sm font-mono uppercase tracking-widest text-muted-foreground font-semibold">
                    Warmest Birthday Wishes to
                  </div>
                  <h3 class="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-foreground leading-tight">
                    {{ currentAnnouncement.employeeName || currentAnnouncement.title }}
                  </h3>
                  <div v-if="currentAnnouncement.department" class="text-sm sm:text-base font-mono text-rose-500 dark:text-rose-400 font-bold uppercase tracking-wider">
                    {{ currentAnnouncement.department }}
                  </div>
                </div>
              </div>

              <!-- Step 2: Birthday Information Modal Overlay (appears after animation) -->
              <div
                v-else
                key="birthday-info-stage"
                class="col-start-1 row-start-1 w-full h-full flex flex-col items-center justify-center text-center space-y-3 sm:space-y-4 px-2"
              >
                <!-- Circular Celebrant Photo (Identical sizing and centering as Stage 1) -->
                <div class="relative py-1 shrink-0">
                  <Avatar class="size-32 sm:size-40 md:size-44 border-4 sm:border-8 border-rose-400/50 shadow-2xl ring-8 ring-rose-500/20">
                    <AvatarImage
                      v-if="currentAnnouncement.photoUrl"
                      :src="currentAnnouncement.photoUrl"
                      :alt="currentAnnouncement.employeeName"
                    />
                    <AvatarFallback class="bg-rose-500/20 text-rose-500 text-4xl sm:text-5xl font-black">
                      {{ (currentAnnouncement.employeeName || 'B').charAt(0) }}
                    </AvatarFallback>
                  </Avatar>
                  <div class="absolute -bottom-1 -right-1 bg-amber-400 text-slate-950 p-2 sm:p-2.5 rounded-full shadow-lg">
                    <Sparkles class="size-5 sm:size-6 text-slate-950" />
                  </div>
                </div>

                <!-- Celebrant Name & Dept (Identical typography as Stage 1) -->
                <div class="space-y-1 sm:space-y-1.5 max-w-2xl shrink-0">
                  <h3 class="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-foreground leading-tight">
                    {{ currentAnnouncement.employeeName || currentAnnouncement.title }}
                  </h3>
                  <div v-if="currentAnnouncement.department" class="text-sm sm:text-base font-mono text-rose-500 dark:text-rose-400 font-bold uppercase tracking-wider">
                    {{ currentAnnouncement.department }}
                  </div>
                </div>

                <!-- Birthday Greeting Message -->
                <p class="text-base sm:text-xl md:text-2xl text-muted-foreground max-w-2xl leading-relaxed font-medium line-clamp-3 sm:line-clamp-4">
                  {{ currentAnnouncement.message }}
                </p>
              </div>
            </Transition>
          </div>

          <!-- Standard Announcement / Reminder Layout -->
          <div v-else class="text-center space-y-4 sm:space-y-6 py-2 sm:py-4 flex-1 flex flex-col items-center justify-center">
            <h3 class="text-3xl font-black tracking-tight text-foreground leading-tight max-w-4xl mx-auto uppercase">
              {{ currentAnnouncement.title }}
            </h3>
            <p class="text-lg sm:text-2xl md:text-3xl text-muted-foreground max-w-3xl mx-auto leading-relaxed font-medium">
              {{ currentAnnouncement.message }}
            </p>
          </div>

          <!-- Subtle Footer Priority Notice -->
          <div class="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t text-center text-xs sm:text-sm font-mono text-muted-foreground/75 flex items-center justify-center gap-2 shrink-0">
            <Fingerprint class="size-4 sm:size-5 text-primary animate-pulse" />
            <span>Biometric scan immediately takes priority</span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Top Bar / Kiosk Header (Native DMBBHR Style) -->
    <header class="border-b bg-card px-4 sm:px-6 lg:px-8 xl:px-10 py-2 sm:py-2.5 lg:py-3 xl:py-3.5 flex items-center justify-between gap-3 shrink-0 shadow-2xs">
      <div class="flex items-center gap-2.5 sm:gap-3.5">
        <div class="flex flex-row flex-wrap items-center gap-12">
          <div class="*:data-[slot=avatar]:ring-background flex -space-x-2 *:data-[slot=avatar]:ring-2">
            <Avatar class="size-9 sm:size-10 xl:size-11 border-2 border-gray-100 bg-white">
              <AvatarImage src="/dmbblogo.png" alt="DMBB Logo" />
              <AvatarFallback>DMBB</AvatarFallback>
            </Avatar>

            <Avatar class="size-9 sm:size-10 xl:size-11 border-2 border-gray-100 bg-white">
              <AvatarImage src="/dbblogo.png" alt="DBB Logo" />
              <AvatarFallback>DBB</AvatarFallback>
            </Avatar>
          </div>
        </div>
        <div>
          <div class="flex items-center gap-1.5 sm:gap-2">
            <span class="font-bold text-sm sm:text-base xl:text-lg tracking-tight text-foreground">
              DMBB / DBB Biometrics
            </span>
            <Badge variant="outline" class="text-[9px] sm:text-[10px] xl:text-xs font-mono px-1.5 sm:px-2 py-0 bg-muted/40">
              Live Kiosk
            </Badge>
          </div>
          <p class="text-[11px] sm:text-xs xl:text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
            <Server class="size-2.5 sm:size-3 xl:size-3.5 text-muted-foreground" />
            <span>BISMAC BISBIO B-29b • 192.168.1.201:4370</span>
          </p>
        </div>
      </div>

      <!-- Live Clock Display (PC Time Minus 5 Minutes in Asia/Manila) -->
      <div class="flex flex-col items-center justify-center px-3.5 py-0.5 sm:py-1">
        <div class="flex items-center gap-2 leading-none">
          <span class="font-mono text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-black tracking-tight text-foreground leading-none">
            {{ currentTimeStr }}
          </span>
          <span
            class="text-[9px] sm:text-[10px] xl:text-xs font-mono px-1.5 sm:px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
          >
            DISPLAY TIME
          </span>
        </div>
        <div class="text-xs sm:text-sm xl:text-base text-muted-foreground font-medium flex items-center gap-1 mt-0.5 leading-none">
          <CalendarIcon class="size-3 sm:size-3.5 xl:size-4 text-muted-foreground" />
          {{ currentDateStr }}
        </div>
      </div>

      <!-- Actions & Controls -->
      <div class="flex items-center gap-2 sm:gap-2.5">
        <!-- Live Status Badge -->
        <div
          v-if="settings.enabled"
          class="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-muted/50 border text-xs xl:text-sm"
        >
          <span class="relative flex size-2 xl:size-2.5">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full size-2 xl:size-2.5 bg-emerald-500"></span>
          </span>
          <span class="text-foreground font-mono text-[10px] xl:text-xs font-medium">LISTENING</span>
        </div>
        <div
          v-else
          class="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs xl:text-sm text-amber-700 dark:text-amber-300"
        >
          <PowerOff class="size-3 xl:size-3.5 text-amber-600" />
          <span class="font-mono text-[10px] xl:text-xs font-medium">DISABLED</span>
        </div>

        <!-- Temporary Development Pause Indicator -->
        <Badge
          v-if="isDisplayPaused"
          variant="outline"
          class="hidden sm:flex items-center gap-1 text-[10px] xl:text-xs py-1.5 font-mono font-bold text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10"
        >
          <span class="size-1.5 xl:size-2 rounded-full bg-amber-500"></span>
          PAUSED
        </Badge>

        <!-- Audio Toggle -->
        <Button
          variant="outline"
          size="sm"
          class="size-7.5 sm:size-8 xl:size-9 p-0 cursor-pointer"
          :title="settings.soundEnabled ? 'Mute Chime' : 'Unmute Chime'"
          @click="toggleSound"
        >
          <Volume2 v-if="settings.soundEnabled" class="size-3.5 sm:size-4 xl:size-4.5 text-primary" />
          <VolumeX v-else class="size-3.5 sm:size-4 xl:size-4.5 text-muted-foreground" />
        </Button>

        <!-- Fullscreen Toggle -->
        <Button
          variant="outline"
          size="sm"
          class="size-7.5 sm:size-8 xl:size-9 p-0 cursor-pointer"
          :title="isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'"
          @click="toggleFullscreen"
        >
          <Minimize2 v-if="isFullscreen" class="size-3.5 sm:size-4 xl:size-4.5" />
          <Maximize2 v-else class="size-3.5 sm:size-4 xl:size-4.5" />
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
    <main class="flex-1 min-h-0 px-3 sm:px-5 md:px-6 lg:px-8 xl:px-10 py-2 sm:py-3 md:py-4 lg:py-5 flex flex-col lg:flex-row gap-3 sm:gap-4 md:gap-5 xl:gap-6 2xl:gap-8 w-full items-stretch justify-center overflow-hidden">
      
      <!-- Primary Active Punch / Idle Display Card -->
      <section class="flex-1 min-h-0 flex flex-col justify-center w-full h-full">
        <!-- CURRENT PUNCH CARD (Modern Profile/Post Card Composition) -->
        <div
          v-if="currentPunch && settings.enabled"
          :key="currentPunch.eventId || currentPunch.id"
          class="relative text-card-foreground border rounded-2xl lg:rounded-3xl shadow-sm overflow-hidden flex flex-col justify-between transition-all animate-in fade-in zoom-in-95 duration-200 h-full w-full"
          :class="[
            hasCustomLateGraphic
              ? 'border-destructive/40 shadow-xl bg-transparent'
              : (currentPunch.isLate && settings.lateVisualEnabled ? 'border-destructive/30 bg-card' : 'bg-card border-border/80')
          ]"
        >
          <!-- Full-Card/Cover Wallpaper for Late IN Punches when Custom Graphic Configured (supports JPG/JPEG, PNG) -->
          <template v-if="hasCustomLateGraphic">
            <div
              class="absolute inset-0 bg-cover bg-[center_70%] bg-no-repeat transition-transform duration-700 pointer-events-none"
              :style="{ backgroundImage: `url('${settings.customLateImageUrl.trim()}')` }"
            ></div>

            <!-- Subtle readability overlay -->
            <div class="absolute inset-0 bg-black/50 dark:bg-black/60 pointer-events-none"></div>
          </template>

          <!-- 1. Profile Cover Area Header -->
          <div
            class="relative w-full h-[clamp(5rem,13vh,11.5rem)] shrink-0 overflow-hidden flex items-start justify-between p-3.5 sm:p-5 lg:p-6 xl:p-8"
          >
            <!-- Decorative pattern on clean cover -->
            <div
              v-if="!hasCustomLateGraphic"
              class="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_30%,_var(--tw-gradient-stops))] from-primary/40 via-transparent to-transparent pointer-events-none"
            ></div>

            <!-- Cover Left: Biometric Terminal Badge -->
            <div
              class="relative z-10 flex items-center gap-2 px-3 sm:px-4 lg:px-5 py-1 sm:py-1.5 lg:py-2 rounded-lg text-xs sm:text-sm lg:text-base xl:text-lg font-mono font-bold uppercase tracking-wider shadow-xs"
              :class="
                hasCustomLateGraphic
                  ? 'bg-black/60 text-white backdrop-blur-md border border-white/20'
                  : (currentPunch.isLate && settings.lateVisualEnabled
                      ? 'bg-destructive/90 text-white border border-destructive/40'
                      : 'bg-card/85 text-foreground border border-border/70 backdrop-blur-xs')
              "
            >
              <Fingerprint
                class="size-4 sm:size-5 lg:size-6"
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
              class="px-3.5 sm:px-5 lg:px-6 py-1 sm:py-1.5 lg:py-2 text-xs sm:text-sm lg:text-base xl:text-lg font-bold uppercase tracking-wider"
              :class="currentPunch.isLate ? 'text-white' : ''"
            >
              {{ currentPunch.statusLabel }}
            </Badge>
          </div>

          <!-- 2. Circular Employee Photo (Centered Overlapping Bottom Edge of Cover) -->
          <div class="flex justify-center -mt-[clamp(3.25rem,7.5vh,6.75rem)] relative z-20 shrink-0">
            <div class="relative">
              <div
                class="size-[clamp(6.5rem,15vh,13.5rem)] rounded-full border-4 sm:border-[5px] lg:border-[6px] shadow-2xl overflow-hidden flex items-center justify-center transition-transform"
                :class="[
                  hasCustomLateGraphic
                    ? 'shadow-2xl border-white/40'
                    : (currentPunch.isLate && settings.lateVisualEnabled
                        ? 'shadow-xl border-destructive/50'
                        : 'bg-white shadow-xl border-card ring-4 ring-gray-200/80 dark:ring-border/80')
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
                  <User class="size-1/2 text-muted-foreground/70" />
                </div>
              </div>

              <!-- Direction Badge Pin anchored to the circular avatar -->
              <div class="absolute -bottom-2.5 sm:-bottom-3 lg:-bottom-3.5 left-0 right-0 flex justify-center">
                <span
                  class="px-3.5 sm:px-5 lg:px-6 py-0.5 sm:py-1 lg:py-1.5 rounded-full text-[11px] sm:text-xs md:text-sm lg:text-base xl:text-lg font-mono font-black uppercase tracking-wider border text-center shadow-md"
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
          <div class="flex-1 flex flex-col justify-between px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 pt-2 sm:pt-3 lg:pt-4 pb-2 sm:pb-3 min-h-0 relative z-10">
            <!-- A. Employee Identity -->
            <div class="text-center space-y-1 sm:space-y-1.5">
              <h2
                class="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-black tracking-tight truncate leading-tight"
                :class="hasCustomLateGraphic ? 'text-white' : 'text-foreground'"
              >
                {{ currentPunch.employeeName }}
              </h2>

              <!-- BIO ID and Department -->
              <div
                class="flex items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm md:text-base lg:text-lg font-medium flex-wrap pt-0.5"
                :class="hasCustomLateGraphic ? 'text-zinc-200' : 'text-muted-foreground'"
              >
                <span
                  class="font-mono text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl font-black px-3 sm:px-4 lg:px-5 py-1 sm:py-1.5 rounded-lg border shadow-xs tracking-wider"
                  :class="hasCustomLateGraphic ? 'bg-black/50 border-white/20 text-white' : 'bg-muted/80 border-border text-foreground'"
                >
                  BIO ID: {{ currentPunch.userId || currentPunch.bioId }}
                </span>
                <span
                  class="font-mono text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl font-bold px-3 sm:px-4 lg:px-5 py-1 sm:py-1.5 rounded-lg border shadow-xs"
                  :class="hasCustomLateGraphic ? 'bg-black/50 border-white/20 text-white' : 'bg-muted/80 border-border text-foreground'"
                >
                  {{ currentPunch.department || 'Operations' }}
                </span>
              </div>

              <!-- Work Group and Location -->
              <div
                class="flex items-center justify-center gap-2 text-xs sm:text-sm md:text-base lg:text-lg font-semibold font-mono uppercase tracking-widest pt-0.5"
                :class="hasCustomLateGraphic ? 'text-zinc-300' : 'text-muted-foreground/90'"
              >
                <span class="uppercase">{{ currentPunch.workGroup || 'Group C' }}</span>
                <span :class="hasCustomLateGraphic ? 'text-zinc-400' : 'text-border'">•</span>
                <span>{{ currentPunch.locationName || 'DBB CEBU' }}</span>
              </div>
            </div>

            <!-- B. Punch Information Card -->
            <div
              class="w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto rounded-2xl sm:rounded-3xl border p-2.5 sm:p-3.5 md:p-4 lg:p-5 xl:p-6 flex flex-col items-center text-center shadow-xs transition-all my-1 sm:my-1.5 lg:my-2"
              :class="[
                hasCustomLateGraphic
                  ? 'text-white shadow-xl border-none bg-black/40 backdrop-blur-xs'
                  : (currentPunch.isLate && settings.lateVisualEnabled
                      ? 'bg-rose-500/10 dark:bg-rose-950/20 border-rose-500/30 text-foreground'
                      : 'bg-muted/35 dark:bg-muted/20 border-border/70 text-foreground')
              ]"
            >
              <div
                class="text-xs sm:text-sm lg:text-base xl:text-lg font-mono uppercase tracking-widest font-black mb-0.5 sm:mb-1"
                :class="hasCustomLateGraphic ? 'text-zinc-300' : 'text-muted-foreground'"
              >
                {{ currentPunch.direction === 'OUT' ? 'Departure Time' : 'Arrival Time' }}
              </div>

              <!-- Exact Punch Time -->
              <div
                class="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl 2xl:text-9xl font-mono font-black tracking-tight leading-none my-0.5 sm:my-1 lg:my-1.5"
                :class="hasCustomLateGraphic ? 'text-white' : 'text-foreground'"
              >
                {{ formatPunchTime(currentPunch.timestamp) }}
              </div>

              <!-- Punch Date -->
              <div
                class="text-xs sm:text-sm md:text-base xl:text-lg font-medium mt-0.5 mb-2 sm:mb-2.5 lg:mb-3 flex items-center gap-1.5"
                :class="hasCustomLateGraphic ? 'text-zinc-300' : 'text-muted-foreground'"
              >
                <CalendarIcon class="size-3.5 sm:size-4 lg:size-5" />
                <span>{{ formatPunchDate(currentPunch.timestamp) }}</span>
              </div>

              <!-- Attendance Result Strip -->
              <div
                class="w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl rounded-xl sm:rounded-2xl py-2 sm:py-2.5 lg:py-3 xl:py-3.5 px-4 sm:px-6 lg:px-8 flex items-center justify-center gap-2 text-sm sm:text-base lg:text-lg xl:text-xl 2xl:text-2xl font-black uppercase tracking-wide border shadow-sm"
                :class="[
                  currentPunch.isLate && settings.lateVisualEnabled
                    ? 'bg-rose-600 text-white border-rose-700'
                    : currentPunch.statusCategory === 'undertime'
                      ? 'bg-amber-500 text-slate-950 border-amber-600'
                      : 'bg-emerald-600 text-white border-emerald-700'
                ]"
              >
                <span class="truncate">
                  {{ currentPunch.statusDetail }}
                </span>
              </div>
            </div>

            <!-- C. Supporting Schedule Context & Today's Punch Recap -->
            <!-- C1. TODAY'S PUNCH RECAP (When Direction is OUT) -->
            <div
              v-if="currentPunch.direction === 'OUT'"
              class="w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4 xl:gap-5 text-center"
            >
              <div
                class="p-1.5 sm:p-2.5 lg:p-3 xl:p-3.5 rounded-xl sm:rounded-2xl border flex flex-col items-center justify-center shadow-2xs"
                :class="hasCustomLateGraphic ? 'border-white/15 text-zinc-200 backdrop-blur-xs bg-black/30' : 'bg-muted/25 border-border/60 text-muted-foreground'"
              >
                <span class="text-[10px] sm:text-xs lg:text-sm xl:text-base font-mono uppercase tracking-wider font-semibold opacity-80">Time In</span>
                <span class="font-mono font-black text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl mt-0.5" :class="hasCustomLateGraphic ? 'text-white' : 'text-foreground'">
                  {{ recapTimeIn }}
                </span>
              </div>

              <div
                class="p-1.5 sm:p-2.5 lg:p-3 xl:p-3.5 rounded-xl sm:rounded-2xl border flex flex-col items-center justify-center shadow-2xs"
                :class="hasCustomLateGraphic ? 'border-white/15 text-zinc-200 backdrop-blur-xs bg-black/30' : 'bg-muted/25 border-border/60 text-muted-foreground'"
              >
                <span class="text-[10px] sm:text-xs lg:text-sm xl:text-base font-mono uppercase tracking-wider font-semibold opacity-80">Time Out</span>
                <span class="font-mono font-black text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl mt-0.5" :class="hasCustomLateGraphic ? 'text-white' : 'text-foreground'">
                  {{ formatPunchTime(currentPunch.timestamp) }}
                </span>
              </div>

              <div
                class="p-1.5 sm:p-2.5 lg:p-3 xl:p-3.5 rounded-xl sm:rounded-2xl border flex flex-col items-center justify-center shadow-2xs"
                :class="hasCustomLateGraphic ? 'border-white/15 text-zinc-200 backdrop-blur-xs bg-black/30' : 'bg-muted/25 border-border/60 text-muted-foreground'"
              >
                <span class="text-[10px] sm:text-xs lg:text-sm xl:text-base font-mono uppercase tracking-wider font-semibold opacity-80">Remarks</span>
                <span class="font-mono font-bold text-xs sm:text-sm mt-0.5">
                  <Badge
                    :variant="
                      (currentPunch.firstInLate || currentPunch.isLate)
                        ? 'destructive'
                        : (currentPunch.statusCategory === 'undertime' ? 'warning' : 'success')
                    "
                    class="px-2.5 sm:px-4 lg:px-5 py-0.5 sm:py-1 lg:py-1.5 text-xs sm:text-sm lg:text-base xl:text-lg font-mono font-black uppercase tracking-wider shadow-xs"
                    :class="(currentPunch.firstInLate || currentPunch.isLate) ? 'text-white' : ''"
                  >
                    {{ recapResultText }}
                  </Badge>
                </span>
              </div>
            </div>
            <!-- C2. Supporting Schedule Context (When Direction is NOT OUT) -->
            <div
              v-else-if="currentSchedule"
              class="w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4 xl:gap-5 text-center"
            >
              <div
                class="p-1.5 sm:p-2.5 lg:p-3 xl:p-3.5 rounded-xl sm:rounded-2xl border flex flex-col items-center justify-center shadow-2xs"
                :class="hasCustomLateGraphic ? 'border-white/15 text-zinc-200 backdrop-blur-xs bg-black/30' : 'bg-muted/25 border-border/60 text-muted-foreground'"
              >
                <span class="text-[10px] sm:text-xs lg:text-sm xl:text-base font-mono uppercase tracking-wider font-semibold opacity-80">Scheduled In</span>
                <span
                  class="font-mono font-black text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl mt-0.5"
                  :class="hasCustomLateGraphic ? 'text-white' : 'text-foreground'"
                >
                  {{ currentSchedule.standardIn }}
                </span>
              </div>

              <div
                class="p-1.5 sm:p-2.5 lg:p-3 xl:p-3.5 rounded-xl sm:rounded-2xl border flex flex-col items-center justify-center shadow-2xs"
                :class="hasCustomLateGraphic ? 'border-white/15 text-zinc-200 backdrop-blur-xs bg-black/30' : 'bg-muted/25 border-border/60 text-muted-foreground'"
              >
                <span class="text-[10px] sm:text-xs lg:text-sm xl:text-base font-mono uppercase tracking-wider font-semibold opacity-80">Expected Out</span>
                <span
                  class="font-mono font-black text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl mt-0.5"
                  :class="hasCustomLateGraphic ? 'text-white' : 'text-foreground'"
                >
                  {{ currentSchedule.expectedOut }}
                </span>
              </div>

              <div
                class="p-1.5 sm:p-2.5 lg:p-3 xl:p-3.5 rounded-xl sm:rounded-2xl border flex flex-col items-center justify-center shadow-2xs"
                :class="hasCustomLateGraphic ? 'border-white/15 text-zinc-200 backdrop-blur-xs bg-black/30' : 'bg-muted/25 border-border/60 text-muted-foreground'"
              >
                <span class="text-[10px] sm:text-xs lg:text-sm xl:text-base font-mono uppercase tracking-wider font-semibold opacity-80">Grace Period</span>
                <span
                  class="font-mono font-black text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl mt-0.5"
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
          class="relative text-card-foreground border rounded-2xl lg:rounded-3xl shadow-sm overflow-hidden flex flex-col bg-card h-full justify-between w-full"
        >
          <!-- Idle Cover Banner -->
          <div
            class="h-[clamp(5rem,13vh,11.5rem)] w-full bg-cover bg-center shrink-0 flex items-start justify-between p-3.5 sm:p-5 lg:p-6 xl:p-8 relative"
            style="background-image: url('/dbbbuildinganimated.jpg');"
          >
            <div class="flex items-center gap-2 px-3 sm:px-4 lg:px-5 py-1 sm:py-1.5 lg:py-2 rounded-full text-xs sm:text-sm lg:text-base xl:text-lg font-mono font-bold tracking-wider uppercase bg-card/85 border text-foreground shadow-2xs backdrop-blur-xs">
              <Fingerprint class="size-4 sm:size-5 lg:size-6 text-primary" />
              <span>Terminal Standby</span>
            </div>
            <div class="flex items-center gap-2 px-3 sm:px-4 lg:px-5 py-1 sm:py-1.5 lg:py-2 rounded-full text-xs sm:text-sm lg:text-base xl:text-lg font-mono font-bold tracking-wider uppercase bg-card/85 border text-foreground shadow-2xs backdrop-blur-xs">
              <span class="size-2 sm:size-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>READY</span>
            </div>
          </div>

          <!-- Idle Avatar Centered Overlapping Cover -->
          <div class="flex justify-center -mt-[clamp(3.25rem,7.5vh,6.75rem)] relative z-20 shrink-0">
            <div class="size-[clamp(6.5rem,15vh,13.5rem)] rounded-full border-4 sm:border-[5px] lg:border-[6px] border-card ring-4 ring-gray-300/80 dark:ring-background/80 bg-primary/20 bg-white text-primary flex items-center justify-center shadow-2xl">
              <Fingerprint class="size-1/2 text-primary animate-pulse" />
            </div>
          </div>

          <!-- Idle Instructions Body -->
          <div class="-mt-[clamp(2rem,5vh,4.5rem)] flex-1 flex flex-col justify-center items-center text-center px-6 sm:px-8 lg:px-12 xl:px-16 py-3 sm:py-4 lg:py-6 space-y-2 sm:space-y-3 lg:space-y-4 min-h-0">
            <h2 class="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-black tracking-tight text-foreground">
              Ready for Biometric Scan
            </h2>
            <p class="text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl text-muted-foreground max-w-md sm:max-w-lg lg:max-w-xl xl:max-w-2xl leading-relaxed font-medium">
              Place your registered finger on the optical sensor to record your attendance punch.
            </p>
            <div class="pt-2 sm:pt-3 lg:pt-4 flex items-center justify-center gap-2 text-xs sm:text-sm lg:text-base xl:text-lg text-muted-foreground font-mono">
              <Server class="size-3.5 sm:size-4 lg:size-5 text-muted-foreground" />
              <span>BISMAC BISBIO B-29b • Port 4370</span>
            </div>
          </div>

          <!-- Standby footer line -->
          <div class="h-1.5 w-full bg-muted/40 shrink-0"></div>
        </div>
      </section>

      <!-- Right / Session Stream: Recent Punches List (Maximum 7 Recent Punches) -->
      <aside class="w-full lg:w-80 xl:w-96 2xl:w-[440px] bg-card text-card-foreground border rounded-2xl lg:rounded-3xl shadow-sm p-3.5 sm:p-4 lg:p-5 xl:p-6 shrink-0 flex flex-col min-h-0 max-h-full">
        <div class="flex items-center justify-between pb-2.5 sm:pb-3 border-b shrink-0">
          <div class="flex items-center gap-2 sm:gap-2.5">
            <History class="size-4 sm:size-5 lg:size-6 text-primary" />
            <h4 class="text-sm sm:text-base lg:text-lg xl:text-xl font-bold text-foreground">
              Recent Punches
            </h4>
          </div>
          <Badge variant="outline" class="text-xs sm:text-sm lg:text-base font-mono font-bold px-2 py-0.5">
            {{ recentPunches.length }} / 7
          </Badge>
        </div>

        <div v-if="recentPunches.length === 0" class="py-12 lg:py-16 text-center text-muted-foreground space-y-1.5 sm:space-y-2">
          <Clock class="size-7 lg:size-9 mx-auto stroke-1 text-muted-foreground/60" />
          <p class="text-xs sm:text-sm lg:text-base">No recent punches yet.</p>
        </div>

        <div v-else class="flex-1 min-h-0 overflow-y-auto space-y-1.5 sm:space-y-2 pt-2.5 pr-0.5">
          <div
            v-for="punch in recentPunches"
            :key="punch.eventId || punch.id"
            class="p-2 sm:p-2.5 lg:p-3 xl:p-3.5 rounded-xl sm:rounded-2xl border bg-muted/20 hover:bg-muted/30 transition-colors flex items-center justify-between gap-3 text-xs sm:text-sm lg:text-base"
          >
            <div class="min-w-0">
              <div class="font-bold text-foreground text-xs sm:text-sm md:text-base lg:text-base xl:text-lg truncate">
                {{ punch.employeeName }}
              </div>
              <div class="text-[11px] sm:text-xs md:text-sm lg:text-sm xl:text-base text-muted-foreground flex items-center gap-1.5 font-mono mt-0.5">
                <span class="font-bold">Bio ID: {{ punch.bioId }}</span>
                <span>•</span>
                <span class="text-foreground font-semibold">{{ punch.time }}</span>
              </div>
            </div>

            <div class="text-right shrink-0">
              <Badge
                :variant="punch.statusVariant === 'destructive' && settings.lateVisualEnabled ? 'destructive' : (punch.statusVariant === 'warning' ? 'warning' : 'success')"
                class="text-[11px] sm:text-xs lg:text-sm xl:text-base uppercase font-mono px-2 sm:px-2.5 lg:px-3 py-0.5 sm:py-1 font-bold"
              >
                {{ punch.status }}
              </Badge>
            </div>
          </div>
        </div>
      </aside>
    </main>

    <!-- Footer Bar with Subtle Development/Testing Controls -->
    <footer class="border-t bg-card px-4 sm:px-6 lg:px-8 xl:px-10 py-1.5 sm:py-2 text-xs sm:text-sm text-muted-foreground flex flex-col md:flex-row items-center justify-between gap-2 shrink-0 shadow-2xs">
      <!-- Status Info -->
      <div class="flex items-center gap-2">
        <span class="size-2 rounded-full" :class="settings.enabled ? 'bg-emerald-500' : 'bg-amber-500'"></span>
        <span class="font-mono text-[11px] sm:text-xs">
          {{ settings.enabled ? 'Hardware Bridge Active' : 'Punch Display Disabled' }}
        </span>
        <span class="text-border hidden sm:inline">·</span>
        <span class="text-[11px] sm:text-xs text-muted-foreground hidden sm:inline">
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
          class="h-6 px-2 text-[11px] font-mono text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 cursor-pointer"
          title="Simulate lunch departure (12:02 PM BREAK OUT)"
          @click="triggerTestPunch('lunch_out', 'user25065')"
        >
          <Play class="size-2.5 mr-1 text-amber-600" />
          <span>Lunch OUT</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-6 px-2 text-[11px] font-mono text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 cursor-pointer"
          title="Simulate lunch return (12:57 PM BREAK IN)"
          @click="triggerTestPunch('lunch_in', 'user25065')"
        >
          <Play class="size-2.5 mr-1 text-blue-600" />
          <span>Lunch IN</span>
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
          class="h-6 px-2 text-[11px] font-mono text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 cursor-pointer font-bold"
          title="Simulate complete day sequence (8:01 AM Late -> 12:02 PM Lunch OUT -> 12:57 PM Lunch IN -> 5:00 PM OUT)"
          @click="triggerTestPunch('full_day_sequence', 'user25065')"
        >
          <Play class="size-2.5 mr-1 text-indigo-600" />
          <span>Full Day Sequence</span>
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
        <Button
          variant="ghost"
          size="sm"
          class="h-6 px-2 text-[11px] font-mono text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer font-bold"
          title="Preview the enhanced Birthday animation, balloons, confetti, and information modal"
          @click="triggerBirthdayPreview()"
        >
          <Cake class="size-2.5 mr-1 text-rose-600" />
          <span>Preview Birthday</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-6 px-2 text-[11px] font-mono text-primary hover:bg-primary/10 cursor-pointer font-bold"
          title="Show preview overlay of the next announcement / reminder / birthday"
          @click="showAnnouncementPreview()"
        >
          <Megaphone class="size-2.5 mr-1 text-primary" />
          <span>Preview Announcement</span>
        </Button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.announcement-slide-enter-active,
.announcement-slide-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.announcement-slide-enter-from {
  opacity: 0;
  transform: translateY(-28px) scale(0.96);
}

.announcement-slide-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.98);
}

/* Birthday Stage Transition (Intro Animation -> Information Modal) */
.fade-stage-enter-active,
.fade-stage-leave-active {
  transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}

.fade-stage-enter-from {
  opacity: 0;
  transform: scale(0.98);
}

.fade-stage-leave-to {
  opacity: 0;
  transform: scale(1.01);
}

/* Flying Balloons: Upward translation with gentle horizontal sway */
@keyframes balloon-float-up {
  0% {
    transform: translate3d(0, 0, 0);
    opacity: 0;
  }
  12% {
    opacity: 0.95;
  }
  85% {
    opacity: 0.95;
  }
  100% {
    transform: translate3d(var(--balloon-sway, 20px), -125vh, 0);
    opacity: 0;
  }
}

/* Lightweight Confetti: Gentle downward drift with rotation */
@keyframes confetti-flutter {
  0% {
    transform: translate3d(0, 0, 0) rotate(0deg);
    opacity: 1;
  }
  75% {
    opacity: 0.9;
  }
  100% {
    transform: translate3d(var(--confetti-drift, 25px), 115vh, 0) rotate(var(--confetti-rot, 360deg));
    opacity: 0;
  }
}

@keyframes spin-slow {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes pulse-gentle {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.03);
  }
}

@keyframes bounce-subtle {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

.birthday-balloon {
  position: absolute;
  will-change: transform, opacity;
  animation-name: balloon-float-up;
  animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  animation-iteration-count: 1;
  animation-fill-mode: forwards;
}

.birthday-confetti {
  position: absolute;
  border-radius: 2px;
  will-change: transform, opacity;
  animation-name: confetti-flutter;
  animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  animation-iteration-count: 1;
  animation-fill-mode: forwards;
}

.animate-spin-slow {
  animation: spin-slow 12s linear infinite;
}

.animate-pulse-gentle {
  animation: pulse-gentle 2.2s ease-in-out infinite;
}

.animate-bounce-subtle {
  animation: bounce-subtle 2s ease-in-out infinite;
}

/* Accessibility: Full fallback for reduced-motion preferences */
@media (prefers-reduced-motion: reduce) {
  .birthday-balloon,
  .birthday-confetti {
    display: none !important;
  }
  .animate-spin-slow,
  .animate-pulse-gentle,
  .animate-bounce-subtle {
    animation: none !important;
  }
  .fade-stage-enter-active,
  .fade-stage-leave-active {
    transition: none !important;
  }
}
</style>
