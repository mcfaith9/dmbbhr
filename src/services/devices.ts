import type { BiometricDevice, Location } from '@/types'
import { SEED_DEVICES, SEED_LOCATIONS } from './seedData'

export const deviceService = {
  getDevices(): Promise<BiometricDevice[]> {
    return new Promise((resolve) => {
      resolve([...SEED_DEVICES])
    })
  },

  getLocations(): Promise<Location[]> {
    return new Promise((resolve) => {
      // In current system, DBB Cebu is active; others are future locations
      resolve([...SEED_LOCATIONS])
    })
  },

  getActiveLocations(): Promise<Location[]> {
    return new Promise((resolve) => {
      resolve(SEED_LOCATIONS.filter(l => l.is_active))
    })
  }
}
