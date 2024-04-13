import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { Amplify } from 'aws-amplify'

Amplify.configure({
    Auth: {
        region: 'eu-central-1',
        userPoolId: 'eu-central-1_kgbFsqjOi',
        userPoolWebClientId: '1asi0t7vvdk8sochfdpunnon7b',
        mandatorySignIn: false,
        oauth: {
            domain: `gitgazer-default.auth.eu-central-1.amazoncognito.com`,
            scope: [
                'email',
                'profile',
                'openid',
                'aws.cognito.signin.user.admin',
            ],
            /*redirectSignIn: 'http://localhost:5173',
            redirectSignOut: 'http://localhost:5173',*/
            redirectSignIn: 'https://gitgazer.mmunsch.services',
            redirectSignOut: 'https://gitgazer.mmunsch.services',
            responseType: 'code',
        },
    },
    API: {
        endpoints: [
            {
                name: 'api',
                endpoint:
                    'https://c1fnd5q4vh.execute-api.eu-central-1.amazonaws.com/v1',
                region: 'eu-central-1',
            },
        ],
    },
})

const app = createApp(App)

app.use(createPinia())

app.mount('#app')
