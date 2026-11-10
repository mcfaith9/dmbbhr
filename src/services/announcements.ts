import { ref } from 'vue'

export type AnnouncementType = 'announcement' | 'reminder' | 'birthday' | 'hr_notice'

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

export type TickerVerticalPosition = 'top' | 'middle' | 'bottom' | 'custom'
export type TickerHorizontalPosition = 'left' | 'center' | 'right' | 'custom'
export type TickerWidthMode = 'full' | 'boxed' | 'custom'
export type TickerSpeed = 'slow' | 'normal' | 'fast'
export type TickerFontWeight = 'normal' | 'medium' | 'semibold' | 'bold' | 'extrabold'

export interface TickerSettings {
  enabled: boolean
  // Positioning
  positionVertical: TickerVerticalPosition
  positionHorizontal: TickerHorizontalPosition
  offsetY: number
  offsetX: number
  // Dimensions
  widthMode: TickerWidthMode
  customWidth: number
  height: number
  borderRadius: number
  // Styling
  backgroundColor: string
  backgroundOpacity: number
  textColor: string
  accentColor: string
  fontSize: number
  fontWeight: TickerFontWeight
  // Marquee
  speed: TickerSpeed
  pauseOnHover: boolean
  showIcon: boolean
  showBadge: boolean
  badgeText: string
  separator: string
  // Interactive drag / editing mode
  editMode: boolean
}

export const DEFAULT_TICKER_SETTINGS: TickerSettings = {
  enabled: true,
  positionVertical: 'bottom',
  positionHorizontal: 'center',
  offsetY: 0,
  offsetX: 0,
  widthMode: 'full',
  customWidth: 1600,
  height: 48,
  borderRadius: 0,
  backgroundColor: '#09090b',
  backgroundOpacity: 0.94,
  textColor: '#ffffff',
  accentColor: '#3b82f6',
  fontSize: 16,
  fontWeight: 'semibold',
  speed: 'normal',
  pauseOnHover: true,
  showIcon: true,
  showBadge: true,
  badgeText: 'ANNOUNCEMENT',
  separator: '✦',
  editMode: false
}

const STORAGE_KEY = 'dmbbhr_kiosk_announcements'
const TICKER_STORAGE_KEY = 'dmbbhr_kiosk_ticker_settings'
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
    rawType === 'reminder' ? 'reminder' :
    (rawType === 'birthday' ? 'birthday' :
    (rawType === 'hr_notice' ? 'hr_notice' : 'announcement'))

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

export function toPlainTickerSettings(raw: any): TickerSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_TICKER_SETTINGS }
  }

  const vertical = ['top', 'middle', 'bottom', 'custom'].includes(raw.positionVertical)
    ? (raw.positionVertical as TickerVerticalPosition)
    : DEFAULT_TICKER_SETTINGS.positionVertical

  const horizontal = ['left', 'center', 'right', 'custom'].includes(raw.positionHorizontal)
    ? (raw.positionHorizontal as TickerHorizontalPosition)
    : DEFAULT_TICKER_SETTINGS.positionHorizontal

  const widthMode = ['full', 'boxed', 'custom'].includes(raw.widthMode)
    ? (raw.widthMode as TickerWidthMode)
    : DEFAULT_TICKER_SETTINGS.widthMode

  const speed = ['slow', 'normal', 'fast'].includes(raw.speed)
    ? (raw.speed as TickerSpeed)
    : DEFAULT_TICKER_SETTINGS.speed

  const fontWeight = ['normal', 'medium', 'semibold', 'bold', 'extrabold'].includes(raw.fontWeight)
    ? (raw.fontWeight as TickerFontWeight)
    : DEFAULT_TICKER_SETTINGS.fontWeight

  const opacity = typeof raw.backgroundOpacity === 'number' && !isNaN(raw.backgroundOpacity)
    ? Math.max(0.1, Math.min(1, raw.backgroundOpacity))
    : DEFAULT_TICKER_SETTINGS.backgroundOpacity

  const customWidth = typeof raw.customWidth === 'number' && !isNaN(raw.customWidth)
    ? Math.max(200, Math.min(1920, Math.round(raw.customWidth)))
    : DEFAULT_TICKER_SETTINGS.customWidth

  const height = typeof raw.height === 'number' && !isNaN(raw.height)
    ? Math.max(28, Math.min(160, Math.round(raw.height)))
    : DEFAULT_TICKER_SETTINGS.height

  const borderRadius = typeof raw.borderRadius === 'number' && !isNaN(raw.borderRadius)
    ? Math.max(0, Math.min(48, Math.round(raw.borderRadius)))
    : DEFAULT_TICKER_SETTINGS.borderRadius

  const fontSize = typeof raw.fontSize === 'number' && !isNaN(raw.fontSize)
    ? Math.max(10, Math.min(36, Math.round(raw.fontSize)))
    : DEFAULT_TICKER_SETTINGS.fontSize

  const offsetX = typeof raw.offsetX === 'number' && !isNaN(raw.offsetX) ? Math.round(raw.offsetX) : 0
  const offsetY = typeof raw.offsetY === 'number' && !isNaN(raw.offsetY) ? Math.round(raw.offsetY) : 0

  return {
    enabled: raw.enabled !== false,
    positionVertical: vertical,
    positionHorizontal: horizontal,
    offsetY,
    offsetX,
    widthMode,
    customWidth,
    height,
    borderRadius,
    backgroundColor: typeof raw.backgroundColor === 'string' && raw.backgroundColor.trim()
      ? raw.backgroundColor.trim()
      : DEFAULT_TICKER_SETTINGS.backgroundColor,
    backgroundOpacity: opacity,
    textColor: typeof raw.textColor === 'string' && raw.textColor.trim()
      ? raw.textColor.trim()
      : DEFAULT_TICKER_SETTINGS.textColor,
    accentColor: typeof raw.accentColor === 'string' && raw.accentColor.trim()
      ? raw.accentColor.trim()
      : DEFAULT_TICKER_SETTINGS.accentColor,
    fontSize,
    fontWeight,
    speed,
    pauseOnHover: raw.pauseOnHover !== false,
    showIcon: raw.showIcon !== false,
    showBadge: raw.showBadge !== false,
    badgeText: typeof raw.badgeText === 'string' ? raw.badgeText.trim() : DEFAULT_TICKER_SETTINGS.badgeText,
    separator: typeof raw.separator === 'string' && raw.separator.length > 0 ? raw.separator : DEFAULT_TICKER_SETTINGS.separator,
    editMode: Boolean(raw.editMode)
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
  public tickerSettings = ref<TickerSettings>(this.loadTickerSettings())
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
          } else if (event.data.type === 'TICKER_SETTINGS_UPDATED' && event.data.payload) {
            const settings = toPlainTickerSettings(event.data.payload)
            this.tickerSettings.value = settings
          }
        }
      } catch (err) {
        console.warn('[AnnouncementService] BroadcastChannel init error:', err)
      }
    }
  }

  public loadTickerSettings(): TickerSettings {
    if (typeof window === 'undefined') return { ...DEFAULT_TICKER_SETTINGS }
    try {
      const stored = localStorage.getItem(TICKER_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed && typeof parsed === 'object') {
          return toPlainTickerSettings(parsed)
        }
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_TICKER_SETTINGS }
  }

  public saveTickerSettings(updates: Partial<TickerSettings>): TickerSettings {
    const merged = { ...this.tickerSettings.value, ...updates }
    const plain = toPlainTickerSettings(merged)
    this.tickerSettings.value = plain
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(TICKER_STORAGE_KEY, JSON.stringify(plain))
      } catch {
        // ignore
      }
    }
    this.broadcast({
      type: 'TICKER_SETTINGS_UPDATED',
      payload: plain
    })
    return plain
  }

  public resetTickerSettings(): TickerSettings {
    const defaults = { ...DEFAULT_TICKER_SETTINGS }
    return this.saveTickerSettings(defaults)
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
      let cloneSafePayload: any = null
      if (message.type === 'ANNOUNCEMENTS_UPDATED' && Array.isArray(message.payload)) {
        cloneSafePayload = toPlainAnnouncementList(message.payload)
      } else if (message.type === 'TICKER_SETTINGS_UPDATED' && message.payload) {
        cloneSafePayload = toPlainTickerSettings(message.payload)
      } else if (message.announcement) {
        cloneSafePayload = toPlainAnnouncement(message.announcement)
      } else if (message.payload) {
        cloneSafePayload = toPlainAnnouncement(message.payload)
      }

      const cloneSafeAnnouncement = message.announcement
        ? toPlainAnnouncement(message.announcement)
        : null

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
