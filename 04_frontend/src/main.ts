import {registerPlugins} from './plugins';
import {Amplify} from 'aws-amplify';
import App from './App.vue';
import {createApp} from 'vue';
import router from './router';

Amplify.configure({
    Auth: {
        Cognito: {
            userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
            userPoolClientId: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID,
            signUpVerificationMethod: 'code',
            loginWith: {
                oauth: {
                    domain: import.meta.env.VITE_COGNITO_DOMAIN,
                    scopes: ['email', 'profile', 'openid', 'aws.cognito.signin.user.admin'],
                    redirectSignIn: [import.meta.env.VITE_HOST_URL],
                    redirectSignOut: [import.meta.env.VITE_HOST_URL],
                    responseType: 'code',
                },
            },
        },
    },
    API: {
        GraphQL: {
            endpoint: import.meta.env.VITE_GRAPHQL_ENDPOINT,
            region: import.meta.env.VITE_GRAPHQL_REGION,
            defaultAuthMode: 'userPool',
        },
    },
});

const app = createApp(App);

registerPlugins(app);

app.use(router).mount('#app');
