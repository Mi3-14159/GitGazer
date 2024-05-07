<script setup lang="ts">
import { signInWithRedirect } from 'aws-amplify/auth'
</script>

<template>
    <h2 className="header">Cognito + GitHub OAuth</h2>
    <div className="login_container">
        <button
            :onClick="
                () => signInWithRedirect({ provider: { custom: 'Github' } })
            "
        >
            Login with Github
        </button>
    </div>
</template>

<style scoped>
.header {
    text-align: center;
    margin-bottom: 100px;
}

.login_container {
    text-align: center;
}
</style>
