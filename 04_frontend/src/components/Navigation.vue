<script setup lang="ts">
    import {useAuth} from '@/composables/useAuth';
    import {ref} from 'vue';
    import {useRouter} from 'vue-router';

    const router = useRouter();
    const {signOut} = useAuth();

    const props = defineProps<{
        username?: string;
        pictureUrl?: string;
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
        width="180"
    >
        <v-list-item
            :prepend-avatar="pictureUrl"
            :title="rail ? undefined : props.username"
            :density="rail ? 'default' : 'compact'"
            :slim="rail"
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
            <v-list
                density="compact"
                nav
            >
                <v-list-item
                    prepend-icon="mdi-view-dashboard"
                    title="Dashboard"
                    value="dashboard"
                    @click="router.push('/dashboard')"
                ></v-list-item>
                <v-list-item
                    prepend-icon="mdi-bell-ring"
                    title="Notifications"
                    value="notifications"
                    @click="router.push('/notifications')"
                ></v-list-item>
                <v-list-item
                    prepend-icon="mdi-account-cog"
                    title="Integrations"
                    value="integrations"
                    @click="router.push('/integrations')"
                ></v-list-item>
                <v-list-item
                    prepend-icon="mdi-logout"
                    title="Logout"
                    value="logout"
                    @click="async () => {
                        await signOut();
                        await router.push('/login');
                    }"
                ></v-list-item>
            </v-list>
        </nav>
    </v-navigation-drawer>
</template>
