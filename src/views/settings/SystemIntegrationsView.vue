<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Server,
  Cable,
  Globe,
  Database,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  ArrowLeft,
  Building,
  FolderGit2,
  Calendar as CalendarIcon,
  ExternalLink,
  Monitor,
  Sliders
} from '@lucide/vue'
import { liveAttendanceService } from '@/services/liveAttendance'
import { punchDisplayService } from '@/services/punchDisplay'
import { authService } from '@/services/auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

const route = useRoute()
const currentUser = authService.currentUser
const deviceStatus = liveAttendanceService.deviceStatus

type SystemTab = 'devices' | 'network' | 'integrations'
const activeTab = ref<SystemTab>('devices')

const isConnectingDevice = ref(false)
const pingStatus = ref<'idle' | 'success' | 'failed'>('idle')
const pingMessage = ref('')

async function testDeviceConnection() {
  isConnectingDevice.value = true
  pingStatus.value = 'idle'
  pingMessage.value = ''
  try {
    await liveAttendanceService.connect()
    pingStatus.value = 'success'
    pingMessage.value = 'Hardware terminal socket connection responded (192.168.1.201:4370 TCP/IP).'
  } catch (err: any) {
    pingStatus.value = 'failed'
    pingMessage.value = err?.message || 'Device socket bridge unreachable.'
  } finally {
    isConnectingDevice.value = false
  }
}

function syncFromRoute() {
  const tab = (route.query.tab || route.query.section) as string | undefined
  if (tab === 'devices' || tab === 'network' || tab === 'integrations') {
    activeTab.value = tab
  }
}

watch(() => [route.query.tab, route.query.section], () => {
  syncFromRoute()
})

onMounted(() => {
  syncFromRoute()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
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
          <span class="text-xs font-semibold text-foreground">System & Integrations</span>
        </div>
        <h1 class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>System & Integrations</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium font-mono">
            Hardware & APIs
          </span>
        </h1>
        <p class="text-xs text-muted-foreground">
          Manage biometric devices, network configuration, and external system integrations.
        </p>
      </div>

      <!-- Tab Switcher -->
      <div class="flex items-center gap-1 bg-card border rounded-lg p-1 self-start sm:self-auto shrink-0 shadow-2xs">
        <button
          type="button"
          class="px-3 py-1.5 text-xs rounded-md transition-all font-medium flex items-center gap-1.5 cursor-pointer"
          :class="activeTab === 'devices' ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'devices'"
        >
          <Server class="size-3.5" />
          <span>Biometric Devices</span>
        </button>
        <button
          type="button"
          class="px-3 py-1.5 text-xs rounded-md transition-all font-medium flex items-center gap-1.5 cursor-pointer"
          :class="activeTab === 'network' ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'network'"
        >
          <Cable class="size-3.5" />
          <span>Network Settings</span>
        </button>
        <button
          type="button"
          class="px-3 py-1.5 text-xs rounded-md transition-all font-medium flex items-center gap-1.5 cursor-pointer"
          :class="activeTab === 'integrations' ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'integrations'"
        >
          <Globe class="size-3.5" />
          <span>Integrations</span>
        </button>
      </div>
    </div>

    <!-- Role security notice for non-admin -->
    <div
      v-if="currentUser?.role === 'hr'"
      class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5"
    >
      <ShieldAlert class="size-4 shrink-0 text-amber-600 mt-0.5" />
      <div>
        <span class="font-bold">Human Resources View Mode:</span>
        <p class="mt-0.5">
          Biometric network hardware listeners and socket bridges are automatically managed in the background. Normal attendance tracking is operational. System-level socket ports are reserved for System Administrators.
        </p>
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- TAB 1: BIOMETRIC DEVICES -->
    <!-- ========================================================================= -->
    <div v-if="activeTab === 'devices'" class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Server class="size-4 text-primary" />
            <span>Biometric Hardware Readers</span>
          </h3>
          <p class="text-xs text-muted-foreground">
            Hardware terminals running ZKTeco standalone protocol over TCP port 4370.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            class="h-8 text-xs gap-1.5 shadow-xs cursor-pointer bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary hover:text-primary"
            @click="punchDisplayService.openPunchDisplay()"
          >
            <Monitor class="size-3.5" />
            <span>Open Punch Display</span>
            <ExternalLink class="size-3 text-muted-foreground ml-0.5" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            class="h-8 text-xs gap-1.5 shadow-xs cursor-pointer"
            :disabled="isConnectingDevice"
            @click="testDeviceConnection"
          >
            <RefreshCw class="size-3" :class="isConnectingDevice ? 'animate-spin' : ''" />
            <span>Test Hardware Ping</span>
          </Button>
        </div>
      </div>

      <div
        v-if="pingMessage"
        class="p-2.5 rounded text-xs flex items-center gap-2"
        :class="pingStatus === 'success' ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20'"
      >
        <CheckCircle2 v-if="pingStatus === 'success'" class="size-4 shrink-0 text-emerald-600" />
        <AlertCircle v-else class="size-4 shrink-0" />
        <span>{{ pingMessage }}</span>
      </div>

      <!-- Devices Grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- Device 1: Active Primary Terminal -->
        <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3 relative border-primary/30">
          <div class="flex items-center justify-between font-semibold text-sm text-foreground">
            <div class="flex items-center gap-2">
              <Server class="size-4 text-primary" />
              <span>BISMAC BISBIO B-29b</span>
            </div>
            <Badge
              :variant="deviceStatus.status === 'online' ? 'default' : (deviceStatus.status === 'connecting' ? 'secondary' : 'outline')"
              class="text-[10px] uppercase font-mono"
            >
              {{ deviceStatus.status }}
            </Badge>
          </div>

          <div class="space-y-2 text-xs">
            <div class="p-2 rounded bg-muted/40 border">
              <span class="text-muted-foreground">Terminal Location:</span>
              <div class="font-medium text-foreground">DBB Cebu Office (Main Entrance)</div>
            </div>
            <div class="p-2 rounded bg-muted/40 border">
              <span class="text-muted-foreground">Hardware IP & Port:</span>
              <div class="font-mono font-medium text-foreground">192.168.1.201 : 4370 (TCP/IP)</div>
            </div>
            <div class="p-2 rounded bg-muted/40 border">
              <span class="text-muted-foreground">Local Dev Socket Bridge:</span>
              <div class="font-mono font-medium text-foreground">ws://localhost:5174</div>
            </div>
            <div class="p-2 rounded bg-muted/40 border">
              <span class="text-muted-foreground">Serial Number:</span>
              <div class="font-mono font-medium text-foreground">0476141400046</div>
            </div>
          </div>
        </div>

        <!-- Device 2: DBB Negros (Prepared Slot) -->
        <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3 opacity-80">
          <div class="flex items-center justify-between font-semibold text-sm text-foreground">
            <div class="flex items-center gap-2">
              <Server class="size-4 text-muted-foreground" />
              <span>BIO 2 (DBB Negros)</span>
            </div>
            <Badge variant="outline" class="text-[10px] uppercase font-mono">
              Prepared Slot
            </Badge>
          </div>

          <div class="space-y-2 text-xs">
            <div class="p-2 rounded bg-muted/40 border">
              <span class="text-muted-foreground">Terminal Location:</span>
              <div class="font-medium text-foreground">DBB Negros Branch</div>
            </div>
            <div class="p-2 rounded bg-muted/40 border">
              <span class="text-muted-foreground">Hardware IP & Port:</span>
              <div class="font-mono font-medium text-foreground">192.168.2.201 : 4370 (TCP/IP)</div>
            </div>
            <div class="p-2 rounded bg-muted/40 border">
              <span class="text-muted-foreground">Connection Mode:</span>
              <div class="font-mono font-medium text-foreground">WAN VPN / Local Socket Bridge</div>
            </div>
          </div>
        </div>

        <!-- Device 3: DBB Iloilo (Prepared Slot) -->
        <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3 opacity-80">
          <div class="flex items-center justify-between font-semibold text-sm text-foreground">
            <div class="flex items-center gap-2">
              <Server class="size-4 text-muted-foreground" />
              <span>BIO 3 (DBB Iloilo)</span>
            </div>
            <Badge variant="outline" class="text-[10px] uppercase font-mono">
              Prepared Slot
            </Badge>
          </div>

          <div class="space-y-2 text-xs">
            <div class="p-2 rounded bg-muted/40 border">
              <span class="text-muted-foreground">Terminal Location:</span>
              <div class="font-medium text-foreground">DBB Iloilo Branch</div>
            </div>
            <div class="p-2 rounded bg-muted/40 border">
              <span class="text-muted-foreground">Hardware IP & Port:</span>
              <div class="font-mono font-medium text-foreground">192.168.3.201 : 4370 (TCP/IP)</div>
            </div>
            <div class="p-2 rounded bg-muted/40 border">
              <span class="text-muted-foreground">Connection Mode:</span>
              <div class="font-mono font-medium text-foreground">WAN VPN / Local Socket Bridge</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Real-Time Punch Display Configuration Card -->
      <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
          <div class="space-y-0.5">
            <h4 class="text-sm font-semibold text-foreground flex items-center gap-2">
              <Sliders class="size-4 text-primary" />
              <span>Real-Time Biometric Punch Display Preferences</span>
            </h4>
            <p class="text-xs text-muted-foreground">
              Configure kiosk timing, celebrations, and visual feedback for the dedicated punch display monitor.
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              class="h-8 gap-1.5 text-xs bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary hover:text-primary cursor-pointer"
              @click="punchDisplayService.openPunchDisplay()"
            >
              <Monitor class="size-3.5" />
              <span>Open Display Window</span>
              <ExternalLink class="size-3 text-muted-foreground ml-0.5" />
            </Button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <!-- 1. Enable Punch Display -->
          <div class="p-3 rounded-lg border bg-muted/20 space-y-2">
            <div class="flex items-center justify-between">
              <Label class="text-xs font-semibold text-foreground">Enable Punch Display</Label>
              <Switch
                :model-value="punchDisplayService.settings.value.enabled"
                @update:model-value="punchDisplayService.saveSettings({ enabled: $event })"
              />
            </div>
            <p class="text-[11px] text-muted-foreground">
              When disabled, incoming biometric scans are not forwarded to the Punch Display.
            </p>
          </div>

          <!-- 2. Display Duration -->
          <div class="p-3 rounded-lg border bg-muted/20 space-y-2">
            <Label class="text-xs font-semibold text-foreground">Display Duration</Label>
            <Select
              :model-value="String(punchDisplayService.settings.value.displayDurationSeconds || 5)"
              @update:model-value="punchDisplayService.saveSettings({ displayDurationSeconds: parseInt(String($event || '5'), 10) })"
            >
              <SelectTrigger class="h-8 text-xs bg-card">
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="3">3 seconds</SelectItem>
                  <SelectItem value="5">5 seconds (Default)</SelectItem>
                  <SelectItem value="8">8 seconds</SelectItem>
                  <SelectItem value="10">10 seconds</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <p class="text-[11px] text-muted-foreground">
              Screen hold duration before returning to idle.
            </p>
          </div>

          <!-- 3. Confetti Celebration -->
          <div class="p-3 rounded-lg border bg-muted/20 space-y-2">
            <div class="flex items-center justify-between">
              <Label class="text-xs font-semibold text-foreground">Confetti Effect</Label>
              <Switch
                :model-value="punchDisplayService.settings.value.confettiEnabled"
                @update:model-value="punchDisplayService.saveSettings({ confettiEnabled: $event })"
              />
            </div>
            <p class="text-[11px] text-muted-foreground">
              Trigger light celebration burst for qualifying on-time/early arrivals.
            </p>
          </div>

          <!-- 4. Late Visual -->
          <div class="p-3 rounded-lg border bg-muted/20 space-y-2">
            <div class="flex items-center justify-between">
              <Label class="text-xs font-semibold text-foreground">Late Visual</Label>
              <Switch
                :model-value="punchDisplayService.settings.value.lateVisualEnabled"
                @update:model-value="punchDisplayService.saveSettings({ lateVisualEnabled: $event })"
              />
            </div>
            <p class="text-[11px] text-muted-foreground">
              Show distinct visual warning when an employee arrives late.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- TAB 2: NETWORK SETTINGS -->
    <!-- ========================================================================= -->
    <div v-else-if="activeTab === 'network'" class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
      <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3">
        <div class="flex items-center gap-2 font-semibold text-sm text-foreground">
          <Cable class="size-4 text-primary" />
          <span>Biometric Hardware Listener & Ports</span>
        </div>
        <div class="space-y-2 text-xs">
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Hardware Port:</span>
            <div class="font-mono font-medium text-foreground">4370 TCP/UDP</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Local Dev Socket Bridge:</span>
            <div class="font-mono font-medium text-foreground">ws://localhost:5174</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Socket Timeout:</span>
            <div class="font-mono font-medium text-foreground">5000 ms</div>
          </div>
        </div>
      </div>

      <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3">
        <div class="flex items-center gap-2 font-semibold text-sm text-foreground">
          <Database class="size-4 text-primary" />
          <span>Backend Target & Timezone</span>
        </div>
        <div class="space-y-2 text-xs">
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">API Backend:</span>
            <div class="font-mono font-medium text-foreground">http://localhost:8000/api</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Local Persistence Engine:</span>
            <div class="font-medium text-foreground">Dexie IndexedDB (DMBBHR_LocalDB)</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Standard Timezone:</span>
            <div class="font-medium text-foreground">Philippine Standard Time (Asia/Manila UTC+08:00)</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- TAB 3: INTEGRATIONS -->
    <!-- ========================================================================= -->
    <div v-else-if="activeTab === 'integrations'" class="space-y-4">
      <div class="rounded-xl border bg-card p-5 shadow-xs space-y-4">
        <div>
          <h3 class="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Globe class="size-4 text-primary" />
            <span>External Service Integrations</span>
          </h3>
          <p class="text-xs text-muted-foreground">
            Consistent integration architecture separating local offline engines from future cloud APIs.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- 1. Holiday Provider Integration -->
          <div class="rounded-xl border p-4 space-y-3 bg-muted/10 flex flex-col justify-between">
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="font-bold text-xs text-foreground flex items-center gap-1.5">
                  <CalendarIcon class="size-3.5 text-primary" />
                  <span>Holiday Provider API</span>
                </span>
                <Badge variant="default" class="text-[10px] font-mono">Implemented</Badge>
              </div>
              <p class="text-[11px] text-muted-foreground">
                Configurable holiday provider with automatic offline fallback to local Cebu City & Philippine calendar.
              </p>
            </div>

            <div class="pt-2 border-t flex items-center justify-between">
              <span class="text-[10px] text-muted-foreground font-mono">Offline-First Engine</span>
              <router-link
                to="/settings/attendance?tab=holidays"
                class="text-primary hover:underline text-[11px] font-medium"
              >
                Configure
              </router-link>
            </div>
          </div>

          <!-- 2. Future Payroll API -->
          <div class="rounded-xl border p-4 space-y-3 bg-muted/10 opacity-80 flex flex-col justify-between">
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="font-bold text-xs text-foreground flex items-center gap-1.5">
                  <Building class="size-3.5 text-muted-foreground" />
                  <span>Enterprise Payroll API</span>
                </span>
                <Badge variant="outline" class="text-[10px] font-mono">Prepared Architecture</Badge>
              </div>
              <p class="text-[11px] text-muted-foreground">
                Integration slot for direct electronic disbursement and banking integration (BDO, BPI, UnionBank).
              </p>
            </div>

            <div class="pt-2 border-t">
              <span class="text-[10px] text-muted-foreground font-mono">Status: Ready for Extension</span>
            </div>
          </div>

          <!-- 3. Future External Attendance API -->
          <div class="rounded-xl border p-4 space-y-3 bg-muted/10 opacity-80 flex flex-col justify-between">
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="font-bold text-xs text-foreground flex items-center gap-1.5">
                  <FolderGit2 class="size-3.5 text-muted-foreground" />
                  <span>Multi-Branch Cloud Attendance</span>
                </span>
                <Badge variant="outline" class="text-[10px] font-mono">Prepared Architecture</Badge>
              </div>
              <p class="text-[11px] text-muted-foreground">
                Architecture ready for centralized cloud aggregation across DBB Cebu, DBB Negros, and DBB Iloilo.
              </p>
            </div>

            <div class="pt-2 border-t">
              <span class="text-[10px] text-muted-foreground font-mono">Status: Ready for Extension</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
