<script setup lang="ts">
import { SEED_USERS } from '@/services/seedData'
import { Badge } from '@/components/ui/badge'
import { getRoleDisplayName } from '@/services/auth'

const users = SEED_USERS
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground">
          System Users & Administrator Access
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Configured system administrators with future access to DBB Cebu, DBB Negros, and DBB Iloilo.
        </p>
      </div>
    </div>

    <div class="rounded-xl border bg-card p-5 shadow-xs space-y-4">
      <div class="divide-y text-xs">
        <div v-for="u in users" :key="u.id" class="py-3 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
              {{ u.username.slice(0, 2).toUpperCase() }}
            </div>
            <div>
              <div class="font-medium text-foreground text-sm flex items-center gap-2">
                <span>{{ u.name }}</span>
                <span class="font-mono text-xs text-muted-foreground">(@{{ u.username }})</span>
              </div>
              <div class="text-[11px] text-muted-foreground mt-0.5">
                Email: {{ u.email }} • Accessible Branches: DBB Cebu, DBB Negros, DBB Iloilo
              </div>
            </div>
          </div>
          <Badge :variant="u.role === 'admin' ? 'default' : 'secondary'" class="text-xs font-mono">
            {{ getRoleDisplayName(u.role) }}
          </Badge>
        </div>
      </div>
    </div>
  </div>
</template>
