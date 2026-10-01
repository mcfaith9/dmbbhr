<script setup lang="ts">
import { ref } from "vue"
import { useRouter } from 'vue-router'
import { authService } from '@/services/auth'
import type { HTMLAttributes } from "vue"
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()

const router = useRouter()
const username = ref('Admin')
const password = ref('password')
const errorMessage = ref('')
const isLoading = ref(false)

async function handleSubmit(e: Event) {
  e.preventDefault()
  errorMessage.value = ''
  isLoading.value = true

  try {
    await authService.login({
      username: username.value,
      password: password.value
    })
    router.push('/dashboard')
  } catch (err: any) {
    errorMessage.value = err?.message || 'Login failed'
  } finally {
    isLoading.value = false
  }
}

function fillDemo(user: 'Admin' | 'HR' | 'dmbbhr') {
  username.value = user
  password.value = 'password'
}
</script>

<template>
  <form :class="cn('flex flex-col gap-6', props.class)" @submit="handleSubmit">
    <FieldGroup>
      <div class="flex flex-col items-center gap-1 text-center">
        <h1 class="text-2xl font-bold">
          Login to your account
        </h1>
        <p class="text-muted-foreground text-sm text-balance">
          Enter your username or email to access DMBBHR
        </p>
      </div>

      <div v-if="errorMessage" class="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
        {{ errorMessage }}
      </div>

      <Field>
        <FieldLabel for="username">
          Username / Email
        </FieldLabel>
        <Input
          id="username"
          v-model="username"
          type="text"
          placeholder="Admin or HR"
          required
        />
      </Field>

      <Field>
        <div class="flex items-center">
          <FieldLabel for="password">
            Password
          </FieldLabel>
          <a
            href="#"
            class="ml-auto text-sm underline-offset-4 hover:underline"
            @click.prevent
          >
            Forgot your password?
          </a>
        </div>
        <Input
          id="password"
          v-model="password"
          type="password"
          placeholder="••••••••"
          required
        />
      </Field>

      <Field>
        <Button type="submit" class="w-full" :disabled="isLoading">
          <span v-if="isLoading">Signing in...</span>
          <span v-else>Login</span>
        </Button>
      </Field>

      <FieldSeparator>Default Application Accounts</FieldSeparator>

      <div class="grid grid-cols-2 gap-2 text-xs">
        <button
          type="button"
          class="rounded border bg-muted/40 p-2 text-left hover:bg-muted transition-colors"
          @click="fillDemo('Admin')"
        >
          <div class="font-semibold text-foreground">Admin</div>
          <div class="text-[11px] text-muted-foreground">Administrator</div>
        </button>
        <button
          type="button"
          class="rounded border bg-muted/40 p-2 text-left hover:bg-muted transition-colors"
          @click="fillDemo('HR')"
        >
          <div class="font-semibold text-foreground">HR</div>
          <div class="text-[11px] text-muted-foreground">Human Resources</div>
        </button>
      </div>

      <FieldDescription class="text-center text-xs text-muted-foreground">
        Local Network Biometric Attendance & HR System
      </FieldDescription>
    </FieldGroup>
  </form>
</template>
