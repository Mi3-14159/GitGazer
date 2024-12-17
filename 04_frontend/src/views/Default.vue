<script setup lang="ts">
    import {ref} from 'vue';
    import {getCurrentUser, type FetchUserAttributesOutput, fetchUserAttributes} from 'aws-amplify/auth';
    import {useRouter} from 'vue-router';
    import Navigation from '../components/Navigation.vue';
    import WorkflowOverview from '../components/WorkflowOverview.vue';
    import NotificationsOveview from '../components/NotificationsOveview.vue';
    import IntegrationsOverview from '../components/IntegrationsOverview.vue';

    const router = useRouter();

    const user = ref<FetchUserAttributesOutput>();

    const getUser = async () => {
        await getCurrentUser();
        const currentUser = await fetchUserAttributes();
        user.value = currentUser;
    };

    getUser();
</script>

<template>
    <v-app id="gitgazer">
        <Navigation
            :username="user?.nickname"
            :picture-url="user?.picture"
        />
        <WorkflowOverview v-if="router.currentRoute.value.name === 'dashboard'" />
        <NotificationsOveview v-else-if="router.currentRoute.value.name === 'notifications'" />
        <IntegrationsOverview v-else-if="router.currentRoute.value.name === 'integrations'" />
    </v-app>
</template>
