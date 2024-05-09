<script setup lang="ts">
import { ref } from 'vue';
import { getCurrentUser, type AuthUser } from 'aws-amplify/auth';
import { useRouter } from 'vue-router';
import Navigation from '../components/Navigation.vue';
import AppContent from '../components/AppContent.vue';

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
    <AppContent v-if="router.currentRoute.value.name === 'dashboard'" />
  </v-app>
</template>
