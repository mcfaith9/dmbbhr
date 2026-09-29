<script setup lang="ts">
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
}>()

const emit = defineEmits<{
  (e: 'update:page', page: number): void
  (e: 'update:pageSize', size: number): void
}>()

function goTo(page: number) {
  if (page >= 1 && page <= props.totalPages && page !== props.currentPage) {
    emit('update:page', page)
  }
}
</script>

<template>
  <div class="flex flex-col sm:flex-row items-center justify-between gap-4 py-2 px-1 text-xs text-muted-foreground">
    <div class="flex items-center gap-2">
      <span>
        Showing
        <strong class="text-foreground">
          {{ totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1 }}
        </strong>
        to
        <strong class="text-foreground">
          {{ Math.min(currentPage * pageSize, totalItems) }}
        </strong>
        of
        <strong class="text-foreground">{{ totalItems }}</strong>
        records
      </span>
    </div>

    <div class="flex items-center gap-2">
      <div class="flex items-center space-x-1">
        <Button
          variant="outline"
          size="sm"
          class="h-8 w-8 p-0"
          :disabled="currentPage <= 1"
          @click="goTo(1)"
        >
          <ChevronsLeft class="size-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="h-8 w-8 p-0"
          :disabled="currentPage <= 1"
          @click="goTo(currentPage - 1)"
        >
          <ChevronLeft class="size-4" />
        </Button>

        <span class="px-2 text-xs font-medium text-foreground">
          Page {{ currentPage }} of {{ totalPages || 1 }}
        </span>

        <Button
          variant="outline"
          size="sm"
          class="h-8 w-8 p-0"
          :disabled="currentPage >= totalPages"
          @click="goTo(currentPage + 1)"
        >
          <ChevronRight class="size-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="h-8 w-8 p-0"
          :disabled="currentPage >= totalPages"
          @click="goTo(totalPages)"
        >
          <ChevronsRight class="size-4" />
        </Button>
      </div>

      <select
        :value="pageSize"
        class="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @change="(e: any) => emit('update:pageSize', Number(e.target.value))"
      >
        <option :value="10">10 / page</option>
        <option :value="25">25 / page</option>
        <option :value="50">50 / page</option>
        <option :value="100">100 / page</option>
      </select>
    </div>
  </div>
</template>
