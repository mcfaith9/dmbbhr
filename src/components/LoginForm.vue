<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import LoginForm from './blocks/components/LoginForm.vue'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <LoginForm :class="props.class" />
</template>
