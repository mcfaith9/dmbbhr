import { ref } from 'vue'
import { db, type HrNoticeRecord } from '@/db'
import { normalizeBioId } from '@/services/punchDisplay'
import { announcementService } from '@/services/announcements'

export interface HrNotice {
  id: string
  bioId: string // Unique biometric user ID (normalized digits-only)
  employeeName: string
  department?: string
  photoUrl?: string
  message: string
  expiresAt?: string | null // ISO string or null
  enabled: boolean
  createdAt: string
  updatedAt: string
  createdBy?: string
}

const STORAGE_KEY = 'dmbbhr_employee_punch_notices'
const BROADCAST_CHANNEL_NAME = 'dmbbhr-punch-display'

export function isNoticeActive(notice: HrNotice): boolean {
  if (!notice.enabled) return false
  if (notice.expiresAt) {
    const expireTime = new Date(notice.expiresAt).getTime()
    if (!isNaN(expireTime) && expireTime <= Date.now()) {
      return false
    }
  }
  return true
}

export function toPlainHrNotice(raw: any): HrNotice | null {
  if (!raw || typeof raw !== 'object') return null
  if ('stopPropagation' in raw || 'preventDefault' in raw || 'target' in raw) {
    return null
  }

  const cleanBioId = normalizeBioId(raw.bioId || raw.biometric_user_id || raw.employee_id || '')
  if (!cleanBioId) return null

  return {
    id: String(raw.id || `hrn-${Date.now()}-${Math.floor(Math.random() * 1000)}`),
    bioId: cleanBioId,
    employeeName: String(raw.employeeName || raw.full_name || 'Employee').trim(),
    department: raw.department ? String(raw.department).trim() : undefined,
    photoUrl: raw.photoUrl ? String(raw.photoUrl).trim() : undefined,
    message: String(raw.message || '').trim(),
    expiresAt: raw.expiresAt ? String(raw.expiresAt).trim() : null,
    enabled: Boolean(raw.enabled !== false),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    createdBy: raw.createdBy ? String(raw.createdBy).trim() : undefined
  }
}

class HrNoticeService {
  private channel: BroadcastChannel | null = null
  public notices = ref<HrNotice[]>(this.loadFromStorage())
  private isInitialized = false

  constructor() {
    this.initChannel()
    this.initStorageListener()
    this.initDatabase()
  }

  private loadFromStorage(): HrNotice[] {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          return parsed
            .map(toPlainHrNotice)
            .filter((n): n is HrNotice => n !== null)
        }
      }
    } catch {
      // ignore
    }
    return []
  }

  private async initDatabase() {
    if (typeof window === 'undefined') return
    try {
      const count = await db.hrNotices.count()
      if (count > 0) {
        const dbRecords = await db.hrNotices.toArray()
        const converted = dbRecords
          .map(r => toPlainHrNotice(r))
          .filter((n): n is HrNotice => n !== null)

        // Merge DB records with localStorage
        const map = new Map<string, HrNotice>()
        for (const item of this.notices.value) {
          map.set(item.id, item)
        }
        for (const item of converted) {
          if (!map.has(item.id)) {
            map.set(item.id, item)
          } else {
            // Pick newest updated
            const existing = map.get(item.id)!
            if (new Date(item.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
              map.set(item.id, item)
            }
          }
        }
        const merged = Array.from(map.values())
        this.notices.value = merged
        this.persistStorage(merged, false)
      } else if (this.notices.value.length > 0) {
        // Seed database from localStorage
        await db.hrNotices.bulkPut(this.notices.value as HrNoticeRecord[])
      }
    } catch (err) {
      console.warn('[HrNoticeService] IndexedDB init error:', err)
    } finally {
      this.isInitialized = true
    }
  }

  private initChannel() {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return
    try {
      this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
      this.channel.onmessage = (event) => {
        if (!event.data) return

        if (event.data.type === 'HR_NOTICES_UPDATED' && Array.isArray(event.data.payload)) {
          const list = event.data.payload
            .map(toPlainHrNotice)
            .filter((n: any): n is HrNotice => n !== null)
          this.notices.value = list
          this.persistStorage(list, false)
        }
      }
    } catch (err) {
      console.warn('[HrNoticeService] BroadcastChannel init error:', err)
    }
  }

  private initStorageListener() {
    if (typeof window === 'undefined') return
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue)
          if (Array.isArray(parsed)) {
            this.notices.value = parsed
              .map(toPlainHrNotice)
              .filter((n): n is HrNotice => n !== null)
          }
        } catch {
          // ignore
        }
      }
    })
  }

  private persistStorage(list: HrNotice[], broadcast: boolean = true) {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
      } catch {
        // ignore
      }
    }

    if (broadcast && this.channel) {
      try {
        this.channel.postMessage({
          type: 'HR_NOTICES_UPDATED',
          payload: list
        })
      } catch (err) {
        console.warn('[HrNoticeService] Broadcast failed:', err)
      }
    }
  }

  public async getNotices(): Promise<HrNotice[]> {
    if (!this.isInitialized) {
      await this.initDatabase()
    }
    return this.notices.value
  }

  /**
   * Fast synchronous lookup to check whether an active HR notice exists for an employee Bio ID.
   * Compares normalized Bio IDs.
   */
  public getActiveNoticeForBioId(bioId: string): HrNotice | null {
    const cleanBio = normalizeBioId(bioId)
    if (!cleanBio) return null

    // Look through current notices in memory
    const matches = this.notices.value.filter(n => {
      return normalizeBioId(n.bioId) === cleanBio && isNoticeActive(n)
    })

    if (matches.length === 0) return null

    // Return the newest active notice
    matches.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return matches[0]
  }

  public async saveNotice(input: {
    id?: string
    bioId: string
    employeeName: string
    department?: string
    photoUrl?: string
    message: string
    expiresAt?: string | null
    enabled?: boolean
    createdBy?: string
  }): Promise<HrNotice> {
    const cleanBioId = normalizeBioId(input.bioId)
    if (!cleanBioId) {
      throw new Error('Employee Bio ID is required')
    }
    if (!input.message || !input.message.trim()) {
      throw new Error('Notice message cannot be empty')
    }

    const now = new Date().toISOString()
    const current = [...this.notices.value]
    const existingIndex = input.id ? current.findIndex(n => n.id === input.id) : -1

    const noticeItem: HrNotice = {
      id: input.id || `hrn-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      bioId: cleanBioId,
      employeeName: input.employeeName.trim() || `User ${cleanBioId}`,
      department: input.department?.trim() || undefined,
      photoUrl: input.photoUrl?.trim() || `/employee-photos/${cleanBioId}.jpg`,
      message: input.message.trim(),
      expiresAt: input.expiresAt ? input.expiresAt.trim() : null,
      enabled: input.enabled !== undefined ? Boolean(input.enabled) : true,
      createdAt: existingIndex !== -1 ? current[existingIndex].createdAt : now,
      updatedAt: now,
      createdBy: input.createdBy || 'HR'
    }

    if (existingIndex !== -1) {
      current[existingIndex] = noticeItem
    } else {
      current.unshift(noticeItem)
    }

    this.notices.value = current
    this.persistStorage(current, true)

    try {
      await db.hrNotices.put(noticeItem as HrNoticeRecord)
    } catch (e) {
      console.warn('[HrNoticeService] Failed to persist to IndexedDB:', e)
    }

    return noticeItem
  }

  public async toggleNotice(id: string, enabled?: boolean): Promise<boolean> {
    const current = [...this.notices.value]
    const index = current.findIndex(n => n.id === id)
    if (index === -1) return false

    const nextEnabled = enabled !== undefined ? enabled : !current[index].enabled
    const updated: HrNotice = {
      ...current[index],
      enabled: nextEnabled,
      updatedAt: new Date().toISOString()
    }

    current[index] = updated
    this.notices.value = current
    this.persistStorage(current, true)

    try {
      await db.hrNotices.put(updated as HrNoticeRecord)
    } catch {
      // ignore
    }
    return true
  }

  public async deleteNotice(id: string): Promise<boolean> {
    const current = this.notices.value.filter(n => n.id !== id)
    if (current.length === this.notices.value.length) return false

    this.notices.value = current
    this.persistStorage(current, true)

    try {
      await db.hrNotices.delete(id)
    } catch {
      // ignore
    }
    return true
  }

  /**
   * Triggers a preview of the HR notice in the Punch Display window via BroadcastChannel
   */
  public triggerNoticePreview(notice: HrNotice) {
    const item = {
      id: `preview-${notice.id}`,
      type: 'hr_notice' as const,
      title: 'HR NOTICE',
      message: notice.message,
      employeeName: notice.employeeName,
      bioId: notice.bioId,
      department: notice.department,
      photoUrl: notice.photoUrl || `/employee-photos/${notice.bioId}.jpg`,
      enabled: true
    }

    announcementService.triggerPreview(item)
  }
}

export const hrNoticeService = new HrNoticeService()
