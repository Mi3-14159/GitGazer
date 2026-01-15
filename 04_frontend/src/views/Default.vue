<script setup lang="ts">
    import IntegrationsOverview from '@/components/IntegrationsOverview.vue';
    import Navigation from '@/components/Navigation.vue';
    import NotificationsOveview from '@/components/NotificationsOveview.vue';
    import WorkflowOverview from '@/components/WorkflowOverview.vue';
    import {onMounted, ref} from 'vue';
    import {useRouter} from 'vue-router';

    const router = useRouter();
    
    // User info - for now just placeholder
    const user = ref<{nickname?: string; picture?: string}>();

    onMounted(async () => {
        // TODO: Fetch user attributes from backend
        user.value = {
            nickname: 'User',
            picture: undefined,
        };
    });
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
