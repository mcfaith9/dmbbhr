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
    title: 'ANNOUNCEMENT',
    message: 'Company meeting today at 3:00 PM in the Main Conference Hall.',
    enabled: true
  },
  {
    id: 'rem-1',
    type: 'reminder',
    title: 'REMINDER',
    message: 'Please remember to submit your daily accomplishment and attendance reports.',
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

class AnnouncementService {
  private channel: BroadcastChannel | null = null
  public announcements = ref<AnnouncementItem[]>(this.loadAnnouncements())
  private previewListeners = new Set<(item: AnnouncementItem | null) => void>()

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
        this.channel.onmessage = (event) => {
          if (event.data?.type === 'ANNOUNCEMENT_PREVIEW') {
            this.notifyPreviewListeners(event.data.payload ?? null)
          } else if (event.data?.type === 'ANNOUNCEMENTS_UPDATED' && event.data.payload) {
            this.announcements.value = event.data.payload
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
          return parsed
        }
      }
    } catch {
      // ignore
    }
    return [...DEFAULT_ANNOUNCEMENTS]
  }

  public saveAnnouncements(items: AnnouncementItem[]) {
    this.announcements.value = [...items]
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
      } catch {
        // ignore
      }
    }
    this.broadcast({
      type: 'ANNOUNCEMENTS_UPDATED',
      payload: this.announcements.value
    })
  }

  public triggerPreview(item?: AnnouncementItem | null) {
    const payload = item ?? null
    // Notify local listeners
    this.notifyPreviewListeners(payload)
    // Broadcast to other windows/kiosk displays
    this.broadcast({
      type: 'ANNOUNCEMENT_PREVIEW',
      payload
    })
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

  private broadcast(message: any) {
    if (this.channel) {
      try {
        this.channel.postMessage(message)
      } catch (err) {
        console.warn('[AnnouncementService] Broadcast error:', err)
      }
    }
  }
}

export const announcementService = new AnnouncementService()
