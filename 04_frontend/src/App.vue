<script setup lang="ts">
import { ref } from 'vue'
import { Amplify } from 'aws-amplify'
import { Hub } from 'aws-amplify/utils'
import {
    signInWithRedirect,
    signOut,
    getCurrentUser,
    type AuthUser,
} from 'aws-amplify/auth'

Amplify.configure({
    Auth: {
        Cognito: {
            userPoolId: 'eu-central-1_kgbFsqjOi',
            userPoolClientId: '1asi0t7vvdk8sochfdpunnon7b',
            signUpVerificationMethod: 'code',
            loginWith: {
                oauth: {
                    domain: `gitgazer-default.auth.eu-central-1.amazoncognito.com`,
                    scopes: [
                        'email',
                        'profile',
                        'openid',
                        'aws.cognito.signin.user.admin',
                    ],
                    redirectSignIn: [import.meta.env.VITE_HOST_URL],
                    redirectSignOut: [import.meta.env.VITE_HOST_URL],
                    responseType: 'code',
                },
            },
        },
    },
})

const user = ref<AuthUser>()

const getUser = async () => {
    try {
        const currentUser = await getCurrentUser()
        user.value = currentUser
    } catch (error) {
        console.error(error)
        console.log('Not signed in')
    }
}

getUser()
</script>

<template>
    <div className="container">
        <h2>Cognito + GitHub OAuth</h2>
        <div v-if="user?.userId" className="profile">
            <p>Welcome {{ user.userId }} aka {{ user.username }} !</p>
            <button :onClick="() => signOut()">logout</button>
        </div>
        <div v-else>
            <p>Not signed in</p>
            <button
                :onClick="
                    () => signInWithRedirect({ provider: { custom: 'Github' } })
                "
            >
                login
            </button>
        </div>
    </div>
</template>

<style scoped>
body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto',
        'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans',
        'Helvetica Neue', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

code {
    font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
        monospace;
}

.container {
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
}

button {
    width: 120px;
    padding: 10px;
    border: none;
    border-radius: 4px;
    background-color: #000;
    color: #fff;
    font-size: 16px;
    cursor: pointer;
}

.profile {
    border: 1px solid #ccc;
    padding: 20px;
    border-radius: 4px;
}
.api-section {
    width: 100%;
    margin-top: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
}

.api-section > button {
    background-color: darkorange;
}
</style>
