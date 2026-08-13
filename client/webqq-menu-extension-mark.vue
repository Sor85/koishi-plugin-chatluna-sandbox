<template>
  <Badge
    variant="secondary"
    class="webqq-menu-extension-mark ml-auto shrink-0"
    :title="SANDBOX_EXTENSION_DESCRIPTION"
  >
    沙盒扩展
    <span class="sr-only">，{{ SANDBOX_EXTENSION_DESCRIPTION }}</span>
  </Badge>
</template>

<script setup lang="ts">
import { Badge } from './components/ui/badge'
import { SANDBOX_EXTENSION_DESCRIPTION } from './webqq/sandbox-extension'
</script>
