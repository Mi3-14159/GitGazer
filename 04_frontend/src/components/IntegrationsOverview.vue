<script setup lang="ts">
import { generateClient, type GraphQLQuery } from 'aws-amplify/api';
import {
  listIntegrations,
  ListIntegrationsResponse,
  Integration,
  putIntegration,
  PutIntegrationsResponse,
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

const handlePutIntegration = async () => {
  try {
    const response = await client.graphql<
      GraphQLQuery<PutIntegrationsResponse>
    >({
      query: putIntegration,
    });

    integrations.set(
      response.data.putIntegration.id,
      response.data.putIntegration,
    );
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
    <v-bottom-navigation :elevation="0">
      <v-btn value="add" @click="handlePutIntegration">
        <v-icon>mdi-plus</v-icon>
        <span>Add</span>
      </v-btn>
    </v-bottom-navigation>
  </v-main>
</template>

<style scoped></style>
