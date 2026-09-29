<script setup lang="ts">
import { Server, Database } from '@lucide/vue'
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground">
          System Settings & Local Network Configuration
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Local office network environment variables, device listener parameters, and branch settings.
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3">
        <div class="flex items-center gap-2 font-semibold text-sm text-foreground">
          <Server class="size-4 text-primary" />
          <span>Local Office Network Setup</span>
        </div>
        <div class="space-y-2 text-xs">
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Biometric Subnet:</span>
            <div class="font-mono font-medium text-foreground">192.168.1.0/24</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Default Biometric Gateway:</span>
            <div class="font-mono font-medium text-foreground">192.168.1.1</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Active Reader IP:</span>
            <div class="font-mono font-medium text-foreground">192.168.1.201 : 4370</div>
          </div>
        </div>
      </div>

      <div class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-3">
        <div class="flex items-center gap-2 font-semibold text-sm text-foreground">
          <Database class="size-4 text-primary" />
          <span>Backend API Target</span>
        </div>
        <div class="space-y-2 text-xs">
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Laravel API URL:</span>
            <div class="font-mono font-medium text-foreground">http://localhost:8000/api</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Audit Retention:</span>
            <div class="font-medium text-foreground">Permanent Immutable Raw Biometric Logs</div>
          </div>
          <div class="p-2.5 rounded bg-muted/40 border">
            <span class="text-muted-foreground">Philippine Standard Time:</span>
            <div class="font-medium text-foreground">UTC+08:00 (Asia/Manila)</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
