import { ref } from 'vue'

export type AnnouncementType = 'announcement' | 'reminder' | 'birthday'

export interface AnnouncementItem {
  id: string
  type: AnnouncementType
  title: string
  message: string
  enabled: boolean
  employeeName?: string
  bioId?: string
  photoUrl?: string
  department?: string
}

const STORAGE_KEY = 'dmbbhr_kiosk_announcements'
const BROADCAST_CHANNEL_NAME = 'dmbbhr-punch-display'

export const DEFAULT_ANNOUNCEMENTS: AnnouncementItem[] = [
  {
    id: 'ann-1',
    type: 'announcement',
    title: 'COMPANY MEETING TODAY',
    message: 'Please proceed to the conference room at 3:00 PM.',
    enabled: true
  },
  {
    id: 'rem-1',
    type: 'reminder',
    title: 'DAILY REMINDER',
    message: 'Please remember to log your attendance and submit daily accomplishment reports.',
    enabled: true
  },
  {
    id: 'bday-1',
    type: 'birthday',
    title: 'HAPPY BIRTHDAY!',
    employeeName: 'Juan Dela Cruz',
    bioId: '25065',
    message: 'Wishing you a wonderful birthday and continued success with the DMBB family!',
    enabled: true
  }
]

/**
 * Strips Vue reactive proxies, functions, DOM events, and non-cloneable objects
 * to guarantee 100% safe BroadcastChannel serialization.
 */
export function toPlainAnnouncement(raw: any): AnnouncementItem | null {
  if (!raw || typeof raw !== 'object') return null
  // Exclude DOM events (PointerEvent, MouseEvent, etc.) that can be passed by Vue click handlers
  if ('stopPropagation' in raw || 'preventDefault' in raw || 'target' in raw) {
    return null
  }

  const rawType = String(raw.type || 'announcement').toLowerCase().trim()
  const cleanType: AnnouncementType =
    rawType === 'reminder' ? 'reminder' : (rawType === 'birthday' ? 'birthday' : 'announcement')

  return {
    id: String(raw.id || `ann-${Date.now()}-${Math.floor(Math.random() * 1000)}`),
    type: cleanType,
    title: String(raw.title || '').trim(),
    message: String(raw.message || '').trim().slice(0, 250),
    enabled: Boolean(raw.enabled !== false),
    employeeName: raw.employeeName ? String(raw.employeeName).trim() : undefined,
    bioId: raw.bioId ? String(raw.bioId).trim() : undefined,
    photoUrl: raw.photoUrl ? String(raw.photoUrl).trim() : undefined,
    department: raw.department ? String(raw.department).trim() : undefined
  }
}

export function toPlainAnnouncementList(list: any[]): AnnouncementItem[] {
  if (!Array.isArray(list)) return []
  return list
    .map(toPlainAnnouncement)
    .filter((item): item is AnnouncementItem => item !== null)
}

class AnnouncementService {
  private channel: BroadcastChannel | null = null
  public announcements = ref<AnnouncementItem[]>(this.loadAnnouncements())
  private previewListeners = new Set<(item: AnnouncementItem | null) => void>()

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
        this.channel.onmessage = (event) => {
          if (!event.data) return

          if (event.data.type === 'ANNOUNCEMENT_PREVIEW' || event.data.type === 'ANNOUNCEMENT_SHOW') {
            const raw = event.data.announcement || event.data.payload
            const plain = toPlainAnnouncement(raw)
            this.notifyPreviewListeners(plain)
          } else if (event.data.type === 'ANNOUNCEMENTS_UPDATED' && Array.isArray(event.data.payload)) {
            const list = toPlainAnnouncementList(event.data.payload)
            this.announcements.value = list
          }
        }
      } catch (err) {
        console.warn('[AnnouncementService] BroadcastChannel init error:', err)
      }
    }
  }

  public loadAnnouncements(): AnnouncementItem[] {
    if (typeof window === 'undefined') return [...DEFAULT_ANNOUNCEMENTS]
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return toPlainAnnouncementList(parsed)
        }
      }
    } catch {
      // ignore
    }
    return [...DEFAULT_ANNOUNCEMENTS]
  }

  public saveAnnouncements(items: AnnouncementItem[]) {
    const plainList = toPlainAnnouncementList(items)
    this.announcements.value = plainList
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(plainList))
      } catch {
        // ignore
      }
    }
    this.broadcast({
      type: 'ANNOUNCEMENTS_UPDATED',
      payload: plainList
    })
  }

  public addAnnouncement(item: Omit<AnnouncementItem, 'id'>): AnnouncementItem {
    const plain = toPlainAnnouncement({
      ...item,
      id: `ann-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    })!
    const updated = [plain, ...this.announcements.value]
    this.saveAnnouncements(updated)
    return plain
  }

  public updateAnnouncement(id: string, updates: Partial<AnnouncementItem>): boolean {
    const current = this.announcements.value
    const index = current.findIndex(a => a.id === id)
    if (index === -1) return false

    const merged = { ...current[index], ...updates, id }
    const plain = toPlainAnnouncement(merged)
    if (!plain) return false

    const updated = [...current]
    updated[index] = plain
    this.saveAnnouncements(updated)
    return true
  }

  public deleteAnnouncement(id: string): boolean {
    const updated = this.announcements.value.filter(a => a.id !== id)
    if (updated.length === this.announcements.value.length) return false
    this.saveAnnouncements(updated)
    return true
  }

  public toggleAnnouncement(id: string, enabled?: boolean): boolean {
    const current = this.announcements.value
    const index = current.findIndex(a => a.id === id)
    if (index === -1) return false

    const nextEnabled = enabled !== undefined ? enabled : !current[index].enabled
    return this.updateAnnouncement(id, { enabled: nextEnabled })
  }

  public resetToDefaults() {
    this.saveAnnouncements([...DEFAULT_ANNOUNCEMENTS])
  }

  /**
   * Safely broadcasts an announcement preview to all listening Punch Display windows
   * with zero chance of DataCloneError.
   */
  public triggerPreview(item?: any) {
    let plainTarget: AnnouncementItem | null = null

    if (item && typeof item === 'object' && !('target' in item)) {
      plainTarget = toPlainAnnouncement(item)
    }

    if (!plainTarget) {
      // Pick first enabled announcement, or first available item
      const candidate =
        this.announcements.value.find(a => a.enabled) ||
        this.announcements.value[0] ||
        DEFAULT_ANNOUNCEMENTS[0]
      plainTarget = toPlainAnnouncement(candidate)
    }

    if (plainTarget) {
      // Notify local listeners (same window)
      this.notifyPreviewListeners(plainTarget)

      // Broadcast clone-safe plain data across BroadcastChannel
      this.broadcast({
        type: 'ANNOUNCEMENT_SHOW',
        announcement: plainTarget,
        payload: plainTarget
      })
    }
  }

  public onPreview(callback: (item: AnnouncementItem | null) => void): () => void {
    this.previewListeners.add(callback)
    return () => {
      this.previewListeners.delete(callback)
    }
  }

  private notifyPreviewListeners(item: AnnouncementItem | null) {
    for (const listener of this.previewListeners) {
      try {
        listener(item)
      } catch (err) {
        console.error('[AnnouncementService] Preview listener error:', err)
      }
    }
  }

  private broadcast(message: { type: string; announcement?: any; payload?: any }) {
    if (!this.channel) return
    try {
      // Guarantee pure structured-clone-safe primitives
      const cloneSafeAnnouncement = message.announcement
        ? toPlainAnnouncement(message.announcement)
        : (message.payload ? toPlainAnnouncement(message.payload) : null)

      const cloneSafePayload = message.type === 'ANNOUNCEMENTS_UPDATED' && Array.isArray(message.payload)
        ? toPlainAnnouncementList(message.payload)
        : cloneSafeAnnouncement

      this.channel.postMessage({
        type: message.type,
        announcement: cloneSafeAnnouncement,
        payload: cloneSafePayload
      })
    } catch (err) {
      console.warn('[AnnouncementService] Broadcast error:', err)
    }
  }
}

export const announcementService = new AnnouncementService()
