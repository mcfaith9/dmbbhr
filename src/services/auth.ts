import { ref, computed } from 'vue'
import type { User } from '@/types'
import { SEED_USERS } from './seedData'

const AUTH_USER_KEY = 'dmbbhr_auth_user'
const AUTH_TOKEN_KEY = 'dmbbhr_auth_token'

export interface LoginCredentials {
  username?: string
  email?: string
  password?: string
}

// Reactive user state
const currentUserState = ref<User | null>(loadInitialUser())
const tokenState = ref<string | null>(localStorage.getItem(AUTH_TOKEN_KEY))

function loadInitialUser(): User | null {
  try {
    const stored = localStorage.getItem(AUTH_USER_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // ignore
  }
  return null
}

export const authService = {
  // Reactive getters
  currentUser: computed(() => currentUserState.value),
  isAuthenticatedUser: computed(() => !!tokenState.value && !!currentUserState.value),

  /**
   * Authenticate with username/email and password against administrators
   */
  async login(credentials: LoginCredentials): Promise<{ user: User; token: string }> {
    const idOrEmail = (credentials.username || credentials.email || '').trim().toLowerCase()
    
    // Find matching admin or user
    const matched = SEED_USERS.find(
      u => u.username.toLowerCase() === idOrEmail || u.email.toLowerCase() === idOrEmail
    )

    // Allowed accounts: dmbbhr, admin (or matching seed users)
    if (matched || idOrEmail === 'dmbbhr' || idOrEmail === 'admin') {
      const user: User = matched || {
        id: idOrEmail === 'admin' ? 'u-2' : 'u-1',
        username: idOrEmail,
        name: idOrEmail === 'dmbbhr' ? 'DMBB HR Administrator' : 'System Administrator',
        email: `${idOrEmail}@dmbb.com`,
        role: 'admin',
        accessible_location_ids: ['loc-cebu', 'loc-negros', 'loc-iloilo']
      }

      const token = `bearer-dmbbhr-jwt-${Date.now()}`
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
      localStorage.setItem(AUTH_TOKEN_KEY, token)

      currentUserState.value = user
      tokenState.value = token

      return { user, token }
    } else {
      throw new Error('Invalid credentials. Use administrator username "dmbbhr" or "admin".')
    }
  },

  getCurrentUser(): User | null {
    if (!currentUserState.value) {
      currentUserState.value = loadInitialUser()
    }
    return currentUserState.value
  },

  getToken(): string | null {
    return tokenState.value || localStorage.getItem(AUTH_TOKEN_KEY)
  },

  isAuthenticated(): boolean {
    const token = localStorage.getItem(AUTH_TOKEN_KEY)
    const userStr = localStorage.getItem(AUTH_USER_KEY)
    return Boolean(token && userStr)
  },

  /**
   * Completely clear session state, tokens, and invalidate reactive state
   */
  logout(): void {
    localStorage.removeItem(AUTH_USER_KEY)
    localStorage.removeItem(AUTH_TOKEN_KEY)
    currentUserState.value = null
    tokenState.value = null
  }
}
