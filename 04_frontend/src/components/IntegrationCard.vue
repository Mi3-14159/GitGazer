<script setup lang="ts">
import type { Integration } from '../queries';

const props = defineProps<{
  integration: Integration;
  onDelete: (id: string) => void;
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
    <v-card-actions>
      <v-spacer></v-spacer>
      <v-dialog max-width="500">
        <template v-slot:activator="{ props: activatorProps }">
          <v-btn v-bind="activatorProps" color="error" text="delete"></v-btn>
        </template>

        <template v-slot:default="{ isActive }">
          <v-card>
            <v-card-text>
              Do you really want to delete this integration? This is
              irreversible and will break your current import jobs!
            </v-card-text>
            <v-card-actions>
              <v-btn
                text="Yes, delete"
                color="error"
                @click="onDelete(props.integration.id)"
              ></v-btn>
            </v-card-actions>
          </v-card>
        </template>
      </v-dialog>
    </v-card-actions>
  </v-card>
</template>
