<script setup lang="ts">
    import {ref} from 'vue';
    import {getCurrentUser, type AuthUser} from 'aws-amplify/auth';
    import {useRouter, RouterView} from 'vue-router';

    const router = useRouter();

    document.title = 'GitGazer';

    const user = ref<AuthUser>();

    const getUser = async () => {
        try {
            const currentUser = await getCurrentUser();
            user.value = currentUser;
        } catch (error) {
            router.push('/login');
        }
    };

    getUser();
</script>

<template>
    <RouterView />
</template>
