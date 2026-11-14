import type { BiometricIdEntry, Employee } from '@/types'
import type { EmployeeRecord } from '@/db'

/**
 * Employee identifier matching & Multi-Biometric ID helpers.
 * All linked Bio IDs (primary, secondary, and historical/inactive) belong to one canonical employee profile.
 */

export function normalizeBiometricIdToken(raw: unknown): string {
  if (raw == null) return ''
  const trimmed = String(raw).trim()
  if (!trimmed || trimmed === '-' || trimmed === '—' || trimmed === 'undefined' || trimmed === 'null') {
    return ''
  }
  const stripped = trimmed.replace(/^emp[-_]/i, '').replace(/^user/i, '').trim()
  return stripped || trimmed
}

export function normalizeBiometricIdKey(raw: unknown): string {
  return normalizeBiometricIdToken(raw).toLowerCase()
}

export function ensureBiometricIdsList(
  canonicalBioId: string,
  entries?: BiometricIdEntry[] | null,
  preferredPrimaryBioId?: string,
  fallbackTimestamp?: string
): BiometricIdEntry[] {
  const cleanCanonical = normalizeBiometricIdToken(canonicalBioId) || String(canonicalBioId || '').trim()
  const now = fallbackTimestamp || new Date().toISOString()
  const byKey = new Map<string, BiometricIdEntry>()

  if (Array.isArray(entries)) {
    for (const raw of entries) {
      if (!raw || typeof raw !== 'object') continue
      const bioId = normalizeBiometricIdToken(raw.bioId) || String(raw.bioId || '').trim()
      if (!bioId) continue
      const key = bioId.toLowerCase()
      const existing = byKey.get(key)
      const status = raw.status === 'inactive' ? 'inactive' : 'active'
      const role = raw.role === 'primary' ? 'primary' : 'secondary'
      if (!existing) {
        byKey.set(key, {
          bioId,
          role,
          status,
          addedAt: typeof raw.addedAt === 'string' && raw.addedAt ? raw.addedAt : now,
          deactivatedAt: typeof raw.deactivatedAt === 'string' && raw.deactivatedAt ? raw.deactivatedAt : undefined,
          reactivatedAt: typeof raw.reactivatedAt === 'string' && raw.reactivatedAt ? raw.reactivatedAt : undefined,
          notes: typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : undefined
        })
      }
    }
  }

  // Ensure canonical Bio ID exists if no entries were provided
  if (byKey.size === 0 && cleanCanonical) {
    const primaryId = normalizeBiometricIdToken(preferredPrimaryBioId) || cleanCanonical
    byKey.set(primaryId.toLowerCase(), {
      bioId: primaryId,
      role: 'primary',
      status: 'active',
      addedAt: now
    })
    if (primaryId.toLowerCase() !== cleanCanonical.toLowerCase()) {
      byKey.set(cleanCanonical.toLowerCase(), {
        bioId: cleanCanonical,
        role: 'secondary',
        status: 'active',
        addedAt: now
      })
    }
  } else if (cleanCanonical && !byKey.has(cleanCanonical.toLowerCase())) {
    byKey.set(cleanCanonical.toLowerCase(), {
      bioId: cleanCanonical,
      role: 'secondary',
      status: 'active',
      addedAt: now
    })
  }

  const list = Array.from(byKey.values())

  // Guarantee exactly one active primary entry
  const prefKey = normalizeBiometricIdKey(preferredPrimaryBioId)
  let primaryEntry =
    (prefKey ? list.find(e => e.bioId.toLowerCase() === prefKey && e.status === 'active') : undefined) ||
    list.find(e => e.role === 'primary' && e.status === 'active') ||
    list.find(e => e.status === 'active') ||
    list[0]

  if (primaryEntry) {
    if (primaryEntry.status === 'inactive') {
      primaryEntry.status = 'active'
      primaryEntry.reactivatedAt = primaryEntry.reactivatedAt || now
    }
    for (const entry of list) {
      entry.role = entry.bioId.toLowerCase() === primaryEntry.bioId.toLowerCase() ? 'primary' : 'secondary'
    }
  }

  // Sort: Primary first, then Active secondaries (newest/insertion order preserved), then Inactive
  return list.sort((a, b) => {
    if (a.role === 'primary' && b.role !== 'primary') return -1
    if (b.role === 'primary' && a.role !== 'primary') return 1
    if (a.status === 'active' && b.status !== 'active') return -1
    if (b.status === 'active' && a.status !== 'active') return 1
    return 0
  })
}

export function deriveLinkedBioIds(
  canonicalBioId: string,
  entries?: BiometricIdEntry[] | null,
  preferredPrimaryBioId?: string
): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  const add = (val?: string | null) => {
    if (!val) return
    const trimmed = String(val).trim()
    const normalized = normalizeBiometricIdToken(trimmed)
    for (const candidate of [normalized, trimmed]) {
      if (candidate && !seen.has(candidate.toLowerCase())) {
        seen.add(candidate.toLowerCase())
        result.push(candidate)
      }
    }
  }

  add(preferredPrimaryBioId)
  add(canonicalBioId)
  if (Array.isArray(entries)) {
    for (const e of entries) {
      add(e?.bioId)
    }
  }
  return result
}

export function getEmployeePrimaryBioId(emp: Partial<Employee & EmployeeRecord> | null | undefined): string {
  if (!emp) return ''
  const entries = (emp as any).biometric_ids || (emp as any).biometricIds
  if (Array.isArray(entries) && entries.length > 0) {
    const primary = entries.find((b: BiometricIdEntry) => b.role === 'primary' && b.status === 'active')
      || entries.find((b: BiometricIdEntry) => b.role === 'primary')
      || entries.find((b: BiometricIdEntry) => b.status === 'active')
    if (primary?.bioId) return primary.bioId
  }
  return String(
    (emp as any).primary_bio_id ||
    (emp as any).primaryBioId ||
    emp.biometric_user_id ||
    emp.bioId ||
    emp.employee_number ||
    emp.employeeNumber ||
    ''
  ).trim()
}

export function getEmployeeBiometricEntries(emp: Partial<Employee & EmployeeRecord> | null | undefined): BiometricIdEntry[] {
  if (!emp) return []
  const canonical = String((emp as any).canonical_bio_id || emp.bioId || emp.biometric_user_id || '').trim()
  const rawEntries = (emp as any).biometric_ids || (emp as any).biometricIds
  const prefPrimary = (emp as any).primary_bio_id || (emp as any).primaryBioId
  if (!canonical && (!Array.isArray(rawEntries) || rawEntries.length === 0)) return []
  return ensureBiometricIdsList(canonical || prefPrimary || '', rawEntries, prefPrimary, (emp as any).created_at || (emp as any).createdAt)
}

export function getEmployeeAllBioIds(emp: Partial<Employee & EmployeeRecord> | null | undefined): string[] {
  if (!emp) return []
  const entries = getEmployeeBiometricEntries(emp)
  const canonical = String((emp as any).canonical_bio_id || emp.bioId || emp.biometric_user_id || '').trim()
  const prefPrimary = (emp as any).primary_bio_id || (emp as any).primaryBioId
  const extraLinked = (emp as any).linked_bio_ids || (emp as any).linkedBioIds || []
  const set = new Set<string>(deriveLinkedBioIds(canonical, entries, prefPrimary))
  if (Array.isArray(extraLinked)) {
    for (const id of extraLinked) {
      const tok = normalizeBiometricIdToken(id)
      if (tok) set.add(tok)
    }
  }
  return Array.from(set)
}

export function getEmployeeActiveBioIds(emp: Partial<Employee & EmployeeRecord> | null | undefined): string[] {
  if (!emp) return []
  const entries = getEmployeeBiometricEntries(emp)
  const active = entries.filter(e => e.status === 'active').map(e => e.bioId)
  if (active.length > 0) return active
  const primary = getEmployeePrimaryBioId(emp)
  return primary ? [primary] : []
}

export function collectEmployeeIdKeys(...values: unknown[]): Set<string> {
  const ids = new Set<string>()

  const add = (id: unknown) => {
    if (id == null) return
    if (id instanceof Set || Array.isArray(id)) {
      for (const nested of id) add(nested)
      return
    }
    if (typeof id === 'object') {
      const rec = id as Record<string, unknown>
      add(rec.biometric_user_id)
      add(rec.bioId)
      add(rec.canonical_bio_id)
      add(rec.primary_bio_id)
      add(rec.primaryBioId)
      add(rec.employee_number)
      add(rec.employeeNumber)
      add(rec.id)
      add(rec.linked_bio_ids)
      add(rec.linkedBioIds)
      add(rec.biometric_ids)
      add(rec.biometricIds)
      return
    }

    const s = String(id).trim().toLowerCase()
    if (!s) return
    ids.add(s)
    const unprefixed = s.replace(/^emp[-_]/i, '')
    ids.add(unprefixed)
    const userStripped = unprefixed.replace(/^user/i, '')
    if (userStripped) ids.add(userStripped)
    if (!s.startsWith('emp-')) ids.add(`emp-${s}`)
    const digits = s.match(/\d+/)?.[0]
    if (digits) ids.add(digits)
  }

  for (const value of values) add(value)
  return ids
}

export function recordMatchesEmployee(recordBioId: string | undefined | null, keys: Set<string>): boolean {
  const rBio = String(recordBioId || '').trim().toLowerCase()
  if (!rBio) return false
  const rUnprefixed = rBio.replace(/^emp[-_]/i, '').replace(/^user/i, '')
  const digits = rBio.match(/\d+/)?.[0]
  return keys.has(rBio) || keys.has(rUnprefixed) || (!!digits && keys.has(digits))
}
