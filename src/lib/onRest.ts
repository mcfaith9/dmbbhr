import type { OnRestPeriod } from '@/types'

/**
 * Normalizes a date value into a strict YYYY-MM-DD calendar string without timezone shift.
 */
export function normalizeOnRestDate(val?: string | null): string | undefined {
  if (!val) return undefined
  const trimmed = String(val).trim()
  if (!trimmed) return undefined

  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoMatch) {
    const dStr = isoMatch[1]
    const [y, m, d] = dStr.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d) {
      return dStr
    }
    return undefined
  }

  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (slashMatch) {
    const first = Number(slashMatch[1])
    const second = Number(slashMatch[2])
    const year = Number(slashMatch[3])
    const month = first <= 12 ? first : second
    const day = first <= 12 ? second : first
    const dt = new Date(Date.UTC(year, month - 1, day))
    if (dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  return undefined
}

export function extractEmployeeOnRestPeriods(
  source?: {
    on_rest_periods?: OnRestPeriod[] | null
    onRestPeriods?: OnRestPeriod[] | null
  } | OnRestPeriod[] | null
): OnRestPeriod[] {
  if (!source) return []
  const raw = Array.isArray(source)
    ? source
    : (source.on_rest_periods ?? source.onRestPeriods ?? [])
  return normalizeOnRestPeriods(raw)
}

/**
 * Sanitizes and deduplicates an OnRestPeriod list into plain, Dexie/structured-clone-safe objects.
 * Sorted descending by startDate (most recent first).
 */
export function normalizeOnRestPeriods(raw: unknown): OnRestPeriod[] {
  if (!Array.isArray(raw)) return []
  const nowIso = new Date().toISOString()
  const byKey = new Map<string, OnRestPeriod>()

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, any>
    const startDate = normalizeOnRestDate(rec.startDate ?? rec.start_date)
    if (!startDate) continue

    let endDate = normalizeOnRestDate(rec.endDate ?? rec.end_date)
    if (endDate && endDate < startDate) {
      endDate = startDate
    }

    const remarksRaw = typeof rec.remarks === 'string' ? rec.remarks.trim() : ''
    const remarks = remarksRaw ? remarksRaw : undefined
    const idRaw = typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : ''
    const fallbackId = `rest_${startDate}_${endDate || 'ongoing'}`
    const id = idRaw || fallbackId
    const createdAt = typeof rec.createdAt === 'string' && rec.createdAt ? rec.createdAt : nowIso
    const updatedAt = typeof rec.updatedAt === 'string' && rec.updatedAt ? rec.updatedAt : createdAt

    const normalized: OnRestPeriod = {
      id,
      startDate,
      ...(endDate ? { endDate } : {}),
      ...(remarks ? { remarks } : {}),
      createdAt,
      updatedAt
    }

    const dedupeKey = idRaw || `${startDate}|${endDate || ''}|${remarks || ''}`
    const existing = byKey.get(dedupeKey)
    if (!existing || normalized.updatedAt >= existing.updatedAt) {
      byKey.set(dedupeKey, normalized)
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const startDiff = b.startDate.localeCompare(a.startDate)
    if (startDiff !== 0) return startDiff
    return (b.updatedAt || '').localeCompare(a.updatedAt || '')
  })
}

export function mergeOnRestPeriods(...lists: Array<OnRestPeriod[] | undefined | null>): OnRestPeriod[] {
  const combined: OnRestPeriod[] = []
  for (const list of lists) {
    if (Array.isArray(list)) {
      combined.push(...list)
    }
  }
  return normalizeOnRestPeriods(combined)
}

/**
 * Returns the active/matching OnRestPeriod covering the given YYYY-MM-DD date, if any.
 */
export function getActiveOnRestPeriodForDate(
  employeeOrPeriods:
    | {
        on_rest_periods?: OnRestPeriod[] | null
        onRestPeriods?: OnRestPeriod[] | null
      }
    | OnRestPeriod[]
    | undefined
    | null,
  dateStr: string
): OnRestPeriod | undefined {
  const normDate = normalizeOnRestDate(dateStr)
  if (!normDate) return undefined
  const periods = extractEmployeeOnRestPeriods(employeeOrPeriods)
  if (periods.length === 0) return undefined

  return periods.find(p => p.startDate <= normDate && (!p.endDate || normDate <= p.endDate))
}

export function isEmployeeOnRestOnDate(
  employeeOrPeriods:
    | {
        on_rest_periods?: OnRestPeriod[] | null
        onRestPeriods?: OnRestPeriod[] | null
      }
    | OnRestPeriod[]
    | undefined
    | null,
  dateStr: string
): boolean {
  return Boolean(getActiveOnRestPeriodForDate(employeeOrPeriods, dateStr))
}

export function formatOnRestPeriodLabel(period: OnRestPeriod): string {
  const formatShort = (dStr: string): string => {
    const [y, m, d] = dStr.split('-').map(Number)
    if (!y || !m || !d) return dStr
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }
  const startLabel = formatShort(period.startDate)
  const endLabel = period.endDate ? formatShort(period.endDate) : 'Ongoing'
  return `${startLabel} – ${endLabel}`
}

export function getOnRestPeriodsSignature(periods?: OnRestPeriod[] | null): string {
  return normalizeOnRestPeriods(periods)
    .map(p => `${p.id}|${p.startDate}|${p.endDate || ''}|${p.remarks || ''}`)
    .sort()
    .join(';')
}

/**
 * Enumerates YYYY-MM-DD dates covered by an OnRestPeriod up to a maximum cap (default 400 days)
 * for cache invalidation and historical attendance lookup.
 */
export function enumerateOnRestDates(period: OnRestPeriod, maxEndDate?: string): string[] {
  const start = normalizeOnRestDate(period.startDate)
  if (!start) return []
  const endCandidate = period.endDate ? normalizeOnRestDate(period.endDate) : normalizeOnRestDate(maxEndDate)
  const effectiveEnd = endCandidate && (!maxEndDate || endCandidate <= maxEndDate) ? endCandidate : (maxEndDate || start)
  if (!effectiveEnd || effectiveEnd < start) return [start]

  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = effectiveEnd.split('-').map(Number)
  const cur = new Date(Date.UTC(sy, sm - 1, sd))
  const endDt = new Date(Date.UTC(ey, em - 1, ed))
  const out: string[] = []
  for (let guard = 0; cur <= endDt && guard < 400; guard++) {
    out.push(
      `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}-${String(cur.getUTCDate()).padStart(2, '0')}`
    )
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}
