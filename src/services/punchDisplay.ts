/**
 * Service to manage the child Punch Display window, BroadcastChannel communication,
 * and user-configurable display preferences.
 * Provides high-performance, zero-recalculation real-time punch event distribution.
 */

import { ref } from 'vue'
import type { AttendanceLog } from '@/types'
import { formatDuration } from '@/lib/timeUtils'
import { employeeService } from '@/services/employees'

export interface PunchDisplayEvent {
  id: string
  userId: string
  employeeName: string
  employeeId?: string
  photoUrl?: string
  workGroup?: string
  workGroupCode?: string
  department?: string
  locationName?: string
  deviceName?: string
  timestamp: string
  type: number // 1: Fingerprint, 2: Face, 3: Password, 4: Card, etc.
  state: number // 1: Time In, 2: Break Out, 3: Break In, 4: Time Out, 5: OT In, 6: OT Out
  stateLabel: string
  stateColor: 'emerald' | 'amber' | 'blue' | 'rose' | 'purple' | 'slate'
  statusCategory: 'early' | 'on_time' | 'late' | 'undertime' | 'regular' | 'time_out'
  statusLabel: string
  statusDetail: string
  statusVariant: 'success' | 'warning' | 'destructive' | 'secondary' | 'outline' | 'default'
  isLate: boolean
  isEarly: boolean
  diffMinutes?: number
}

export interface PunchDisplaySettings {
  displayDurationSeconds: number // 0 means hold indefinitely until next punch
  soundEnabled: boolean
  confettiEnabled: boolean
  lateImageEnabled: boolean
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

const PRIMARY_CHANNEL_NAME = 'dmbbhr-punch-display'
const FALLBACK_CHANNEL_NAME = 'dmbbhr-punch-channel'
const SETTINGS_KEY = 'dmbbhr_punch_display_settings'

const DEFAULT_SETTINGS: PunchDisplaySettings = {
  displayDurationSeconds: 8,
  soundEnabled: true,
  confettiEnabled: true,
  lateImageEnabled: false,
  customLateImageUrl: ''
}

class PunchDisplayService {
  private primaryChannel: BroadcastChannel | null = null
  private fallbackChannel: BroadcastChannel | null = null
  private punchDisplayWindow: Window | null = null
  public isChannelSupported = typeof window !== 'undefined' && 'BroadcastChannel' in window
  public currentPunch = ref<PunchDisplayEvent | null>(null)
  
  // Maximum 5 recent punches for visual lineup
  public recentPunches = ref<PunchDisplayEvent[]>([])
  public punchHistory = ref<PunchDisplayEvent[]>([]) // alias for backward compatibility
  
  // Persistent Settings
  public settings = ref<PunchDisplaySettings>(this.loadSettings())

  constructor() {
    this.initChannels()
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
  }

  private initChannels() {
    if (typeof window === 'undefined' || !this.isChannelSupported) return

    const handleMessage = (event: MessageEvent) => {
      if (event.data && (event.data.type === 'PUNCH_EVENT' || event.data.type === 'PUNCH_DETECTED') && event.data.payload) {
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

  public evaluateAttendanceStatus = (
    timestampStr: string,
    state: number,
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

    if (state === 1) { // TIME IN
      const [stdH, stdM] = standardIn.split(':').map(Number)
      const standardInMinutes = (stdH || 8) * 60 + (stdM || 0)

      if (punchMinutes < standardInMinutes) {
        const earlyDiff = standardInMinutes - punchMinutes
        return {
          statusCategory: 'early',
          statusLabel: '✓ EARLY',
          statusDetail: `${formatDuration(earlyDiff)} early`,
          statusVariant: 'success',
          isEarly: true,
          isLate: false,
          diffMinutes: earlyDiff
        }
      } else if (punchMinutes <= standardInMinutes + gracePeriod) {
        return {
          statusCategory: 'on_time',
          statusLabel: '✓ ON TIME',
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
          statusLabel: 'LATE ARRIVAL',
          statusDetail: `Late by ${formatDuration(lateDiff)}`,
          statusVariant: 'destructive',
          isEarly: false,
          isLate: true,
          diffMinutes: lateDiff
        }
      }
    }

    if (state === 4) { // TIME OUT
      const [expH, expM] = expectedOut.split(':').map(Number)
      const expectedOutMinutes = (expH || 17) * 60 + (expM || 0)

      // Normal OUT is NOT labeled as early; it is TIME OUT
      if (punchMinutes >= expectedOutMinutes) {
        return {
          statusCategory: 'time_out',
          statusLabel: '✓ TIME OUT',
          statusDetail: 'Shift completed',
          statusVariant: 'success',
          isEarly: false,
          isLate: false,
          diffMinutes: 0
        }
      } else {
        const undertime = expectedOutMinutes - punchMinutes
        return {
          statusCategory: 'undertime',
          statusLabel: 'EARLY OUT',
          statusDetail: `${formatDuration(undertime)} before scheduled exit`,
          statusVariant: 'warning',
          isEarly: false,
          isLate: false,
          diffMinutes: undertime
        }
      }
    }

    if (state === 2) {
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

    if (state === 3) {
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

    if (state === 5) {
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

    if (state === 6) {
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

  public handleIncomingPunch = (event: PunchDisplayEvent) => {
    // When a new punch arrives, the previous current punch moves into recent punches (max 5)
    if (this.currentPunch.value && this.currentPunch.value.id !== event.id) {
      const prev = this.currentPunch.value
      this.recentPunches.value = [
        prev,
        ...this.recentPunches.value.filter(p => p.id !== prev.id && p.id !== event.id)
      ].slice(0, 5)
    }

    this.currentPunch.value = event
    this.punchHistory.value = this.recentPunches.value

    if (this.settings.value.soundEnabled) {
      this.playChime()
    }
  }

  /**
   * Resolves the employee by normalized Bio ID and broadcasts the authoritative punch event.
   */
  public broadcastPunchFromLog = async (
    log: AttendanceLog,
    extra?: {
      workGroup?: string
      workGroupCode?: string
      department?: string
      standardIn?: string
      gracePeriod?: number
      expectedOut?: string
      photoUrl?: string
    }
  ) => {
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

    const resolvedWorkGroup = employee?.work_group_name || extra?.workGroup || employee?.work_group_id || 'Standard Crew'
    const resolvedWorkGroupCode = employee?.work_group_code || extra?.workGroupCode || 'C'
    const resolvedDepartment = employee?.department || extra?.department || 'Operations'
    const resolvedLocation = employee?.location || log.location_name || 'DBB Cebu'

    const { label, color } = this.getStateLabelAndColor(log.state ?? 1)
    const status = this.evaluateAttendanceStatus(
      log.attendance_time || new Date().toISOString(),
      log.state ?? 1,
      extra?.standardIn || '08:00',
      extra?.gracePeriod ?? 15,
      extra?.expectedOut || '17:00'
    )

    const event: PunchDisplayEvent = {
      id: log.id || `punch-${normalizedBioId}-${Date.now()}`,
      userId: normalizedBioId,
      employeeName: resolvedName,
      employeeId: normalizedBioId,
      photoUrl: extra?.photoUrl,
      workGroup: resolvedWorkGroup,
      workGroupCode: resolvedWorkGroupCode,
      department: resolvedDepartment,
      locationName: resolvedLocation,
      deviceName: log.device_name || 'BISMAC BISBIO B-29b',
      timestamp: log.attendance_time || new Date().toISOString(),
      type: log.type ?? 1,
      state: log.state ?? 1,
      stateLabel: label,
      stateColor: color,
      statusCategory: status.statusCategory,
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
