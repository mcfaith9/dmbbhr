<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import {
  Megaphone,
  Move,
  GripHorizontal,
  Check,
  ArrowUpToLine,
  ArrowDownToLine,
  AlignCenter,
  Maximize2
} from '@lucide/vue'
import {
  announcementService,
  type AnnouncementItem,
  type TickerSettings
} from '@/services/announcements'

interface Props {
  // If true, behaves as an interactive live preview inside Settings or Standalone preview
  isSettingsPreview?: boolean
  // Optional override items for live preview
  overrideAnnouncements?: AnnouncementItem[]
}

const props = withDefaults(defineProps<Props>(), {
  isSettingsPreview: false,
  overrideAnnouncements: undefined
})

const tickerSettings = computed<TickerSettings>(() => announcementService.tickerSettings.value)
const announcements = computed<AnnouncementItem[]>(() => {
  if (props.overrideAnnouncements && props.overrideAnnouncements.length > 0) {
    return props.overrideAnnouncements
  }
  return announcementService.announcements.value
})

// Filter to active announcements
const activeAnnouncements = computed(() => {
  return announcements.value.filter(a => a.enabled)
})

// Fallback message when enabled but no announcements exist
const displayAnnouncements = computed<AnnouncementItem[]>(() => {
  if (activeAnnouncements.value.length > 0) {
    return activeAnnouncements.value
  }
  if (tickerSettings.value.editMode || props.isSettingsPreview) {
    return [
      {
        id: 'sample-1',
        type: 'announcement',
        title: 'WELCOME TO DMBBHR',
        message: 'Daily attendance terminal is active. Please punch your fingerprint upon entering and leaving.',
        enabled: true
      },
      {
        id: 'sample-2',
        type: 'reminder',
        title: 'GENERAL ANNOUNCEMENT',
        message: 'Ensure company ID badges are worn at all times within the office premises.',
        enabled: true
      }
    ]
  }
  return []
})

// Determine overall visibility
const isVisible = computed(() => {
  if (props.isSettingsPreview) return true
  if (!tickerSettings.value.enabled) return false
  return displayAnnouncements.value.length > 0 || tickerSettings.value.editMode
})

// Root element ref for measuring and dragging
const tickerBarRef = ref<HTMLElement | null>(null)

// Drag and drop state
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const initialLeft = ref(0)
const initialTop = ref(0)
const currentCoordX = ref(0)
const currentCoordY = ref(0)

// Helper to convert hex + opacity to rgba
function getRgbaColor(hex: string, opacity: number): string {
  let cleanHex = hex.replace('#', '')
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('')
  }
  if (cleanHex.length !== 6) return hex
  const r = parseInt(cleanHex.substring(0, 2), 16)
  const g = parseInt(cleanHex.substring(2, 4), 16)
  const b = parseInt(cleanHex.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

// Compute style for the container based on presets or custom offsets
const containerStyle = computed(() => {
  const s = tickerSettings.value

  // When rendering in Settings Preview:
  // Must be strictly constrained to 100% of the settings container with zero overflow.
  if (props.isSettingsPreview) {
    return {
      position: 'relative',
      width: '100%',
      maxWidth: '100%',
      minWidth: '0',
      overflow: 'hidden',
      zIndex: '1',
      userSelect: 'none',
      boxSizing: 'border-box'
    }
  }

  // When rendering in live Punch Display kiosk mode (1920x1080):
  const style: Record<string, string> = {
    position: 'fixed',
    zIndex: '9999',
    userSelect: isDragging.value ? 'none' : 'auto'
  }

  // Width and layout on actual display
  if (s.widthMode === 'full') {
    style.width = '100vw'
    style.maxWidth = '100vw'
    style.left = '0'
    style.right = '0'
  } else if (s.widthMode === 'boxed') {
    style.width = 'calc(100% - 3rem)'
    style.maxWidth = '1600px'
  } else {
    // Custom width
    style.width = `${s.customWidth}px`
    style.maxWidth = '98vw'
  }

  if (s.positionVertical === 'custom' || s.positionHorizontal === 'custom') {
    style.top = `${s.offsetY}px`
    style.left = `${s.offsetX}px`
    style.transform = 'none'
  } else {
    // Horizontal positioning
    if (s.positionHorizontal === 'center') {
      style.left = '50%'
      style.transform = 'translateX(-50%)'
    } else if (s.positionHorizontal === 'left') {
      style.left = `${Math.max(0, s.offsetX || 16)}px`
      style.transform = 'none'
    } else if (s.positionHorizontal === 'right') {
      style.right = `${Math.max(0, -(s.offsetX || 0) || 16)}px`
      style.transform = 'none'
    }

    // Vertical positioning
    if (s.positionVertical === 'top') {
      style.top = `${s.offsetY}px`
    } else if (s.positionVertical === 'middle') {
      style.top = `calc(50% + ${s.offsetY}px)`
      style.transform = s.positionHorizontal === 'center' ? 'translate(-50%, -50%)' : 'translateY(-50%)'
    } else {
      // 'bottom' default
      style.bottom = `${Math.max(0, -(s.offsetY || 0))}px`
    }
  }

  return style
})

// Bar styling (colors, height, borders)
const barStyle = computed(() => {
  const s = tickerSettings.value

  // When rendering in Settings Preview:
  if (props.isSettingsPreview) {
    let previewWidth = '100%'
    if (s.widthMode === 'boxed') {
      previewWidth = '92%'
    } else if (s.widthMode === 'custom') {
      // Proportional visual representation scaled against 1920px kiosk width
      const ratio = Math.max(0.45, Math.min(1.0, s.customWidth / 1920))
      previewWidth = `${Math.round(ratio * 100)}%`
    }

    // Compact height scaled for settings panel (34px to 48px max)
    const previewHeight = Math.max(34, Math.min(48, Math.round(s.height * 0.75)))
    const previewRadius = s.widthMode === 'full' ? 0 : Math.min(16, s.borderRadius)

    return {
      width: previewWidth,
      maxWidth: '100%',
      minWidth: '0',
      margin: '0 auto',
      height: `${previewHeight}px`,
      borderRadius: `${previewRadius}px`,
      backgroundColor: getRgbaColor(s.backgroundColor, s.backgroundOpacity),
      color: s.textColor,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
      borderTop: `1px solid ${s.accentColor}33`,
      borderBottom: `1px solid ${s.accentColor}33`,
      backdropFilter: 'blur(8px)',
      boxSizing: 'border-box' as const
    }
  }

  // Actual display mode on kiosk:
  return {
    height: `${s.height}px`,
    borderRadius: s.widthMode === 'full' ? '0px' : `${s.borderRadius}px`,
    backgroundColor: getRgbaColor(s.backgroundColor, s.backgroundOpacity),
    color: s.textColor,
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
    borderTop: `1px solid ${s.accentColor}33`,
    borderBottom: `1px solid ${s.accentColor}33`,
    backdropFilter: 'blur(8px)'
  }
})

// Scaled font size for compact preview
const effectiveFontSize = computed(() => {
  const s = tickerSettings.value
  if (props.isSettingsPreview) {
    // Compact preview scaling for settings panel (between 11px and 14px)
    return Math.max(11, Math.min(14, Math.round(s.fontSize * 0.72)))
  }
  return s.fontSize
})

// Marquee speed duration
const marqueeDuration = computed(() => {
  const s = tickerSettings.value
  // Estimate character length for consistent speed
  const totalLength = displayAnnouncements.value.reduce(
    (sum, a) => sum + (a.title?.length || 0) + (a.message?.length || 0),
    0
  )
  const baseSeconds = Math.max(16, Math.round(totalLength * 0.18))
  if (s.speed === 'slow') return `${baseSeconds * 1.6}s`
  if (s.speed === 'fast') return `${Math.max(10, baseSeconds * 0.65)}s`
  return `${baseSeconds}s`
})

// Font styling class
const fontClass = computed(() => {
  const fw = tickerSettings.value.fontWeight
  if (fw === 'normal') return 'font-normal'
  if (fw === 'medium') return 'font-medium'
  if (fw === 'semibold') return 'font-semibold'
  if (fw === 'bold') return 'font-bold'
  if (fw === 'extrabold') return 'font-extrabold'
  return 'font-semibold'
})

// Drag and drop handlers
function startDrag(e: MouseEvent | TouchEvent) {
  if (props.isSettingsPreview) return
  if (!tickerBarRef.value) return

  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

  const rect = tickerBarRef.value.getBoundingClientRect()
  isDragging.value = true
  dragStartX.value = clientX
  dragStartY.value = clientY
  initialLeft.value = rect.left
  initialTop.value = rect.top
  currentCoordX.value = rect.left
  currentCoordY.value = rect.top

  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', endDrag)
  window.addEventListener('touchmove', onDragMove, { passive: false })
  window.addEventListener('touchend', endDrag)
}

function onDragMove(e: MouseEvent | TouchEvent) {
  if (!isDragging.value || !tickerBarRef.value) return
  if ('touches' in e) {
    e.preventDefault()
  }

  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

  const deltaX = clientX - dragStartX.value
  const deltaY = clientY - dragStartY.value

  const elementWidth = tickerBarRef.value.offsetWidth
  const elementHeight = tickerBarRef.value.offsetHeight

  const maxLeft = Math.max(0, window.innerWidth - elementWidth)
  const maxTop = Math.max(0, window.innerHeight - elementHeight)

  const newLeft = Math.max(0, Math.min(maxLeft, initialLeft.value + deltaX))
  const newTop = Math.max(0, Math.min(maxTop, initialTop.value + deltaY))

  currentCoordX.value = Math.round(newLeft)
  currentCoordY.value = Math.round(newTop)

  // Direct DOM update during drag for 60fps responsiveness
  tickerBarRef.value.style.left = `${newLeft}px`
  tickerBarRef.value.style.top = `${newTop}px`
  tickerBarRef.value.style.transform = 'none'
  tickerBarRef.value.style.bottom = 'auto'
  tickerBarRef.value.style.right = 'auto'
}

function endDrag() {
  if (!isDragging.value) return
  isDragging.value = false
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', endDrag)
  window.removeEventListener('touchmove', onDragMove)
  window.removeEventListener('touchend', endDrag)

  // Save coordinates and persist
  announcementService.saveTickerSettings({
    positionVertical: 'custom',
    positionHorizontal: 'custom',
    offsetX: currentCoordX.value,
    offsetY: currentCoordY.value
  })
}

// Preset snapping shortcuts
function snapTo(preset: 'top' | 'middle' | 'bottom') {
  if (preset === 'top') {
    announcementService.saveTickerSettings({
      positionVertical: 'top',
      positionHorizontal: 'center',
      offsetY: 0,
      offsetX: 0
    })
  } else if (preset === 'middle') {
    announcementService.saveTickerSettings({
      positionVertical: 'middle',
      positionHorizontal: 'center',
      offsetY: 0,
      offsetX: 0
    })
  } else {
    announcementService.saveTickerSettings({
      positionVertical: 'bottom',
      positionHorizontal: 'center',
      offsetY: 0,
      offsetX: 0
    })
  }
}

function toggleWidthMode() {
  const current = tickerSettings.value.widthMode
  const next = current === 'full' ? 'boxed' : (current === 'boxed' ? 'custom' : 'full')
  announcementService.saveTickerSettings({ widthMode: next })
}

function toggleEditMode() {
  announcementService.saveTickerSettings({
    editMode: !tickerSettings.value.editMode
  })
}

onUnmounted(() => {
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', endDrag)
  window.removeEventListener('touchmove', onDragMove)
  window.removeEventListener('touchend', endDrag)
})
</script>

<template>
  <div
    v-if="isVisible"
    ref="tickerBarRef"
    class="news-ticker-overlay group transition-shadow select-none max-w-full"
    :class="[
      tickerSettings.editMode && !isSettingsPreview ? 'ring-2 ring-primary ring-offset-2 ring-offset-black/60 cursor-move' : '',
      isSettingsPreview ? 'w-full min-w-0 overflow-hidden' : ''
    ]"
    :style="containerStyle"
    @mousedown="tickerSettings.editMode && !isSettingsPreview ? startDrag($event) : undefined"
    @touchstart="tickerSettings.editMode && !isSettingsPreview ? startDrag($event) : undefined"
  >
    <!-- Admin Edit Handle Toolbar (Visible in Edit Mode on Punch Display) -->
    <div
      v-if="tickerSettings.editMode && !isSettingsPreview"
      class="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 bg-zinc-950/95 border border-zinc-700/80 rounded-full text-zinc-100 text-xs shadow-2xl z-[10000] backdrop-blur-md"
    >
      <div class="flex items-center gap-1 font-mono text-[11px] text-zinc-400 pr-2 border-r border-zinc-700">
        <Move class="size-3.5 text-primary animate-pulse" />
        <span>{{ currentCoordX }}x{{ currentCoordY }}</span>
      </div>

      <button
        type="button"
        class="px-2 py-0.5 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors text-[11px] flex items-center gap-1"
        title="Snap to top"
        @click.stop="snapTo('top')"
      >
        <ArrowUpToLine class="size-3" /> Top
      </button>

      <button
        type="button"
        class="px-2 py-0.5 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors text-[11px] flex items-center gap-1"
        title="Snap to middle"
        @click.stop="snapTo('middle')"
      >
        <AlignCenter class="size-3" /> Middle
      </button>

      <button
        type="button"
        class="px-2 py-0.5 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors text-[11px] flex items-center gap-1"
        title="Snap to bottom"
        @click.stop="snapTo('bottom')"
      >
        <ArrowDownToLine class="size-3" /> Bottom
      </button>

      <div class="w-px h-3 bg-zinc-700 mx-0.5"></div>

      <button
        type="button"
        class="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-colors text-[11px] flex items-center gap-1"
        title="Toggle width mode"
        @click.stop="toggleWidthMode"
      >
        <Maximize2 class="size-3" /> {{ tickerSettings.widthMode.toUpperCase() }}
      </button>

      <button
        type="button"
        class="px-2 py-0.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-colors text-[11px] flex items-center gap-1 ml-1"
        title="Save & Lock position"
        @click.stop="toggleEditMode"
      >
        <Check class="size-3" /> Done
      </button>
    </div>

    <!-- Main Ticker Bar -->
    <div
      class="w-full max-w-full min-w-0 flex items-center overflow-hidden relative"
      :style="barStyle"
    >
      <!-- Optional Prefix Badge / Icon -->
      <div
        v-if="tickerSettings.showBadge || tickerSettings.showIcon"
        class="flex-shrink-0 h-full flex items-center z-20 shadow-md select-none"
        :class="isSettingsPreview ? 'gap-1.5 px-2.5' : 'gap-2 px-3.5 sm:px-4'"
        :style="{
          backgroundColor: tickerSettings.accentColor,
          color: '#ffffff'
        }"
      >
        <div v-if="tickerSettings.showIcon" class="flex items-center justify-center">
          <Megaphone :class="isSettingsPreview ? 'size-3.5' : 'size-4.5 animate-bounce'" />
        </div>
        <span
          v-if="tickerSettings.showBadge && tickerSettings.badgeText"
          class="font-extrabold tracking-wider uppercase whitespace-nowrap"
          :class="isSettingsPreview ? 'text-[10px]' : 'text-xs sm:text-sm'"
        >
          {{ tickerSettings.badgeText }}
        </span>
      </div>

      <!-- Marquee Track Wrapper -->
      <div
        class="flex-1 min-w-0 overflow-hidden relative flex items-center h-full"
        :class="[tickerSettings.pauseOnHover ? 'hover:[&_.marquee-content]:[animation-play-state:paused]' : '']"
      >
        <!-- Continuous Smooth Marquee Track (Repeated twice to create infinite right-to-left loop) -->
        <div
          class="marquee-track flex items-center whitespace-nowrap will-change-transform"
          :style="{
            animationDuration: marqueeDuration
          }"
        >
          <!-- Loop Instance 1 -->
          <div class="marquee-content flex items-center shrink-0 pr-6">
            <template v-for="(item, idx) in displayAnnouncements" :key="`t1-${item.id}-${idx}`">
              <div
                class="inline-flex items-center"
                :class="[fontClass, isSettingsPreview ? 'gap-1.5 px-2' : 'gap-2.5 px-4']"
                :style="{ fontSize: `${effectiveFontSize}px` }"
              >
                <!-- Title Pill / Accent -->
                <span
                  class="font-black uppercase tracking-wide opacity-95 rounded"
                  :class="isSettingsPreview ? 'px-1 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[0.88em]'"
                  :style="{
                    backgroundColor: `${tickerSettings.accentColor}25`,
                    color: tickerSettings.accentColor
                  }"
                >
                  {{ item.title }}
                </span>

                <!-- Message text -->
                <span class="opacity-95 font-medium leading-none">
                  {{ item.message }}
                </span>

                <!-- Employee note for birthdays/reminders if present -->
                <span
                  v-if="item.employeeName"
                  class="text-xs opacity-75 font-normal italic"
                >
                  — {{ item.employeeName }}
                </span>
              </div>

              <!-- Separator Glyph -->
              <span
                class="inline-block opacity-60 select-none"
                :class="isSettingsPreview ? 'px-2 text-xs' : 'px-3 text-sm'"
                :style="{ color: tickerSettings.accentColor }"
              >
                {{ tickerSettings.separator || '✦' }}
              </span>
            </template>
          </div>

          <!-- Loop Instance 2 (Seamless loop repeat) -->
          <div class="marquee-content flex items-center shrink-0 pr-6" aria-hidden="true">
            <template v-for="(item, idx) in displayAnnouncements" :key="`t2-${item.id}-${idx}`">
              <div
                class="inline-flex items-center"
                :class="[fontClass, isSettingsPreview ? 'gap-1.5 px-2' : 'gap-2.5 px-4']"
                :style="{ fontSize: `${effectiveFontSize}px` }"
              >
                <span
                  class="font-black uppercase tracking-wide opacity-95 rounded"
                  :class="isSettingsPreview ? 'px-1 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[0.88em]'"
                  :style="{
                    backgroundColor: `${tickerSettings.accentColor}25`,
                    color: tickerSettings.accentColor
                  }"
                >
                  {{ item.title }}
                </span>
                <span class="opacity-95 font-medium leading-none">
                  {{ item.message }}
                </span>
                <span
                  v-if="item.employeeName"
                  class="text-xs opacity-75 font-normal italic"
                >
                  — {{ item.employeeName }}
                </span>
              </div>
              <span
                class="inline-block opacity-60 select-none"
                :class="isSettingsPreview ? 'px-2 text-xs' : 'px-3 text-sm'"
                :style="{ color: tickerSettings.accentColor }"
              >
                {{ tickerSettings.separator || '✦' }}
              </span>
            </template>
          </div>
        </div>
      </div>

      <!-- Interactive Drag Handle Button on the right (Punch Display) -->
      <div
        v-if="!isSettingsPreview"
        class="flex-shrink-0 h-full flex items-center px-2 opacity-30 group-hover:opacity-100 transition-opacity"
      >
        <button
          type="button"
          class="p-1 rounded hover:bg-white/10 text-zinc-300 hover:text-white transition-colors"
          :title="tickerSettings.editMode ? 'Finish positioning ticker' : 'Drag or reposition news ticker'"
          @click.stop="toggleEditMode"
        >
          <GripHorizontal v-if="!tickerSettings.editMode" class="size-4" />
          <Check v-else class="size-4 text-emerald-400" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes marquee-scroll {
  0% {
    transform: translate3d(0, 0, 0);
  }
  100% {
    transform: translate3d(-50%, 0, 0);
  }
}

.marquee-track {
  display: flex;
  width: max-content;
  animation-name: marquee-scroll;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}

.marquee-track:hover {
  animation-play-state: var(--hover-play-state, running);
}
</style>
