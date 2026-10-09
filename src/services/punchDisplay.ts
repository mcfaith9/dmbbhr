/**
 * Service to manage the child Punch Display window, BroadcastChannel communication,
 * and user-configurable display preferences.
 * Provides high-performance, zero-recalculation real-time punch event distribution.
 */

import { ref } from 'vue'
import type { AttendanceLog } from '@/types'
import { formatDuration } from '@/lib/timeUtils'
import { employeeService } from '@/services/employees'
import { punchRepository } from '@/repositories/punchRepository'
import { workGroupRepository, calculateExpectedOutMinutes } from '@/repositories/workGroupRepository'
import { getManilaDateString, getManilaMinutesFromMidnight } from '@/services/attendanceEngine'

export interface CompactRecentPunch {
  id: string
  eventId: string
  employeeName: string
  bioId: string
  direction: string // "TIME IN" | "TIME OUT" | "BREAK OUT" | "BREAK IN"
  time: string // "8:03 AM"
  date: string // "October 5, 2026"
  status: string // "EARLY" | "ON TIME" | "LATE" | "TIME OUT" | "EARLY OUT" | "BREAK OUT" | "BREAK IN"
  statusVariant: 'success' | 'warning' | 'destructive' | 'secondary' | 'outline' | 'default'
  isLate: boolean
  firstInTime?: string
  firstInLate?: boolean
  firstInLateMinutes?: number
}

export interface PunchDisplayEvent {
  id: string
  eventId: string // Unique UI event identity to distinguish consecutive scans from same employee
  userId: string
  bioId: string // Canonical Bio ID alias
  employeeName: string
  employeeId?: string
  photoUrl?: string
  workGroup?: string
  workGroupCode?: string
  department?: string
  locationName?: string
  deviceName?: string
  timestamp: string
  time: string // Formatted time e.g. "8:05:08 AM"
  date: string // Formatted date e.g. "October 5, 2026"
  type: number // 1: Fingerprint, 2: Face, 3: Password, 4: Card, etc.
  state: number // 1: Time In, 2: Break Out, 3: Break In, 4: Time Out, 5: OT In, 6: OT Out
  direction: 'IN' | 'OUT' | 'BREAK_OUT' | 'BREAK_IN' | 'OT_IN' | 'OT_OUT'
  stateLabel: string
  stateColor: 'emerald' | 'amber' | 'blue' | 'rose' | 'purple' | 'slate'
  statusCategory: 'early' | 'on_time' | 'late' | 'undertime' | 'regular' | 'time_out'
  status: string // Canonical status alias e.g. "EARLY" | "ON TIME" | "LATE" | "TIME OUT" | "EARLY OUT"
  statusLabel: string
  statusDetail: string
  statusVariant: 'success' | 'warning' | 'destructive' | 'secondary' | 'outline' | 'default'
  isLate: boolean
  isEarly: boolean
  diffMinutes?: number
  late_minutes?: number
  lateMinutes?: number
  firstInTime?: string
  firstInLate?: boolean
  firstInLateMinutes?: number
}

export interface PunchDisplaySettings {
  enabled: boolean // Enable Punch Display = ON / OFF (default: true)
  displayDurationSeconds: number // Supported values: 2, 3, 5, 8, 10 (default: 5)
  soundEnabled: boolean // Audio chime ON / OFF (default: true)
  confettiEnabled: boolean // Confetti = ON / OFF (default: true)
  lateVisualEnabled: boolean // Late Visual = ON / OFF (default: true)
  customLateImageUrl: string
  // Voice Announcements / Text-to-Speech (TTS)
  punchDisplayVoiceEnabled: boolean
  punchDisplayVoiceVolume: number // 0.0 - 1.0 (default: 0.8)
  punchDisplayVoiceRate: number // 0.5 - 2.0 (default: 1.0)
  punchDisplayVoicePitch: number // 0.5 - 1.5 (default: 1.0)
  punchDisplayVoiceURI: string // Voice identifier
  // Backward compatibility aliases
  voiceEnabled?: boolean
  voiceVolume?: number
  voiceRate?: number
  voicePitch?: number
  voiceURI?: string
}

/**
 * Normalizes any raw biometric user ID (e.g. "user25065", "25065", 25065, "  user_50044  ")
 * into a clean digits-only identifier ("25065", "50044").
 */
export function normalizeBioId(value: unknown): string {
  const raw = String(value ?? '').trim()
  const match = raw.match(/\d+/)
  return match?.[0] ?? raw
}

let eventCounter = 0

const PRIMARY_CHANNEL_NAME = 'dmbbhr-punch-display'
const FALLBACK_CHANNEL_NAME = 'dmbbhr-punch-channel'
const SETTINGS_KEY = 'dmbbhr_punch_display_settings'
const OFFSET_STORAGE_KEY = 'dmbbhr_device_time_offset'
const LAST_DEVICE_TIME_KEY = 'dmbbhr_last_device_timestamp'

/**
 * Display clock offset: Exactly 5 minutes (300,000 milliseconds) behind the computer system clock.
 * As per specification:
 * - PC time 11:37 AM -> Punch Display 11:32 AM
 * - PC time 3:00 PM -> Punch Display 2:55 PM
 */
export const PUNCH_DISPLAY_CLOCK_OFFSET_MS = -5 * 60 * 1000 // -300,000 ms

function cleanLegacyStoredOffset(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(OFFSET_STORAGE_KEY)
    localStorage.removeItem(LAST_DEVICE_TIME_KEY)
  } catch {
    // ignore
  }
}

const DEFAULT_SETTINGS: PunchDisplaySettings = {
  enabled: true,
  displayDurationSeconds: 5, // Default: 5 seconds
  soundEnabled: true,
  confettiEnabled: true,
  lateVisualEnabled: true,
  customLateImageUrl: '',
  punchDisplayVoiceEnabled: false,
  punchDisplayVoiceVolume: 0.8,
  punchDisplayVoiceRate: 1.0,
  punchDisplayVoicePitch: 1.0,
  punchDisplayVoiceURI: '',
  voiceEnabled: false,
  voiceVolume: 0.8,
  voiceRate: 1.0,
  voicePitch: 1.0,
  voiceURI: ''
}

class PunchDisplayService {
  private primaryChannel: BroadcastChannel | null = null
  private fallbackChannel: BroadcastChannel | null = null
  private punchDisplayWindow: Window | null = null
  public isChannelSupported = typeof window !== 'undefined' && 'BroadcastChannel' in window
  public currentPunch = ref<PunchDisplayEvent | null>(null)
  
  // Maximum 7 recent punches for visual lineup
  public recentPunches = ref<CompactRecentPunch[]>([])
  public punchHistory = ref<CompactRecentPunch[]>([]) // alias for backward compatibility

  // Session-level punch tracker to ensure instant pairing across fast consecutive events
  private sessionPunchHistory = new Map<string, AttendanceLog[]>()
  
  // Persistent Settings
  public settings = ref<PunchDisplaySettings>(this.loadSettings())

  // Display Wall-Clock Synchronization State
  // Uses computer clock (Date.now()) minus exactly 5 minutes (300,000 ms).
  // Does not depend on the biometric device clock, device offsets, or localStorage.
  public deviceTimeOffset = ref<number>(PUNCH_DISPLAY_CLOCK_OFFSET_MS)
  public clockSource = ref<'device' | 'local'>('device')
  public lastDeviceTimestamp = ref<string | null>(null)

  constructor() {
    cleanLegacyStoredOffset()
    this.initChannels()
    this.initStorageListener()
  }

  private loadSettings(): PunchDisplaySettings {
    if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS }
    try {
      const stored = localStorage.getItem(SETTINGS_KEY)
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_SETTINGS }
  }

  public saveSettings = (newSettings: Partial<PunchDisplaySettings>) => {
    const updated: Partial<PunchDisplaySettings> = { ...newSettings }
    // Keep punchDisplayVoice* and voice* aliases strictly synchronized
    if (newSettings.punchDisplayVoiceEnabled !== undefined) {
      updated.voiceEnabled = newSettings.punchDisplayVoiceEnabled
    } else if (newSettings.voiceEnabled !== undefined) {
      updated.punchDisplayVoiceEnabled = newSettings.voiceEnabled
    }
    if (newSettings.punchDisplayVoiceVolume !== undefined) {
      updated.voiceVolume = newSettings.punchDisplayVoiceVolume
    } else if (newSettings.voiceVolume !== undefined) {
      updated.punchDisplayVoiceVolume = newSettings.voiceVolume
    }
    if (newSettings.punchDisplayVoiceRate !== undefined) {
      updated.voiceRate = newSettings.punchDisplayVoiceRate
    } else if (newSettings.voiceRate !== undefined) {
      updated.punchDisplayVoiceRate = newSettings.voiceRate
    }
    if (newSettings.punchDisplayVoicePitch !== undefined) {
      updated.voicePitch = newSettings.punchDisplayVoicePitch
    } else if (newSettings.voicePitch !== undefined) {
      updated.punchDisplayVoicePitch = newSettings.voicePitch
    }
    if (newSettings.punchDisplayVoiceURI !== undefined) {
      updated.voiceURI = newSettings.punchDisplayVoiceURI
    } else if (newSettings.voiceURI !== undefined) {
      updated.punchDisplayVoiceURI = newSettings.voiceURI
    }

    this.settings.value = { ...this.settings.value, ...updated }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings.value))
    } catch {
      // ignore
    }

    // Broadcast updated settings to other tabs/windows immediately
    const msg = {
      type: 'SETTINGS_UPDATED',
      payload: this.settings.value
    }
    try {
      this.primaryChannel?.postMessage(msg)
      this.fallbackChannel?.postMessage(msg)
    } catch {
      // ignore
    }
  }

  private initStorageListener() {
    if (typeof window === 'undefined') return
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY && e.newValue) {
        try {
          this.settings.value = { ...DEFAULT_SETTINGS, ...JSON.parse(e.newValue) }
        } catch {
          // ignore
        }
      }
    })
  }

  private initChannels() {
    if (typeof window === 'undefined' || !this.isChannelSupported) return

    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return

      if (event.data.type === 'SETTINGS_UPDATED' && event.data.payload) {
        this.settings.value = { ...DEFAULT_SETTINGS, ...event.data.payload }
        return
      }

      if (event.data.type === 'DEVICE_CLOCK_OFFSET') {
        // Obsolete: Display clock is permanently locked to PC time minus 5 minutes
        return
      }

      if ((event.data.type === 'PUNCH_EVENT' || event.data.type === 'PUNCH_DETECTED') && event.data.payload) {
        // If Punch Display is disabled, do not process incoming punches
        if (!this.settings.value.enabled) return
        this.handleIncomingPunch(event.data.payload)
      }
    }

    try {
      this.primaryChannel = new BroadcastChannel(PRIMARY_CHANNEL_NAME)
      this.primaryChannel.onmessage = handleMessage
    } catch (err) {
      console.warn('[PunchDisplayService] Primary BroadcastChannel init error:', err)
    }

    try {
      this.fallbackChannel = new BroadcastChannel(FALLBACK_CHANNEL_NAME)
      this.fallbackChannel.onmessage = handleMessage
    } catch (err) {
      console.warn('[PunchDisplayService] Fallback BroadcastChannel init error:', err)
    }
  }

  public getStateLabelAndColor = (state: number): { label: string; color: PunchDisplayEvent['stateColor'] } => {
    switch (state) {
      case 1:
        return { label: 'TIME IN', color: 'emerald' }
      case 2:
        return { label: 'BREAK OUT', color: 'amber' }
      case 3:
        return { label: 'BREAK IN', color: 'blue' }
      case 4:
        return { label: 'TIME OUT', color: 'rose' }
      case 5:
        return { label: 'OVERTIME IN', color: 'purple' }
      case 6:
        return { label: 'OVERTIME OUT', color: 'slate' }
      default:
        return { label: 'TIME IN', color: 'emerald' }
    }
  }

  /**
   * Authoritatively evaluates punch direction and attendance status.
   * OUT punches NEVER inherit IN lateness, and are NEVER marked 'LATE'.
   */
  public evaluateAttendanceStatus = (
    timestampStr: string,
    direction: 'IN' | 'OUT' | 'BREAK_OUT' | 'BREAK_IN' | 'OT_IN' | 'OT_OUT',
    standardIn: string = '08:00',
    _gracePeriod: number = 0,
    expectedOut: string = '17:00',
    isFirstIn: boolean = true,
    lunchStart: string = '12:00',
    lunchEnd: string = '13:00'
  ): {
    statusCategory: PunchDisplayEvent['statusCategory']
    statusLabel: string
    statusDetail: string
    statusVariant: PunchDisplayEvent['statusVariant']
    isLate: boolean
    isEarly: boolean
    diffMinutes: number
    late_minutes: number
    lateMinutes: number
  } => {
    const punchDate = new Date(timestampStr)
    let hours = punchDate.getHours()
    let minutes = punchDate.getMinutes()
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        hourCycle: 'h23'
      }).formatToParts(punchDate)
      const hPart = parts.find(p => p.type === 'hour')?.value
      const mPart = parts.find(p => p.type === 'minute')?.value
      if (hPart && mPart) {
        hours = parseInt(hPart, 10)
        minutes = parseInt(mPart, 10)
      }
    } catch {
      // fallback to local
    }
    if (hours === 24) hours = 0

    const punchMinutes = hours * 60 + minutes

    const [lStartH, lStartM] = lunchStart.split(':').map(Number)
    const [lEndH, lEndM] = lunchEnd.split(':').map(Number)
    const lunchStartMinutes = (lStartH || 12) * 60 + (lStartM || 0)
    const lunchEndMinutes = (lEndH || 13) * 60 + (lEndM || 0)

    // 1. TIME OUT EVALUATION
    if (direction === 'OUT') {
      const [expH, expM] = expectedOut.split(':').map(Number)
      const expectedOutMinutes = (expH || 17) * 60 + (expM || 0)

      // If employee leaves on or after expected OUT time: TIME OUT
      if (punchMinutes >= expectedOutMinutes) {
        return {
          statusCategory: 'time_out',
          statusLabel: 'TIME OUT',
          statusDetail: 'Shift completed',
          statusVariant: 'success',
          isEarly: false,
          isLate: false, // Never late on OUT
          diffMinutes: 0,
          late_minutes: 0,
          lateMinutes: 0
        }
      } else {
        // If employee leaves earlier than required OUT time: EARLY OUT
        const undertime = expectedOutMinutes - punchMinutes
        return {
          statusCategory: 'undertime',
          statusLabel: 'EARLY OUT',
          statusDetail: `${formatDuration(undertime)} before scheduled exit`,
          statusVariant: 'warning',
          isEarly: false,
          isLate: false, // Never late on OUT
          diffMinutes: undertime,
          late_minutes: 0,
          lateMinutes: 0
        }
      }
    }

    // 2. TIME IN EVALUATION
    // Only the first applicable morning arrival IN punch is evaluated for lateness against standardIn.
    // Lunch-return / subsequent IN punches are classified as BREAK IN and NEVER evaluated as late arrival.
    if (direction === 'IN') {
      if (!isFirstIn || (punchMinutes > lunchStartMinutes + 30 && punchMinutes <= lunchEndMinutes + 35)) {
        return {
          statusCategory: 'regular',
          statusLabel: 'BREAK IN',
          statusDetail: 'Returned from break',
          statusVariant: 'secondary',
          isEarly: false,
          isLate: false,
          diffMinutes: 0,
          late_minutes: 0,
          lateMinutes: 0
        }
      }

      if (punchMinutes >= lunchStartMinutes - 30 && punchMinutes <= lunchStartMinutes + 30) {
        return {
          statusCategory: 'regular',
          statusLabel: 'BREAK OUT',
          statusDetail: 'Lunch / break period started',
          statusVariant: 'secondary',
          isEarly: false,
          isLate: false,
          diffMinutes: 0,
          late_minutes: 0,
          lateMinutes: 0
        }
      }

      const [stdH, stdM] = standardIn.split(':').map(Number)
      const standardInMinutes = (stdH || 8) * 60 + (stdM || 0)

      if (punchMinutes < standardInMinutes) {
        const earlyDiff = standardInMinutes - punchMinutes
        return {
          statusCategory: 'early',
          statusLabel: 'EARLY',
          statusDetail: `${formatDuration(earlyDiff)} early`,
          statusVariant: 'success',
          isEarly: true,
          isLate: false,
          diffMinutes: earlyDiff,
          late_minutes: 0,
          lateMinutes: 0
        }
      } else if (punchMinutes === standardInMinutes) {
        // Strict minute precision: 8:00:59 AM has punchMinutes = 480 -> ON TIME
        return {
          statusCategory: 'on_time',
          statusLabel: 'ON TIME',
          statusDetail: 'On schedule',
          statusVariant: 'success',
          isEarly: false,
          isLate: false,
          diffMinutes: 0,
          late_minutes: 0,
          lateMinutes: 0
        }
      } else {
        // Strict minute precision: 8:01:00 AM has punchMinutes = 481 -> LATE by 1m
        const lateDiff = punchMinutes - standardInMinutes
        return {
          statusCategory: 'late',
          statusLabel: 'LATE',
          statusDetail: `Late by ${formatDuration(lateDiff)}`,
          statusVariant: 'destructive',
          isEarly: false,
          isLate: true,
          diffMinutes: lateDiff,
          late_minutes: lateDiff,
          lateMinutes: lateDiff
        }
      }
    }

    if (direction === 'BREAK_OUT') {
      return {
        statusCategory: 'regular',
        statusLabel: 'BREAK OUT',
        statusDetail: 'Lunch / break period started',
        statusVariant: 'secondary',
        isEarly: false,
        isLate: false,
        diffMinutes: 0,
        late_minutes: 0,
        lateMinutes: 0
      }
    }

    if (direction === 'BREAK_IN') {
      return {
        statusCategory: 'regular',
        statusLabel: 'BREAK IN',
        statusDetail: 'Returned from break',
        statusVariant: 'secondary',
        isEarly: false,
        isLate: false,
        diffMinutes: 0,
        late_minutes: 0,
        lateMinutes: 0
      }
    }

    if (direction === 'OT_IN') {
      return {
        statusCategory: 'regular',
        statusLabel: 'OVERTIME IN',
        statusDetail: 'Overtime session active',
        statusVariant: 'secondary',
        isEarly: false,
        isLate: false,
        diffMinutes: 0,
        late_minutes: 0,
        lateMinutes: 0
      }
    }

    if (direction === 'OT_OUT') {
      return {
        statusCategory: 'regular',
        statusLabel: 'OVERTIME OUT',
        statusDetail: 'Overtime session ended',
        statusVariant: 'secondary',
        isEarly: false,
        isLate: false,
        diffMinutes: 0,
        late_minutes: 0,
        lateMinutes: 0
      }
    }

    return {
      statusCategory: 'regular',
      statusLabel: 'PUNCH RECORDED',
      statusDetail: 'Biometric verified',
      statusVariant: 'secondary',
      isEarly: false,
      isLate: false,
      diffMinutes: 0,
      late_minutes: 0,
      lateMinutes: 0
    }
  }

  /**
   * Core rule: Every real biometric event is immediately recorded as a recent punch.
   * Do NOT deduplicate by employee/Bio ID — consecutive punches from the same employee
   * or different employees must immediately appear at index 0 (top of Recent Punches).
   * Exact event duplicates (e.g. multi-channel broadcasts) are deduplicated by eventId/id.
   */
  public handleIncomingPunch = (event: PunchDisplayEvent) => {
    // If Punch Display is turned OFF in preferences, do not accept punches
    if (!this.settings.value.enabled) return

    // Build compact recent punch representation directly from the incoming punch event
    const compactIncoming: CompactRecentPunch = {
      id: event.id,
      eventId: event.eventId || event.id,
      employeeName: event.employeeName,
      bioId: event.bioId || event.userId,
      direction: event.stateLabel,
      time: event.time || this.formatTimeDisplay(event.timestamp),
      date: event.date || this.formatDateDisplay(event.timestamp),
      status: event.statusLabel,
      statusVariant: event.statusVariant,
      isLate: event.isLate,
      firstInTime: event.firstInTime,
      firstInLate: event.firstInLate,
      firstInLateMinutes: event.firstInLateMinutes
    }

    // Immediately prepend incoming punch to Recent Punches (capped strictly at 7 entries)
    // Filter out any matching eventId / id to prevent double-counting across multi-channel broadcasts
    this.recentPunches.value = [
      compactIncoming,
      ...this.recentPunches.value.filter(p => p.id !== compactIncoming.id && p.eventId !== compactIncoming.eventId)
    ].slice(0, 7)

    // Always replace current punch with a fresh object reference for the hero display
    this.currentPunch.value = { ...event }
    this.punchHistory.value = this.recentPunches.value

    if (this.settings.value.soundEnabled) {
      this.playChime()
    }
  }

  /**
   * Hydrates recent punches from IndexedDB for today's date if recentPunches is currently empty.
   * Uses O(log N) indexed single-date query, avoiding any full-database scans.
   */
  public hydrateRecentPunches = async (): Promise<void> => {
    if (this.recentPunches.value.length > 0) return
    try {
      const todayStr = getManilaDateString(new Date())
      const punchesToday = await punchRepository.getPunchesByDate(todayStr)
      if (punchesToday.length === 0) return

      // Sort descending (newest first) and take the latest up to 7
      const sorted = [...punchesToday].sort(
        (a, b) => new Date(b.attendance_time).getTime() - new Date(a.attendance_time).getTime()
      )
      const latest = sorted.slice(0, 7)

      const compactList: CompactRecentPunch[] = latest.map(p => {
        const stateNum = Number(p.state ?? 1)
        let dir: 'IN' | 'OUT' | 'BREAK_OUT' | 'BREAK_IN' | 'OT_IN' | 'OT_OUT' = 'IN'
        if (stateNum === 2) dir = 'BREAK_OUT'
        else if (stateNum === 3) dir = 'BREAK_IN'
        else if (stateNum === 4) dir = 'OUT'
        else if (stateNum === 5) dir = 'OT_IN'
        else if (stateNum === 6) dir = 'OT_OUT'
        else {
          const pMins = getManilaMinutesFromMidnight(p.attendance_time)
          if (pMins >= 13 * 60 + 35) {
            dir = 'OUT'
          } else if (pMins >= 11 * 60 + 30 && pMins <= 12 * 60 + 30) {
            dir = 'BREAK_OUT'
          } else if (pMins > 12 * 60 + 30 && pMins < 13 * 60 + 35) {
            dir = 'BREAK_IN'
          } else {
            dir = 'IN'
          }
        }

        const stateInfo = this.getStateLabelAndColor(
          dir === 'OUT' ? 4 : (dir === 'BREAK_OUT' ? 2 : (dir === 'BREAK_IN' ? 3 : (dir === 'OT_IN' ? 5 : (dir === 'OT_OUT' ? 6 : 1))))
        )
        const status = this.evaluateAttendanceStatus(
          p.attendance_time,
          dir as any,
          '08:00',
          0,
          '17:00',
          dir === 'IN'
        )
        return {
          id: p.id,
          eventId: p.id,
          employeeName: p.employee_name || `User ${p.user_id}`,
          bioId: normalizeBioId(p.user_id),
          direction: stateInfo.label,
          time: this.formatTimeDisplay(p.attendance_time),
          date: this.formatDateDisplay(p.attendance_time),
          status: status.statusLabel,
          statusVariant: status.statusVariant,
          isLate: status.isLate
        }
      })

      if (this.recentPunches.value.length === 0) {
        this.recentPunches.value = compactList
        this.punchHistory.value = compactList
      }
    } catch (err) {
      console.warn('[PunchDisplayService] Failed to hydrate recent punches:', err)
    }
  }

  /**
   * Display clock offset: permanently fixed to -300,000 ms (PC time minus 5 minutes).
   * Does not dynamically learn, calculate, or override from incoming punches.
   */
  public updateDeviceTimeOffset = (_deviceTimestampStr?: string): void => {
    // No-op: punch display clock strictly uses PC system time minus 5 minutes.
  }

  public resetDeviceTimeOffset = (): void => {
    cleanLegacyStoredOffset()
    this.deviceTimeOffset.value = PUNCH_DISPLAY_CLOCK_OFFSET_MS
    this.clockSource.value = 'device'
  }

  /**
   * Returns the current display clock offset in milliseconds (-300,000 ms).
   */
  public getDeviceTimeOffset = (): number => {
    return PUNCH_DISPLAY_CLOCK_OFFSET_MS
  }

  /**
   * Computes the current wall-clock date for the Punch Display:
   * Normal computer clock (Date.now()) minus exactly 5 minutes (300,000 ms).
   */
  public getDeviceAlignedDate = (): Date => {
    return new Date(Date.now() + PUNCH_DISPLAY_CLOCK_OFFSET_MS)
  }

  /**
   * Alias for getDeviceAlignedDate for clear semantic intent.
   */
  public getDisplayClockDate = (): Date => {
    return new Date(Date.now() + PUNCH_DISPLAY_CLOCK_OFFSET_MS)
  }

  public formatTimeDisplay(isoStr: string): string {
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

  public formatDateDisplay(isoStr: string): string {
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

  /**
   * Resolves the employee by normalized Bio ID, determines punch direction,
   * evaluates status without calculating separate attendance rules,
   * and broadcasts the punch to the Punch Display.
   */
  public broadcastPunchFromLog = async (
    log: AttendanceLog,
    extra?: {
      direction?: 'IN' | 'OUT' | 'BREAK_OUT' | 'BREAK_IN' | 'OT_IN' | 'OT_OUT'
      workGroup?: string
      workGroupCode?: string
      department?: string
      standardIn?: string
      gracePeriod?: number
      expectedOut?: string
      photoUrl?: string
      firstInTime?: string
      firstInLate?: boolean
      firstInLateMinutes?: number
    }
  ) => {
    // If Punch Display is disabled in settings, do not broadcast
    if (!this.settings.value.enabled) {
      return
    }

    const rawUserId = log.user_id || log.employee_id || ''
    const normalizedBioId = normalizeBioId(rawUserId)

    // Lookup employee from the existing employee directory
    let employee = undefined
    if (normalizedBioId) {
      try {
        employee = await employeeService.getEmployeeByBioId(normalizedBioId)
      } catch {
        // ignore
      }
    }

    // Authoritative employee name resolution:
    // If employee exists in directory: use full_name
    // If not found in directory: use 'Unknown Employee' (never raw "user25065")
    let resolvedName = 'Unknown Employee'
    if (employee?.full_name) {
      resolvedName = employee.full_name
    } else if (log.employee_name && !/^user\d+$/i.test(log.employee_name.trim()) && !/^user_\d+$/i.test(log.employee_name.trim()) && log.employee_name !== 'Biometric User') {
      resolvedName = log.employee_name.trim()
    } else {
      resolvedName = 'Unknown Employee'
    }

    // Resolve Work Group schedule parameters from authoritative repository
    let wg: any = undefined
    if (employee?.work_group_id) {
      try {
        wg = await workGroupRepository.getById(employee.work_group_id)
      } catch {
        // fallback
      }
    }

    const stdIn = wg?.standard_in || wg?.standardIn || extra?.standardIn || '08:00'
    const grace = wg?.grace_period_minutes ?? wg?.gracePeriodMinutes ?? extra?.gracePeriod ?? 0
    const wgName = wg?.name || employee?.work_group_name || extra?.workGroup || 'Group C'
    const wgCode = wg?.code || employee?.work_group_code || extra?.workGroupCode || 'C'
    
    let expOut = wg?.expected_out || wg?.expectedOut || extra?.expectedOut || '17:00'
    if (wg && !wg.expected_out && !wg.expectedOut) {
      const outCalc = calculateExpectedOutMinutes(
        stdIn,
        wg.required_work_minutes || wg.requiredWorkMinutes || 480,
        wg.lunch_start || wg.lunchStart || '12:00',
        wg.lunch_end || wg.lunchEnd || '13:00'
      )
      expOut = outCalc.outHHMM || '17:00'
    }

    const lunchStart = wg?.lunch_start || wg?.lunchStart || '12:00'
    const lunchEnd = wg?.lunch_end || wg?.lunchEnd || '13:00'
    const [inH, inM] = stdIn.split(':').map(Number)
    const [lStartH, lStartM] = lunchStart.split(':').map(Number)
    const [lEndH, lEndM] = lunchEnd.split(':').map(Number)
    const [outH, outM] = expOut.split(':').map(Number)

    const standardInMinutes = (inH || 8) * 60 + (inM || 0)
    const expectedOutMinutes = (outH || 17) * 60 + (outM || 0)
    const lunchStartMinutes = (lStartH || 12) * 60 + (lStartM || 0)
    const lunchEndMinutes = (lEndH || 13) * 60 + (lEndM || 0)

    const morningArrivalCutoffMins = lunchStartMinutes - 15 // e.g. 11:45 AM
    const afternoonDepartureMinMins = Math.max(lunchEndMinutes + 35, standardInMinutes + 210) // e.g. 1:35 PM (815m)

    const punchDate = new Date(log.attendance_time || Date.now())
    const punchMinutes = getManilaMinutesFromMidnight(punchDate)
    const currentMs = punchDate.getTime()

    // Retrieve prior primary punches for this employee today
    const todayStr = getManilaDateString(punchDate)
    const sessionKey = `${todayStr}_${normalizedBioId}`
    const inMemLogs = this.sessionPunchHistory.get(sessionKey) || []

    let allCandidatePunches: AttendanceLog[] = [...inMemLogs]
    try {
      const todayPunches = await punchRepository.getPunchesByDate(todayStr)
      const userPunchesToday = todayPunches.filter(p => normalizeBioId(p.user_id) === normalizedBioId)
      for (const p of userPunchesToday) {
        if (!allCandidatePunches.some(x => x.id === p.id || (Math.abs(new Date(x.attendance_time).getTime() - new Date(p.attendance_time).getTime()) < 1000))) {
          allCandidatePunches.push(p)
        }
      }
    } catch {
      // ignore
    }

    // Filter out current log if already present to establish prior punches
    const userPriorPunches = allCandidatePunches.filter(p => p.id !== log.id)
    const sortedPrior = [...userPriorPunches].sort((a, b) => new Date(a.attendance_time).getTime() - new Date(b.attendance_time).getTime())

    const primaryPrior: AttendanceLog[] = []
    let lastPrimaryMs = -Infinity
    for (const p of sortedPrior) {
      const pMs = new Date(p.attendance_time).getTime()
      if (primaryPrior.length === 0 || pMs - lastPrimaryMs > 60000) {
        primaryPrior.push(p)
        lastPrimaryMs = pMs
      }
    }

    // Record this incoming log into session punch history
    if (!inMemLogs.some(x => x.id === log.id || (Math.abs(new Date(x.attendance_time).getTime() - currentMs) < 1000))) {
      this.sessionPunchHistory.set(sessionKey, [...inMemLogs, log])
    }

    // Resolve morning arrival metadata (for end-of-day recap preservation)
    let resolvedFirstInTime: string | undefined = extra?.firstInTime
    let resolvedFirstInLate: boolean | undefined = extra?.firstInLate
    let resolvedFirstInLateMinutes: number | undefined = extra?.firstInLateMinutes

    // Check recent punches in memory if morning arrival was already established
    if (resolvedFirstInLate === undefined) {
      const prevRecent = this.recentPunches.value.find(p => p.bioId === normalizedBioId && p.firstInLate !== undefined)
      if (prevRecent) {
        resolvedFirstInLate = prevRecent.firstInLate
        resolvedFirstInLateMinutes = prevRecent.firstInLateMinutes
        resolvedFirstInTime = resolvedFirstInTime || prevRecent.firstInTime
      }
    }

    if (primaryPrior.length > 0 && (!resolvedFirstInTime || resolvedFirstInLate === undefined)) {
      const firstPrimaryIn = primaryPrior.find(p => {
        const mins = getManilaMinutesFromMidnight(p.attendance_time)
        const st = Number(p.state ?? 0)
        return mins < morningArrivalCutoffMins || st === 1 || (p as any).direction === 'IN' || (p as any).windowRole === 'IN'
      }) || primaryPrior[0]

      if (firstPrimaryIn) {
        if (!resolvedFirstInTime) {
          resolvedFirstInTime = this.formatTimeDisplay(firstPrimaryIn.attendance_time)
        }
        if (resolvedFirstInLate === undefined) {
          const firstMins = getManilaMinutesFromMidnight(firstPrimaryIn.attendance_time)
          if (firstMins > standardInMinutes) {
            resolvedFirstInLate = true
            resolvedFirstInLateMinutes = firstMins - standardInMinutes
          } else {
            resolvedFirstInLate = false
            resolvedFirstInLateMinutes = 0
          }
        }
      }
    }

    // Determine Direction: IN, OUT, BREAK_OUT, BREAK_IN
    let direction: 'IN' | 'OUT' | 'BREAK_OUT' | 'BREAK_IN' | 'OT_IN' | 'OT_OUT' = 'IN'
    const explicitState = Number(log.state ?? 0)
    const explicitDir = extra?.direction || (log as any).direction

    const lastPrimary = primaryPrior[primaryPrior.length - 1]
    const isDuplicateOfLast = lastPrimary && Math.abs(currentMs - new Date(lastPrimary.attendance_time).getTime()) <= 60000

    if (isDuplicateOfLast) {
      const lastSt = Number(lastPrimary.state ?? 0)
      direction = lastSt === 2 ? 'BREAK_OUT' : (lastSt === 3 ? 'BREAK_IN' : (lastSt === 4 ? 'OUT' : 'IN'))
    } else if (explicitDir === 'BREAK_OUT' || explicitState === 2) {
      direction = 'BREAK_OUT'
    } else if (explicitDir === 'BREAK_IN' || explicitState === 3) {
      direction = 'BREAK_IN'
    } else if (explicitDir === 'OT_IN' || explicitState === 5) {
      direction = 'OT_IN'
    } else if (explicitDir === 'OT_OUT' || explicitState === 6) {
      direction = 'OT_OUT'
    } else if (explicitDir === 'OUT' || explicitState === 4) {
      if (primaryPrior.length === 1 && punchMinutes < afternoonDepartureMinMins) {
        direction = 'BREAK_OUT'
      } else {
        direction = 'OUT'
      }
    } else {
      // Sequence & Schedule-Aware Pairing
      const priorCount = primaryPrior.length

      if (priorCount === 0) {
        if (punchMinutes >= afternoonDepartureMinMins) {
          direction = 'OUT' // Likely OUT — Missing IN
        } else if (punchMinutes >= lunchStartMinutes - 30 && punchMinutes <= lunchStartMinutes + 30) {
          direction = 'BREAK_OUT' // Lunch Departure
        } else if (punchMinutes > lunchStartMinutes + 30 && punchMinutes <= lunchEndMinutes + 35) {
          direction = 'BREAK_IN' // Lunch Return
        } else {
          direction = 'IN' // First Morning Arrival
        }
      } else if (priorCount === 1) {
        if (punchMinutes >= afternoonDepartureMinMins) {
          direction = 'OUT' // Shift Departure
        } else {
          direction = 'BREAK_OUT' // Lunch Departure
        }
      } else if (priorCount === 2) {
        if (punchMinutes < afternoonDepartureMinMins) {
          direction = 'BREAK_IN' // Lunch Return
        } else {
          direction = 'OUT' // Shift Departure
        }
      } else if (priorCount === 3) {
        if (punchMinutes >= afternoonDepartureMinMins - 30) {
          direction = 'OUT' // Shift Departure
        } else {
          direction = 'BREAK_OUT'
        }
      } else {
        if (punchMinutes >= expectedOutMinutes - 30) {
          direction = 'OUT'
        } else {
          const lastSt = Number(primaryPrior[primaryPrior.length - 1].state ?? 0)
          direction = (lastSt === 1 || lastSt === 3) ? 'BREAK_OUT' : 'BREAK_IN'
        }
      }
    }

    const stateNumber = direction === 'OUT' ? 4 : (direction === 'BREAK_OUT' ? 2 : (direction === 'BREAK_IN' ? 3 : (direction === 'OT_IN' ? 5 : (direction === 'OT_OUT' ? 6 : 1))))
    const { label, color } = this.getStateLabelAndColor(stateNumber)
    
    // Evaluate status using the resolved direction
    // Only genuine morning arrival (before lunch) with no prior punches is evaluated for arrival lateness
    const isFirstIn = direction === 'IN' && primaryPrior.length === 0 && punchMinutes < morningArrivalCutoffMins
    const status = this.evaluateAttendanceStatus(
      log.attendance_time || new Date().toISOString(),
      direction,
      stdIn,
      grace,
      expOut,
      isFirstIn,
      lunchStart,
      lunchEnd
    )

    const formattedTime = this.formatTimeDisplay(log.attendance_time || new Date().toISOString())
    const formattedDate = this.formatDateDisplay(log.attendance_time || new Date().toISOString())

    if (isFirstIn) {
      resolvedFirstInTime = formattedTime
      resolvedFirstInLate = status.isLate
      resolvedFirstInLateMinutes = status.lateMinutes || status.diffMinutes || 0
    }

    // Generate guaranteed unique event identity so repeated punches from same employee are distinct
    const seq = ++eventCounter
    const eventTimestamp = new Date(log.attendance_time || Date.now()).getTime()
    const uniqueEventId = `punch-${normalizedBioId}-${eventTimestamp}-${seq}`

    const resolvedPhoto = employee?.photo || (normalizedBioId ? `/employee-photos/${normalizedBioId}.jpg` : undefined) || extra?.photoUrl

    const event: PunchDisplayEvent = {
      id: uniqueEventId,
      eventId: uniqueEventId,
      userId: normalizedBioId,
      bioId: normalizedBioId,
      employeeName: resolvedName,
      employeeId: normalizedBioId,
      photoUrl: resolvedPhoto,
      workGroup: wgName,
      workGroupCode: wgCode,
      department: employee?.department || extra?.department || 'Operations',
      locationName: employee?.location || log.location_name || 'DBB Cebu',
      deviceName: log.device_name || 'BISMAC BISBIO B-29b',
      timestamp: log.attendance_time || new Date().toISOString(),
      time: formattedTime,
      date: formattedDate,
      type: log.type ?? 1,
      state: stateNumber,
      direction,
      stateLabel: label,
      stateColor: color,
      statusCategory: status.statusCategory,
      status: status.statusLabel,
      statusLabel: status.statusLabel,
      statusDetail: status.statusDetail,
      statusVariant: status.statusVariant,
      isLate: status.isLate,
      isEarly: status.isEarly,
      diffMinutes: status.diffMinutes,
      late_minutes: status.late_minutes,
      lateMinutes: status.lateMinutes,
      firstInTime: resolvedFirstInTime,
      firstInLate: resolvedFirstInLate,
      firstInLateMinutes: resolvedFirstInLateMinutes
    }

    this.handleIncomingPunch(event)

    const broadcastPayload = {
      type: 'PUNCH_DETECTED',
      payload: event
    }

    if (this.primaryChannel) {
      try {
        this.primaryChannel.postMessage(broadcastPayload)
      } catch (e) {
        console.warn('[PunchDisplayService] Primary postMessage failed:', e)
      }
    }

    if (this.fallbackChannel) {
      try {
        this.fallbackChannel.postMessage(broadcastPayload)
      } catch (e) {
        console.warn('[PunchDisplayService] Fallback postMessage failed:', e)
      }
    }
  }

  public openPunchDisplay = (): Window | null => {
    if (typeof window === 'undefined') return null

    // If window exists and is not closed, focus and reuse it
    if (this.punchDisplayWindow && !this.punchDisplayWindow.closed) {
      try {
        this.punchDisplayWindow.focus()
        return this.punchDisplayWindow
      } catch {
        // In case of cross-origin or detached frame, reopen below
      }
    }

    const targetUrl = `${window.location.origin}${window.location.pathname}#/punch-display`
    const windowFeatures = 'popup=yes,width=1020,height=760,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes'

    try {
      this.punchDisplayWindow = window.open(targetUrl, 'dmbbhr-punch-display', windowFeatures)
      if (this.punchDisplayWindow) {
        this.punchDisplayWindow.focus()
      }
      return this.punchDisplayWindow
    } catch (e) {
      console.error('[PunchDisplayService] Failed to open punch display window:', e)
      return null
    }
  }

  public isWindowOpen = (): boolean => {
    return Boolean(this.punchDisplayWindow && !this.punchDisplayWindow.closed)
  }

  public playChime = () => {
    if (typeof window === 'undefined' || (typeof window.AudioContext === 'undefined' && typeof (window as any).webkitAudioContext === 'undefined')) {
      return
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioCtx()
      
      const now = ctx.currentTime
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()

      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(587.33, now) // D5
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15) // A5

      osc2.type = 'triangle'
      osc2.frequency.setValueAtTime(880, now) // A5
      osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.18) // D6

      gain.gain.setValueAtTime(0.15, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)

      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(ctx.destination)

      osc1.start(now)
      osc2.start(now)
      osc1.stop(now + 0.35)
      osc2.stop(now + 0.35)
    } catch {
      // Audio context might be restricted before user gesture
    }
  }
}

export const punchDisplayService = new PunchDisplayService()
