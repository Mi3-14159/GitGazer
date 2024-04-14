import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Amplify } from 'aws-amplify'
import App from './App.vue'

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
    API: {
        GraphQL: {
            endpoint: 'https://api.gitgazer.mmunsch.services/graphql',
            region: 'eu-central-1',
            defaultAuthMode: 'userPool',
        },
    },
})

const app = createApp(App)

app.use(createPinia())

app.mount('#app')
