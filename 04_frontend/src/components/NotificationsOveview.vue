<script setup lang="ts">
import { generateClient, type GraphQLQuery } from 'aws-amplify/api';
import {
  putNotificationRule,
  PutNotificationRuleInput,
  PutNotificationRuleResponse,
  NotificationRule,
  ListNotificationRulesResponse,
  listNotificationRules,
} from '../queries';
import { reactive, ref } from 'vue';
import NotificationCard from './NotificationCard.vue';
import NotificationDetailsCard from './NotificationDetailsCard.vue';
import { fetchAuthSession } from 'aws-amplify/auth';

const client = generateClient();
const notificationRules = reactive(new Map<string, NotificationRule>());
const dialog = ref(false);
const userGroups = ref<Array<string>>([]);

const handlePutNotificationRule = async (
  putNotificationRuleInput: PutNotificationRuleInput,
) => {
  try {
    const response = await client.graphql<
      GraphQLQuery<PutNotificationRuleResponse>
    >({
      query: putNotificationRule(putNotificationRuleInput),
    });
    notificationRules.set(
      `${response.data.putNotificationRule.integrationId}-${response.data.putNotificationRule.owner}/${response.data.putNotificationRule.repository_name}/${response.data.putNotificationRule.workflow_name}`,
      response.data.putNotificationRule,
    );
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

const getUserGroups = async () => {
  const session = await fetchAuthSession();

  const groups: string[] =
    (session.tokens?.accessToken.payload['cognito:groups'] as string[]) ?? [];
  groups.forEach(group => userGroups.value.push(group));
};

getUserGroups();

const onSave = async (notificationRule: NotificationRule) => {
  await handlePutNotificationRule(notificationRule);
  dialog.value = false;
};
</script>

<template>
  <v-main>
    <v-row
      align="start"
      v-for="[key, notificationRule] in notificationRules"
      :key="key"
      no-gutters
    >
      <NotificationCard :notificationRule="notificationRule" />
    </v-row>
    <v-bottom-navigation :elevation="0">
      <v-dialog v-model="dialog" max-width="600">
        <template v-slot:activator="{ props: activatorProps }">
          <v-btn
            prepend-icon="mdi-plus"
            text="Add"
            v-bind="activatorProps"
          ></v-btn>
        </template>
        <NotificationDetailsCard
          v-if="dialog"
          :onClose="() => (dialog = false)"
          :integrations="userGroups"
          :onSave="onSave"
        />
      </v-dialog>
    </v-bottom-navigation>
  </v-main>
</template>

<style scoped></style>
