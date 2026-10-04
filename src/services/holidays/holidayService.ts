import { ref } from 'vue'
import type { HolidayItem, HolidaySettingsConfig, HolidayType, HolidayScope } from './types'
import { LocalHolidayProvider } from './providers/LocalHolidayProvider'
import { ApiHolidayProvider } from './providers/ApiHolidayProvider'

const HOLIDAY_CONFIG_STORAGE_KEY = 'dmbbhr_holiday_config'
const CUSTOM_HOLIDAYS_STORAGE_KEY = 'dmbbhr_custom_holidays'

function getInitialConfig(): HolidaySettingsConfig {
  try {
    const raw = localStorage.getItem(HOLIDAY_CONFIG_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        source: parsed.source || 'local',
        apiUrl: parsed.apiUrl || '',
        apiKey: parsed.apiKey || '',
        enableApiSync: Boolean(parsed.enableApiSync),
        fallbackToLocal: parsed.fallbackToLocal !== false,
        lastSyncTime: parsed.lastSyncTime || '',
        lastSyncStatus: parsed.lastSyncStatus || 'idle',
        lastSyncMessage: parsed.lastSyncMessage || ''
      }
    }
  } catch {
    // fallback
  }

  return {
    source: 'local',
    apiUrl: '',
    apiKey: '',
    enableApiSync: false,
    fallbackToLocal: true,
    lastSyncTime: '',
    lastSyncStatus: 'idle',
    lastSyncMessage: ''
  }
}

function loadStoredCustomHolidays(): HolidayItem[] {
  try {
    const raw = localStorage.getItem(CUSTOM_HOLIDAYS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed
      }
    }
  } catch {
    // ignore
  }
  return []
}

function saveStoredCustomHolidays(items: HolidayItem[]): void {
  try {
    localStorage.setItem(CUSTOM_HOLIDAYS_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // ignore
  }
}

class HolidayService {
  private config = ref<HolidaySettingsConfig>(getInitialConfig())
  private localProvider = new LocalHolidayProvider()
  private apiProvider: ApiHolidayProvider

  constructor() {
    this.apiProvider = new ApiHolidayProvider(this.config.value)
  }

  getConfig(): HolidaySettingsConfig {
    return { ...this.config.value }
  }

  saveConfig(newConfig: Partial<HolidaySettingsConfig>): HolidaySettingsConfig {
    this.config.value = {
      ...this.config.value,
      ...newConfig
    }
    this.apiProvider.updateConfig(this.config.value)
    try {
      localStorage.setItem(HOLIDAY_CONFIG_STORAGE_KEY, JSON.stringify(this.config.value))
    } catch {
      // ignore
    }
    return { ...this.config.value }
  }

  /**
   * Retrieves all holidays for the given year according to the configured architecture:
   * 1. Check holiday settings (API enabled vs Local)
   * 2. If API enabled: try API provider
   * 3. If API succeeds: use API holidays; if API fails: fall back to local provider
   * 4. Merge custom/manual holidays for the given year
   * 5. Sort chronologically
   */
  async getHolidays(year: number): Promise<{
    holidays: HolidayItem[]
    activeSource: 'local' | 'api'
    isFallback: boolean
    errorMessage?: string
  }> {
    let baseHolidays: HolidayItem[] = []
    let activeSource: 'local' | 'api' = 'local'
    let isFallback = false
    let errorMessage: string | undefined

    const currentCfg = this.config.value

    if (currentCfg.source === 'api' && currentCfg.enableApiSync) {
      try {
        baseHolidays = await this.apiProvider.getHolidays(year)
        activeSource = 'api'
        this.saveConfig({
          lastSyncTime: new Date().toISOString(),
          lastSyncStatus: 'success',
          lastSyncMessage: `Successfully fetched ${baseHolidays.length} holidays from API for year ${year}`
        })
      } catch (err: any) {
        errorMessage = err.message || 'API request failed'
        if (currentCfg.fallbackToLocal) {
          // Graceful fallback to offline local data
          baseHolidays = await this.localProvider.getHolidays(year)
          activeSource = 'local'
          isFallback = true
          this.saveConfig({
            lastSyncTime: new Date().toISOString(),
            lastSyncStatus: 'failed',
            lastSyncMessage: `API error (${errorMessage}). Fell back to offline local holiday data.`
          })
        } else {
          // If fallback is explicitly disabled
          this.saveConfig({
            lastSyncTime: new Date().toISOString(),
            lastSyncStatus: 'failed',
            lastSyncMessage: errorMessage
          })
          baseHolidays = []
        }
      }
    } else {
      // Use offline local provider
      baseHolidays = await this.localProvider.getHolidays(year)
      activeSource = 'local'
    }

    // Merge custom holidays for this year
    const customHolidays = this.getCustomHolidaysForYear(year)
    const combined = [...baseHolidays]

    // Overwrite or append custom holidays
    for (const ch of customHolidays) {
      const existingIdx = combined.findIndex(h => h.id === ch.id || h.date === ch.date && h.name.toLowerCase() === ch.name.toLowerCase())
      if (existingIdx >= 0) {
        combined[existingIdx] = ch
      } else {
        combined.push(ch)
      }
    }

    // Sort chronologically
    combined.sort((a, b) => a.date.localeCompare(b.date))

    return {
      holidays: combined,
      activeSource,
      isFallback,
      errorMessage
    }
  }

  /**
   * Retrieves custom holidays from storage
   */
  getAllCustomHolidays(): HolidayItem[] {
    return loadStoredCustomHolidays()
  }

  getCustomHolidaysForYear(year: number): HolidayItem[] {
    return this.getAllCustomHolidays().filter(h => h.year === year)
  }

  /**
   * Adds or updates a custom holiday
   */
  async saveCustomHoliday(holiday: {
    id?: string
    name: string
    date: string // YYYY-MM-DD
    type: HolidayType
    scope?: HolidayScope
    payRule?: string
    description?: string
    legalBasis?: string
  }): Promise<HolidayItem> {
    const customList = this.getAllCustomHolidays()
    const cleanDate = holiday.date.trim()
    const year = parseInt(cleanDate.slice(0, 4), 10) || new Date().getFullYear()

    let defaultPayRule = 'Special Non-Working: 130% Worked / Unworked No Pay'
    if (holiday.type === 'Regular') {
      defaultPayRule = 'Regular Holiday: 200% Worked / 100% Unworked Pay'
    } else if (holiday.type === 'Special Working') {
      defaultPayRule = 'Special Working: Standard Rate'
    }

    const item: HolidayItem = {
      id: holiday.id || `custom-h-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: holiday.name.trim(),
      date: cleanDate,
      year,
      type: holiday.type,
      scope: holiday.scope || 'Company / Custom',
      source: 'custom',
      payRule: holiday.payRule || defaultPayRule,
      description: holiday.description?.trim() || '',
      legalBasis: holiday.legalBasis?.trim() || 'Internal HR / Custom Schedule',
      updatedAt: new Date().toISOString()
    }

    const existingIndex = customList.findIndex(h => h.id === item.id)
    if (existingIndex >= 0) {
      customList[existingIndex] = item
    } else {
      item.createdAt = new Date().toISOString()
      customList.push(item)
    }

    saveStoredCustomHolidays(customList)
    return item
  }

  /**
   * Deletes a custom holiday
   */
  async deleteCustomHoliday(id: string): Promise<boolean> {
    const customList = this.getAllCustomHolidays()
    const filtered = customList.filter(h => h.id !== id)
    if (filtered.length !== customList.length) {
      saveStoredCustomHolidays(filtered)
      return true
    }
    return false
  }

  /**
   * Performs an immediate connection test to the configured API
   */
  async testApiConnection(): Promise<{ success: boolean; message: string; holidayCount?: number }> {
    const currentCfg = this.config.value
    if (!currentCfg.apiUrl.trim()) {
      return { success: false, message: 'Please provide an API URL before testing.' }
    }

    try {
      const year = new Date().getFullYear()
      const testList = await this.apiProvider.getHolidays(year)
      this.saveConfig({
        lastSyncTime: new Date().toISOString(),
        lastSyncStatus: 'success',
        lastSyncMessage: `Test connection successful: retrieved ${testList.length} holidays.`
      })
      return {
        success: true,
        message: `Successfully connected to Holiday API. ${testList.length} holidays returned.`,
        holidayCount: testList.length
      }
    } catch (err: any) {
      const msg = err.message || 'Connection test failed.'
      this.saveConfig({
        lastSyncTime: new Date().toISOString(),
        lastSyncStatus: 'failed',
        lastSyncMessage: msg
      })
      return { success: false, message: msg }
    }
  }
}

export const holidayService = new HolidayService()
export { HolidayService }
