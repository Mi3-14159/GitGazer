<script setup lang="ts">
import type { Integration } from '../queries/index';

const props = defineProps<{
  integration: Integration;
}>();

const integrationUrl = `${import.meta.env.VITE_IMPORT_URL_BASE}${props.integration.id}`;
</script>

<template>
  <v-card class="ma-2 rounded-lg">
    <v-card-title>{{ props.integration.id }}</v-card-title>
    <v-card-text
      >Secret: {{ props.integration.secret }}<br />
      Users: {{ props.integration.users.join(', ') }}<br />
      Webhook payload URL:
      <a :href="integrationUrl" target="_blank">{{ integrationUrl }}</a>
    </v-card-text>
  </v-card>
</template>
