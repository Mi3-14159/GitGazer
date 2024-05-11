<script setup lang="ts">
import { signOut } from 'aws-amplify/auth';
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const props = defineProps<{
  username: string;
}>();

const drawer = ref(true);
const rail = ref(true);
</script>

<template>
  <v-navigation-drawer
    v-model="drawer"
    :rail="rail"
    permanent
    @click="rail = false"
  >
    <v-list-item
      prepend-avatar="https://randomuser.me/api/portraits/men/85.jpg"
      :title="props.username"
    >
      <template v-slot:append>
        <v-btn
          icon="mdi-chevron-left"
          variant="text"
          @click.stop="rail = !rail"
        ></v-btn>
      </template>
    </v-list-item>

    <v-divider></v-divider>

    <nav>
      <v-list density="compact" nav>
        <v-list-item
          prepend-icon="mdi-view-dashboard"
          title="Dashboard"
          value="dashboard"
          @click="router.push('/dashboard')"
        ></v-list-item>
      </v-list>
      <v-list density="compact" nav>
        <v-list-item
          prepend-icon="mdi-bell-ring"
          title="Notifications"
          value="notifications"
          @click="router.push('/notifications')"
        ></v-list-item>
      </v-list>
      <v-list density="compact" nav>
        <v-list-item
          prepend-icon="mdi-account-cog"
          title="Integrations"
          value="integrations"
          @click="router.push('/integrations')"
        ></v-list-item>
      </v-list>
      <v-list density="compact" nav>
        <v-list-item
          prepend-icon="mdi-logout"
          title="Logout"
          value="logout"
          :onclick="signOut"
        ></v-list-item>
      </v-list>
    </nav>
  </v-navigation-drawer>
</template>
