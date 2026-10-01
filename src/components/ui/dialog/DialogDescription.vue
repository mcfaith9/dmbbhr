<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { DialogDescription, type DialogDescriptionProps } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<DialogDescriptionProps & { class?: HTMLAttributes["class"] }>()
</script>

<template>
  <DialogDescription
    data-slot="dialog-description"
    :class="cn('text-muted-foreground text-xs leading-relaxed', props.class)"
    v-bind="props"
  >
    <slot />
  </DialogDescription>
</template>
