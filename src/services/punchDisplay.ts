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
import { getManilaDateString } from '@/services/attendanceEngine'

export interface CompactRecentPunch {
  id: string
  eventId: string
  employeeName: string
  bioId: string
  direction: string // "TIME IN" | "TIME OUT"
  time: string // "8:03 AM"
  date: string // "October 5, 2026"
  status: string // "EARLY" | "ON TIME" | "LATE" | "TIME OUT" | "EARLY OUT"
  statusVariant: 'success' | 'warning' | 'destructive' | 'secondary' | 'outline' | 'default'
  isLate: boolean
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
}

export interface PunchDisplaySettings {
  enabled: boolean // Enable Punch Display = ON / OFF (default: true)
  displayDurationSeconds: number // Supported values: 2, 3, 5, 8, 10 (default: 5)
  soundEnabled: boolean // Audio chime ON / OFF (default: true)
  confettiEnabled: boolean // Confetti = ON / OFF (default: true)
  lateVisualEnabled: boolean // Late Visual = ON / OFF (default: true)
  customLateImageUrl: string
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

const DEFAULT_SETTINGS: PunchDisplaySettings = {
  enabled: true,
  displayDurationSeconds: 5, // Default: 5 seconds
  soundEnabled: true,
  confettiEnabled: true,
  lateVisualEnabled: true,
  customLateImageUrl: ''
}

class PunchDisplayService {
  private primaryChannel: BroadcastChannel | null = null
  private fallbackChannel: BroadcastChannel | null = null
  private punchDisplayWindow: Window | null = null
  public isChannelSupported = typeof window !== 'undefined' && 'BroadcastChannel' in window
  public currentPunch = ref<PunchDisplayEvent | null>(null)
  
  // Maximum 10 recent punches for visual lineup
  public recentPunches = ref<CompactRecentPunch[]>([])
  public punchHistory = ref<CompactRecentPunch[]>([]) // alias for backward compatibility
  
  // Persistent Settings
  public settings = ref<PunchDisplaySettings>(this.loadSettings())

  constructor() {
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
    this.settings.value = { ...this.settings.value, ...newSettings }
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
    gracePeriod: number = 15,
    expectedOut: string = '17:00'
  ): {
    statusCategory: PunchDisplayEvent['statusCategory']
    statusLabel: string
    statusDetail: string
    statusVariant: PunchDisplayEvent['statusVariant']
    isLate: boolean
    isEarly: boolean
    diffMinutes: number
  } => {
    const punchDate = new Date(timestampStr)
    let hours = punchDate.getHours()
    let minutes = punchDate.getMinutes()
    try {
      const phTimeStr = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
      }).format(punchDate)
      const parts = phTimeStr.split(':')
      if (parts.length === 2) {
        hours = parseInt(parts[0], 10)
        minutes = parseInt(parts[1], 10)
      }
    } catch {
      // fallback to local
    }

    const punchMinutes = hours * 60 + minutes

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
          diffMinutes: 0
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
          diffMinutes: undertime
        }
      }
    }

    // 2. TIME IN EVALUATION
    if (direction === 'IN') {
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
          diffMinutes: earlyDiff
        }
      } else if (punchMinutes <= standardInMinutes + gracePeriod) {
        return {
          statusCategory: 'on_time',
          statusLabel: 'ON TIME',
          statusDetail: 'Within shift grace period',
          statusVariant: 'success',
          isEarly: false,
          isLate: false,
          diffMinutes: 0
        }
      } else {
        const lateDiff = punchMinutes - standardInMinutes
        return {
          statusCategory: 'late',
          statusLabel: 'LATE',
          statusDetail: `Late by ${formatDuration(lateDiff)}`,
          statusVariant: 'destructive',
          isEarly: false,
          isLate: true,
          diffMinutes: lateDiff
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
        diffMinutes: 0
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
        diffMinutes: 0
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
        diffMinutes: 0
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
        diffMinutes: 0
      }
    }

    return {
      statusCategory: 'regular',
      statusLabel: 'PUNCH RECORDED',
      statusDetail: 'Biometric verified',
      statusVariant: 'secondary',
      isEarly: false,
      isLate: false,
      diffMinutes: 0
    }
  }

  /**
   * Core rule: Every real biometric event is a NEW punch event.
   * Do NOT deduplicate by employee/Bio ID.
   * Same employee punching again creates a distinct event and pushes previous punch to recent history.
   */
  public handleIncomingPunch = (event: PunchDisplayEvent) => {
    // If Punch Display is turned OFF in preferences, do not accept punches
    if (!this.settings.value.enabled) return

    // When a new punch arrives, convert previous current punch to compact recent punch (max 10)
    // Even if it's the exact same employee, the previous punch is archived into recent punches!
    if (this.currentPunch.value) {
      const prev = this.currentPunch.value
      // Check if previous event is different from incoming event
      if (prev.id !== event.id && prev.eventId !== event.eventId) {
        const compactPrev: CompactRecentPunch = {
          id: prev.id,
          eventId: prev.eventId || prev.id,
          employeeName: prev.employeeName,
          bioId: prev.bioId || prev.userId,
          direction: prev.stateLabel,
          time: prev.time || this.formatTimeDisplay(prev.timestamp),
          date: prev.date || this.formatDateDisplay(prev.timestamp),
          status: prev.statusLabel,
          statusVariant: prev.statusVariant,
          isLate: prev.isLate
        }

        // Insert newest at the top. DO NOT deduplicate by Bio ID!
        // Consecutive punches from the same employee must both be kept in recent punches.
        this.recentPunches.value = [
          compactPrev,
          ...this.recentPunches.value.filter(p => p.id !== compactPrev.id && p.eventId !== compactPrev.eventId)
        ].slice(0, 10) // Maximum 10 entries
      }
    }

    // Always replace current punch with a fresh object reference
    this.currentPunch.value = { ...event }
    this.punchHistory.value = this.recentPunches.value

    if (this.settings.value.soundEnabled) {
      this.playChime()
    }
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
    let stdIn = extra?.standardIn || '08:00'
    let grace = extra?.gracePeriod ?? 15
    let expOut = extra?.expectedOut || '17:00'
    let wgName = employee?.work_group_name || extra?.workGroup || employee?.work_group_id || 'Standard Crew'
    let wgCode = employee?.work_group_code || extra?.workGroupCode || 'C'

    if (employee?.work_group_id) {
      try {
        const wg = await workGroupRepository.getById(employee.work_group_id)
        if (wg) {
          stdIn = wg.standard_in || '08:00'
          grace = wg.grace_period_minutes ?? 15
          wgName = wg.name || wgName
          wgCode = wg.code || wgCode
          const outCalc = calculateExpectedOutMinutes(stdIn, wg.required_work_minutes || 480, wg.lunch_start || '12:00', wg.lunch_end || '13:00')
          expOut = outCalc.outHHMM || '17:00'
        }
      } catch {
        // fallback to defaults
      }
    }

    // Determine Direction: IN vs OUT
    // Priority 1: Explicit caller direction or state
    let direction: 'IN' | 'OUT' | 'BREAK_OUT' | 'BREAK_IN' | 'OT_IN' | 'OT_OUT' = 'IN'
    const explicitState = Number(log.state ?? 0)
    const explicitDir = extra?.direction || (log as any).direction

    if (explicitDir === 'OUT' || explicitState === 4) {
      direction = 'OUT'
    } else if (explicitDir === 'IN') {
      direction = 'IN'
    } else if (explicitState === 2) {
      direction = 'BREAK_OUT'
    } else if (explicitState === 3) {
      direction = 'BREAK_IN'
    } else if (explicitState === 5) {
      direction = 'OT_IN'
    } else if (explicitState === 6) {
      direction = 'OT_OUT'
    } else {
      // Priority 2: Use existing attendance sequence and schedule window
      try {
        const todayStr = getManilaDateString(new Date(log.attendance_time))
        const todayPunches = await punchRepository.getPunchesByDate(todayStr)
        const userPunchesToday = todayPunches.filter(p => p.user_id === normalizedBioId && p.id !== log.id)

        if (userPunchesToday.length > 0) {
          // Employee already has a punch earlier today -> this is an OUT punch
          direction = 'OUT'
        } else {
          // First punch of the day: check time of day
          const punchDate = new Date(log.attendance_time)
          const h = punchDate.getHours()
          const m = punchDate.getMinutes()
          const punchMins = h * 60 + m
          // If after 1:00 PM (780m), departure window
          if (punchMins >= 780) {
            direction = 'OUT'
          } else {
            direction = 'IN'
          }
        }
      } catch {
        direction = 'IN'
      }
    }

    const stateNumber = direction === 'OUT' ? 4 : (direction === 'BREAK_OUT' ? 2 : (direction === 'BREAK_IN' ? 3 : (direction === 'OT_IN' ? 5 : (direction === 'OT_OUT' ? 6 : 1))))
    const { label, color } = this.getStateLabelAndColor(stateNumber)
    
    // Evaluate status using the resolved direction
    const status = this.evaluateAttendanceStatus(
      log.attendance_time || new Date().toISOString(),
      direction,
      stdIn,
      grace,
      expOut
    )

    // Generate guaranteed unique event identity so repeated punches from same employee are distinct
    const seq = ++eventCounter
    const eventTimestamp = new Date(log.attendance_time || Date.now()).getTime()
    const uniqueEventId = `punch-${normalizedBioId}-${eventTimestamp}-${seq}`

    const formattedTime = this.formatTimeDisplay(log.attendance_time || new Date().toISOString())
    const formattedDate = this.formatDateDisplay(log.attendance_time || new Date().toISOString())

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
      diffMinutes: status.diffMinutes
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
