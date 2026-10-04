<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Search,
  Check,
  UserCheck,
  Building,
  Lock,
  ArrowLeft,
  AlertTriangle
} from '@lucide/vue'
import { authService, getRoleDisplayName } from '@/services/auth'
import type { User } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'

const currentUser = authService.currentUser
const isAdmin = computed(() => currentUser.value?.role === 'admin')

const users = ref<User[]>([])
const loadingUsers = ref(false)
const searchQuery = ref('')
const activeTab = ref<'users' | 'roles'>('users')

// =========================================================================
// 1. OWN PASSWORD CHANGE STATE & LOGIC
// =========================================================================
const showOwnPasswordModal = ref(false)
const currentPasswordInput = ref('')
const ownNewPasswordInput = ref('')
const ownConfirmPasswordInput = ref('')
const ownPasswordError = ref('')
const ownPasswordSuccess = ref('')
const isSavingOwnPassword = ref(false)

function openOwnPasswordModal() {
  currentPasswordInput.value = ''
  ownNewPasswordInput.value = ''
  ownConfirmPasswordInput.value = ''
  ownPasswordError.value = ''
  ownPasswordSuccess.value = ''
  showOwnPasswordModal.value = true
}

async function handleOwnPasswordChange() {
  ownPasswordError.value = ''
  ownPasswordSuccess.value = ''

  const cur = currentPasswordInput.value.trim()
  const p1 = ownNewPasswordInput.value.trim()
  const p2 = ownConfirmPasswordInput.value.trim()

  if (!cur) {
    ownPasswordError.value = 'Current password is required.'
    return
  }
  if (!p1) {
    ownPasswordError.value = 'New password is required.'
    return
  }
  if (p1.length < 4) {
    ownPasswordError.value = 'New password must be at least 4 characters long.'
    return
  }
  if (p1 !== p2) {
    ownPasswordError.value = 'New password and confirmation do not match.'
    return
  }
  if (cur === p1) {
    ownPasswordError.value = 'New password must be different from current password.'
    return
  }

  isSavingOwnPassword.value = true
  try {
    const res = await authService.changePassword({
      currentPassword: cur,
      newPassword: p1,
      confirmPassword: p2
    })
    ownPasswordSuccess.value = res.message || 'Password changed successfully.'
    setTimeout(() => {
      showOwnPasswordModal.value = false
    }, 1200)
  } catch (err: any) {
    ownPasswordError.value = err?.message || 'Failed to change password.'
  } finally {
    isSavingOwnPassword.value = false
  }
}

// =========================================================================
// 2. ADMINISTRATOR RESET PASSWORD STATE & LOGIC
// =========================================================================
const showAdminResetModal = ref(false)
const selectedUserForReset = ref<User | null>(null)
const adminNewPasswordInput = ref('')
const adminConfirmPasswordInput = ref('')
const adminResetError = ref('')
const adminResetSuccess = ref('')
const isSavingAdminReset = ref(false)

function openAdminResetModal(u: User) {
  if (!isAdmin.value) return
  selectedUserForReset.value = u
  adminNewPasswordInput.value = ''
  adminConfirmPasswordInput.value = ''
  adminResetError.value = ''
  adminResetSuccess.value = ''
  showAdminResetModal.value = true
}

async function handleAdminResetPassword() {
  adminResetError.value = ''
  adminResetSuccess.value = ''

  if (!selectedUserForReset.value) return

  if (!isAdmin.value) {
    adminResetError.value = 'Permission denied: Only administrators can reset other users\' passwords.'
    return
  }

  const p1 = adminNewPasswordInput.value.trim()
  const p2 = adminConfirmPasswordInput.value.trim()

  if (!p1) {
    adminResetError.value = 'New password cannot be empty.'
    return
  }
  if (p1.length < 4) {
    adminResetError.value = 'Password must be at least 4 characters long.'
    return
  }
  if (p1 !== p2) {
    adminResetError.value = 'New password and confirmation do not match.'
    return
  }

  isSavingAdminReset.value = true
  try {
    await authService.adminResetPassword(selectedUserForReset.value.username, p1)
    adminResetSuccess.value = `Password for @${selectedUserForReset.value.username} (${selectedUserForReset.value.name}) has been reset successfully.`
    await loadAccounts()
    setTimeout(() => {
      showAdminResetModal.value = false
    }, 1400)
  } catch (err: any) {
    adminResetError.value = err?.message || 'Failed to reset password.'
  } finally {
    isSavingAdminReset.value = false
  }
}

// =========================================================================
// 3. LOAD ACCOUNTS
// =========================================================================
async function loadAccounts() {
  loadingUsers.value = true
  try {
    users.value = await authService.getAllAccounts()
  } finally {
    loadingUsers.value = false
  }
}

const filteredUsers = computed(() => {
  if (!searchQuery.value.trim()) return users.value
  const q = searchQuery.value.toLowerCase().trim()
  return users.value.filter(u =>
    u.name.toLowerCase().includes(q) ||
    u.username.toLowerCase().includes(q) ||
    u.email.toLowerCase().includes(q) ||
    u.role.toLowerCase().includes(q)
  )
})

onMounted(() => {
  loadAccounts()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header with Back Link to Settings -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <router-link
            to="/settings"
            class="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <ArrowLeft class="size-3.5" />
            <span>Settings</span>
          </router-link>
          <span class="text-xs text-muted-foreground">/</span>
          <span class="text-xs font-semibold text-foreground">User Accounts</span>
        </div>
        <h1 class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>User Accounts & Security</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium font-mono">
            Administration
          </span>
        </h1>
        <p class="text-xs text-muted-foreground">
          Manage system users, roles, password policies, and security credentials.
        </p>
      </div>

      <!-- Tab Switcher -->
      <div class="flex items-center gap-1 bg-card border rounded-lg p-1 self-start sm:self-auto shrink-0 shadow-2xs">
        <button
          type="button"
          class="px-3 py-1.5 text-xs rounded-md transition-all font-medium flex items-center gap-1.5 cursor-pointer"
          :class="activeTab === 'users' ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'users'"
        >
          <UserCheck class="size-3.5" />
          <span>User Accounts ({{ users.length }})</span>
        </button>
        <button
          type="button"
          class="px-3 py-1.5 text-xs rounded-md transition-all font-medium flex items-center gap-1.5 cursor-pointer"
          :class="activeTab === 'roles' ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'roles'"
        >
          <ShieldCheck class="size-3.5" />
          <span>Roles & Permissions</span>
        </button>
      </div>
    </div>

    <!-- Active User Session Quick Action Banner -->
    <div
      v-if="currentUser"
      class="rounded-xl border bg-card p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-primary/20"
    >
      <div class="flex items-center gap-3">
        <div class="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm border border-primary/20">
          {{ currentUser.username.slice(0, 2).toUpperCase() }}
        </div>
        <div>
          <div class="font-bold text-foreground text-sm flex items-center gap-2">
            <span>{{ currentUser.name }}</span>
            <span class="font-mono text-xs text-muted-foreground">(@{{ currentUser.username }})</span>
            <Badge variant="outline" class="text-[10px] bg-primary/10 text-primary border-primary/30">
              Active Session
            </Badge>
          </div>
          <div class="text-[11px] text-muted-foreground mt-0.5">
            Role: <strong>{{ getRoleDisplayName(currentUser.role) }}</strong> • Email: {{ currentUser.email }}
          </div>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        class="h-8 text-xs gap-1.5 cursor-pointer self-start sm:self-auto font-medium"
        @click="openOwnPasswordModal"
      >
        <KeyRound class="size-3.5 text-primary" />
        <span>Change My Password</span>
      </Button>
    </div>

    <!-- TAB 1: USER ACCOUNTS -->
    <div v-if="activeTab === 'users'" class="space-y-4">
      <!-- Search Toolbar -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="relative w-full sm:w-72">
          <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            placeholder="Search accounts, names, emails..."
            class="pl-8 text-xs h-8 bg-card"
          />
        </div>

        <div class="text-xs text-muted-foreground flex items-center gap-2">
          <span v-if="isAdmin" class="text-emerald-600 font-medium flex items-center gap-1">
            <CheckCircle2 class="size-3.5" />
            Administrator: Can reset password for any account
          </span>
          <span v-else class="text-muted-foreground flex items-center gap-1">
            <Lock class="size-3.5" />
            Standard User: Can change own password
          </span>
        </div>
      </div>

      <!-- Users Table Card -->
      <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
        <Table class="text-xs">
          <TableHeader>
            <TableRow class="bg-muted/40 hover:bg-muted/40">
              <TableHead class="font-semibold text-foreground">User / Identity</TableHead>
              <TableHead class="font-semibold text-foreground">Email</TableHead>
              <TableHead class="font-semibold text-foreground">Role</TableHead>
              <TableHead class="font-semibold text-foreground">Accessible Branches</TableHead>
              <TableHead class="font-semibold text-foreground text-center">Status</TableHead>
              <TableHead class="font-semibold text-foreground text-right w-[180px]">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <TableRow
              v-for="u in filteredUsers"
              :key="u.id"
              class="hover:bg-muted/30 transition-colors"
            >
              <!-- Identity -->
              <TableCell class="py-3">
                <div class="flex items-center gap-2.5">
                  <div class="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                    {{ u.username.slice(0, 2).toUpperCase() }}
                  </div>
                  <div>
                    <div class="font-semibold text-foreground flex items-center gap-1.5">
                      <span>{{ u.name }}</span>
                      <Badge v-if="currentUser?.username === u.username" variant="outline" class="text-[9px] px-1 py-0 bg-primary/5 text-primary">
                        You
                      </Badge>
                    </div>
                    <div class="text-[11px] text-muted-foreground font-mono">@{{ u.username }}</div>
                  </div>
                </div>
              </TableCell>

              <!-- Email -->
              <TableCell class="py-3 text-muted-foreground font-mono text-[11px]">
                {{ u.email }}
              </TableCell>

              <!-- Role -->
              <TableCell class="py-3">
                <Badge :variant="u.role === 'admin' ? 'default' : 'secondary'" class="text-[10px] font-mono">
                  {{ getRoleDisplayName(u.role) }}
                </Badge>
              </TableCell>

              <!-- Accessible Branches -->
              <TableCell class="py-3">
                <div class="flex items-center gap-1 flex-wrap">
                  <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border bg-muted/30 text-[10px] text-muted-foreground">
                    <Building class="size-2.5" />
                    DBB Cebu
                  </span>
                  <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border bg-muted/30 text-[10px] text-muted-foreground">
                    <Building class="size-2.5" />
                    DBB Negros
                  </span>
                  <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border bg-muted/30 text-[10px] text-muted-foreground">
                    <Building class="size-2.5" />
                    DBB Iloilo
                  </span>
                </div>
              </TableCell>

              <!-- Status -->
              <TableCell class="py-3 text-center">
                <Badge variant="outline" class="text-[10px] text-emerald-600 border-emerald-500/30 bg-emerald-500/10">
                  Active
                </Badge>
              </TableCell>

              <!-- Actions -->
              <TableCell class="py-3 text-right">
                <!-- Case A: This row is the CURRENT LOGGED IN USER -->
                <Button
                  v-if="currentUser?.username === u.username"
                  variant="outline"
                  size="sm"
                  class="h-7 text-xs gap-1.5 cursor-pointer font-medium"
                  @click="openOwnPasswordModal"
                >
                  <KeyRound class="size-3 text-primary" />
                  <span>Change Password</span>
                </Button>

                <!-- Case B: This row is ANOTHER USER and current user is ADMINISTRATOR -->
                <Button
                  v-else-if="isAdmin"
                  variant="outline"
                  size="sm"
                  class="h-7 text-xs gap-1.5 cursor-pointer hover:border-destructive/50 hover:text-destructive"
                  @click="openAdminResetModal(u)"
                >
                  <KeyRound class="size-3 text-muted-foreground" />
                  <span>Reset Password</span>
                </Button>

                <!-- Case C: This row is ANOTHER USER and current user is NOT administrator -->
                <span
                  v-else
                  class="inline-flex items-center gap-1 text-[11px] text-muted-foreground px-2 py-1"
                >
                  <Lock class="size-3 text-muted-foreground/60" />
                  <span>Protected</span>
                </span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- Security Notice Footer -->
      <div class="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <Lock class="size-4 text-primary shrink-0" />
          <span>Application accounts authenticate securely with salted SHA-256 password hashing stored in persistent browser storage.</span>
        </div>
        <span class="font-mono text-[11px]">dmbbhr_accounts</span>
      </div>
    </div>

    <!-- TAB 2: ROLES & PERMISSIONS -->
    <div v-else class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Administrator Role Card -->
        <div class="rounded-xl border bg-card p-5 shadow-xs space-y-3">
          <div class="flex items-center justify-between border-b pb-3">
            <div class="flex items-center gap-2.5">
              <div class="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                <ShieldCheck class="size-5" />
              </div>
              <div>
                <h3 class="font-bold text-sm text-foreground">Administrator</h3>
                <p class="text-xs text-muted-foreground font-mono">Role: admin</p>
              </div>
            </div>
            <Badge variant="default" class="text-xs">Full Access</Badge>
          </div>

          <div class="space-y-2 text-xs">
            <p class="text-muted-foreground">
              Highest privilege tier with unrestricted operational and administrative access.
            </p>
            <div class="space-y-1.5 pt-1 font-medium text-foreground">
              <div class="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                <Check class="size-3.5 text-emerald-600" />
                Reset passwords for ANY application account
              </div>
              <div class="flex items-center gap-2">
                <Check class="size-3.5 text-emerald-600" />
                Change own account password
              </div>
              <div class="flex items-center gap-2">
                <Check class="size-3.5 text-emerald-600" />
                Full biometric terminal listener & socket ports (4370)
              </div>
              <div class="flex items-center gap-2">
                <Check class="size-3.5 text-emerald-600" />
                Attendance manual adjustments & approval authority
              </div>
              <div class="flex items-center gap-2">
                <Check class="size-3.5 text-emerald-600" />
                Work group schedules & attendance rules management
              </div>
              <div class="flex items-center gap-2">
                <Check class="size-3.5 text-emerald-600" />
                Payroll generation and employee audits
              </div>
            </div>
          </div>
        </div>

        <!-- Human Resources Role Card -->
        <div class="rounded-xl border bg-card p-5 shadow-xs space-y-3">
          <div class="flex items-center justify-between border-b pb-3">
            <div class="flex items-center gap-2.5">
              <div class="size-9 rounded-lg bg-secondary text-secondary-foreground flex items-center justify-center font-bold">
                <UserCheck class="size-5" />
              </div>
              <div>
                <h3 class="font-bold text-sm text-foreground">Human Resources</h3>
                <p class="text-xs text-muted-foreground font-mono">Role: hr</p>
              </div>
            </div>
            <Badge variant="secondary" class="text-xs">HR Access</Badge>
          </div>

          <div class="space-y-2 text-xs">
            <p class="text-muted-foreground">
              Operational human resources tier focused on daily personnel management and attendance verification.
            </p>
            <div class="space-y-1.5 pt-1 font-medium text-foreground">
              <div class="flex items-center gap-2">
                <Check class="size-3.5 text-emerald-600" />
                Change own account password with current password verification
              </div>
              <div class="flex items-center gap-2 text-muted-foreground">
                <Lock class="size-3.5 text-amber-600" />
                Cannot reset passwords for other accounts (restricted)
              </div>
              <div class="flex items-center gap-2">
                <Check class="size-3.5 text-emerald-600" />
                Employee directory and profile management
              </div>
              <div class="flex items-center gap-2">
                <Check class="size-3.5 text-emerald-600" />
                Daily attendance inspection and audit logs
              </div>
              <div class="flex items-center gap-2">
                <Check class="size-3.5 text-emerald-600" />
                Leave and overtime request submissions
              </div>
              <div class="flex items-center gap-2 text-muted-foreground">
                <Lock class="size-3.5" />
                Biometric hardware socket listener auto-managed
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================= -->
    <!-- DIALOG 1: CHANGE MY PASSWORD (OWN ACCOUNT) -->
    <!-- ============================================================= -->
    <Dialog :open="showOwnPasswordModal" @update:open="showOwnPasswordModal = $event">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-base font-bold">
            <KeyRound class="size-4 text-primary" />
            <span>Change My Password</span>
          </DialogTitle>
          <DialogDescription class="text-xs text-muted-foreground">
            Update password for your account <strong>@{{ currentUser?.username }}</strong> ({{ currentUser?.name }}).
          </DialogDescription>
        </DialogHeader>

        <form @submit.prevent="handleOwnPasswordChange" class="space-y-3 py-1 text-xs">
          <!-- Error banner -->
          <div v-if="ownPasswordError" class="p-2.5 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
            <AlertCircle class="size-4 shrink-0" />
            <span>{{ ownPasswordError }}</span>
          </div>

          <!-- Success banner -->
          <div v-if="ownPasswordSuccess" class="p-2.5 rounded-md border border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 class="size-4 shrink-0 text-emerald-600" />
            <span>{{ ownPasswordSuccess }}</span>
          </div>

          <!-- Current Password -->
          <div class="space-y-1.5">
            <label class="font-medium text-foreground">
              Current Password <span class="text-destructive">*</span>
            </label>
            <Input
              v-model="currentPasswordInput"
              type="password"
              required
              placeholder="Enter your current password"
              class="h-8 text-xs font-mono"
            />
          </div>

          <!-- New Password -->
          <div class="space-y-1.5">
            <label class="font-medium text-foreground">
              New Password <span class="text-destructive">*</span>
            </label>
            <Input
              v-model="ownNewPasswordInput"
              type="password"
              required
              placeholder="Minimum 4 characters"
              class="h-8 text-xs font-mono"
            />
          </div>

          <!-- Confirm New Password -->
          <div class="space-y-1.5">
            <label class="font-medium text-foreground">
              Confirm New Password <span class="text-destructive">*</span>
            </label>
            <Input
              v-model="ownConfirmPasswordInput"
              type="password"
              required
              placeholder="Re-type new password"
              class="h-8 text-xs font-mono"
            />
          </div>

          <DialogFooter class="border-t pt-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="h-8 text-xs cursor-pointer"
              @click="showOwnPasswordModal = false"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              class="h-8 text-xs font-semibold cursor-pointer gap-1.5"
              :disabled="isSavingOwnPassword"
            >
              <KeyRound class="size-3.5" />
              <span>{{ isSavingOwnPassword ? 'Updating...' : 'Change Password' }}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <!-- ============================================================= -->
    <!-- DIALOG 2: ADMINISTRATOR RESET PASSWORD CONFIRMATION MODAL -->
    <!-- ============================================================= -->
    <Dialog :open="showAdminResetModal && !!selectedUserForReset" @update:open="showAdminResetModal = $event">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-base font-bold text-destructive">
            <AlertTriangle class="size-4 text-destructive" />
            <span>Reset Password</span>
          </DialogTitle>
          <DialogDescription class="text-xs text-muted-foreground">
            Are you sure you want to reset the password for:
          </DialogDescription>
        </DialogHeader>

        <form @submit.prevent="handleAdminResetPassword" class="space-y-3 py-1 text-xs">
          <!-- Target User Profile Highlight Box -->
          <div class="rounded-lg border bg-muted/40 p-3 space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="font-bold text-sm text-foreground">
                {{ selectedUserForReset?.name }}
              </span>
              <Badge :variant="selectedUserForReset?.role === 'admin' ? 'default' : 'secondary'" class="text-[10px] font-mono">
                {{ getRoleDisplayName(selectedUserForReset?.role) }}
              </Badge>
            </div>
            <div class="text-[11px] text-muted-foreground font-mono">
              Username: @{{ selectedUserForReset?.username }} • Email: {{ selectedUserForReset?.email }}
            </div>
          </div>

          <!-- Error banner -->
          <div v-if="adminResetError" class="p-2.5 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
            <AlertCircle class="size-4 shrink-0" />
            <span>{{ adminResetError }}</span>
          </div>

          <!-- Success banner -->
          <div v-if="adminResetSuccess" class="p-2.5 rounded-md border border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 class="size-4 shrink-0 text-emerald-600" />
            <span>{{ adminResetSuccess }}</span>
          </div>

          <!-- New Password Input -->
          <div class="space-y-1.5">
            <label class="font-medium text-foreground">
              New Password for @{{ selectedUserForReset?.username }} <span class="text-destructive">*</span>
            </label>
            <Input
              v-model="adminNewPasswordInput"
              type="password"
              required
              placeholder="Enter new password (min 4 characters)"
              class="h-8 text-xs font-mono"
            />
          </div>

          <!-- Confirm New Password Input -->
          <div class="space-y-1.5">
            <label class="font-medium text-foreground">
              Confirm New Password <span class="text-destructive">*</span>
            </label>
            <Input
              v-model="adminConfirmPasswordInput"
              type="password"
              required
              placeholder="Re-type new password"
              class="h-8 text-xs font-mono"
            />
          </div>

          <p class="text-[11px] text-muted-foreground">
            This action will immediately overwrite the password for account <strong>@{{ selectedUserForReset?.username }}</strong>. The user must use this new password on their next login.
          </p>

          <DialogFooter class="border-t pt-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="h-8 text-xs cursor-pointer"
              @click="showAdminResetModal = false"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              class="h-8 text-xs font-semibold cursor-pointer gap-1.5"
              :disabled="isSavingAdminReset"
            >
              <KeyRound class="size-3.5" />
              <span>{{ isSavingAdminReset ? 'Resetting...' : 'Reset Password' }}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
