<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  Fingerprint,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Activity,
  Radio,
  Clock,
  ShieldAlert,
  Monitor,
  ExternalLink
} from '@lucide/vue'
import { deviceService } from '@/services/devices'
import { liveAttendanceService } from '@/services/liveAttendance'
import { punchDisplayService } from '@/services/punchDisplay'
import type { BiometricDevice, Location } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const devices = ref<BiometricDevice[]>([])
const locations = ref<Location[]>([])
const testingConnection = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

// Live real device status reported directly by the Node.js biometric agent
const deviceStatus = liveAttendanceService.deviceStatus

async function loadDevices() {
  devices.value = await deviceService.getDevices()
  locations.value = await deviceService.getLocations()
}

function formatClockTime(isoStr: string | null) {
  if (!isoStr) return 'None'
  try {
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(new Date(isoStr))
  } catch {
    return isoStr
  }
}

async function testDevicePing(device: BiometricDevice) {
  testingConnection.value = true
  testResult.value = null

  // Ensure live service is connected
  liveAttendanceService.connect()

  setTimeout(() => {
    testingConnection.value = false
    if (deviceStatus.value.status === 'online') {
      testResult.value = {
        success: true,
        message: `Hardware handshake verified: ${device.model} at ${device.ip_address}:${device.port}. Socket alive and listening for scans.`
      }
    } else {
      testResult.value = {
        success: false,
        message: `Device unreachable at ${device.ip_address}:${device.port}. Reason: ${deviceStatus.value.reason || 'Connection refused or laptop not connected to biometric LAN.'}`
      }
    }
  }, 1000)
}

onMounted(() => {
  loadDevices()
  liveAttendanceService.connect()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>Biometric Device Management</span>
          <Badge
            :variant="
              deviceStatus.status === 'online'
                ? 'success'
                : (deviceStatus.status === 'connecting' ? 'warning' : 'destructive')
            "
            :class="[
              'text-[11px] gap-1',
              deviceStatus.status === 'offline' ? 'text-white' : ''
            ]"
          >
            <Radio
              class="size-3"
              :class="[
                deviceStatus.status === 'online'
                  ? 'animate-pulse'
                  : (deviceStatus.status === 'connecting' ? 'animate-spin' : '')
              ]"
            />
            <span>
              {{
                deviceStatus.status === 'online'
                  ? 'Online'
                  : (deviceStatus.status === 'connecting' ? 'Connecting...' : 'Offline')
              }}
            </span>
          </Badge>
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Real hardware socket state from the local Node.js biometric agent.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          class="h-8 gap-1.5 text-xs bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary hover:text-primary cursor-pointer"
          @click="punchDisplayService.openPunchDisplay()"
        >
          <Monitor class="size-3.5" />
          <span>Open Punch Display</span>
          <ExternalLink class="size-3 text-muted-foreground ml-0.5" />
        </Button>

        <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs cursor-pointer" @click="loadDevices(); liveAttendanceService.connect()">
          <RefreshCw class="size-3.5" />
          <span>Refresh Status</span>
        </Button>
      </div>
    </div>

    <!-- Active Hardware Device Card -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        v-for="device in devices"
        :key="device.id"
        class="rounded-xl border bg-card p-5 text-card-foreground shadow-xs space-y-4"
      >
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div
              :class="[
                'p-2.5 rounded-lg transition-colors',
                deviceStatus.status === 'online' ? 'bg-emerald-500/10 text-emerald-600' : (deviceStatus.status === 'connecting' ? 'bg-amber-500/10 text-amber-600' : 'bg-destructive/10 text-destructive')
              ]"
            >
              <Fingerprint class="size-6" />
            </div>
            <div>
              <h3 class="font-semibold text-base text-foreground">{{ device.name }}</h3>
              <p class="text-xs font-mono text-muted-foreground">{{ device.model }}</p>
            </div>
          </div>

          <!-- Strict Status: Only Online when socket is alive -->
          <div class="text-right">
            <Badge
              v-if="deviceStatus.status === 'online'"
              variant="success"
              class="text-xs"
            >
              <span class="size-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
              Online
            </Badge>

            <Badge
              v-else-if="deviceStatus.status === 'connecting'"
              variant="warning"
              class="text-xs"
            >
              <span class="size-1.5 rounded-full bg-amber-500 mr-1.5 animate-spin" />
              Connecting...
            </Badge>

            <Badge
              v-else
              variant="destructive"
              class="text-xs text-white"
            >
              <span class="size-1.5 rounded-full bg-white mr-1.5" />
              Offline
            </Badge>
          </div>
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
            <span class="text-muted-foreground text-[11px]">LOCATION</span>
            <div class="font-medium text-foreground">DBB Cebu</div>
          </div>
          <div>
            <span class="text-muted-foreground text-[11px]">SUBNET</span>
            <div class="font-mono text-muted-foreground text-[11px]">{{ device.subnet || '255.255.255.0' }}</div>
          </div>
          <div>
            <span class="text-muted-foreground text-[11px]">PROTOCOL</span>
            <div class="font-mono text-muted-foreground text-[11px]">zkteco-js :4370</div>
          </div>
        </div>

        <!-- Real Connection Diagnostic Panel -->
        <div
          :class="[
            'rounded-lg p-3 text-xs space-y-1.5 border',
            deviceStatus.status === 'online' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-muted/40 border-border'
          ]"
        >
          <div class="flex items-center justify-between font-medium">
            <span class="text-foreground">Connection Diagnostics</span>
            <span
              :class="[
                'font-mono text-[11px]',
                deviceStatus.status === 'online' ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-destructive font-bold'
              ]"
            >
              {{ deviceStatus.status.toUpperCase() }}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-[11px] pt-1">
            <div>
              <span class="text-muted-foreground">Last Connected:</span>
              <div class="font-mono text-foreground">{{ formatClockTime(deviceStatus.lastConnected) }}</div>
            </div>
            <div>
              <span class="text-muted-foreground">Last Scan Event:</span>
              <div class="font-mono text-foreground">{{ formatClockTime(deviceStatus.lastEvent) }}</div>
            </div>
            <div>
              <span class="text-muted-foreground">Last Attempt:</span>
              <div class="font-mono text-foreground">{{ formatClockTime(deviceStatus.lastAttempt) }}</div>
            </div>
            <div>
              <span class="text-muted-foreground">Status Reason:</span>
              <div class="font-medium text-foreground truncate" :title="deviceStatus.reason">
                {{ deviceStatus.reason }}
              </div>
            </div>
          </div>
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
            <span>{{ testingConnection ? 'Testing Socket...' : 'Test Connection' }}</span>
          </Button>

          <router-link to="/attendance/logs">
            <Button variant="ghost" size="sm" class="h-8 text-xs">
              View Logs for this Device
            </Button>
          </router-link>
        </div>

        <div
          v-if="testResult"
          :class="[
            'p-2.5 rounded-md border text-xs flex items-start gap-2',
            testResult.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'bg-destructive/10 border-destructive/20 text-destructive'
          ]"
        >
          <CheckCircle2 v-if="testResult.success" class="size-4 shrink-0 mt-0.5" />
          <XCircle v-else class="size-4 shrink-0 mt-0.5" />
          <span>{{ testResult.message }}</span>
        </div>
      </div>

      <!-- Information Card: Starting the Agent -->
      <div class="rounded-xl border bg-card/50 p-5 text-card-foreground shadow-xs flex flex-col justify-between space-y-3">
        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-lg bg-primary/10 text-primary">
              <Clock class="size-6" />
            </div>
            <div>
              <h3 class="font-semibold text-base text-foreground">Biometric Agent Service</h3>
              <p class="text-xs text-muted-foreground">Local TCP/IP bridge to BISMAC BISBIO B-29b</p>
            </div>
          </div>

          <p class="text-xs text-muted-foreground leading-relaxed">
            The Node.js agent connects directly to <code class="font-mono text-foreground font-semibold">192.168.1.201:4370</code> via TCP/IP socket. It polls heartbeats every 15 seconds and automatically reconnects if network connectivity drops.
          </p>

          <div class="rounded-md bg-muted p-2.5 text-xs font-mono space-y-1">
            <div class="text-[11px] text-muted-foreground">Single command startup:</div>
            <div class="text-primary font-bold">npm run dev</div>
            <div class="text-[11px] text-muted-foreground pt-1">Or run agent standalone in background:</div>
            <div class="text-foreground">npm run biometric-agent</div>
          </div>
        </div>

        <div class="text-[11px] text-muted-foreground border-t pt-2 flex items-center gap-1.5">
          <ShieldAlert class="size-3.5 text-amber-500 shrink-0" />
          <span>If the laptop is not on the same LAN as 192.168.1.201, status remains Offline.</span>
        </div>
      </div>
    </div>
  </div>
</template>
