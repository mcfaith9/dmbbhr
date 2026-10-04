import { ref, computed } from 'vue'
import type { User } from '@/types'
import { SEED_USERS } from './seedData'

const AUTH_USER_KEY = 'dmbbhr_auth_user'
const AUTH_TOKEN_KEY = 'dmbbhr_auth_token'
const AUTH_ACCOUNTS_KEY = 'dmbbhr_accounts'

export interface LoginCredentials {
  username?: string
  email?: string
  password?: string
}

export interface StoredAccount {
  user: User
  salt: string
  passwordHash: string
}

export function getRoleDisplayName(role?: string): string {
  if (!role) return 'Administrator'
  const r = role.toLowerCase().trim()
  if (r === 'admin') return 'Administrator'
  if (r === 'hr') return 'Human Resources'
  if (r === 'viewer') return 'Viewer'
  return role.charAt(0).toUpperCase() + role.slice(1)
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

async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder()
  const data = enc.encode(`${salt}:${password}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function generateSalt(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

async function getStoredAccounts(): Promise<Record<string, StoredAccount>> {
  try {
    const raw = localStorage.getItem(AUTH_ACCOUNTS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed
      }
    }
  } catch {
    // ignore
  }

  // Initialize default application accounts if none exist
  const accounts: Record<string, StoredAccount> = {}
  const defaultPassword = 'password'

  for (const u of SEED_USERS) {
    const salt = generateSalt()
    const passwordHash = await hashPassword(defaultPassword, salt)
    accounts[u.username.toLowerCase()] = {
      user: { ...u },
      salt,
      passwordHash
    }
  }

  try {
    localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(accounts))
  } catch {
    // ignore
  }

  return accounts
}

async function saveStoredAccounts(accounts: Record<string, StoredAccount>): Promise<void> {
  localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(accounts))
}

export const authService = {
  // Reactive getters
  currentUser: computed(() => currentUserState.value),
  isAuthenticatedUser: computed(() => !!tokenState.value && !!currentUserState.value),

  /**
   * Authenticate with username/email and password against stored application accounts
   */
  async login(credentials: LoginCredentials): Promise<{ user: User; token: string }> {
    const idOrEmail = (credentials.username || credentials.email || '').trim().toLowerCase()
    const enteredPassword = credentials.password || ''

    if (!idOrEmail) {
      throw new Error('Username or email is required.')
    }
    if (!enteredPassword) {
      throw new Error('Password is required.')
    }

    const accounts = await getStoredAccounts()

    // Find account by username or email
    let matchedKey: string | null = null
    for (const [key, acc] of Object.entries(accounts)) {
      if (key === idOrEmail || acc.user.email.toLowerCase() === idOrEmail) {
        matchedKey = key
        break
      }
    }

    // Fallback migration if an account from SEED_USERS isn't initialized yet
    if (!matchedKey) {
      const seedMatch = SEED_USERS.find(
        u => u.username.toLowerCase() === idOrEmail || u.email.toLowerCase() === idOrEmail
      )
      if (seedMatch) {
        const salt = generateSalt()
        const passwordHash = await hashPassword('password', salt)
        const newAcc: StoredAccount = {
          user: { ...seedMatch },
          salt,
          passwordHash
        }
        accounts[seedMatch.username.toLowerCase()] = newAcc
        await saveStoredAccounts(accounts)
        matchedKey = seedMatch.username.toLowerCase()
      }
    }

    if (!matchedKey) {
      throw new Error('Invalid credentials. Use "Admin" or "HR" account.')
    }

    const targetAccount = accounts[matchedKey]
    const testHash = await hashPassword(enteredPassword, targetAccount.salt)

    if (testHash !== targetAccount.passwordHash) {
      throw new Error('Incorrect password. Please verify your credentials.')
    }

    const token = `bearer-dmbbhr-jwt-${Date.now()}`
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(targetAccount.user))
    localStorage.setItem(AUTH_TOKEN_KEY, token)

    currentUserState.value = targetAccount.user
    tokenState.value = token

    return { user: targetAccount.user, token }
  },

  /**
   * Change password for the current logged-in account
   */
  async changePassword(params: {
    currentPassword?: string
    newPassword?: string
    confirmPassword?: string
  }): Promise<{ success: boolean; message: string }> {
    const user = currentUserState.value
    if (!user) {
      throw new Error('No logged-in user session found. Please log in again.')
    }

    const currentPwd = (params.currentPassword || '').trim()
    const newPwd = (params.newPassword || '').trim()
    const confirmPwd = (params.confirmPassword || '').trim()

    // Input validations
    if (!currentPwd) {
      throw new Error('Current password is required.')
    }
    if (!newPwd) {
      throw new Error('New password is required.')
    }
    if (!confirmPwd) {
      throw new Error('Confirm new password is required.')
    }
    if (newPwd !== confirmPwd) {
      throw new Error('New password and confirmation do not match.')
    }
    if (newPwd.length < 4) {
      throw new Error('New password must be at least 4 characters long.')
    }
    if (currentPwd === newPwd) {
      throw new Error('New password must be different from current password.')
    }

    const accounts = await getStoredAccounts()
    const accountKey = user.username.toLowerCase()
    const account = accounts[accountKey]

    if (!account) {
      throw new Error('Account record could not be found.')
    }

    // Verify current password against stored hash
    const testCurrentHash = await hashPassword(currentPwd, account.salt)
    if (testCurrentHash !== account.passwordHash) {
      throw new Error('Current password is incorrect.')
    }

    // Generate new salt and compute hash
    const newSalt = generateSalt()
    const newPasswordHash = await hashPassword(newPwd, newSalt)

    account.salt = newSalt
    account.passwordHash = newPasswordHash

    // Persist updated credentials in accounts store
    await saveStoredAccounts(accounts)

    // Ensure session maintains same user and role
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(account.user))
    currentUserState.value = { ...account.user }

    return {
      success: true,
      message: 'Password changed successfully.'
    }
  },

  /**
   * Reset password for an account (by Administrator)
   */
  async adminResetPassword(username: string, newPassword: string): Promise<void> {
    const cleanUsername = username.trim().toLowerCase()
    const accounts = await getStoredAccounts()
    let matchedKey: string | null = null
    for (const [key, acc] of Object.entries(accounts)) {
      if (key === cleanUsername || acc.user.username.toLowerCase() === cleanUsername) {
        matchedKey = key
        break
      }
    }
    if (!matchedKey) {
      throw new Error(`Account "${username}" was not found.`)
    }
    const targetAccount = accounts[matchedKey]
    const newSalt = generateSalt()
    const newPasswordHash = await hashPassword(newPassword, newSalt)
    targetAccount.salt = newSalt
    targetAccount.passwordHash = newPasswordHash
    await saveStoredAccounts(accounts)
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
