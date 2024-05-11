<script setup lang="ts">
import type { NotificationRule } from '../queries/index';

const props = defineProps<{
  notificationRule: NotificationRule;
}>();
</script>

<template>
  <v-card class="ma-2 rounded-lg">
    <v-card-title
      >{{
        [
          props.notificationRule.owner,
          props.notificationRule.repository_name,
          props.notificationRule.workflow_name,
        ]
          .filter(elm => elm)
          .join('/')
      }}
    </v-card-title>
    <v-card-text
      >Enabled: {{ props.notificationRule.enabled }}<br />
      Created at: {{ props.notificationRule.created_at }}<br />
      Updated at: {{ props.notificationRule.updated_at }}
    </v-card-text>
  </v-card>
</template>
