<script setup lang="ts">
    import IntegrationsOverview from '@components/IntegrationsOverview.vue';
    import Navigation from '@components/Navigation.vue';
    import NotificationsOveview from '@components/NotificationsOveview.vue';
    import WorkflowOverview from '@components/WorkflowOverview.vue';
    import {fetchUserAttributes, getCurrentUser, type FetchUserAttributesOutput} from 'aws-amplify/auth';
    import {ref} from 'vue';
    import {useRouter} from 'vue-router';

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
