<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Server,
  Cable,
  Globe,
  Database,
  ShieldAlert,
  ArrowLeft,
  Building,
  FolderGit2,
  Calendar as CalendarIcon,
  ExternalLink,
  Monitor,
  Sliders,
  Image as ImageIcon,
  Volume2,
  AlertCircle,
  Radio,
  Wifi,
  Sparkles,
  Trash2
} from '@lucide/vue'
import { liveAttendanceService } from '@/services/liveAttendance'
import { punchDisplayService } from '@/services/punchDisplay'
import { authService } from '@/services/auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
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

type SystemTab = 'punch-display' | 'devices' | 'network' | 'integrations'
const activeTab = ref<SystemTab>('punch-display')

// Punch display settings local state
const lateGraphicUrlInput = ref(punchDisplayService.settings.value.customLateImageUrl || '')
const lateGraphicPreviewError = ref(false)

watch(
  () => punchDisplayService.settings.value.customLateImageUrl,
  (val) => {
    lateGraphicUrlInput.value = val || ''
    lateGraphicPreviewError.value = false
  }
)

function onLateGraphicUrlChange() {
  punchDisplayService.saveSettings({ customLateImageUrl: lateGraphicUrlInput.value.trim() })
}

function clearLateGraphic() {
  lateGraphicUrlInput.value = ''
  lateGraphicPreviewError.value = false
  punchDisplayService.saveSettings({ customLateImageUrl: '' })
}

function syncFromRoute() {
  const tab = (route.query.tab || route.query.section) as string | undefined
  if (tab === 'devices' || tab === 'network' || tab === 'integrations' || tab === 'punch-display' || tab === 'punch_display') {
    activeTab.value = tab?.startsWith('punch') ? 'punch-display' : (tab as SystemTab)
  } else {
    activeTab.value = 'punch-display'
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
          :class="activeTab === 'punch-display' ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'punch-display'"
        >
          <Sliders class="size-3.5" />
          <span>Punch Display Preferences</span>
        </button>
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
    <!-- TAB 1: PUNCH DISPLAY PREFERENCES -->
    <!-- ========================================================================= -->
    <div v-if="activeTab === 'punch-display'" class="space-y-4">
      <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <h4 class="text-sm font-semibold text-foreground flex items-center gap-2">
                <Sliders class="size-4 text-primary" />
                <span>Punch Display Preferences</span>
              </h4>
              <Badge
                :variant="punchDisplayService.settings.value.enabled ? 'outline' : 'secondary'"
                class="text-[10px] font-mono px-2 py-0.2"
                :class="punchDisplayService.settings.value.enabled ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10' : ''"
              >
                {{ punchDisplayService.settings.value.enabled ? 'Active / Broadcasting' : 'Display Disabled' }}
              </Badge>
            </div>
            <p class="text-xs text-muted-foreground">
              Configure kiosk timing, audio celebrations, custom late graphics, and visual feedback for the dedicated biometric terminal screen.
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <!-- Open Punch Display button -->
            <Button
              variant="default"
              size="sm"
              class="h-8 gap-1.5 text-xs shadow-xs cursor-pointer font-medium"
              @click="punchDisplayService.openPunchDisplay()"
            >
              <Monitor class="size-3.5" />
              <span>Open Punch Display</span>
              <ExternalLink class="size-3 text-primary-foreground/80 ml-0.5" />
            </Button>
          </div>
        </div>

        <!-- Punch Display Current Status Banner -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl border bg-muted/20 text-xs">
          <div class="flex items-center gap-2.5">
            <div
              class="size-8 rounded-lg flex items-center justify-center shrink-0 border"
              :class="punchDisplayService.settings.value.enabled ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-muted text-muted-foreground border-border'"
            >
              <Radio class="size-4" :class="punchDisplayService.settings.value.enabled ? 'animate-pulse' : ''" />
            </div>
            <div>
              <div class="font-semibold text-foreground">Pipeline Status</div>
              <div class="text-[11px] text-muted-foreground font-mono">
                {{ punchDisplayService.settings.value.enabled ? 'Listening & Forwarding Scans' : 'Disabled' }}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2.5">
            <div class="size-8 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
              <Wifi class="size-4" />
            </div>
            <div>
              <div class="font-semibold text-foreground">BroadcastChannel</div>
              <div class="text-[11px] text-muted-foreground font-mono">
                dmbbhr-punch-display
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2.5">
            <div class="size-8 rounded-lg bg-muted flex items-center justify-center shrink-0 border border-border">
              <Monitor class="size-4 text-foreground/80" />
            </div>
            <div>
              <div class="font-semibold text-foreground">Child Window</div>
              <div class="text-[11px] text-muted-foreground">
                Display-Only (No Preferences In Window)
              </div>
            </div>
          </div>
        </div>

        <!-- Configuration Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <!-- 1. Enable Punch Display -->
          <div class="p-3.5 rounded-xl border bg-card space-y-2">
            <div class="flex items-center justify-between">
              <Label class="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Monitor class="size-3.5 text-primary" />
                <span>Enable Punch Display</span>
              </Label>
              <Switch
                :model-value="punchDisplayService.settings.value.enabled"
                @update:model-value="punchDisplayService.saveSettings({ enabled: $event })"
              />
            </div>
            <p class="text-[11px] text-muted-foreground leading-relaxed">
              When enabled, incoming biometric punches are automatically dispatched in real-time to the child display window.
            </p>
          </div>

          <!-- 2. Display Duration (Includes 2s, 3s, 5s, 8s, 10s) -->
          <div class="p-3.5 rounded-xl border bg-card space-y-2">
            <Label class="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <CalendarIcon class="size-3.5 text-primary" />
              <span>Display Duration</span>
            </Label>
            <Select
              :model-value="String(punchDisplayService.settings.value.displayDurationSeconds || 5)"
              @update:model-value="punchDisplayService.saveSettings({ displayDurationSeconds: parseInt(String($event || '5'), 10) })"
            >
              <SelectTrigger class="h-8 text-xs bg-card">
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="2">2 seconds</SelectItem>
                  <SelectItem value="3">3 seconds</SelectItem>
                  <SelectItem value="5">5 seconds (Default)</SelectItem>
                  <SelectItem value="8">8 seconds</SelectItem>
                  <SelectItem value="10">10 seconds</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <p class="text-[11px] text-muted-foreground leading-relaxed">
              Hold duration before returning to idle. Any subsequent punch immediately replaces the display without waiting.
            </p>
          </div>

          <!-- 3. Audio Chime (Sound) -->
          <div class="p-3.5 rounded-xl border bg-card space-y-2">
            <div class="flex items-center justify-between">
              <Label class="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Volume2 class="size-3.5 text-primary" />
                <span>Audio Chime</span>
              </Label>
              <Switch
                :model-value="punchDisplayService.settings.value.soundEnabled"
                @update:model-value="punchDisplayService.saveSettings({ soundEnabled: $event })"
              />
            </div>
            <p class="text-[11px] text-muted-foreground leading-relaxed">
              Play a soft confirmation chime in the child window when a biometric punch is recorded.
            </p>
          </div>

          <!-- 4. Confetti Celebration -->
          <div class="p-3.5 rounded-xl border bg-card space-y-2">
            <div class="flex items-center justify-between">
              <Label class="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles class="size-3.5 text-amber-500" />
                <span>Confetti Celebration</span>
              </Label>
              <Switch
                :model-value="punchDisplayService.settings.value.confettiEnabled"
                @update:model-value="punchDisplayService.saveSettings({ confettiEnabled: $event })"
              />
            </div>
            <p class="text-[11px] text-muted-foreground leading-relaxed">
              Trigger a subtle celebratory burst for qualifying on-time and early biometric arrivals.
            </p>
          </div>

          <!-- 5. Late Visual -->
          <div class="p-3.5 rounded-xl border bg-card space-y-2 sm:col-span-2 lg:col-span-2">
            <div class="flex items-center justify-between">
              <Label class="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <AlertCircle class="size-3.5 text-rose-500" />
                <span>Late Visual Alert</span>
              </Label>
              <Switch
                :model-value="punchDisplayService.settings.value.lateVisualEnabled"
                @update:model-value="punchDisplayService.saveSettings({ lateVisualEnabled: $event })"
              />
            </div>
            <p class="text-[11px] text-muted-foreground leading-relaxed">
              Show distinct visual warning styling when an employee clocks in after their standard work group shift and grace period.
            </p>
          </div>
        </div>

        <!-- Custom Late Reminder Graphic URL Section -->
        <div class="p-4 rounded-xl border bg-card space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5">
            <div>
              <Label class="text-xs font-bold text-foreground flex items-center gap-1.5">
                <ImageIcon class="size-4 text-primary" />
                <span>Custom Late Reminder Graphic URL</span>
              </Label>
              <p class="text-[11px] text-muted-foreground mt-0.5">
                When configured and an employee's punch is <strong>LATE</strong>, this image covers the entire reminder card background with high visual prominence. Supports JPG, JPEG, and PNG formats via <code class="font-mono text-[10px] bg-muted px-1 rounded">http://</code>, <code class="font-mono text-[10px] bg-muted px-1 rounded">https://</code>, <code class="font-mono text-[10px] bg-muted px-1 rounded">data:</code>, or local <code class="font-mono text-[10px] bg-muted px-1 rounded">/</code> paths.
              </p>
            </div>
            <div v-if="lateGraphicUrlInput" class="shrink-0">
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10 cursor-pointer gap-1"
                @click="clearLateGraphic"
              >
                <Trash2 class="size-3" />
                <span>Clear Graphic</span>
              </Button>
            </div>
          </div>

          <div class="space-y-2">
            <div class="flex flex-col sm:flex-row gap-2">
              <Input
                v-model="lateGraphicUrlInput"
                placeholder="https://example.com/graphic.png or .jpg, data:image/png;base64,..., or /assets/..."
                class="h-8 text-xs font-mono flex-1 bg-card"
                @blur="onLateGraphicUrlChange"
                @keydown.enter="onLateGraphicUrlChange"
              />
              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs shrink-0 cursor-pointer font-medium"
                @click="onLateGraphicUrlChange"
              >
                Apply URL
              </Button>
            </div>

            <!-- Preview Card when URL is configured -->
            <div
              v-if="lateGraphicUrlInput.trim()"
              class="rounded-lg border p-3 bg-muted/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
            >
              <div class="flex items-center gap-3">
                <div class="size-14 rounded-md border overflow-hidden bg-muted shrink-0 relative flex items-center justify-center shadow-2xs">
                  <img
                    v-if="!lateGraphicPreviewError"
                    :src="lateGraphicUrlInput.trim()"
                    alt="Late Graphic Preview"
                    class="size-full object-cover"
                    @error="lateGraphicPreviewError = true"
                    @load="lateGraphicPreviewError = false"
                  />
                  <span v-else class="text-[9px] text-destructive font-mono text-center p-1">
                    Invalid URL
                  </span>
                </div>
                <div class="space-y-0.5">
                  <div class="flex items-center gap-1.5">
                    <span class="font-semibold text-foreground">Graphic Status:</span>
                    <Badge
                      :variant="lateGraphicPreviewError ? 'destructive' : 'outline'"
                      class="text-[10px] font-mono px-1.5 py-0"
                    >
                      {{ lateGraphicPreviewError ? 'Image Load Failed' : 'Valid & Ready' }}
                    </Badge>
                  </div>
                  <p class="text-[11px] text-muted-foreground truncate max-w-md font-mono">
                    {{ lateGraphicUrlInput.trim() }}
                  </p>
                  <p v-if="lateGraphicPreviewError" class="text-[11px] text-destructive">
                    URL could not be loaded as an image. Punch Display will fall back to normal late styling.
                  </p>
                </div>
              </div>

              <div class="text-[11px] text-muted-foreground sm:text-right shrink-0">
                <p>Applies <strong>only</strong> to LATE punch cards.</p>
                <p>Normal IN/OUT punches use standard clean cards.</p>
              </div>
            </div>

            <div v-else class="text-[11px] text-muted-foreground italic">
              No custom graphic URL set. The Punch Display uses the standard clean late visual styling.
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- TAB 2: BIOMETRIC DEVICES -->
    <!-- ========================================================================= -->
    <div v-else-if="activeTab === 'devices'" class="space-y-4">
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
              <span class="text-muted-foreground">Target Architecture:</span>
              <div class="font-mono text-foreground">BISBIO B-29b &rarr; Agent &rarr; API</div>
            </div>
          </div>
        </div>

        <!-- Device 2: Backup Terminal -->
        <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3 opacity-75">
          <div class="flex items-center justify-between font-semibold text-sm text-foreground">
            <div class="flex items-center gap-2">
              <Server class="size-4 text-muted-foreground" />
              <span>BISBIO Backup Terminal</span>
            </div>
            <Badge variant="outline" class="text-[10px] uppercase font-mono">
              STANDBY
            </Badge>
          </div>

          <div class="space-y-2 text-xs">
            <div class="p-2 rounded bg-muted/40 border">
              <span class="text-muted-foreground">Terminal Location:</span>
              <div class="font-medium text-foreground">DBB Cebu (Warehouse Floor)</div>
            </div>
            <div class="p-2 rounded bg-muted/40 border">
              <span class="text-muted-foreground">Hardware IP & Port:</span>
              <div class="font-mono font-medium text-foreground">192.168.1.202 : 4370 (TCP/IP)</div>
            </div>
            <div class="p-2 rounded bg-muted/40 border">
              <span class="text-muted-foreground">Failover Priority:</span>
              <div class="font-mono font-medium text-foreground">Secondary Backup</div>
            </div>
          </div>
        </div>

        <!-- Device 3: Remote Satellite Terminal -->
        <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3 opacity-75">
          <div class="flex items-center justify-between font-semibold text-sm text-foreground">
            <div class="flex items-center gap-2">
              <Building class="size-4 text-muted-foreground" />
              <span>Iloilo Satellite Reader</span>
            </div>
            <Badge variant="outline" class="text-[10px] uppercase font-mono">
              REMOTE
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
            <span class="text-muted-foreground">Default Device Gateway:</span>
            <div class="font-mono font-medium text-foreground">192.168.1.1</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Subnet Mask:</span>
            <div class="font-mono font-medium text-foreground">255.255.255.0</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Hardware Handshake Timeout:</span>
            <div class="font-mono font-medium text-foreground">10,000 ms (10 seconds)</div>
          </div>
        </div>
      </div>

      <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3">
        <div class="flex items-center gap-2 font-semibold text-sm text-foreground">
          <Database class="size-4 text-primary" />
          <span>Database & Persistence Architecture</span>
        </div>
        <div class="space-y-2 text-xs">
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">IndexedDB Database:</span>
            <div class="font-mono font-medium text-foreground">dmbbhr_offline_db (Dexie.js v4)</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Query Latency Index:</span>
            <div class="font-mono font-medium text-foreground">O(log N) Indexed Composite Indexing</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Target MySQL Host:</span>
            <div class="font-mono font-medium text-foreground">127.0.0.1 : 3306 (MySQL 8.0)</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Laravel Bridge API:</span>
            <div class="font-mono font-medium text-foreground">http://127.0.0.1:8000/api/biometric/logs</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- TAB 4: INTEGRATIONS -->
    <!-- ========================================================================= -->
    <div v-else-if="activeTab === 'integrations'" class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3">
          <div class="flex items-center gap-2 font-semibold text-sm text-foreground">
            <FolderGit2 class="size-4 text-primary" />
            <span>Attendance Excel Importer & Mapper</span>
          </div>
          <p class="text-muted-foreground leading-relaxed">
            Directly parse, map, and import biometric records from multi-brand Excel sheets (ZKTeco, Realand, FingerTech, Anviz) with interactive column mapping.
          </p>
          <div class="p-2.5 rounded bg-muted/40 border font-mono">
            Status: Fully Operational
          </div>
        </div>

        <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3">
          <div class="flex items-center gap-2 font-semibold text-sm text-foreground">
            <CalendarIcon class="size-4 text-primary" />
            <span>Payroll Computation Export Bridge</span>
          </div>
          <p class="text-muted-foreground leading-relaxed">
            Automated export formatting to DOLE/BIR payroll format including standard night differentials, overtime hours, and undertime deductions.
          </p>
          <div class="p-2.5 rounded bg-muted/40 border font-mono">
            Status: Ready for Generation
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
