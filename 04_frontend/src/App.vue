<script setup lang="ts">
import { ref } from 'vue'
import { getCurrentUser, type AuthUser } from 'aws-amplify/auth'
import Login from './components/Login.vue'
import AppContent from './components/AppContent.vue'

const user = ref<AuthUser>()

const getUser = async () => {
    try {
        const currentUser = await getCurrentUser()
        user.value = currentUser
    } catch (error) {
        console.info('Not signed in:', error)
    }
}

getUser()
</script>

<template>
    <Suspense>
        <div className="app">
            <AppContent v-if="user" />
            <Login v-else />
        </div>
    </Suspense>
</template>

<style scoped></style>
