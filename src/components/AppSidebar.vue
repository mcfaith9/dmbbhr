<script setup lang="ts">
import type { SidebarProps } from '@/components/ui/sidebar'
import {
  LayoutDashboard,
  Clock,
  UsersRound,
  Fingerprint,
  CalendarDays,
  WalletCards,
  ChartPie,
  Settings,
} from "@lucide/vue"
import { h, ref, computed } from "vue"
import { useRoute, useRouter } from 'vue-router'
import NavUser from '@/components/NavUser.vue'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { authService } from '@/services/auth'

const props = withDefaults(defineProps<SidebarProps>(), {
  collapsible: "icon",
})

const route = useRoute()
const router = useRouter()
const currentUser = authService.currentUser

const userData = computed(() => ({
  name: currentUser.value?.name || (currentUser.value?.username === 'HR' ? 'Human Resources' : 'Administrator'),
  username: currentUser.value?.username || 'Admin',
  email: currentUser.value?.email || (currentUser.value?.username === 'HR' ? 'hr@dmbb.com' : 'admin@dmbb.com'),
  avatar: currentUser.value?.avatar || "",
  role: currentUser.value?.role || "admin",
}))

interface NavItem {
  id: string
  title: string
  icon: any
  url?: string
  badge?: string
  children?: {
    title: string
    url: string
    description?: string
  }[]
}

const navSections: NavItem[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    id: "attendance",
    title: "Attendance",
    icon: Clock,
    children: [
      { title: "Daily Attendance", url: "/attendance/daily", description: "Aggregated daily in/out entries" },
      { title: "Attendance Logs", url: "/attendance/logs", description: "Raw biometric scans & auditable logs" },
    ],
  },
  {
    id: "employees",
    title: "Employees",
    url: "/employees",
    icon: UsersRound,
  },
  {
    id: "devices",
    title: "Biometric Devices",
    url: "/devices",
    icon: Fingerprint,
    badge: "",
  },
  {
    id: "time_management",
    title: "Time Management",
    icon: CalendarDays,
    children: [
      { title: "Schedules", url: "/schedules", description: "Shift assignments & grace periods" },
      { title: "Leave", url: "/leave", description: "Leave requests and approval" },
      { title: "Overtime", url: "/overtime", description: "OT pre-approvals and calculations" },
      { title: "Holidays", url: "/holidays", description: "Regular and special non-working" },
    ],
  },
  {
    id: "payroll",
    title: "Payroll",
    icon: WalletCards,
    children: [
      { title: "Payroll Periods", url: "/payroll/periods", description: "Cut-offs and batch generation" },
      { title: "Payroll Records", url: "/payroll/records", description: "Audited payroll sheets" },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    url: "/reports",
    icon: ChartPie,
  },
  {
    id: "administration",
    title: "Administration",
    icon: Settings,
    children: [
      { title: "Accounts", url: "/users", description: "Manage user accounts, roles, and access" },
      { title: "Settings", url: "/settings", description: "System & branch preferences" },
    ],
  },
]

const activeSectionId = ref<string>('attendance')

const activeItem = computed(() => {
  const currentPath = route.path
  if (currentPath.startsWith('/attendance')) return navSections.find(s => s.id === 'attendance')!
  if (currentPath.startsWith('/employees')) return navSections.find(s => s.id === 'employees')!
  if (currentPath.startsWith('/devices')) return navSections.find(s => s.id === 'devices')!
  if (currentPath.startsWith('/schedules') || currentPath.startsWith('/leave') || currentPath.startsWith('/overtime') || currentPath.startsWith('/holidays')) {
    return navSections.find(s => s.id === 'time_management')!
  }
  if (currentPath.startsWith('/payroll')) return navSections.find(s => s.id === 'payroll')!
  if (currentPath.startsWith('/reports')) return navSections.find(s => s.id === 'reports')!
  if (currentPath.startsWith('/users') || currentPath.startsWith('/settings')) {
    return navSections.find(s => s.id === 'administration')!
  }
  return navSections.find(s => s.id === 'dashboard')!
})

const searchQuery = ref('')

const filteredChildren = computed(() => {
  const current = activeItem.value
  if (!current.children) return []
  if (!searchQuery.value.trim()) return current.children
  const q = searchQuery.value.toLowerCase()
  return current.children.filter(c =>
    c.title.toLowerCase().includes(q) || (c.description && c.description.toLowerCase().includes(q))
  )
})

function handlePrimaryClick(item: NavItem) {
  activeSectionId.value = item.id
  if (item.url) {
    router.push(item.url)
  } else if (item.children && item.children.length > 0) {
    router.push(item.children[0].url)
  }
}

function isPathActive(url: string): boolean {
  return route.path === url
}
</script>

<template>
  <Sidebar
    class="overflow-hidden *:data-[sidebar=sidebar]:flex-row"
    v-bind="props"
  >
    <Sidebar
      collapsible="none"
      class="w-[calc(var(--sidebar-width-icon)+1px)]! border-r"
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" as-child class="md:h-8 md:p-0">
              <router-link to="/dashboard" title="DMBBHR">
                <div class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Fingerprint class="size-4" />
                </div>
                <div class="grid flex-1 text-left text-sm leading-tight">
                  <span class="truncate font-semibold tracking-tight">DMBBHR</span>
                  <span class="truncate text-xs text-muted-foreground">DBB Cebu</span>
                </div>
              </router-link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent class="px-1.5 md:px-0">
            <SidebarMenu>
              <SidebarMenuItem v-for="item in navSections" :key="item.id">
                <SidebarMenuButton
                  :tooltip="h('div', { hidden: false }, item.title)"
                  :is-active="activeItem.id === item.id"
                  class="px-2.5 md:px-2"
                  @click="handlePrimaryClick(item)"
                >
                  <component :is="item.icon" />
                  <span>{{ item.title }}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser :user="userData" />
      </SidebarFooter>
    </Sidebar>

    <Sidebar collapsible="none" class="hidden flex-1 md:flex">
      <SidebarHeader class="gap-3.5 border-b p-4">
        <div class="flex w-full items-center justify-between">
          <div class="text-base font-semibold text-foreground flex items-center gap-2">
            <span>{{ activeItem.title }}</span>
            <span
              v-if="activeItem.badge"
              class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
            >
              {{ activeItem.badge }}
            </span>
          </div>
        </div>

        <div v-if="activeItem.children && activeItem.children.length > 0">
          <SidebarInput v-model="searchQuery" placeholder="Filter navigation..." />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup v-if="activeItem.children && activeItem.children.length > 0" class="px-0">
          <SidebarGroupContent>
            <router-link
              v-for="sub in filteredChildren"
              :key="sub.url"
              :to="sub.url"
              :class="[
                'flex flex-col items-start gap-1 border-b p-4 text-sm leading-tight transition-colors last:border-b-0',
                isPathActive(sub.url)
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium border-l-2 border-l-primary'
                  : 'hover:bg-sidebar-accent/50 text-muted-foreground hover:text-foreground'
              ]"
            >
              <div class="flex w-full items-center gap-2">
                <span class="text-sm font-medium text-foreground">{{ sub.title }}</span>
                <span v-if="isPathActive(sub.url)" class="ml-auto flex size-2 rounded-full bg-primary" />
              </div>
              <span v-if="sub.description" class="text-xs text-muted-foreground line-clamp-2">
                {{ sub.description }}
              </span>
            </router-link>
          </SidebarGroupContent>
        </SidebarGroup>

        <div v-else class="p-4 space-y-4 text-xs">
          <div class="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div class="font-medium text-foreground flex items-center justify-between">
              <span>Branch Context</span>
              <span class="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold text-[10px]">Active</span>
            </div>
            <p class="text-muted-foreground text-[11px] leading-relaxed">
              Connected to <strong>DBB Cebu</strong>. Biometric device B-29b is communicating over local TCP/IP :4370.
            </p>
          </div>

          <div class="space-y-1.5">
            <div class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Quick Shortcuts
            </div>
            <router-link
              to="/attendance/logs"
              class="flex items-center gap-2 rounded-md p-2 hover:bg-muted text-foreground transition-colors"
            >
              <Clock class="size-3.5 text-muted-foreground" />
              <span>Inspect Raw Scans</span>
            </router-link>
            <router-link
              to="/devices"
              class="flex items-center gap-2 rounded-md p-2 hover:bg-muted text-foreground transition-colors"
            >
              <Fingerprint class="size-3.5 text-muted-foreground" />
              <span>Device Health (B-29b)</span>
            </router-link>
            <router-link
              to="/employees"
              class="flex items-center gap-2 rounded-md p-2 hover:bg-muted text-foreground transition-colors"
            >
              <UsersRound class="size-3.5 text-muted-foreground" />
              <span>Employee Directory</span>
            </router-link>
          </div>
        </div>
      </SidebarContent>

      <SidebarFooter class="border-t p-3 text-[11px] text-muted-foreground">
        <div class="flex items-center justify-between">
          <span>BISBIO B-29b</span>
          <span class="flex items-center gap-1 text-emerald-600 font-medium">
            app v.0.0.1
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  </Sidebar>
</template>
