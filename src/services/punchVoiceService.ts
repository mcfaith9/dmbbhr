/**
 * Voice Announcement / Text-to-Speech (TTS) Service for dmbbhr Real-Time Punch Display.
 *
 * Requirements:
 * - Uses native window.speechSynthesis & SpeechSynthesisUtterance
 * - Time-aware greeting (Good morning < 12:00, Good afternoon 12:00-17:59, Good evening >= 18:00)
 * - Safe employee name sanitization (e.g. "Cabigas, Marc Louie" -> "Marc Louie Cabigas")
 * - Late arrival awareness ("Good morning, [Name]. You are late.")
 * - TIME OUT farewell ("Goodbye, [Name]. Take care.")
 * - Lightweight bounded duplicate-event guard (max 30 recent keys)
 * - Immediate speech queue cancellation (speechSynthesis.cancel()) on rapid punches
 * - Cached voices list to avoid repeated getVoices() polling
 * - Zero lag: No database queries, no attendance recalculations, no arrays copied
 */

import type { PunchDisplayEvent, PunchDisplaySettings } from './punchDisplay'

// Small bounded set for recent punch event deduplication
const recentAnnouncedKeys = new Set<string>()
const recentKeyQueue: string[] = []
const MAX_RECENT_KEYS = 30

// Cached browser speech voices
let cachedVoices: SpeechSynthesisVoice[] = []
let voicesInitialized = false

/**
 * Loads available browser speech synthesis voices and caches them.
 */
export function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return []
  }

  try {
    const list = window.speechSynthesis.getVoices()
    if (list && list.length > 0) {
      cachedVoices = list
      voicesInitialized = true
    }
  } catch {
    // Fail-safe
  }
  return cachedVoices
}

// Auto-initialize voice cache if in browser
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices()
  try {
    window.speechSynthesis.onvoiceschanged = () => {
      loadVoices()
    }
  } catch {
    // ignore
  }
}

/**
 * Extracts Manila/local hour from punch timestamp string to determine appropriate greeting.
 */
export function getHourFromPunch(timestampStr: string): number {
  try {
    const date = new Date(timestampStr)
    if (isNaN(date.getTime())) {
      return new Date().getHours()
    }

    const phTimeStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      hour12: false
    }).format(date)

    const h = parseInt(phTimeStr, 10)
    return isNaN(h) ? date.getHours() : h
  } catch {
    try {
      return new Date(timestampStr).getHours()
    } catch {
      return 8
    }
  }
}

/**
 * Returns time-aware greeting based on punch timestamp:
 * - Before 12:00 -> "Good morning"
 * - 12:00–17:59  -> "Good afternoon"
 * - 18:00 onward -> "Good evening"
 */
export function getTimeAwareGreeting(timestampStr: string): string {
  const hour = getHourFromPunch(timestampStr)
  if (hour < 12) {
    return 'Good morning'
  }
  if (hour < 18) {
    return 'Good afternoon'
  }
  return 'Good evening'
}

/**
 * Sanitizes and formats employee name for natural speech synthesis.
 * Converts "Lastname, Firstname" -> "Firstname Lastname".
 * Strips HTML, control characters, and ignores placeholders like "Unknown Employee".
 */
export function formatSpokenName(name?: string): string {
  if (!name || typeof name !== 'string') return ''

  // Strip HTML and script tags
  const clean = name.replace(/<[^>]*>/g, '').trim()
  if (!clean) return ''

  // Ignore default generic placeholders
  if (
    /^unknown(\s+employee)?$/i.test(clean) ||
    /^biometric\s+user$/i.test(clean) ||
    /^user\d+$/i.test(clean) ||
    /^user_\d+$/i.test(clean)
  ) {
    return ''
  }

  // Handle "Lastname, Firstname" format common in HR rosters
  if (clean.includes(',')) {
    const parts = clean.split(',').map(s => s.trim())
    if (parts.length >= 2 && parts[1]) {
      return `${parts[1]} ${parts[0]}`.replace(/[^\w\s.,'-]/gi, ' ').replace(/\s+/g, ' ').trim()
    }
  }

  return clean.replace(/[^\w\s.,'-]/gi, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Builds the announcement text for a given punch event.
 */
export function buildPunchAnnouncement(event: PunchDisplayEvent): string {
  const spokenName = formatSpokenName(event.employeeName)
  const isOut = event.direction === 'OUT' || event.direction === 'BREAK_OUT'

  if (isOut) {
    return spokenName ? `Goodbye, ${spokenName}. Take care.` : 'Goodbye. Take care.'
  }

  // Arrival / IN
  const greeting = getTimeAwareGreeting(event.timestamp)

  if (event.isLate) {
    return spokenName ? `${greeting}, ${spokenName}. You are late.` : `${greeting}. You are late.`
  }

  return spokenName ? `${greeting}, ${spokenName}.` : `${greeting}.`
}

/**
 * Builds a unique identifier for an event to prevent duplicate announcements.
 */
export function getPunchEventKey(event: PunchDisplayEvent): string {
  if (event.eventId) return event.eventId
  if (event.id) return event.id
  const bio = event.bioId || event.userId || 'unknown'
  const dir = event.direction || 'IN'
  const time = event.timestamp || '0'
  return `${bio}_${dir}_${time}`
}

export const punchVoiceService = {
  /**
   * Returns list of available SpeechSynthesis voices without hammering the browser.
   */
  getVoices(): SpeechSynthesisVoice[] {
    if (!voicesInitialized || cachedVoices.length === 0) {
      loadVoices()
    }
    return cachedVoices
  },

  /**
   * Checks if speech synthesis is supported in current environment.
   */
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
  },

  /**
   * Cancels any pending or current speech synthesis.
   */
  cancelSpeech(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel()
      } catch {
        // Safe fail
      }
    }
  },

  /**
   * Clears the duplicate-announcement event key cache.
   */
  clearEventCache(): void {
    recentAnnouncedKeys.clear()
    recentKeyQueue.length = 0
  },

  /**
   * Announces a biometric punch event if voice is enabled in settings.
   * Completely non-blocking and safe from exceptions.
   */
  announcePunch(event: PunchDisplayEvent, settings: PunchDisplaySettings): boolean {
    const isVoiceEnabled = Boolean(settings.punchDisplayVoiceEnabled ?? settings.voiceEnabled)
    if (!isVoiceEnabled || !this.isSupported()) {
      return false
    }

    // 1. Duplicate guard: Prevent announcing the exact same punch twice
    const eventKey = getPunchEventKey(event)
    if (recentAnnouncedKeys.has(eventKey)) {
      return false
    }

    // Record key in bounded FIFO queue
    recentAnnouncedKeys.add(eventKey)
    recentKeyQueue.push(eventKey)
    if (recentKeyQueue.length > MAX_RECENT_KEYS) {
      const oldest = recentKeyQueue.shift()
      if (oldest) recentAnnouncedKeys.delete(oldest)
    }

    // 2. Build announcement message
    const message = buildPunchAnnouncement(event)
    if (!message) return false

    // 3. Speak the announcement
    this.speak(message, {
      volume: settings.punchDisplayVoiceVolume ?? settings.voiceVolume ?? 0.8,
      rate: settings.punchDisplayVoiceRate ?? settings.voiceRate ?? 1.0,
      pitch: settings.punchDisplayVoicePitch ?? settings.voicePitch ?? 1.0,
      voiceURI: settings.punchDisplayVoiceURI ?? settings.voiceURI ?? ''
    })

    return true
  },

  /**
   * Low-level speech invocation with cancellation of stale speech.
   */
  speak(text: string, options: {
    volume?: number
    rate?: number
    pitch?: number
    voiceURI?: string
  } = {}): void {
    if (!this.isSupported() || !text.trim()) {
      return
    }

    try {
      // Cancel previous pending speech to avoid backlog
      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text.trim())

      const vol = options.volume !== undefined ? options.volume : 0.8
      const rate = options.rate !== undefined ? options.rate : 1.0
      const pitch = options.pitch !== undefined ? options.pitch : 1.0

      utterance.volume = Math.max(0, Math.min(1, vol))
      utterance.rate = Math.max(0.5, Math.min(2, rate))
      utterance.pitch = Math.max(0.5, Math.min(1.5, pitch))

      // Match voice by URI if specified
      const targetURI = options.voiceURI?.trim()
      if (targetURI) {
        const voices = this.getVoices()
        const matchedVoice = voices.find(v => v.voiceURI === targetURI)
        if (matchedVoice) {
          utterance.voice = matchedVoice
        }
      }

      utterance.onerror = () => {
        // Graceful error ignore: standard behavior when cancelled
      }

      window.speechSynthesis.speak(utterance)
    } catch {
      // Never throw or interrupt the punch display
    }
  },

  /**
   * Test Voice button handler for Settings page.
   * Also helps user establish browser audio interaction permission.
   */
  testVoice(options: {
    volume?: number
    rate?: number
    pitch?: number
    voiceURI?: string
  } = {}): void {
    const sample = 'Good morning, Marc Louie Cabigas. Voice announcements are active.'
    this.speak(sample, options)
  }
}
