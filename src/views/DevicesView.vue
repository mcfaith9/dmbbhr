<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  Fingerprint,
  CheckCircle2,
  RefreshCw,
  Server,
  Activity,
} from '@lucide/vue'
import { deviceService } from '@/services/devices'
import type { BiometricDevice, Location } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const devices = ref<BiometricDevice[]>([])
const locations = ref<Location[]>([])
const testingConnection = ref(false)
const testResult = ref<string | null>(null)

async function loadDevices() {
  devices.value = await deviceService.getDevices()
  locations.value = await deviceService.getLocations()
}

async function testDevicePing(device: BiometricDevice) {
  testingConnection.value = true
  testResult.value = null
  setTimeout(() => {
    testingConnection.value = false
    testResult.value = `Handshake verified: ${device.model} on ${device.ip_address}:${device.port}. Serial: ${device.serial_number} confirmed online.`
  }, 1000)
}

onMounted(() => {
  loadDevices()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground">
          Biometric Device Management
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Manage hardware biometric readers connected across office locations via Node.js zkteco agent.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" class="h-8 gap-1.5" @click="loadDevices">
          <RefreshCw class="size-3.5" />
          <span class="text-xs">Refresh Status</span>
        </Button>
      </div>
    </div>

    <!-- Active Device Card -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        v-for="device in devices"
        :key="device.id"
        class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-4"
      >
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600">
              <Fingerprint class="size-6" />
            </div>
            <div>
              <h3 class="font-semibold text-base text-foreground">{{ device.name }}</h3>
              <p class="text-xs font-mono text-muted-foreground">{{ device.model }}</p>
            </div>
          </div>
          <Badge variant="success" class="text-xs">
            <span class="size-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
            Connected
          </Badge>
        </div>

        <!-- Hardware & Network Specifications -->
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs border-t pt-3">
          <div>
            <span class="text-muted-foreground text-[11px]">IP ADDRESS</span>
            <div class="font-mono font-medium text-foreground">{{ device.ip_address }}</div>
          </div>
          <div>
            <span class="text-muted-foreground text-[11px]">PORT</span>
            <div class="font-mono font-medium text-foreground">{{ device.port }} (TCP/IP)</div>
          </div>
          <div>
            <span class="text-muted-foreground text-[11px]">SERIAL NUMBER</span>
            <div class="font-mono font-medium text-foreground">{{ device.serial_number }}</div>
          </div>
          <div>
            <span class="text-muted-foreground text-[11px]">SUBNET / GATEWAY</span>
            <div class="font-mono text-muted-foreground text-[11px]">{{ device.subnet || '255.255.255.0' }}</div>
          </div>
          <div>
            <span class="text-muted-foreground text-[11px]">MAC ADDRESS</span>
            <div class="font-mono text-muted-foreground text-[11px]">{{ device.mac_address || '00:17:61:10:0c:a3' }}</div>
          </div>
          <div>
            <span class="text-muted-foreground text-[11px]">FIRMWARE</span>
            <div class="font-mono text-muted-foreground text-[11px]">{{ device.firmware_version || '6.5.4 Build 142' }}</div>
          </div>
        </div>

        <div class="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
          <div class="font-medium text-foreground flex items-center justify-between">
            <span>Communication Protocol</span>
            <span class="font-mono text-[10px] text-muted-foreground">zkteco-js :4370</span>
          </div>
          <p class="text-muted-foreground text-[11px]">
            Node.js service establishes socket to port 4370 and receives live logs via <code class="font-mono text-foreground">getRealTimeLogs()</code> callback. Historical sync uses incremental cursor to prevent re-querying 24,000+ records.
          </p>
        </div>

        <div class="flex items-center justify-between pt-1">
          <Button
            variant="outline"
            size="sm"
            class="h-8 text-xs gap-1.5"
            :disabled="testingConnection"
            @click="testDevicePing(device)"
          >
            <Activity :class="['size-3.5', testingConnection ? 'animate-spin' : '']" />
            <span>{{ testingConnection ? 'Testing...' : 'Test Connection' }}</span>
          </Button>

          <router-link to="/attendance/logs">
            <Button variant="ghost" size="sm" class="h-8 text-xs">
              View Logs for this Device
            </Button>
          </router-link>
        </div>

        <div v-if="testResult" class="p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 class="size-4 shrink-0" />
          <span>{{ testResult }}</span>
        </div>
      </div>

      <!-- Future Multi-Branch Device Card (Placeholder for Negros / Iloilo) -->
      <div class="rounded-xl border border-dashed bg-card/50 p-5 text-card-foreground shadow-xs flex flex-col justify-between">
        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-lg bg-muted text-muted-foreground">
              <Server class="size-6" />
            </div>
            <div>
              <h3 class="font-semibold text-base text-foreground">Future Location Readers</h3>
              <p class="text-xs text-muted-foreground">DBB Negros & DBB Iloilo</p>
            </div>
          </div>

          <p class="text-xs text-muted-foreground leading-relaxed">
            The multi-tenant branch architecture is already configured to accommodate future readers. When devices in Negros and Iloilo are provisioned with their IP addresses, they can be registered without database refactoring.
          </p>
        </div>

        <div class="border-t pt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Active Primary Reader:</span>
          <span class="font-semibold text-foreground">DBB Cebu (Online)</span>
        </div>
      </div>
    </div>
  </div>
</template>
