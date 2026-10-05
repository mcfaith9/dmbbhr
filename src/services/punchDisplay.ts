/**
 * Service to manage the child Punch Display window and BroadcastChannel communication.
 * Provides high-performance, zero-recalculation real-time punch event distribution.
 */

import { ref } from 'vue'
import type { AttendanceLog } from '@/types'

export interface PunchDisplayEvent {
  id: string
  userId: string
  employeeName: string
  employeeId?: string
  workGroup?: string
  department?: string
  locationName?: string
  deviceName?: string
  timestamp: string
  type: number // 1: Fingerprint, 2: Face, 3: Password, 4: Card, etc.
  state: number // 1: Time In, 2: Break Out, 3: Break In, 4: Time Out, 5: OT In, 6: OT Out
  stateLabel: string
  stateColor: 'emerald' | 'amber' | 'blue' | 'rose' | 'purple' | 'slate'
}

const CHANNEL_NAME = 'dmbbhr-punch-channel'

class PunchDisplayService {
  private channel: BroadcastChannel | null = null
  private punchDisplayWindow: Window | null = null
  public isChannelSupported = typeof window !== 'undefined' && 'BroadcastChannel' in window
  public currentPunch = ref<PunchDisplayEvent | null>(null)
  public punchHistory = ref<PunchDisplayEvent[]>([])
  public isMuted = ref(false)

  constructor() {
    this.initChannel()
  }

  private initChannel() {
    if (typeof window === 'undefined' || !this.isChannelSupported) return

    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME)
      this.channel.onmessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'PUNCH_EVENT' && event.data.payload) {
          this.handleIncomingPunch(event.data.payload)
        }
      }
    } catch (err) {
      console.warn('[PunchDisplayService] BroadcastChannel init error:', err)
    }
  }

  public getStateLabelAndColor = (state: number): { label: string; color: PunchDisplayEvent['stateColor'] } => {
    switch (state) {
      case 1:
        return { label: 'Time In', color: 'emerald' }
      case 2:
        return { label: 'Break Out', color: 'amber' }
      case 3:
        return { label: 'Break In', color: 'blue' }
      case 4:
        return { label: 'Time Out', color: 'rose' }
      case 5:
        return { label: 'Overtime In', color: 'purple' }
      case 6:
        return { label: 'Overtime Out', color: 'slate' }
      default:
        return { label: 'Time In', color: 'emerald' }
    }
  }

  public handleIncomingPunch = (event: PunchDisplayEvent) => {
    this.currentPunch.value = event
    // Keep max 20 records in memory for session history
    this.punchHistory.value = [event, ...this.punchHistory.value.filter(p => p.id !== event.id)].slice(0, 20)
    
    if (!this.isMuted.value) {
      this.playChime()
    }
  }

  public broadcastPunchFromLog = (log: AttendanceLog, extra?: { workGroup?: string; department?: string }) => {
    const { label, color } = this.getStateLabelAndColor(log.state ?? 1)
    const event: PunchDisplayEvent = {
      id: log.id || `punch-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId: String(log.user_id),
      employeeName: log.employee_name || 'Biometric User',
      employeeId: log.employee_id,
      workGroup: extra?.workGroup || 'Standard Crew',
      department: extra?.department,
      locationName: log.location_name || 'DBB Main Building',
      deviceName: log.device_name || 'BISMAC BISBIO B-29b',
      timestamp: log.attendance_time || new Date().toISOString(),
      type: log.type ?? 1,
      state: log.state ?? 1,
      stateLabel: label,
      stateColor: color
    }

    this.currentPunch.value = event
    this.punchHistory.value = [event, ...this.punchHistory.value.filter(p => p.id !== event.id)].slice(0, 20)

    if (this.channel) {
      try {
        this.channel.postMessage({
          type: 'PUNCH_EVENT',
          payload: event
        })
      } catch (e) {
        console.warn('[PunchDisplayService] Post message failed:', e)
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
    const windowFeatures = 'popup=yes,width=1020,height=720,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes'

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
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined' && typeof (window as any).webkitAudioContext === 'undefined') {
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
