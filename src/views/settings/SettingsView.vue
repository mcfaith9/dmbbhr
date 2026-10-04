<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  Layers,
  Cpu,
  Clock,
  CalendarDays,
  Server,
  Cable,
  Globe,
  ArrowRight,
  Sparkles,
  Sliders,
  CheckCircle2
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { liveAttendanceService } from '@/services/liveAttendance'

const router = useRouter()
const route = useRoute()
const deviceStatus = liveAttendanceService.deviceStatus

// Check for deep links / legacy queries and redirect if requested
onMounted(() => {
  const cat = route.query.category as string | undefined
  const sec = (route.query.section || route.query.tab) as string | undefined

  if (cat === 'attendance' || sec === 'workgroups' || sec === 'rules' || sec === 'holidays') {
    router.replace({ path: '/settings/attendance', query: sec ? { tab: sec } : undefined })
  } else if (cat === 'system' || sec === 'devices' || sec === 'network' || sec === 'integrations') {
    router.replace({ path: '/settings/system', query: sec ? { tab: sec } : undefined })
  } else if (cat === 'accounts' || sec === 'users' || sec === 'roles') {
    router.replace('/users')
  }
})

function navigateTo(path: string) {
  router.push(path)
}
</script>

<template>
  <div class="space-y-6 max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>Application Settings</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium font-mono">
            Configuration
          </span>
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Dedicated system configuration for attendance policies, work groups, biometric hardware, and integrations.
        </p>
      </div>

      <!-- Quick Environment Context -->
      <div class="flex items-center gap-2">
        <Badge variant="outline" class="text-xs gap-1.5 py-1 px-2.5 bg-card">
          <span class="size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span class="font-mono text-[11px]">DBB Cebu (Main Branch)</span>
        </Badge>
      </div>
    </div>

    <!-- Overview Banner -->
    <div class="rounded-xl border bg-linear-to-r from-primary/5 via-card to-muted/20 p-5 shadow-xs">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles class="size-4 text-primary" />
              Settings & Policy Administration
            </span>
          </div>
          <p class="text-xs text-muted-foreground max-w-2xl leading-relaxed">
            Select a configuration category below to customize shift parameters, manage public holidays, monitor biometric listeners, and configure enterprise integration protocols. User accounts are managed under the top-level <strong>Accounts</strong> navigation.
          </p>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <div class="rounded-lg border bg-card px-3 py-2 text-xs flex items-center gap-2 shadow-2xs">
            <Server class="size-3.5 text-primary" />
            <div>
              <div class="font-medium text-foreground text-[11px]">Primary Hardware Reader</div>
              <div class="text-[10px] text-muted-foreground font-mono">
                B-29b ({{ deviceStatus.status.toUpperCase() }})
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Settings Categories Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
      <!-- 1. Attendance Configuration Card -->
      <div
        class="group relative rounded-xl border bg-card p-6 shadow-xs hover:shadow-md transition-all duration-200 hover:border-primary/50 cursor-pointer flex flex-col justify-between"
        @click="navigateTo('/settings/attendance')"
      >
        <div class="space-y-4">
          <!-- Icon & Header -->
          <div class="flex items-start justify-between gap-3">
            <div class="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold border border-primary/20 group-hover:scale-105 transition-transform duration-200">
              <Layers class="size-6 text-primary" />
            </div>
            <Badge variant="outline" class="text-xs font-mono bg-muted/30">
              Work Groups • Rules • Holidays
            </Badge>
          </div>

          <!-- Title & Description -->
          <div class="space-y-1.5">
            <h2 class="text-base font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
              <span>Attendance Configuration</span>
            </h2>
            <p class="text-xs text-muted-foreground leading-relaxed">
              Configure work groups, attendance rules, holidays, and other attendance-related settings.
            </p>
          </div>

          <!-- Feature Highlights List -->
          <div class="space-y-2 pt-2 border-t text-xs">
            <div class="flex items-center justify-between p-2 rounded-lg bg-muted/40">
              <span class="text-muted-foreground flex items-center gap-2">
                <Clock class="size-3.5 text-emerald-600 dark:text-emerald-400" />
                Work Groups & Shifts
              </span>
              <span class="font-medium text-foreground text-[11px]">Standard IN, Lunch & Auto OUT</span>
            </div>

            <div class="flex items-center justify-between p-2 rounded-lg bg-muted/40">
              <span class="text-muted-foreground flex items-center gap-2">
                <Sliders class="size-3.5 text-primary" />
                Attendance Rules
              </span>
              <span class="font-medium text-foreground text-[11px]">Grace periods & single-punch policy</span>
            </div>

            <div class="flex items-center justify-between p-2 rounded-lg bg-muted/40">
              <span class="text-muted-foreground flex items-center gap-2">
                <CalendarDays class="size-3.5 text-amber-600 dark:text-amber-400" />
                Holidays Calendar
              </span>
              <span class="font-medium text-foreground text-[11px]">Regular & Special Non-Working days</span>
            </div>
          </div>
        </div>

        <!-- Action Link -->
        <div class="mt-6 pt-4 border-t flex items-center justify-between">
          <span class="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            Configure attendance policies
          </span>
          <Button
            size="sm"
            class="h-8 gap-1.5 text-xs font-medium cursor-pointer"
            @click.stop="navigateTo('/settings/attendance')"
          >
            <span>Open Attendance Configuration</span>
            <ArrowRight class="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </div>
      </div>

      <!-- 2. System & Integrations Card -->
      <div
        class="group relative rounded-xl border bg-card p-6 shadow-xs hover:shadow-md transition-all duration-200 hover:border-primary/50 cursor-pointer flex flex-col justify-between"
        @click="navigateTo('/settings/system')"
      >
        <div class="space-y-4">
          <!-- Icon & Header -->
          <div class="flex items-start justify-between gap-3">
            <div class="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold border border-primary/20 group-hover:scale-105 transition-transform duration-200">
              <Cpu class="size-6 text-primary" />
            </div>
            <Badge variant="outline" class="text-xs font-mono bg-muted/30">
              Hardware • Network • APIs
            </Badge>
          </div>

          <!-- Title & Description -->
          <div class="space-y-1.5">
            <h2 class="text-base font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
              <span>System & Integrations</span>
            </h2>
            <p class="text-xs text-muted-foreground leading-relaxed">
              Manage biometric devices, network configuration, and external system integrations.
            </p>
          </div>

          <!-- Feature Highlights List -->
          <div class="space-y-2 pt-2 border-t text-xs">
            <div class="flex items-center justify-between p-2 rounded-lg bg-muted/40">
              <span class="text-muted-foreground flex items-center gap-2">
                <Server class="size-3.5 text-primary" />
                Biometric Devices
              </span>
              <span class="font-medium text-foreground text-[11px]">TCP/IP 4370 hardware & ping test</span>
            </div>

            <div class="flex items-center justify-between p-2 rounded-lg bg-muted/40">
              <span class="text-muted-foreground flex items-center gap-2">
                <Cable class="size-3.5 text-emerald-600 dark:text-emerald-400" />
                Network Settings
              </span>
              <span class="font-medium text-foreground text-[11px]">Socket bridge, Dexie DB & timezone</span>
            </div>

            <div class="flex items-center justify-between p-2 rounded-lg bg-muted/40">
              <span class="text-muted-foreground flex items-center gap-2">
                <Globe class="size-3.5 text-amber-600 dark:text-amber-400" />
                External Integrations
              </span>
              <span class="font-medium text-foreground text-[11px]">Holiday API, Payroll & Cloud sync</span>
            </div>
          </div>
        </div>

        <!-- Action Link -->
        <div class="mt-6 pt-4 border-t flex items-center justify-between">
          <span class="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            Manage hardware & network
          </span>
          <Button
            size="sm"
            class="h-8 gap-1.5 text-xs font-medium cursor-pointer"
            @click.stop="navigateTo('/settings/system')"
          >
            <span>Open System & Integrations</span>
            <ArrowRight class="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </div>
      </div>
    </div>

    <!-- Quick Accounts Reference Footer Notice -->
    <div class="rounded-lg border bg-muted/30 p-3.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-muted-foreground">
      <div class="flex items-center gap-2">
        <CheckCircle2 class="size-4 text-emerald-600 shrink-0" />
        <span>
          Looking for User Accounts, Roles & Permissions, or Password resets?
        </span>
      </div>
      <router-link
        to="/users"
        class="inline-flex items-center gap-1 font-semibold text-primary hover:underline self-start sm:self-auto text-xs"
      >
        <span>Go to Accounts Navigation</span>
        <ArrowRight class="size-3" />
      </router-link>
    </div>
  </div>
</template>
