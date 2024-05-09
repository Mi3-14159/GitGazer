<script setup lang="ts">
import { signInWithRedirect } from 'aws-amplify/auth';
</script>

<template>
  <v-container class="d-flex justify-center">GitGazer</v-container>
  <v-divider></v-divider>
  <v-container class="d-flex justify-center">
    <v-btn
      :onClick="() => signInWithRedirect({ provider: { custom: 'Github' } })"
      >Login with Github
    </v-btn>
  </v-container>
</template>
