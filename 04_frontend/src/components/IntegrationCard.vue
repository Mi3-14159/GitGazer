<script setup lang="ts">
import type { Integration } from '../queries/index';

const props = defineProps<{
  integration: Integration;
}>();
</script>

<template>
  <v-card class="ma-2 rounded-lg">
    <v-card-title>{{ props.integration.id }}</v-card-title>
    <v-card-text
      >Secret: {{ props.integration.secret }}<br />
      Users: {{ props.integration.users.join(', ') }}
    </v-card-text>
  </v-card>
</template>
