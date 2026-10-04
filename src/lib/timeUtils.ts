/**
 * Utilities for time normalization, validation, and change detection in attendance adjustments.
 */

/**
 * Normalizes any valid time string into 24-hour "HH:mm" format (e.g. "05:40", "17:00").
 * Handles:
 * - "5:40 AM", "05:40 AM", "5:40:15 AM", "12:00 AM", "12:30 PM", "5:20:42 PM"
 * - "05:40", "5:40", "17:00", "05:40:00", "17:00:15"
 * Returns null if the value is empty, placeholder, or invalid.
 */
export function normalizeTimeToHHMM(val?: string | null): string | null {
  if (!val) return null
  const clean = val.replace(/\s*\(Manual\)/gi, '').trim()
  if (
    !clean ||
    clean === '—' ||
    clean === '-' ||
    clean.toLowerCase().includes('missing') ||
    clean.toLowerCase().includes('awaiting') ||
    clean.toLowerCase().includes('no in') ||
    clean.toLowerCase().includes('no out')
  ) {
    return null
  }

  // 12-hour format: e.g. "5:40 AM", "05:40:15 AM", "12:00 AM", "5:20:42 PM"
  const match12 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i)
  if (match12) {
    let hours = parseInt(match12[1], 10)
    const minutes = parseInt(match12[2], 10)
    const period = match12[3].toUpperCase()

    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
      return null
    }

    if (period === 'AM') {
      if (hours === 12) hours = 0
    } else if (period === 'PM') {
      if (hours !== 12) hours += 12
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  // 24-hour format: e.g. "05:40", "5:40", "17:00", "05:40:15"
  const match24 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (match24) {
    const hours = parseInt(match24[1], 10)
    const minutes = parseInt(match24[2], 10)

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  return null
}

/**
 * Validates whether a time string is strictly valid.
 * Rejects arbitrary text like "asd", "hello", "123abc", "5:40:15 asd", "5:40 asd".
 */
export function isValidTimeString(value?: string | null): boolean {
  if (!value) return false
  return normalizeTimeToHHMM(value) !== null
}

/**
 * Checks whether two time strings represent the exact same time of day.
 * Understands that "5:40 AM", "05:40", and "05:40:00" represent the same time.
 */
export function areTimesEqual(t1?: string | null, t2?: string | null): boolean {
  const n1 = normalizeTimeToHHMM(t1)
  const n2 = normalizeTimeToHHMM(t2)

  // Both missing or empty
  if (!n1 && !n2) return true
  // One is missing and other is present
  if (!n1 || !n2) return false

  return n1 === n2
}

/**
 * Checks if a requested adjustment time represents an actual change from original.
 */
export function hasTimeChanged(originalTime?: string | null, requestedTime?: string | null): boolean {
  const reqNorm = normalizeTimeToHHMM(requestedTime)
  if (!reqNorm) return false

  const origNorm = normalizeTimeToHHMM(originalTime)
  // If original was missing or placeholder, any valid requested time is a change
  if (!origNorm) return true

  return reqNorm !== origNorm
}

/**
 * Converts a 24-hour "HH:mm" string into standard 12-hour display format "hh:mm AM/PM".
 */
export function formatHHMMTo12Hour(hhmm: string): string {
  const norm = normalizeTimeToHHMM(hhmm)
  if (!norm) return hhmm

  const [hStr, mStr] = norm.split(':')
  let hours = parseInt(hStr, 10)
  const minutes = mStr
  const period = hours >= 12 ? 'PM' : 'AM'

  if (hours === 0) {
    hours = 12
  } else if (hours > 12) {
    hours -= 12
  }

  return `${String(hours).padStart(2, '0')}:${minutes} ${period}`
}

/**
 * Formats original time for clean display (removes (Manual) tag, preserves standard representation).
 */
export function formatOriginalTimeDisplay(t?: string | null): string {
  if (!t) return '—'
  const clean = t.replace(/\s*\(Manual\)/gi, '').trim()
  if (!clean || clean === '-' || clean === '—') return '—'
  return clean
}
