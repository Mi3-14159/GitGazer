<script setup lang="ts">
import { ref } from "vue";
import { getCurrentUser, type AuthUser } from "aws-amplify/auth";
import Login from "./components/Login.vue";
import Navigation from "./components/Navigation.vue";
import AppContent from "./components/AppContent.vue";

document.title = "GitGazer";

const user = ref<AuthUser>();

const getUser = async () => {
  try {
    const currentUser = await getCurrentUser();
    user.value = currentUser;
  } catch (error) {
    console.info("Not signed in:", error);
  }
};

getUser();
</script>

<template>
  <v-app id="gitgazer" v-if="user">
    <Navigation :username="user.username" />
    <AppContent />
  </v-app>
  <v-app id="gitgazer-login" v-else>
    <Login />
  </v-app>
</template>
