<script setup lang="ts">
import { signOut } from 'aws-amplify/auth'
import { ref, computed } from 'vue'

const props = defineProps<{
    userId: string
    username: string
}>()

const detailsVisible = ref(false)

const toggleDetails = () => {
    detailsVisible.value = !detailsVisible.value
}

const initials = computed(() => {
    return props.username
        .split(' ')
        .map((n) => n[0])
        .join('')
})
</script>

<template>
    <div>
        <div class="profile-button" @click="toggleDetails">{{ initials }}</div>
        <div :class="{ 'details-view': true, active: detailsVisible }">
            <p>Name: {{ username }}</p>
            <button :onClick="() => signOut()">logout</button>
        </div>
    </div>
</template>

<style scoped>
.profile-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background-color: #2d29a6;
    color: white;
    cursor: pointer;
    transition: all 0.3s ease;
}
.details-view {
    padding: 20px;
    border-radius: 10px;
    background-color: #2d29a6;
    color: white;
    transition: all 0.3s ease;
    transform: scale(1.1);
    opacity: 0;
    height: 0;
    overflow: hidden;
    width: 300px;
}
.details-view.active {
    opacity: 1;
    height: auto;
    transform: scale(1);
}
.logout_container {
    text-align: center;
    height: 100px;
    width: 100px;
}
</style>
