<script setup lang="ts">
import { generateClient, type GraphQLQuery } from 'aws-amplify/api';
import {
  listIntegrations,
  ListIntegrationsResponse,
  Integration,
} from '../queries/index';
import { reactive } from 'vue';
import IntegrationCard from './IntegrationCard.vue';

const client = generateClient();
const integrations = reactive(new Map());

const handleListIntegrations = async () => {
  try {
    const response = await client.graphql<
      GraphQLQuery<ListIntegrationsResponse>
    >({
      query: listIntegrations,
    });
    response.data.listIntegrations.forEach((integration: Integration) => {
      integrations.set(integration.id, integration);
    });
  } catch (error) {
    console.error(error);
  }
};

handleListIntegrations();
</script>

<template>
  <v-main>
    <v-row
      align="start"
      v-for="[key, integration] in integrations"
      :key="key"
      no-gutters
    >
      <IntegrationCard :integration="integration" />
    </v-row>
  </v-main>
</template>

<style scoped></style>
