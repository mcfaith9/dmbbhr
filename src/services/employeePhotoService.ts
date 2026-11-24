import { ref } from 'vue'
import type { Employee } from '@/types'

export const MAX_EMPLOYEE_PHOTO_BYTES = 5 * 1024 * 1024 // 5 MB
export const ALLOWED_PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const
export const ALLOWED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const
export const EMPLOYEE_PHOTO_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'

export interface UploadedEmployeePhotoResult {
  status: 'ok'
  bioId: string
  filename: string
  photoPath: string
  mimeType: string
  size: number
}

// In-memory cache-busting versions per Bio ID so overwritten files (e.g. /employee-photos/25065.jpg)
// refresh immediately in the browser while keeping clean public URLs in IndexedDB.
export const photoCacheVersions = ref<Record<string, number>>({})

export function normalizePhotoBioIdKey(bioId?: string | null): string {
  return String(bioId || '')
    .trim()
    .replace(/^emp[-_]/i, '')
    .trim()
}

export function bumpEmployeePhotoVersion(bioId?: string | null): void {
  const key = normalizePhotoBioIdKey(bioId)
  if (!key) return
  photoCacheVersions.value = {
    ...photoCacheVersions.value,
    [key]: Date.now()
  }
}

export function appendPhotoCacheVersion(photoPath: string, bioId?: string | null): string {
  const key = normalizePhotoBioIdKey(bioId)
  const version = key ? photoCacheVersions.value[key] : undefined
  if (!version || !photoPath || photoPath.startsWith('data:') || photoPath.startsWith('blob:')) {
    return photoPath
  }
  const sep = photoPath.includes('?') ? '&' : '?'
  return `${photoPath}${sep}v=${version}`
}

export function validateEmployeePhotoFile(file: File): string | null {
  if (!file) {
    return 'Please select an image file.'
  }
  if (file.size <= 0) {
    return 'The selected image file is empty.'
  }
  if (file.size > MAX_EMPLOYEE_PHOTO_BYTES) {
    return 'Image file exceeds the 5 MB maximum size limit.'
  }

  const ext = (file.name.split('.').pop() || '').toLowerCase()
  const mime = (file.type || '').toLowerCase()
  const extAllowed = ALLOWED_PHOTO_EXTENSIONS.includes(ext as any)
  const mimeAllowed = mime ? ALLOWED_PHOTO_MIME_TYPES.includes(mime as any) : false

  if (!extAllowed && !mimeAllowed) {
    return 'Unsupported file type. Please choose a JPG, JPEG, PNG, or WebP image.'
  }
  if (mime && !mimeAllowed) {
    return 'Unsupported file type. Please choose a JPG, JPEG, PNG, or WebP image.'
  }
  if (ext && !extAllowed) {
    return 'Unsupported file extension. Allowed formats: JPG, JPEG, PNG, WebP.'
  }

  return null
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to read selected image file.'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read selected image file.'))
    reader.readAsDataURL(file)
  })
}

function getBiometricAgentPhotoEndpoint(): string | null {
  if (import.meta.env.VITE_AGENT_WS_URL) {
    try {
      const u = new URL(import.meta.env.VITE_AGENT_WS_URL)
      return `http://${u.hostname}:${u.port || '5174'}/api/employee-photos`
    } catch {
      // ignore invalid URL
    }
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname || 'localhost'
    if (
      window.location.protocol === 'https:' ||
      (host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.local'))
    ) {
      return null
    }
    return `http://${host}:5174/api/employee-photos`
  }
  return 'http://localhost:5174/api/employee-photos'
}

/**
 * Uploads an employee photo to the Node.js biometric agent (with same-origin Vite Node.js fallback),
 * saving it into `public/employee-photos/<sanitizedBioId>.<ext>`.
 */
export async function uploadEmployeePhoto(bioId: string, file: File): Promise<UploadedEmployeePhotoResult> {
  const validationError = validateEmployeePhotoFile(file)
  if (validationError) {
    throw new Error(validationError)
  }

  const cleanBioId = normalizePhotoBioIdKey(bioId)
  if (!cleanBioId) {
    throw new Error('Employee Bio ID is required before uploading a photo.')
  }

  const dataBase64 = await readFileAsDataUrl(file)
  const payload = JSON.stringify({
    bioId: cleanBioId,
    fileName: file.name,
    mimeType: file.type,
    dataBase64
  })

  const agentEndpoint = getBiometricAgentPhotoEndpoint()
  const candidateEndpoints = agentEndpoint
    ? [agentEndpoint, '/api/employee-photos']
    : ['/api/employee-photos']

  let lastErrorMessage = 'Unable to upload employee photo.'

  for (let i = 0; i < candidateEndpoints.length; i++) {
    const endpoint = candidateEndpoints[i]
    const isLast = i === candidateEndpoints.length - 1
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      })

      let body: any = null
      try {
        body = await res.json()
      } catch {
        body = null
      }

      if (res.ok && body?.photoPath) {
        bumpEmployeePhotoVersion(cleanBioId)
        return body as UploadedEmployeePhotoResult
      }

      const serverMsg = body?.message || `Photo upload failed (HTTP ${res.status}).`
      // Surface validation errors immediately instead of retrying another endpoint
      if (res.status >= 400 && res.status < 500 && res.status !== 404) {
        throw new Error(serverMsg)
      }

      lastErrorMessage = serverMsg
      if (isLast) {
        throw new Error(lastErrorMessage)
      }
    } catch (err: any) {
      // Re-throw validation errors immediately
      if (err?.message && !isLast && err.name !== 'TypeError' && !/fetch|network|refused/i.test(err.message)) {
        throw err
      }
      lastErrorMessage = err?.message || lastErrorMessage
      if (isLast) {
        throw new Error(lastErrorMessage)
      }
    }
  }

  throw new Error(lastErrorMessage)
}

/**
 * Builds an ordered list of candidate public photo URLs for an employee.
 */
export function buildEmployeePhotoCandidates(emp?: Employee | null): string[] {
  if (!emp) return []
  const bioId = normalizePhotoBioIdKey(emp.biometric_user_id || emp.employee_number)
  if (!bioId) return []

  const candidates: string[] = []
  const addUnique = (url?: string | null) => {
    const clean = String(url || '').trim()
    if (!clean || candidates.includes(clean)) return
    candidates.push(clean)
  }

  if (emp.photo && typeof emp.photo === 'string' && emp.photo.trim()) {
    addUnique(emp.photo.trim())
  }
  addUnique(`/employee-photos/${bioId}.jpg`)
  addUnique(`/employee-photos/${bioId}.png`)
  addUnique(`/employee-photos/${bioId}.webp`)
  addUnique(`/employee-photos/${bioId}.jpeg`)

  return candidates
}
