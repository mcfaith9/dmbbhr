<script setup lang="ts">
import { computed } from 'vue'
import {
  Radio,
  CheckCircle2,
  AlertCircle,
  X,
  Fingerprint,
  HardDrive
} from '@lucide/vue'
import { liveAttendanceService } from '@/services/liveAttendance'

const syncProgress = liveAttendanceService.syncProgress
const isSyncing = liveAttendanceService.isSyncing

const title = computed(() => {
  if (!syncProgress.value) return ''
  if (syncProgress.value.stage === 'complete') {
    return 'Biometric Sync Complete'
  }
  if (syncProgress.value.stage === 'error') {
    return 'Sync Error'
  }
  return 'Syncing Hardware Biometric Scans...'
})

function handleDismiss() {
  liveAttendanceService.clearSyncProgress()
}
</script>

<template>
  <div
    v-if="syncProgress"
    class="rounded-xl border p-4 text-xs transition-all shadow-xs animate-in fade-in duration-200"
    :class="[
      syncProgress.stage === 'error'
        ? 'border-destructive/40 bg-destructive/10 text-destructive-foreground'
        : syncProgress.stage === 'complete'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-foreground'
          : 'border-primary/30 bg-primary/5 text-foreground'
    ]"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="space-y-2 flex-1 min-w-0">
        <!-- Title & Percentage Row -->
        <div class="flex items-center gap-2">
          <Radio v-if="isSyncing" class="size-3.5 text-primary animate-spin shrink-0" />
          <CheckCircle2
            v-else-if="syncProgress.stage === 'complete'"
            class="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
          />
          <AlertCircle
            v-else-if="syncProgress.stage === 'error'"
            class="size-3.5 text-destructive shrink-0"
          />
          <Fingerprint v-else class="size-3.5 text-primary shrink-0" />

          <span class="font-semibold text-sm">
            {{ title }}
          </span>

          <span
            class="text-xs font-mono font-bold ml-auto pr-1"
            :class="[
              syncProgress.stage === 'error'
                ? 'text-destructive'
                : syncProgress.stage === 'complete'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-primary'
            ]"
          >
            {{ syncProgress.progress }}%
          </span>
        </div>

        <!-- Progress Bar -->
        <div class="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
          <div
            class="h-full transition-all duration-300 rounded-full"
            :class="[
              syncProgress.stage === 'error'
                ? 'bg-destructive'
                : syncProgress.stage === 'complete'
                  ? 'bg-emerald-600'
                  : 'bg-primary'
            ]"
            :style="{ width: `${syncProgress.progress}%` }"
          />
        </div>

        <!-- Progress Message & Byte Details -->
        <div class="flex items-center justify-between text-xs text-muted-foreground gap-2 flex-wrap">
          <div class="truncate max-w-full font-sans">
            {{ syncProgress.message }}
          </div>
          <div
            v-if="syncProgress.receivedBytes !== undefined && syncProgress.totalBytes !== undefined && syncProgress.totalBytes > 0"
            class="font-mono text-[11px] text-muted-foreground shrink-0 flex items-center gap-1"
          >
            <HardDrive class="size-3 text-muted-foreground/70" />
            <span>{{ syncProgress.receivedBytes.toLocaleString() }} / {{ syncProgress.totalBytes.toLocaleString() }} bytes</span>
          </div>
        </div>
      </div>

      <!-- Dismiss button -->
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground p-1 rounded-md cursor-pointer transition-colors shrink-0"
        title="Dismiss notification"
        @click="handleDismiss"
      >
        <X class="size-3.5" />
      </button>
    </div>
  </div>
</template>
