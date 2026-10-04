<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  Search,
  Check,
  UserCheck,
  Building,
  Lock
} from '@lucide/vue'
import { SEED_USERS } from '@/services/seedData'
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

const users = ref<User[]>(SEED_USERS)
const searchQuery = ref('')
const activeTab = ref<'users' | 'roles'>('users')

// Password Reset Dialog State
const showPasswordModal = ref(false)
const selectedUserForPassword = ref<User | null>(null)
const newPasswordInput = ref('')
const confirmPasswordInput = ref('')
const passwordMsg = ref('')
const passwordError = ref('')
const isSavingPassword = ref(false)

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

function openPasswordModal(u: User) {
  selectedUserForPassword.value = u
  newPasswordInput.value = ''
  confirmPasswordInput.value = ''
  passwordMsg.value = ''
  passwordError.value = ''
  showPasswordModal.value = true
}

async function handleResetPassword() {
  passwordError.value = ''
  passwordMsg.value = ''

  if (!selectedUserForPassword.value) return

  const p1 = newPasswordInput.value.trim()
  const p2 = confirmPasswordInput.value.trim()

  if (!p1) {
    passwordError.value = 'Password cannot be empty.'
    return
  }
  if (p1.length < 4) {
    passwordError.value = 'Password must be at least 4 characters long.'
    return
  }
  if (p1 !== p2) {
    passwordError.value = 'New password and confirmation do not match.'
    return
  }

  isSavingPassword.value = true
  try {
    await authService.adminResetPassword(selectedUserForPassword.value.username, p1)
    passwordMsg.value = `Password for @${selectedUserForPassword.value.username} has been reset successfully.`
    setTimeout(() => {
      showPasswordModal.value = false
    }, 1200)
  } catch (err: any) {
    passwordError.value = err?.message || 'Failed to reset password.'
  } finally {
    isSavingPassword.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>Accounts & User Management</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium font-mono">
            Administration
          </span>
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Dedicated management for administrative accounts, role privileges, and credentials.
        </p>
      </div>

      <!-- Tab Switcher -->
      <div class="flex items-center gap-1 bg-card border rounded-lg p-1 self-start sm:self-auto shrink-0 shadow-2xs">
        <button
          type="button"
          class="px-3 py-1 text-xs rounded-md transition-colors font-medium cursor-pointer"
          :class="activeTab === 'users' ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'users'"
        >
          User Accounts ({{ users.length }})
        </button>
        <button
          type="button"
          class="px-3 py-1 text-xs rounded-md transition-colors font-medium cursor-pointer"
          :class="activeTab === 'roles' ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'roles'"
        >
          Roles & Permissions
        </button>
      </div>
    </div>

    <!-- TAB 1: USER ACCOUNTS -->
    <div v-if="activeTab === 'users'" class="space-y-4">
      <!-- Search Toolbar -->
      <div class="flex items-center justify-between gap-3">
        <div class="relative w-full sm:w-72">
          <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            placeholder="Search accounts, names, emails..."
            class="pl-8 text-xs h-8 bg-card"
          />
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
              <TableHead class="font-semibold text-foreground text-right w-[140px]">Actions</TableHead>
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
                    <div class="font-semibold text-foreground">{{ u.name }}</div>
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
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7 text-xs gap-1.5 cursor-pointer"
                  @click="openPasswordModal(u)"
                >
                  <KeyRound class="size-3 text-muted-foreground" />
                  <span>Reset Password</span>
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- Info note -->
      <div class="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Lock class="size-4 text-primary shrink-0" />
          <span>Accounts authenticate securely using salted SHA-256 password hashing persisted in local storage.</span>
        </div>
        <span class="font-mono text-[11px]">System Accounts</span>
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
            <div class="space-y-1 pt-1 font-medium text-foreground">
              <div class="flex items-center gap-2"><Check class="size-3.5 text-emerald-600" /> Full biometric terminal and sync controls</div>
              <div class="flex items-center gap-2"><Check class="size-3.5 text-emerald-600" /> Attendance override & manual approval authority</div>
              <div class="flex items-center gap-2"><Check class="size-3.5 text-emerald-600" /> Work Group and schedule policy management</div>
              <div class="flex items-center gap-2"><Check class="size-3.5 text-emerald-600" /> User account & password administration</div>
              <div class="flex items-center gap-2"><Check class="size-3.5 text-emerald-600" /> Payroll batch generation & report export</div>
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
            <div class="space-y-1 pt-1 font-medium text-foreground">
              <div class="flex items-center gap-2"><Check class="size-3.5 text-emerald-600" /> Employee directory and profile management</div>
              <div class="flex items-center gap-2"><Check class="size-3.5 text-emerald-600" /> Daily attendance inspection and reporting</div>
              <div class="flex items-center gap-2"><Check class="size-3.5 text-emerald-600" /> Leave and overtime request submissions</div>
              <div class="flex items-center gap-2"><Check class="size-3.5 text-emerald-600" /> Excel data imports & export generation</div>
              <div class="flex items-center gap-2 text-muted-foreground/60"><Lock class="size-3.5" /> Hardware socket configuration restricted</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Password Reset Dialog -->
    <Dialog v-model:open="showPasswordModal">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-base font-bold">
            <KeyRound class="size-4 text-primary" />
            <span>Reset Account Password</span>
          </DialogTitle>
          <DialogDescription class="text-xs text-muted-foreground">
            Set a new password for account <strong>@{{ selectedUserForPassword?.username }}</strong> ({{ selectedUserForPassword?.name }}).
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-3 py-2 text-xs">
          <div v-if="passwordError" class="p-2.5 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-xs">
            {{ passwordError }}
          </div>
          <div v-if="passwordMsg" class="p-2.5 rounded-md border border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-1.5">
            <CheckCircle2 class="size-4 shrink-0 text-emerald-600" />
            <span>{{ passwordMsg }}</span>
          </div>

          <div class="space-y-1.5">
            <label class="font-medium text-foreground">New Password</label>
            <Input
              v-model="newPasswordInput"
              type="password"
              placeholder="Minimum 4 characters"
              class="h-8 text-xs"
            />
          </div>

          <div class="space-y-1.5">
            <label class="font-medium text-foreground">Confirm New Password</label>
            <Input
              v-model="confirmPasswordInput"
              type="password"
              placeholder="Re-type new password"
              class="h-8 text-xs"
            />
          </div>
        </div>

        <DialogFooter class="border-t pt-3 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            class="h-8 text-xs cursor-pointer"
            @click="showPasswordModal = false"
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            class="h-8 text-xs font-semibold cursor-pointer"
            :disabled="isSavingPassword"
            @click="handleResetPassword"
          >
            <span v-if="isSavingPassword">Saving...</span>
            <span v-else>Update Password</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
