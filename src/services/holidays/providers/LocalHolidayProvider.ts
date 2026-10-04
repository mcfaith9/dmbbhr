import type { HolidayProvider } from './HolidayProvider'
import type { HolidayItem } from '../types'
import { generateLocalHolidaysForYear } from '../localHolidayData'

export class LocalHolidayProvider implements HolidayProvider {
  readonly id = 'local'
  readonly name = 'Local / Offline Provider (Cebu City & Philippines)'

  async getHolidays(year: number): Promise<HolidayItem[]> {
    // Generates mathematically precise regular, special non-working, and Cebu City holidays
    return generateLocalHolidaysForYear(year)
  }
}
