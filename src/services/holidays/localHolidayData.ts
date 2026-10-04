import type { HolidayItem } from './types'

/**
 * Computes Easter Sunday for any Gregorian year using the Anonymous Gregorian algorithm
 * (Meeus/Jones/Butcher algorithm).
 */
export function getEasterSunday(year: number): { month: number; day: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

/**
 * Helper to format year, month (1-indexed), day to YYYY-MM-DD
 */
function toDateStr(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

/**
 * Finds the last Monday of August for National Heroes Day
 */
function getLastMondayOfAugust(year: number): string {
  for (let day = 31; day >= 25; day--) {
    const d = new Date(Date.UTC(year, 7, day)) // month 7 is August (0-indexed)
    if (d.getUTCDay() === 1) { // 1 = Monday
      return toDateStr(year, 8, day)
    }
  }
  return toDateStr(year, 8, 31)
}

/**
 * Known / calculated dates for Islamic Holidays (National Philippine Observance)
 */
const ISLAMIC_HOLIDAYS_MAP: Record<number, { eidlFitr: string; eidlAdha: string }> = {
  2024: { eidlFitr: '2024-04-10', eidlAdha: '2024-06-17' },
  2025: { eidlFitr: '2025-03-31', eidlAdha: '2025-06-06' },
  2026: { eidlFitr: '2026-03-20', eidlAdha: '2026-05-27' },
  2027: { eidlFitr: '2027-03-10', eidlAdha: '2027-05-16' },
  2028: { eidlFitr: '2028-02-27', eidlAdha: '2028-05-05' },
  2029: { eidlFitr: '2029-02-15', eidlAdha: '2029-04-24' },
  2030: { eidlFitr: '2030-02-04', eidlAdha: '2030-04-14' }
}

/**
 * Known dates for Chinese Lunar New Year
 */
const CHINESE_NEW_YEAR_MAP: Record<number, string> = {
  2024: '2024-02-10',
  2025: '2025-01-29',
  2026: '2026-02-17',
  2027: '2027-02-06',
  2028: '2028-01-26',
  2029: '2029-02-13',
  2030: '2030-02-02'
}

/**
 * Computes all Philippine National & Cebu City Local Holidays for any given year.
 */
export function generateLocalHolidaysForYear(year: number): HolidayItem[] {
  const holidays: HolidayItem[] = []

  // 1. Easter & Holy Week Calculations
  const easter = getEasterSunday(year)
  const easterDate = new Date(Date.UTC(year, easter.month - 1, easter.day))

  const maundyDate = new Date(easterDate.getTime() - 3 * 24 * 60 * 60 * 1000)
  const goodFridayDate = new Date(easterDate.getTime() - 2 * 24 * 60 * 60 * 1000)
  const blackSaturdayDate = new Date(easterDate.getTime() - 1 * 24 * 60 * 60 * 1000)

  const maundyStr = toDateStr(maundyDate.getUTCFullYear(), maundyDate.getUTCMonth() + 1, maundyDate.getUTCDate())
  const goodFridayStr = toDateStr(goodFridayDate.getUTCFullYear(), goodFridayDate.getUTCMonth() + 1, goodFridayDate.getUTCDate())
  const blackSaturdayStr = toDateStr(blackSaturdayDate.getUTCFullYear(), blackSaturdayDate.getUTCMonth() + 1, blackSaturdayDate.getUTCDate())

  // ==========================================
  // CEBU CITY, PHILIPPINES LOCAL HOLIDAYS
  // ==========================================
  holidays.push({
    id: `cebu-charter-${year}`,
    name: 'Cebu City Charter Day',
    date: toDateStr(year, 2, 24),
    year,
    type: 'Local Holiday',
    scope: 'Cebu City',
    source: 'system',
    payRule: 'Special Non-Working: 130% Worked / Unworked No Pay',
    description: 'Annual commemoration of the signing of the Cebu City Charter on February 24, 1937.',
    legalBasis: 'Republic Act No. 7287 / Proclamation for Cebu City'
  })

  // Sinulog Festival (Third Sunday of January)
  let sinulogSunday = 0
  let sundayCount = 0
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(Date.UTC(year, 0, d))
    if (dt.getUTCDay() === 0) { // Sunday
      sundayCount++
      if (sundayCount === 3) {
        sinulogSunday = d
        break
      }
    }
  }
  if (sinulogSunday > 0) {
    holidays.push({
      id: `cebu-sinulog-${year}`,
      name: 'Sinulog Festival / Feast of Santo Niño',
      date: toDateStr(year, 1, sinulogSunday),
      year,
      type: 'Local Holiday',
      scope: 'Cebu City',
      source: 'system',
      payRule: 'Special Observance: Standard / Special Shift Scheduling',
      description: 'Major cultural and religious festival in honor of the Señor Santo Niño in Cebu City.',
      legalBasis: 'Cebu City Executive Order / Local City Proclamation'
    })
  }

  holidays.push({
    id: `cebu-kadaugan-${year}`,
    name: 'Kadaugan sa Mactan (Victory of Mactan)',
    date: toDateStr(year, 4, 27),
    year,
    type: 'Local Holiday',
    scope: 'Regional',
    source: 'system',
    payRule: 'Special Working / Regional Observance',
    description: 'Historic commemoration of the battle between Datu Lapulapu and Ferdinand Magellan.',
    legalBasis: 'Republic Act No. 11040 / Regional Observance'
  })

  holidays.push({
    id: `cebu-osmena-${year}`,
    name: 'Don Sergio Osmeña Sr. Day',
    date: toDateStr(year, 9, 9),
    year,
    type: 'Local Holiday',
    scope: 'Cebu City',
    source: 'system',
    payRule: 'Special Non-Working: 130% Worked / Unworked No Pay',
    description: 'Birth anniversary of Don Sergio Osmeña Sr., the Grand Old Man of Cebu and 4th President of the Philippines.',
    legalBasis: 'Republic Act No. 6953 (Official Non-Working Holiday in Cebu)'
  })

  // ==========================================
  // PHILIPPINE REGULAR HOLIDAYS (200% worked, 100% unworked)
  // ==========================================
  holidays.push({
    id: `ph-new-year-${year}`,
    name: "New Year's Day",
    date: toDateStr(year, 1, 1),
    year,
    type: 'Regular',
    scope: 'National',
    source: 'system',
    payRule: 'Regular Holiday: 200% Worked / 100% Unworked Pay',
    description: 'Nationwide public regular holiday welcoming the calendar year.',
    legalBasis: 'Labor Code of the Philippines / Presidential Proclamation'
  })

  holidays.push({
    id: `ph-maundy-thursday-${year}`,
    name: 'Maundy Thursday',
    date: maundyStr,
    year,
    type: 'Regular',
    scope: 'National',
    source: 'system',
    payRule: 'Regular Holiday: 200% Worked / 100% Unworked Pay',
    description: 'Holy Week commemoration of the Last Supper.',
    isMovable: true,
    legalBasis: 'Labor Code of the Philippines'
  })

  holidays.push({
    id: `ph-good-friday-${year}`,
    name: 'Good Friday',
    date: goodFridayStr,
    year,
    type: 'Regular',
    scope: 'National',
    source: 'system',
    payRule: 'Regular Holiday: 200% Worked / 100% Unworked Pay',
    description: 'Holy Week religious observance of the Passion and Death of Christ.',
    isMovable: true,
    legalBasis: 'Labor Code of the Philippines'
  })

  holidays.push({
    id: `ph-araw-kagitingan-${year}`,
    name: 'Araw ng Kagitingan (Day of Valor)',
    date: toDateStr(year, 4, 9),
    year,
    type: 'Regular',
    scope: 'National',
    source: 'system',
    payRule: 'Regular Holiday: 200% Worked / 100% Unworked Pay',
    description: 'National observance commemorating the Fall of Bataan during WWII.',
    legalBasis: 'Executive Order No. 292 / Proclamation'
  })

  holidays.push({
    id: `ph-labor-day-${year}`,
    name: 'Labor Day',
    date: toDateStr(year, 5, 1),
    year,
    type: 'Regular',
    scope: 'National',
    source: 'system',
    payRule: 'Regular Holiday: 200% Worked / 100% Unworked Pay',
    description: 'Honoring the social and economic achievements of Philippine workers.',
    legalBasis: 'Labor Code of the Philippines'
  })

  holidays.push({
    id: `ph-independence-day-${year}`,
    name: 'Independence Day (Araw ng Kasarinlan)',
    date: toDateStr(year, 6, 12),
    year,
    type: 'Regular',
    scope: 'National',
    source: 'system',
    payRule: 'Regular Holiday: 200% Worked / 100% Unworked Pay',
    description: 'Commemoration of the Philippine Declaration of Independence from Spain in 1898.',
    legalBasis: 'Republic Act No. 4166'
  })

  const natHeroesDate = getLastMondayOfAugust(year)
  holidays.push({
    id: `ph-heroes-day-${year}`,
    name: 'National Heroes Day (Araw ng mga Bayani)',
    date: natHeroesDate,
    year,
    type: 'Regular',
    scope: 'National',
    source: 'system',
    payRule: 'Regular Holiday: 200% Worked / 100% Unworked Pay',
    description: 'Honoring all national heroes who fought for freedom and democracy.',
    isMovable: true,
    legalBasis: 'Republic Act No. 9492 (Last Monday of August)'
  })

  holidays.push({
    id: `ph-bonifacio-day-${year}`,
    name: 'Bonifacio Day',
    date: toDateStr(year, 11, 30),
    year,
    type: 'Regular',
    scope: 'National',
    source: 'system',
    payRule: 'Regular Holiday: 200% Worked / 100% Unworked Pay',
    description: 'Birth anniversary of Gat Andres Bonifacio, supreme leader of Katipunan.',
    legalBasis: 'Republic Act No. 2946'
  })

  holidays.push({
    id: `ph-christmas-day-${year}`,
    name: 'Christmas Day',
    date: toDateStr(year, 12, 25),
    year,
    type: 'Regular',
    scope: 'National',
    source: 'system',
    payRule: 'Regular Holiday: 200% Worked / 100% Unworked Pay',
    description: 'Celebration of the Nativity of Jesus Christ.',
    legalBasis: 'Labor Code of the Philippines'
  })

  holidays.push({
    id: `ph-rizal-day-${year}`,
    name: 'Rizal Day',
    date: toDateStr(year, 12, 30),
    year,
    type: 'Regular',
    scope: 'National',
    source: 'system',
    payRule: 'Regular Holiday: 200% Worked / 100% Unworked Pay',
    description: 'Memorial of the martyrdom of national hero Dr. Jose P. Rizal in Bagumbayan.',
    legalBasis: 'Decree of Gen. Emilio Aguinaldo / RA 229'
  })

  // Islamic Regular Holidays
  const islamic = ISLAMIC_HOLIDAYS_MAP[year]
  if (islamic) {
    holidays.push({
      id: `ph-eidl-fitr-${year}`,
      name: "Eid'l Fitr (Feast of Ramadhan)",
      date: islamic.eidlFitr,
      year,
      type: 'Regular',
      scope: 'National',
      source: 'system',
      payRule: 'Regular Holiday: 200% Worked / 100% Unworked Pay',
      description: 'End of Islamic holy fasting month of Ramadan (approximate Islamic lunar calendar).',
      isMovable: true,
      legalBasis: 'Republic Act No. 9177'
    })

    holidays.push({
      id: `ph-eidl-adha-${year}`,
      name: "Eid'l Adha (Feast of the Sacrifice)",
      date: islamic.eidlAdha,
      year,
      type: 'Regular',
      scope: 'National',
      source: 'system',
      payRule: 'Regular Holiday: 200% Worked / 100% Unworked Pay',
      description: 'Islamic festival marking the culmination of Hajj pilgrimage.',
      isMovable: true,
      legalBasis: 'Republic Act No. 9849'
    })
  }

  // ==========================================
  // PHILIPPINE SPECIAL NON-WORKING HOLIDAYS (130% worked, no work no pay)
  // ==========================================
  const cny = CHINESE_NEW_YEAR_MAP[year]
  if (cny) {
    holidays.push({
      id: `ph-cny-${year}`,
      name: 'Chinese Lunar New Year',
      date: cny,
      year,
      type: 'Special Non-Working',
      scope: 'National',
      source: 'system',
      payRule: 'Special Non-Working: 130% Worked / Unworked No Pay',
      description: 'Traditional Spring Festival celebration.',
      isMovable: true,
      legalBasis: 'Presidential Proclamation'
    })
  }

  holidays.push({
    id: `ph-edsa-${year}`,
    name: 'EDSA People Power Revolution Anniversary',
    date: toDateStr(year, 2, 25),
    year,
    type: 'Special Non-Working',
    scope: 'National',
    source: 'system',
    payRule: 'Special Non-Working: 130% Worked / Unworked No Pay',
    description: 'Commemorating the peaceful 1986 restoration of democracy in the Philippines.',
    legalBasis: 'Presidential Proclamation'
  })

  holidays.push({
    id: `ph-black-saturday-${year}`,
    name: 'Black Saturday',
    date: blackSaturdayStr,
    year,
    type: 'Special Non-Working',
    scope: 'National',
    source: 'system',
    payRule: 'Special Non-Working: 130% Worked / Unworked No Pay',
    description: 'Day between Good Friday and Easter Sunday.',
    isMovable: true,
    legalBasis: 'Presidential Proclamation'
  })

  holidays.push({
    id: `ph-ninoy-aquino-${year}`,
    name: 'Ninoy Aquino Day',
    date: toDateStr(year, 8, 21),
    year,
    type: 'Special Non-Working',
    scope: 'National',
    source: 'system',
    payRule: 'Special Non-Working: 130% Worked / Unworked No Pay',
    description: 'Assassination anniversary of former Senator Benigno Ninoy Aquino Jr.',
    legalBasis: 'Republic Act No. 9256'
  })

  holidays.push({
    id: `ph-all-saints-${year}`,
    name: "All Saints' Day (Undas)",
    date: toDateStr(year, 11, 1),
    year,
    type: 'Special Non-Working',
    scope: 'National',
    source: 'system',
    payRule: 'Special Non-Working: 130% Worked / Unworked No Pay',
    description: 'Traditional Christian remembrance of all saints and departed loved ones.',
    legalBasis: 'Presidential Proclamation'
  })

  holidays.push({
    id: `ph-all-souls-${year}`,
    name: "All Souls' Day",
    date: toDateStr(year, 11, 2),
    year,
    type: 'Special Non-Working',
    scope: 'National',
    source: 'system',
    payRule: 'Special Non-Working: 130% Worked / Unworked No Pay',
    description: 'Traditional Undas commemoration for all souls.',
    legalBasis: 'Presidential Proclamation'
  })

  holidays.push({
    id: `ph-immaculate-conception-${year}`,
    name: 'Feast of the Immaculate Conception of Mary',
    date: toDateStr(year, 12, 8),
    year,
    type: 'Special Non-Working',
    scope: 'National',
    source: 'system',
    payRule: 'Special Non-Working: 130% Worked / Unworked No Pay',
    description: 'Principal Patroness of the Republic of the Philippines.',
    legalBasis: 'Republic Act No. 10966'
  })

  holidays.push({
    id: `ph-christmas-eve-${year}`,
    name: 'Christmas Eve',
    date: toDateStr(year, 12, 24),
    year,
    type: 'Special Non-Working',
    scope: 'National',
    source: 'system',
    payRule: 'Special Non-Working: 130% Worked / Unworked No Pay',
    description: 'Traditional family vigil preceding Christmas Day.',
    legalBasis: 'Presidential Proclamation'
  })

  holidays.push({
    id: `ph-last-day-${year}`,
    name: 'Last Day of the Year (New Year Eve)',
    date: toDateStr(year, 12, 31),
    year,
    type: 'Special Non-Working',
    scope: 'National',
    source: 'system',
    payRule: 'Special Non-Working: 130% Worked / Unworked No Pay',
    description: 'Special non-working day for year-end family preparations.',
    legalBasis: 'Presidential Proclamation'
  })

  // Sort chronologically by date
  holidays.sort((a, b) => a.date.localeCompare(b.date))

  return holidays
}
