<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import { liveAttendanceService } from '@/services/liveAttendance'
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'

const route = useRoute()
const deviceStatus = liveAttendanceService.deviceStatus

onMounted(() => {
  liveAttendanceService.connect()
})

const breadcrumbs = computed(() => {
  const metaBreadcrumb = route.meta.breadcrumb as string[] | undefined
  if (metaBreadcrumb && metaBreadcrumb.length > 0) {
    return metaBreadcrumb
  }
  return ['DMBBHR', (route.meta.title as string) || 'Dashboard']
})
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <!-- Top App Header adhering to existing visual style -->
        <header class="flex h-14 shrink-0 items-center justify-between border-b px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div class="flex items-center gap-2">
            <SidebarTrigger class="-ml-1" />
            <Separator orientation="vertical" class="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <template v-for="(crumb, idx) in breadcrumbs" :key="crumb">
                  <BreadcrumbItem v-if="idx < breadcrumbs.length - 1" class="hidden md:block">
                    <BreadcrumbLink href="#">
                      {{ crumb }}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator v-if="idx < breadcrumbs.length - 1" class="hidden md:block" />
                  <BreadcrumbItem v-else>
                    <BreadcrumbPage>{{ crumb }}</BreadcrumbPage>
                  </BreadcrumbItem>
                </template>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div class="flex items-center gap-3">
            <!-- Active Location Indicator -->
            <div class="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-muted/40 text-xs">
              <span class="size-2 rounded-full bg-emerald-500" />
              <span class="font-medium text-foreground">DBB Cebu</span>
              <span class="text-muted-foreground text-[10px]">(Active Branch)</span>
            </div>
            <!-- Live Biometric Hardware Status (Single Source of Truth) -->
            <router-link
              to="/devices"
              class="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs shadow-xs transition-colors hover:opacity-90"
              :class="[
                deviceStatus.status === 'online'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : (deviceStatus.status === 'connecting'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                    : 'bg-destructive/10 border-destructive/30 text-destructive')
              ]"
              :title="`Biometric Device: ${deviceStatus.model}\nTarget: ${deviceStatus.ip}:${deviceStatus.port}\nStatus: ${deviceStatus.status.toUpperCase()}\nDetails: ${deviceStatus.reason || 'None'}\nLast Connected: ${deviceStatus.lastConnected || 'Never'}\nLast Event: ${deviceStatus.lastEvent || 'None'}`"
            >
              <span class="relative flex size-2">
                <span
                  v-if="deviceStatus.status === 'online'"
                  class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
                />
                <span
                  class="relative inline-flex rounded-full size-2"
                  :class="[
                    deviceStatus.status === 'online'
                      ? 'bg-emerald-500'
                      : (deviceStatus.status === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-destructive')
                  ]"
                />
              </span>
              <span class="font-medium text-xs">
                {{ deviceStatus.status === 'online' ? 'Online' : (deviceStatus.status === 'connecting' ? 'Connecting' : 'Offline') }}
              </span>
              <span class="font-mono text-[11px] text-muted-foreground hidden md:inline">
                {{ deviceStatus.ip }}:{{ deviceStatus.port }}
              </span>
            </router-link>
          </div>
        </header>

        <!-- Dynamic Routed Content Area -->
        <div class="flex-1 p-4 md:p-6 overflow-y-auto">
          <router-view />
        </div>
      </SidebarInset>
    </SidebarProvider>
  </div>
</template>
