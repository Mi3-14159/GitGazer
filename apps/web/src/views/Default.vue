<script setup lang="ts">
    import AppFooter from '@/components/layout/AppFooter.vue';
    import AppHeader from '@/components/layout/AppHeader.vue';
    import AppNav from '@/components/layout/AppNav.vue';
</script>

<template>
    <div class="min-h-screen bg-background flex flex-col">
        <AppHeader />
        <AppNav />

        <!-- Main Content -->
        <main class="flex-1 container mx-auto px-4 pb-4 flex flex-col">
            <router-view v-slot="{Component}">
                <transition
                    name="fade"
                    mode="out-in"
                >
                    <component
                        :is="Component"
                        class="flex-1 min-h-0 flex flex-col"
                    />
                </transition>
            </router-view>
        </main>

        <AppFooter />
    </div>
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
