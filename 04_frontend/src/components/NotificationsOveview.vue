<script setup lang="ts">
import { generateClient, type GraphQLQuery } from 'aws-amplify/api';
import {
  putNotificationRule,
  PutNotificationRuleInput,
  PutNotificationRuleResponse,
  NotificationRule,
  ListNotificationRulesResponse,
  listNotificationRules,
} from '../queries/index';
import { reactive } from 'vue';
import NotificationDetailsCard from './NotificationDetailsCard.vue';

const client = generateClient();
const notificationRules = reactive(new Map<string, NotificationRule>());

const handlePutNotificationRule = async (
  putNotificationRuleInput: PutNotificationRuleInput,
) => {
  try {
    const response = await client.graphql<
      GraphQLQuery<PutNotificationRuleResponse>
    >({
      query: putNotificationRule(putNotificationRuleInput),
    });
    notificationRules.set(``, response.data.putNotificationRule);
  } catch (error) {
    console.error(error);
  }
};

const handleListNotificationRules = async () => {
  try {
    const response = await client.graphql<
      GraphQLQuery<ListNotificationRulesResponse>
    >({
      query: listNotificationRules,
    });
    response.data.listNotificationRules.items?.forEach(
      (notificationRule: NotificationRule) => {
        notificationRules.set(
          `${notificationRule.integrationId}-${notificationRule.owner}/${notificationRule.repository_name}/${notificationRule.workflow_name}`,
          notificationRule,
        );
      },
    );
  } catch (error) {
    console.error(error);
  }
};

handleListNotificationRules();
</script>

<template>
  <v-main>
    <v-row
      align="start"
      v-for="[key, notificationRule] in notificationRules"
      :key="key"
      no-gutters
    >
      <NotificationDetailsCard :notificationRule="notificationRule" />
    </v-row>
    <v-bottom-navigation :elevation="0">
      <v-btn value="add">
        <v-icon>mdi-plus</v-icon>
        <span>Add</span>
      </v-btn>
    </v-bottom-navigation>
  </v-main>
</template>

<style scoped></style>
