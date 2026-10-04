<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  Calendar as CalendarIcon,
  RefreshCw,
  Search,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Database,
  Globe,
  Tag,
  ShieldCheck
} from '@lucide/vue'
import { holidayService, type HolidayItem } from '@/services/holidays'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

const currentYear = new Date().getFullYear()
const selectedYear = ref<number>(currentYear)
const holidays = ref<HolidayItem[]>([])
const loading = ref(false)
const searchQuery = ref('')
const selectedTypeFilter = ref<string>('all')

// Status & source
const activeSource = ref<'local' | 'api'>('local')
const isFallback = ref(false)
const sourceErrorMessage = ref<string | undefined>()

const availableYears = [2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032]

async function loadHolidays() {
  loading.value = true
  sourceErrorMessage.value = undefined
  try {
    const res = await holidayService.getHolidays(selectedYear.value)
    holidays.value = res.holidays
    activeSource.value = res.activeSource
    isFallback.value = res.isFallback
    sourceErrorMessage.value = res.errorMessage
  } catch (err: any) {
    sourceErrorMessage.value = err.message || 'Failed to load holidays'
  } finally {
    loading.value = false
  }
}

watch(selectedYear, () => {
  loadHolidays()
})

onMounted(() => {
  loadHolidays()
})

// Filtered list
const filteredHolidays = computed(() => {
  return holidays.value.filter(h => {
    // Search filter
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim()
      const matchName = h.name.toLowerCase().includes(q)
      const matchDate = h.date.includes(q)
      const matchType = h.type.toLowerCase().includes(q)
      const matchScope = (h.scope || '').toLowerCase().includes(q)
      if (!matchName && !matchDate && !matchType && !matchScope) {
        return false
      }
    }

    // Type filter
    if (selectedTypeFilter.value !== 'all') {
      if (selectedTypeFilter.value === 'Local') {
        if (!h.scope?.toLowerCase().includes('cebu') && h.type !== 'Local Holiday') {
          return false
        }
      } else if (h.type !== selectedTypeFilter.value) {
        return false
      }
    }

    return true
  })
})

// Summary metrics
const regularCount = computed(() => holidays.value.filter(h => h.type === 'Regular').length)
const specialCount = computed(() => holidays.value.filter(h => h.type.startsWith('Special')).length)
const localCount = computed(() => holidays.value.filter(h => h.scope?.toLowerCase().includes('cebu') || h.type === 'Local Holiday').length)

// Format date helper: "2026-04-02" -> "April 2, 2026"
function formatDateLong(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    return dt.toLocaleDateString('en-US', {
      timeZone: 'UTC',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  } catch {
    return dateStr
  }
}

// Format day of week helper: "2026-04-02" -> "Thursday"
function formatDayOfWeek(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    return dt.toLocaleDateString('en-US', {
      timeZone: 'UTC',
      weekday: 'long'
    })
  } catch {
    return ''
  }
}

function getTypeBadgeVariant(type: string, scope?: string): 'default' | 'secondary' | 'outline' {
  if (scope?.toLowerCase().includes('cebu') || type === 'Local Holiday' || type === 'Local') {
    return 'outline'
  }
  if (type === 'Regular') {
    return 'default'
  }
  return 'secondary'
}

function getTypeBadgeClass(type: string, scope?: string): string {
  if (scope?.toLowerCase().includes('cebu') || type === 'Local Holiday' || type === 'Local') {
    return 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 font-semibold'
  }
  if (type === 'Regular') {
    return 'bg-emerald-600 text-white font-semibold'
  }
  return 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30 font-semibold'
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header & Controls -->
    <div class="rounded-xl border bg-card p-5 shadow-xs space-y-4">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b pb-4">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-base font-bold text-foreground flex items-center gap-2">
              <CalendarIcon class="size-4 text-primary" />
              <span>Official Holiday Calendar</span>
            </h2>
            <Badge variant="outline" class="text-xs bg-muted/30 flex items-center gap-1">
              <MapPin class="size-3 text-primary" />
              <span>Location: Cebu City, Philippines</span>
            </Badge>
          </div>
          <p class="text-xs text-muted-foreground mt-1">
            Automated official Philippine National and Cebu City local holidays for payroll and attendance computations.
          </p>
        </div>

        <!-- Year Selector & Refresh -->
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-semibold text-foreground">Year:</span>
            <Select v-model.number="selectedYear">
              <SelectTrigger class="w-[110px] h-8 text-xs font-mono font-bold bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="y in availableYears" :key="y" :value="y">
                    {{ y }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            class="h-8 text-xs gap-1.5 cursor-pointer shadow-xs"
            :disabled="loading"
            @click="loadHolidays"
          >
            <RefreshCw class="size-3" :class="loading ? 'animate-spin' : ''" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      <!-- Provider Status Banner -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-muted/30 border text-xs">
        <div class="flex items-center gap-2">
          <Database v-if="activeSource === 'local'" class="size-4 text-emerald-600 shrink-0" />
          <Globe v-else class="size-4 text-primary shrink-0" />
          <div>
            <div class="font-medium text-foreground">
              <span v-if="activeSource === 'local'">
                Local Offline Data Active
                <span v-if="isFallback" class="text-amber-600">(API fallback triggered)</span>
              </span>
              <span v-else>
                External Holiday API Synchronized
              </span>
            </div>
            <div class="text-[11px] text-muted-foreground">
              Official DOLE Proclamations, Easter Movable Computations & Cebu City Charter Day automatically calculated.
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
            <CheckCircle2 class="size-3" />
            Offline Ready
          </span>
        </div>
      </div>

      <!-- Summary Metrics Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div class="p-3 rounded-lg border bg-card shadow-2xs">
          <div class="text-muted-foreground text-[11px]">Total Holidays ({{ selectedYear }})</div>
          <div class="text-xl font-bold font-mono text-foreground mt-0.5">{{ holidays.length }}</div>
        </div>
        <div class="p-3 rounded-lg border bg-card shadow-2xs">
          <div class="text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">Regular Holidays</div>
          <div class="text-xl font-bold font-mono text-foreground mt-0.5">{{ regularCount }}</div>
          <div class="text-[10px] text-muted-foreground">200% worked / 100% rest</div>
        </div>
        <div class="p-3 rounded-lg border bg-card shadow-2xs">
          <div class="text-amber-600 dark:text-amber-400 text-[11px] font-medium">Special Non-Working</div>
          <div class="text-xl font-bold font-mono text-foreground mt-0.5">{{ specialCount }}</div>
          <div class="text-[10px] text-muted-foreground">130% worked / no pay rest</div>
        </div>
        <div class="p-3 rounded-lg border bg-card shadow-2xs">
          <div class="text-purple-600 dark:text-purple-400 text-[11px] font-medium">Local (Cebu City)</div>
          <div class="text-xl font-bold font-mono text-foreground mt-0.5">{{ localCount }}</div>
          <div class="text-[10px] text-muted-foreground">Charter Day & Provincial</div>
        </div>
      </div>

      <!-- Filters Row -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div class="relative w-full sm:w-72">
          <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            placeholder="Filter holidays by name, date..."
            class="pl-8 text-xs h-8 bg-card"
          />
        </div>

        <div class="flex items-center gap-2 self-start sm:self-auto">
          <span class="text-xs text-muted-foreground whitespace-nowrap">Classification:</span>
          <Select v-model="selectedTypeFilter">
            <SelectTrigger class="w-[180px] h-8 text-xs bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All Classifications</SelectItem>
                <SelectItem value="Regular">Regular Holiday</SelectItem>
                <SelectItem value="Special Non-Working">Special Non-Working</SelectItem>
                <SelectItem value="Local">Local (Cebu City)</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <!-- Error Message if any -->
      <div v-if="sourceErrorMessage" class="p-2.5 rounded bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
        <AlertCircle class="size-4 shrink-0" />
        <span>{{ sourceErrorMessage }}</span>
      </div>

      <!-- Holidays Table -->
      <div class="rounded-xl border bg-card shadow-2xs overflow-hidden">
        <Table class="text-xs">
          <TableHeader>
            <TableRow class="bg-muted/40 hover:bg-muted/40">
              <TableHead class="font-semibold text-foreground w-[160px]">Date</TableHead>
              <TableHead class="font-semibold text-foreground w-[90px]">Day</TableHead>
              <TableHead class="font-semibold text-foreground">Holiday Name</TableHead>
              <TableHead class="font-semibold text-foreground">Classification</TableHead>
              <TableHead class="font-semibold text-foreground">Scope</TableHead>
              <TableHead class="font-semibold text-foreground">DOLE Pay Rule</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <TableRow
              v-for="h in filteredHolidays"
              :key="h.id || h.date + h.name"
              class="hover:bg-muted/30 transition-colors"
            >
              <!-- Date -->
              <TableCell class="font-mono font-medium text-foreground whitespace-nowrap py-3">
                <div class="flex items-center gap-1.5">
                  <CalendarIcon class="size-3 text-muted-foreground" />
                  <span>{{ formatDateLong(h.date) }}</span>
                </div>
              </TableCell>

              <!-- Day of Week -->
              <TableCell class="text-muted-foreground font-medium py-3">
                {{ formatDayOfWeek(h.date) }}
              </TableCell>

              <!-- Holiday Name -->
              <TableCell class="py-3">
                <div class="font-semibold text-foreground text-sm">
                  {{ h.name }}
                </div>
                <div v-if="h.legalBasis" class="text-[10px] text-muted-foreground">
                  Basis: {{ h.legalBasis }}
                </div>
              </TableCell>

              <!-- Classification Badge -->
              <TableCell class="py-3">
                <Badge
                  :variant="getTypeBadgeVariant(h.type, h.scope)"
                  :class="['text-[11px] px-2 py-0.5', getTypeBadgeClass(h.type, h.scope)]"
                >
                  <span v-if="h.scope?.toLowerCase().includes('cebu')">Local Holiday</span>
                  <span v-else>{{ h.type }} Holiday</span>
                </Badge>
              </TableCell>

              <!-- Scope -->
              <TableCell class="py-3 text-muted-foreground">
                <span class="inline-flex items-center gap-1 font-medium">
                  <Tag class="size-2.5" />
                  {{ h.scope || 'National' }}
                </span>
              </TableCell>

              <!-- Pay Rule -->
              <TableCell class="py-3 text-[11px] text-muted-foreground">
                <span v-if="h.type === 'Regular'" class="text-emerald-700 dark:text-emerald-400 font-medium">
                  200% worked / 100% unworked pay
                </span>
                <span v-else-if="h.type.startsWith('Special')" class="text-amber-700 dark:text-amber-400 font-medium">
                  130% worked / unworked no pay
                </span>
                <span v-else>
                  {{ h.payRule || 'Standard rate' }}
                </span>
              </TableCell>
            </TableRow>

            <TableRow v-if="filteredHolidays.length === 0">
              <TableCell colspan="6" class="h-28 text-center text-muted-foreground">
                No holidays found matching your criteria for year {{ selectedYear }}.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- Explanatory DOLE Compliance Footer -->
      <div class="rounded-lg border bg-muted/20 p-3 text-[11px] text-muted-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <ShieldCheck class="size-4 text-primary shrink-0" />
          <span>DOLE Handbook on Workers' Statutory Monetary Benefits strictly applies to attendance and payroll cut-offs.</span>
        </div>
        <span class="font-mono">Philippine Standard Time (Asia/Manila)</span>
      </div>
    </div>
  </div>
</template>
