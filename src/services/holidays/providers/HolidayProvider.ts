import type { HolidayItem } from '../types'

export interface HolidayProvider {
  readonly name: string
  readonly id: string
  getHolidays(year: number): Promise<HolidayItem[]>
}
