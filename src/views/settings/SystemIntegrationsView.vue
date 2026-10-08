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
  Trash2,
  Megaphone,
  Bell,
  Cake,
  Plus,
  Pencil,
  Play,
  RotateCcw
} from '@lucide/vue'
import { liveAttendanceService } from '@/services/liveAttendance'
import { punchDisplayService } from '@/services/punchDisplay'
import { punchVoiceService } from '@/services/punchVoiceService'
import { announcementService, type AnnouncementItem, type AnnouncementType } from '@/services/announcements'
import { authService } from '@/services/auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
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

// Voice announcements state
const availableVoices = ref<SpeechSynthesisVoice[]>([])
const isTtsSupported = ref(punchVoiceService.isSupported())

function refreshVoices() {
  availableVoices.value = punchVoiceService.getVoices()
}

function testCurrentVoice() {
  punchVoiceService.testVoice({
    volume: punchDisplayService.settings.value.punchDisplayVoiceVolume,
    rate: punchDisplayService.settings.value.punchDisplayVoiceRate,
    pitch: punchDisplayService.settings.value.punchDisplayVoicePitch,
    voiceURI: punchDisplayService.settings.value.punchDisplayVoiceURI
  })
}

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

// Announcements management & dialog form state
const announcementsList = announcementService.announcements
const isFormDialogOpen = ref(false)
const editingAnnouncementId = ref<string | null>(null)
const formType = ref<AnnouncementType>('announcement')
const formTitle = ref('')
const formMessage = ref('')
const formEnabled = ref(true)
const formEmployeeName = ref('')
const formBioId = ref('')
const formDepartment = ref('')
const formError = ref('')

function openCreateDialog() {
  editingAnnouncementId.value = null
  formType.value = 'announcement'
  formTitle.value = ''
  formMessage.value = ''
  formEnabled.value = true
  formEmployeeName.value = ''
  formBioId.value = ''
  formDepartment.value = ''
  formError.value = ''
  isFormDialogOpen.value = true
}

function openEditDialog(item: AnnouncementItem) {
  editingAnnouncementId.value = item.id
  formType.value = item.type
  formTitle.value = item.title
  formMessage.value = (item.message || '').slice(0, 250)
  formEnabled.value = item.enabled
  formEmployeeName.value = item.employeeName || ''
  formBioId.value = item.bioId || ''
  formDepartment.value = item.department || ''
  formError.value = ''
  isFormDialogOpen.value = true
}

function saveAnnouncementForm() {
  const cleanTitle = formTitle.value.trim()
  const cleanMessage = formMessage.value.trim().slice(0, 250)

  if (!cleanTitle) {
    formError.value = 'Please provide a title for the announcement.'
    return
  }
  if (!cleanMessage) {
    formError.value = 'Please enter a message.'
    return
  }

  if (editingAnnouncementId.value) {
    announcementService.updateAnnouncement(editingAnnouncementId.value, {
      type: formType.value,
      title: cleanTitle,
      message: cleanMessage,
      enabled: formEnabled.value,
      employeeName: formType.value === 'birthday' ? formEmployeeName.value.trim() : undefined,
      bioId: formType.value === 'birthday' ? formBioId.value.trim() : undefined,
      photoUrl: formType.value === 'birthday' && formBioId.value.trim() ? `/employee-photos/${formBioId.value.trim()}.jpg` : undefined,
      department: formType.value === 'birthday' ? formDepartment.value.trim() : undefined
    })
  } else {
    announcementService.addAnnouncement({
      type: formType.value,
      title: cleanTitle,
      message: cleanMessage,
      enabled: formEnabled.value,
      employeeName: formType.value === 'birthday' ? formEmployeeName.value.trim() : undefined,
      bioId: formType.value === 'birthday' ? formBioId.value.trim() : undefined,
      photoUrl: formType.value === 'birthday' && formBioId.value.trim() ? `/employee-photos/${formBioId.value.trim()}.jpg` : undefined,
      department: formType.value === 'birthday' ? formDepartment.value.trim() : undefined
    })
  }

  isFormDialogOpen.value = false
}

function deleteAnnouncement(id: string) {
  announcementService.deleteAnnouncement(id)
}

function toggleAnnouncement(id: string, enabled: boolean) {
  announcementService.toggleAnnouncement(id, enabled)
}

function triggerAnnouncementPreview(item?: any) {
  // Guard against click/DOM event objects
  if (!item || (typeof item === 'object' && 'target' in item)) {
    announcementService.triggerPreview(null)
  } else {
    announcementService.triggerPreview(item)
  }
}

function resetAnnouncements() {
  announcementService.resetToDefaults()
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
  refreshVoices()
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.onvoiceschanged = () => {
        refreshVoices()
      }
    } catch {
      // ignore
    }
  }
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

        <!-- Voice Announcements (Text-to-Speech / TTS) Section -->
        <div class="p-4 sm:p-5 rounded-xl border bg-card space-y-4 shadow-2xs">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3.5">
            <div class="space-y-0.5">
              <div class="flex items-center gap-2">
                <Volume2 class="size-4 text-primary" />
                <Label class="text-sm font-bold text-foreground">Voice Announcements (Text-to-Speech)</Label>
                <Badge
                  :variant="punchDisplayService.settings.value.punchDisplayVoiceEnabled ? 'outline' : 'secondary'"
                  class="text-[10px] font-mono px-2 py-0.2"
                  :class="punchDisplayService.settings.value.punchDisplayVoiceEnabled ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10' : ''"
                >
                  {{ punchDisplayService.settings.value.punchDisplayVoiceEnabled ? 'Enabled' : 'Disabled' }}
                </Badge>
              </div>
              <p class="text-xs text-muted-foreground mt-0.5">
                Automatically speak short, time-aware greetings upon punch detection (e.g., "Good morning, [Name]", "Goodbye, [Name]. Take care", "Good morning, [Name]. You are late").
              </p>
            </div>

            <!-- Master Toggle & Test Voice Button -->
            <div class="flex items-center gap-2.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs gap-1.5 font-medium cursor-pointer shadow-2xs"
                :disabled="!isTtsSupported"
                title="Test audio greeting with the selected voice parameters"
                @click="testCurrentVoice"
              >
                <Play class="size-3 text-primary" />
                <span>Test Voice</span>
              </Button>
              <Switch
                :model-value="punchDisplayService.settings.value.punchDisplayVoiceEnabled"
                @update:model-value="punchDisplayService.saveSettings({ punchDisplayVoiceEnabled: $event })"
              />
            </div>
          </div>

          <!-- Controls Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
            <!-- 1. Voice Selector -->
            <div class="space-y-1.5 sm:col-span-2">
              <Label class="text-[11px] font-medium text-foreground">
                Voice Selection
              </Label>
              <Select
                :model-value="punchDisplayService.settings.value.punchDisplayVoiceURI || 'default'"
                @update:model-value="punchDisplayService.saveSettings({ punchDisplayVoiceURI: !$event || $event === 'default' ? '' : String($event) })"
              >
                <SelectTrigger class="h-8 text-xs bg-card">
                  <SelectValue placeholder="System Default Voice" />
                </SelectTrigger>
                <SelectContent class="max-h-60">
                  <SelectGroup>
                    <SelectItem value="default">System Default Voice</SelectItem>
                    <SelectItem
                      v-for="voice in availableVoices"
                      :key="voice.voiceURI"
                      :value="voice.voiceURI"
                    >
                      {{ voice.name }} ({{ voice.lang }})
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p class="text-[10px] text-muted-foreground">
                {{ availableVoices.length > 0 ? `${availableVoices.length} voice options available in browser.` : 'Using system default speech engine.' }}
              </p>
            </div>

            <!-- 2. Volume -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <Label class="text-[11px] font-medium text-foreground">
                  Volume
                </Label>
                <span class="font-mono text-[10px] text-muted-foreground font-semibold">
                  {{ Math.round((punchDisplayService.settings.value.punchDisplayVoiceVolume ?? 0.8) * 100) }}%
                </span>
              </div>
              <Select
                :model-value="String(punchDisplayService.settings.value.punchDisplayVoiceVolume ?? 0.8)"
                @update:model-value="punchDisplayService.saveSettings({ punchDisplayVoiceVolume: parseFloat(String($event)) })"
              >
                <SelectTrigger class="h-8 text-xs bg-card">
                  <SelectValue placeholder="80% (Default)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="0.2">20% (Low)</SelectItem>
                    <SelectItem value="0.4">40%</SelectItem>
                    <SelectItem value="0.6">60%</SelectItem>
                    <SelectItem value="0.8">80% (Default)</SelectItem>
                    <SelectItem value="1">100% (Maximum)</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p class="text-[10px] text-muted-foreground">
                Announcer speech output volume.
              </p>
            </div>

            <!-- 3. Speed (Rate) -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <Label class="text-[11px] font-medium text-foreground">
                  Speed (Rate)
                </Label>
                <span class="font-mono text-[10px] text-muted-foreground font-semibold">
                  {{ (punchDisplayService.settings.value.punchDisplayVoiceRate ?? 1.0).toFixed(1) }}x
                </span>
              </div>
              <Select
                :model-value="String(punchDisplayService.settings.value.punchDisplayVoiceRate ?? 1.0)"
                @update:model-value="punchDisplayService.saveSettings({ punchDisplayVoiceRate: parseFloat(String($event)) })"
              >
                <SelectTrigger class="h-8 text-xs bg-card">
                  <SelectValue placeholder="1.0x (Normal)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="0.8">0.8x (Slower)</SelectItem>
                    <SelectItem value="0.9">0.9x</SelectItem>
                    <SelectItem value="1">1.0x (Normal / Default)</SelectItem>
                    <SelectItem value="1.1">1.1x (Brisk)</SelectItem>
                    <SelectItem value="1.25">1.25x (Fast)</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p class="text-[10px] text-muted-foreground">
                Cadence of spoken greeting.
              </p>
            </div>

            <!-- 4. Pitch -->
            <div class="space-y-1.5 sm:col-span-2 lg:col-span-2">
              <div class="flex items-center justify-between">
                <Label class="text-[11px] font-medium text-foreground">
                  Voice Pitch
                </Label>
                <span class="font-mono text-[10px] text-muted-foreground font-semibold">
                  {{ (punchDisplayService.settings.value.punchDisplayVoicePitch ?? 1.0).toFixed(1) }}
                </span>
              </div>
              <Select
                :model-value="String(punchDisplayService.settings.value.punchDisplayVoicePitch ?? 1.0)"
                @update:model-value="punchDisplayService.saveSettings({ punchDisplayVoicePitch: parseFloat(String($event)) })"
              >
                <SelectTrigger class="h-8 text-xs bg-card">
                  <SelectValue placeholder="1.0 (Natural)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="0.8">0.8 (Deeper)</SelectItem>
                    <SelectItem value="0.9">0.9</SelectItem>
                    <SelectItem value="1">1.0 (Natural / Default)</SelectItem>
                    <SelectItem value="1.1">1.1</SelectItem>
                    <SelectItem value="1.2">1.2 (Higher)</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p class="text-[10px] text-muted-foreground">
                Tonal pitch of speech utterance.
              </p>
            </div>

            <!-- Announcement Rules Guide Box -->
            <div class="sm:col-span-2 lg:col-span-2 p-2.5 rounded-lg border bg-muted/20 text-[11px] text-muted-foreground space-y-1">
              <div class="font-semibold text-foreground text-[11px]">Announcement Guide:</div>
              <div class="grid grid-cols-2 gap-1 text-[10px] font-mono">
                <div>• Before 12:00: <span class="text-foreground">"Good morning"</span></div>
                <div>• 12:00–17:59: <span class="text-foreground">"Good afternoon"</span></div>
                <div>• 18:00+: <span class="text-foreground">"Good evening"</span></div>
                <div>• TIME OUT: <span class="text-foreground">"Goodbye, [Name]. Take care."</span></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 6. Announcements & Reminders Management Section -->
        <div class="p-4 sm:p-5 rounded-xl border bg-card space-y-4 shadow-2xs">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3.5">
            <div>
              <div class="flex items-center gap-2">
                <Megaphone class="size-4 text-primary" />
                <Label class="text-sm font-bold text-foreground">Announcements & Reminders</Label>
                <Badge variant="outline" class="text-[10px] font-mono px-1.5 py-0">
                  {{ announcementsList.length }} items
                </Badge>
              </div>
              <p class="text-xs text-muted-foreground mt-0.5">
                Manage notifications that slide onto the Punch Display after <strong>3 minutes of idle</strong>. Biometric punches immediately take highest priority.
              </p>
            </div>
            <div class="flex items-center gap-2 flex-wrap shrink-0">
              <Button
                variant="outline"
                size="sm"
                class="h-8 gap-1.5 text-xs shadow-2xs cursor-pointer font-medium"
                title="Immediately test and show the active announcement overlay on the Punch Display"
                @click="triggerAnnouncementPreview()"
              >
                <Play class="size-3.5 text-primary" />
                <span>Show Preview</span>
              </Button>
              <Button
                variant="default"
                size="sm"
                class="h-8 gap-1.5 text-xs shadow-xs cursor-pointer font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                title="Create a new custom announcement, reminder, or birthday greeting"
                @click="openCreateDialog"
              >
                <Plus class="size-3.5" />
                <span>+ Add Announcement</span>
              </Button>
            </div>
          </div>

          <!-- Empty State -->
          <div
            v-if="announcementsList.length === 0"
            class="py-8 text-center rounded-xl border border-dashed p-6 space-y-3 bg-muted/10"
          >
            <Megaphone class="size-8 mx-auto text-muted-foreground/60" />
            <div class="space-y-1">
              <h5 class="text-xs font-semibold text-foreground">No Announcements Configured</h5>
              <p class="text-[11px] text-muted-foreground max-w-sm mx-auto">
                Add your first announcement or reminder to display on the terminal during idle periods.
              </p>
            </div>
            <div class="flex items-center justify-center gap-2 pt-1">
              <Button size="sm" class="h-7 text-xs font-medium cursor-pointer" @click="openCreateDialog">
                <Plus class="size-3 mr-1" />
                <span>Add Announcement</span>
              </Button>
              <Button variant="outline" size="sm" class="h-7 text-xs cursor-pointer" @click="resetAnnouncements">
                <RotateCcw class="size-3 mr-1" />
                <span>Load Defaults</span>
              </Button>
            </div>
          </div>

          <!-- Announcement Items List -->
          <div v-else class="space-y-2.5">
            <div
              v-for="item in announcementsList"
              :key="item.id"
              class="p-3.5 rounded-xl border bg-muted/20 hover:bg-muted/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              :class="!item.enabled ? 'opacity-60 bg-muted/10' : ''"
            >
              <!-- Left info block -->
              <div class="flex items-start gap-3 min-w-0">
                <div
                  class="size-9 rounded-lg flex items-center justify-center shrink-0 border mt-0.5 shadow-2xs"
                  :class="[
                    item.type === 'birthday'
                      ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                      : item.type === 'reminder'
                        ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                        : 'bg-primary/10 text-primary border-primary/20'
                  ]"
                >
                  <Cake v-if="item.type === 'birthday'" class="size-4" />
                  <Bell v-else-if="item.type === 'reminder'" class="size-4" />
                  <Megaphone v-else class="size-4" />
                </div>
                <div class="min-w-0 space-y-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-foreground uppercase text-[12px] font-mono tracking-wider">
                      {{ item.title }}
                    </span>
                    <Badge
                      variant="outline"
                      class="text-[9px] uppercase font-mono px-1.5 py-0"
                      :class="[
                        item.type === 'birthday'
                          ? 'border-rose-500/30 text-rose-600 dark:text-rose-400'
                          : item.type === 'reminder'
                            ? 'border-amber-500/30 text-amber-600 dark:text-amber-400'
                            : 'border-primary/30 text-primary'
                      ]"
                    >
                      {{ item.type }}
                    </Badge>
                    <Badge
                      :variant="item.enabled ? 'outline' : 'secondary'"
                      class="text-[9px] font-mono px-1.5 py-0"
                      :class="item.enabled ? 'border-emerald-500/30 text-emerald-600 bg-emerald-500/10' : 'text-muted-foreground'"
                    >
                      {{ item.enabled ? 'Enabled' : 'Disabled' }}
                    </Badge>
                  </div>
                  <p class="text-xs text-muted-foreground leading-relaxed">
                    <span v-if="item.type === 'birthday' && item.employeeName" class="font-semibold text-foreground mr-1">
                      {{ item.employeeName }}:
                    </span>
                    {{ item.message }}
                  </p>
                  <div
                    v-if="item.type === 'birthday' && (item.bioId || item.department)"
                    class="flex items-center gap-2 text-[10px] text-muted-foreground font-mono"
                  >
                    <span v-if="item.bioId">Bio ID: {{ item.bioId }}</span>
                    <span v-if="item.bioId && item.department">•</span>
                    <span v-if="item.department">{{ item.department }}</span>
                  </div>
                </div>
              </div>

              <!-- Right Actions: Preview, Edit, Enable Switch, Delete -->
              <div class="flex items-center gap-2 self-end md:self-center shrink-0 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7 px-2.5 text-[11px] cursor-pointer font-medium gap-1"
                  title="Immediately display this specific announcement on the Punch Display"
                  @click="triggerAnnouncementPreview(item)"
                >
                  <Play class="size-3 text-primary" />
                  <span>Preview</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 px-2 text-[11px] cursor-pointer text-muted-foreground hover:text-foreground gap-1"
                  title="Edit announcement text and configuration"
                  @click="openEditDialog(item)"
                >
                  <Pencil class="size-3" />
                  <span>Edit</span>
                </Button>
                <div class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/30 border">
                  <span class="text-[10px] font-mono text-muted-foreground select-none">
                    {{ item.enabled ? 'ON' : 'OFF' }}
                  </span>
                  <Switch
                    :model-value="item.enabled"
                    @update:model-value="toggleAnnouncement(item.id, $event)"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 px-2 text-[11px] cursor-pointer text-destructive hover:bg-destructive/10"
                  title="Delete announcement"
                  @click="deleteAnnouncement(item.id)"
                >
                  <Trash2 class="size-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <!-- Add / Edit Announcement Modal Dialog -->
        <Dialog :open="isFormDialogOpen" @update:open="isFormDialogOpen = $event">
          <DialogContent class="sm:max-w-lg bg-card text-card-foreground">
            <DialogHeader>
              <DialogTitle class="text-base font-bold flex items-center gap-2">
                <Megaphone class="size-4 text-primary" />
                <span>{{ editingAnnouncementId ? 'Edit Announcement' : 'Add New Announcement / Reminder' }}</span>
              </DialogTitle>
              <DialogDescription class="text-xs text-muted-foreground">
                Configure notifications or birthday celebrations to display on the terminal during idle time.
              </DialogDescription>
            </DialogHeader>

            <form @submit.prevent="saveAnnouncementForm" class="space-y-4 py-2 text-xs">
              <!-- Error message -->
              <div
                v-if="formError"
                class="p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs border border-destructive/20 flex items-center gap-2"
              >
                <AlertCircle class="size-4 shrink-0" />
                <span>{{ formError }}</span>
              </div>

              <!-- 1. Type Selection -->
              <div class="space-y-1.5">
                <Label class="text-xs font-semibold">Type</Label>
                <Select v-model="formType">
                  <SelectTrigger class="h-9 text-xs bg-background">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="announcement">📢 Announcement</SelectItem>
                      <SelectItem value="reminder">🔔 Reminder</SelectItem>
                      <SelectItem value="birthday">🎂 Birthday</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <!-- 2. Title -->
              <div class="space-y-1.5">
                <Label class="text-xs font-semibold">Title</Label>
                <Input
                  v-model="formTitle"
                  placeholder="e.g. Company Meeting, Daily Reminder, Happy Birthday!"
                  class="h-9 text-xs bg-background"
                />
              </div>

              <!-- 3. Message -->
              <div class="space-y-1.5">
                <Label class="text-xs font-semibold">Message</Label>
                <Textarea
                  v-model="formMessage"
                  maxlength="250"
                  placeholder="e.g. Please proceed to the conference room at 3:00 PM."
                  class="min-h-20 text-xs bg-background"
                />
                <div class="text-[11px] font-mono text-muted-foreground text-right">
                  {{ (formMessage || '').length }} / 250
                </div>
              </div>

              <!-- Birthday Celebrant Fields -->
              <div
                v-if="formType === 'birthday'"
                class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl border bg-muted/20"
              >
                <div class="space-y-1.5">
                  <Label class="text-[11px] font-semibold">Celebrant / Employee Name</Label>
                  <Input
                    v-model="formEmployeeName"
                    placeholder="e.g. Juan Dela Cruz"
                    class="h-8 text-xs bg-background"
                  />
                </div>
                <div class="space-y-1.5">
                  <Label class="text-[11px] font-semibold">Bio ID (Photo Resolver)</Label>
                  <Input
                    v-model="formBioId"
                    placeholder="e.g. 25065"
                    class="h-8 text-xs bg-background font-mono"
                  />
                </div>
                <div class="space-y-1.5 sm:col-span-2">
                  <Label class="text-[11px] font-semibold">Department (Optional)</Label>
                  <Input
                    v-model="formDepartment"
                    placeholder="e.g. Operations"
                    class="h-8 text-xs bg-background"
                  />
                </div>
              </div>

              <!-- 4. Enabled Switch -->
              <div class="flex items-center justify-between p-3 rounded-xl border bg-muted/20">
                <div>
                  <Label class="text-xs font-semibold">Enabled</Label>
                  <p class="text-[11px] text-muted-foreground">
                    Include this item in the automatic 3-minute idle rotation.
                  </p>
                </div>
                <Switch v-model="formEnabled" />
              </div>

              <DialogFooter class="gap-2 sm:gap-0 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="h-8 text-xs cursor-pointer"
                  @click="isFormDialogOpen = false"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  class="h-8 text-xs cursor-pointer font-semibold"
                >
                  {{ editingAnnouncementId ? 'Save Changes' : 'Create Announcement' }}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
