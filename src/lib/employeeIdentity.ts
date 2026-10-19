/**
 * Employee identifier matching used by Manual Time and Overtime lookups.
 * Records may store biometric_user_id, employee_number, or prefixed variants.
 */

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
      add(rec.employee_number)
      add(rec.employeeNumber)
      add(rec.id)
      return
    }

    const s = String(id).trim().toLowerCase()
    if (!s) return
    ids.add(s)
    const unprefixed = s.replace(/^emp[-_]/i, '')
    ids.add(unprefixed)
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
  const rUnprefixed = rBio.replace(/^emp[-_]/i, '')
  const digits = rBio.match(/\d+/)?.[0]
  return keys.has(rBio) || keys.has(rUnprefixed) || (!!digits && keys.has(digits))
}
