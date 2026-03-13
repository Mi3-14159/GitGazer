<script setup lang="ts">
    import ThemeToggle from '@/components/ThemeToggle.vue';
    import {useAuth} from '@/composables/useAuth';
    import {computed, ref} from 'vue';
    import {useRoute, useRouter} from 'vue-router';

    const {signOut} = useAuth();
    const router = useRouter();
    const route = useRoute();

    const props = defineProps<{
        username?: string;
        pictureUrl?: string;
    }>();

    const drawer = ref(true);
    const rail = ref(true);

    const activeRoute = computed(() => {
        const name = route.name as string;
        return name ? [name] : [];
    });
</script>

<template>
    <v-navigation-drawer
        v-model="drawer"
        :rail="rail"
        permanent
        @click="rail = !rail"
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
                v-model:selected="activeRoute"
                density="compact"
                nav
                mandatory
                color="primary"
            >
                <v-list-item
                    prepend-icon="mdi-view-dashboard"
                    title="Dashboard"
                    value="dashboard"
                    to="/dashboard"
                    @click.stop
                ></v-list-item>
                <v-list-item
                    prepend-icon="mdi-bell-ring"
                    title="Notifications"
                    value="notifications"
                    to="/notifications"
                    @click.stop
                ></v-list-item>
                <v-list-item
                    prepend-icon="mdi-connection"
                    title="Integrations"
                    value="integrations"
                    to="/integrations"
                    @click.stop
                ></v-list-item>
                <v-list-item
                    prepend-icon="mdi-chart-box-outline"
                    title="Metrics"
                    value="metrics"
                    to="/metrics"
                    @click.stop
                ></v-list-item>
                <v-list-item
                    prepend-icon="mdi-logout"
                    title="Logout"
                    value="logout"
                    @click.stop="signOut"
                ></v-list-item>
            </v-list>
        </nav>

        <template v-slot:append>
            <div class="pa-2 d-flex justify-center">
                <ThemeToggle :rail="rail" />
            </div>
        </template>
    </v-navigation-drawer>
</template>
