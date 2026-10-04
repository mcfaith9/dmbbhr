export type HolidayType =
  | 'Regular'
  | 'Special Non-Working'
  | 'Special Working'
  | 'Local Holiday'

export type HolidayScope =
  | 'National'
  | 'Cebu City'
  | 'Regional'
  | 'Company / Custom'

export type HolidaySource = 'system' | 'api' | 'custom'

export interface HolidayItem {
  id: string
  name: string
  date: string // YYYY-MM-DD
  year: number
  type: HolidayType
  scope: HolidayScope
  source: HolidaySource
  payRule: string // e.g. "200% Worked / 100% Unworked", "130% Worked"
  description?: string
  legalBasis?: string // e.g. "Republic Act 7287", "Proclamation No. 90"
  isMovable?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface HolidaySettingsConfig {
  source: 'local' | 'api'
  apiUrl: string
  apiKey: string
  enableApiSync: boolean
  fallbackToLocal: boolean
  lastSyncTime?: string
  lastSyncStatus?: 'idle' | 'success' | 'failed'
  lastSyncMessage?: string
}
