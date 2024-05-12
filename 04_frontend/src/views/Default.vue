<script setup lang="ts">
import { ref } from 'vue';
import { getCurrentUser, type AuthUser } from 'aws-amplify/auth';
import { useRouter } from 'vue-router';
import Navigation from '../components/Navigation.vue';
import WorkflowOverview from '../components/WorkflowOverview.vue';
import IntegrationsOverview from '../components/IntegrationsOverview.vue';

const router = useRouter();

const user = ref<AuthUser>();

const getUser = async () => {
  try {
    const currentUser = await getCurrentUser();
    user.value = currentUser;
  } catch (error) {}
};

getUser();
</script>

<template>
  <v-app id="gitgazer">
    <Navigation :username="user?.username ?? ''" />
    <WorkflowOverview v-if="router.currentRoute.value.name === 'dashboard'" />
    <NotificationsOveview
      v-else-if="router.currentRoute.value.name === 'notifications'"
    />
    <IntegrationsOverview
      v-else-if="router.currentRoute.value.name === 'integrations'"
    />
  </v-app>
</template>
