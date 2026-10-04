<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Shield,
  UserRound,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2
} from '@lucide/vue'
import { authService, getRoleDisplayName } from '@/services/auth'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const currentUser = authService.currentUser

const roleName = computed(() => {
  return getRoleDisplayName(currentUser.value?.role)
})

const usernameDisplay = computed(() => {
  return currentUser.value?.username || 'Admin'
})

// Password Form State
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')

const showCurrentPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

const isSubmitting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

function resetForm() {
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  showCurrentPassword.value = false
  showNewPassword.value = false
  showConfirmPassword.value = false
  errorMessage.value = ''
  successMessage.value = ''
}

watch(
  () => props.open,
  (val) => {
    if (val) {
      resetForm()
    }
  }
)

async function handleChangePassword() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!currentPassword.value) {
    errorMessage.value = 'Current password is required.'
    return
  }
  if (!newPassword.value) {
    errorMessage.value = 'New password is required.'
    return
  }
  if (!confirmPassword.value) {
    errorMessage.value = 'Please confirm your new password.'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = 'New password and confirmation do not match.'
    return
  }
  if (newPassword.value.length < 4) {
    errorMessage.value = 'New password must be at least 4 characters long.'
    return
  }
  if (currentPassword.value === newPassword.value) {
    errorMessage.value = 'New password must be different from current password.'
    return
  }

  isSubmitting.value = true

  try {
    const res = await authService.changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
      confirmPassword: confirmPassword.value,
    })

    successMessage.value = res.message || 'Password changed successfully.'
    // Clear sensitive password inputs
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (err: any) {
    errorMessage.value = err?.message || 'Failed to change password. Please check your credentials.'
  } finally {
    isSubmitting.value = false
  }
}

function handleClose() {
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(val) => emit('update:open', val)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 text-base font-semibold">
          <KeyRound class="size-4 text-primary" />
          <span>Profile Settings</span>
        </DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          Manage your account and security.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-1">
        <!-- Account Section -->
        <div class="space-y-2">
          <div class="flex items-center justify-between border-b pb-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <UserRound class="size-3.5 text-primary" />
              Account
            </span>
          </div>

          <div class="rounded-lg border bg-muted/30 p-3 space-y-2 text-xs">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Username</span>
              <span class="font-medium text-foreground font-mono bg-background px-2 py-0.5 rounded border">
                {{ usernameDisplay }}
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Role</span>
              <Badge variant="secondary" class="font-normal text-xs">
                {{ roleName }}
              </Badge>
            </div>
          </div>
        </div>

        <!-- Security Section -->
        <form @submit.prevent="handleChangePassword" class="space-y-3 pt-1">
          <div class="flex items-center justify-between border-b pb-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Shield class="size-3.5 text-primary" />
              Security
            </span>
          </div>

          <!-- Current Password -->
          <div class="space-y-1">
            <label class="text-xs font-medium text-foreground">
              Current Password <span class="text-destructive">*</span>
            </label>
            <div class="relative">
              <Input
                v-model="currentPassword"
                :type="showCurrentPassword ? 'text' : 'password'"
                placeholder="Enter current password"
                class="pr-9 h-8 text-xs"
                required
                :disabled="isSubmitting"
              />
              <button
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                @click="showCurrentPassword = !showCurrentPassword"
                tabindex="-1"
              >
                <EyeOff v-if="showCurrentPassword" class="size-3.5" />
                <Eye v-else class="size-3.5" />
              </button>
            </div>
          </div>

          <!-- New Password -->
          <div class="space-y-1">
            <label class="text-xs font-medium text-foreground">
              New Password <span class="text-destructive">*</span>
            </label>
            <div class="relative">
              <Input
                v-model="newPassword"
                :type="showNewPassword ? 'text' : 'password'"
                placeholder="Enter new password (min. 4 characters)"
                class="pr-9 h-8 text-xs"
                required
                :disabled="isSubmitting"
              />
              <button
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                @click="showNewPassword = !showNewPassword"
                tabindex="-1"
              >
                <EyeOff v-if="showNewPassword" class="size-3.5" />
                <Eye v-else class="size-3.5" />
              </button>
            </div>
          </div>

          <!-- Confirm New Password -->
          <div class="space-y-1">
            <label class="text-xs font-medium text-foreground">
              Confirm New Password <span class="text-destructive">*</span>
            </label>
            <div class="relative">
              <Input
                v-model="confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                placeholder="Re-enter new password"
                class="pr-9 h-8 text-xs"
                required
                :disabled="isSubmitting"
              />
              <button
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                @click="showConfirmPassword = !showConfirmPassword"
                tabindex="-1"
              >
                <EyeOff v-if="showConfirmPassword" class="size-3.5" />
                <Eye v-else class="size-3.5" />
              </button>
            </div>
          </div>

          <!-- Success Message Feedback -->
          <div
            v-if="successMessage"
            class="flex items-center gap-2 p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs animate-in fade-in"
          >
            <CheckCircle2 class="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{{ successMessage }}</span>
          </div>

          <!-- Error Message Feedback -->
          <div
            v-if="errorMessage"
            class="flex items-center gap-2 p-2.5 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs animate-in fade-in"
          >
            <AlertCircle class="size-4 shrink-0" />
            <span>{{ errorMessage }}</span>
          </div>

          <DialogFooter class="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="h-8 text-xs"
              :disabled="isSubmitting"
              @click="handleClose"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              class="h-8 text-xs gap-1.5 font-medium"
              :disabled="isSubmitting"
            >
              <Loader2 v-if="isSubmitting" class="size-3.5 animate-spin" />
              <KeyRound v-else class="size-3.5" />
              <span>{{ isSubmitting ? 'Changing Password...' : 'Change Password' }}</span>
            </Button>
          </DialogFooter>
        </form>
      </div>
    </DialogContent>
  </Dialog>
</template>
