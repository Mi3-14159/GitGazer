<script setup lang="ts">
    import Navigation from '@/components/Navigation.vue';
    import {useAuth} from '@/composables/useAuth';
    import {UserAttributes} from '@common/types';
    import {onMounted, ref} from 'vue';

    const {getUserAttributes} = useAuth();

    const user = ref<UserAttributes>();

    onMounted(async () => {
        user.value = await getUserAttributes();
    });
</script>

<template>
    <Navigation
        :username="user?.nickname"
        :picture-url="user?.picture"
    />
    <v-main>
        <div class="page-header px-6 pt-5 pb-2">
            <h1 class="text-h5 font-weight-medium">{{ $route.meta.title }}</h1>
        </div>
        <router-view v-slot="{Component}">
            <transition
                name="fade"
                mode="out-in"
            >
                <component :is="Component" />
            </transition>
        </router-view>
    </v-main>
</template>

<style scoped>
    .fade-enter-active,
    .fade-leave-active {
        transition: opacity 0.15s ease;
    }
    .fade-enter-from,
    .fade-leave-to {
        opacity: 0;
    }
</style>
