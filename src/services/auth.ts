import type { User } from '@/types'
import { SEED_USERS } from './seedData'

const AUTH_USER_KEY = 'dmbbhr_auth_user'
const AUTH_TOKEN_KEY = 'dmbbhr_auth_token'

export interface LoginCredentials {
  username?: string
  email?: string
  password?: string
}

export const authService = {
  login(credentials: LoginCredentials): Promise<{ user: User; token: string }> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const idOrEmail = (credentials.username || credentials.email || '').trim().toLowerCase()
        
        // Find matching default admin or user
        const matched = SEED_USERS.find(
          u => u.username.toLowerCase() === idOrEmail || u.email.toLowerCase() === idOrEmail
        )

        // For development/initial setup, accept dmbbhr or admin
        if (matched || idOrEmail === 'dmbbhr' || idOrEmail === 'admin') {
          const user: User = matched || {
            id: 'u-1',
            username: idOrEmail,
            name: idOrEmail === 'dmbbhr' ? 'DMBB HR Admin' : 'System Admin',
            email: `${idOrEmail}@dmbb.com`,
            role: 'admin',
            accessible_location_ids: ['loc-cebu', 'loc-negros', 'loc-iloilo']
          }

          const token = `bearer-dev-token-${Date.now()}`
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
          localStorage.setItem(AUTH_TOKEN_KEY, token)
          resolve({ user, token })
        } else {
          // Allow login for testing or reject with clean message
          reject(new Error('Invalid credentials. Default usernames: "dmbbhr" or "admin"'))
        }
      }, 300)
    })
  },

  getCurrentUser(): User | null {
    try {
      const stored = localStorage.getItem(AUTH_USER_KEY)
      if (stored) {
        return JSON.parse(stored)
      }
    } catch {
      // fallback
    }
    // Return default logged in user if not set yet for seamless development
    return SEED_USERS[0]
  },

  getToken(): string | null {
    return localStorage.getItem(AUTH_TOKEN_KEY) || 'bearer-dev-token'
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem(AUTH_TOKEN_KEY) || true // Always authenticated in dev unless logged out
  },

  logout(): void {
    localStorage.removeItem(AUTH_USER_KEY)
    localStorage.removeItem(AUTH_TOKEN_KEY)
  }
}
