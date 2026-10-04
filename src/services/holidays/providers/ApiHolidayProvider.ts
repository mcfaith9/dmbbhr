import type { HolidayProvider } from './HolidayProvider'
import type { HolidayItem, HolidaySettingsConfig } from '../types'

export class ApiHolidayProvider implements HolidayProvider {
  readonly id = 'api'
  readonly name = 'External Holiday API Provider'

  private config: HolidaySettingsConfig

  constructor(config: HolidaySettingsConfig) {
    this.config = config
  }

  updateConfig(config: HolidaySettingsConfig) {
    this.config = config
  }

  async getHolidays(year: number): Promise<HolidayItem[]> {
    const url = (this.config.apiUrl || '').trim()
    if (!url) {
      throw new Error('Holiday API endpoint is not configured. Please enter a valid API URL in Settings.')
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json'
    }

    if (this.config.apiKey && this.config.apiKey.trim()) {
      headers['Authorization'] = `Bearer ${this.config.apiKey.trim()}`
    }

    // Build URL with year parameter
    const fullUrl = url.includes('?')
      ? `${url}&year=${year}&country=PH&city=Cebu`
      : `${url}?year=${year}&country=PH&city=Cebu`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)

    try {
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers,
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error(`Holiday API returned status HTTP ${response.status} (${response.statusText})`)
      }

      const json = await response.json()
      const rawList = Array.isArray(json) ? json : (json.data || json.holidays || [])

      if (!Array.isArray(rawList)) {
        throw new Error('Holiday API response structure invalid: expected array of holidays.')
      }

      // Map API response to canonical HolidayItem format
      return rawList.map((item: any, idx: number): HolidayItem => {
        const dateStr = item.date || item.holiday_date || ''
        return {
          id: item.id ? `api-${item.id}` : `api-h-${year}-${idx}`,
          name: item.name || item.holiday_name || 'Unnamed Holiday',
          date: dateStr,
          year: item.year || (dateStr ? parseInt(dateStr.slice(0, 4), 10) : year),
          type: item.type || (item.is_regular ? 'Regular' : 'Special Non-Working'),
          scope: item.scope || (item.is_local ? 'Cebu City' : 'National'),
          source: 'api',
          payRule: item.pay_rule || (item.type === 'Regular' ? 'Regular Holiday: 200% Worked / 100% Unworked' : 'Special Non-Working: 130% Worked'),
          description: item.description || item.notes || 'Retrieved from External Holiday API',
          legalBasis: item.legal_basis || item.proclamation || 'External API'
        }
      })
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Holiday API connection timed out (6s).')
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }
  }
}
