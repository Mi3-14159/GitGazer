<script setup lang="ts">
    import {signInWithRedirect} from 'aws-amplify/auth';
    import {getCurrentUser} from 'aws-amplify/auth';
    import {useRouter} from 'vue-router';

    const router = useRouter();

    const getUser = async () => {
        try {
            await getCurrentUser();
            router.push('/dashboard');
        } catch (error) {}
    };

    getUser();
</script>

<template>
    <v-container class="d-flex justify-center">GitGazer</v-container>
    <v-divider></v-divider>
    <v-container class="d-flex justify-center">
        <v-btn :onClick="() => signInWithRedirect({provider: {custom: 'Github'}})">Login with Github </v-btn>
    </v-container>
</template>
