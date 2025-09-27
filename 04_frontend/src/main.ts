import App from '@/App.vue';
import {useAuth} from '@/composables/useAuth';
import {registerPlugins} from '@/plugins';
import router from '@/router';
import {Amplify} from 'aws-amplify';
import {createApp} from 'vue';

const {getSession} = useAuth();

Amplify.configure(
    {
        Auth: {
            Cognito: {
                userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
                userPoolClientId: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID,
                identityPoolId: import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID,
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
            REST: {
                api: {
                    endpoint: import.meta.env.VITE_REST_API_ENDPOINT,
                    region: import.meta.env.VITE_REST_API_REGION,
                },
            },
        },
    },
    {
        API: {
            REST: {
                headers: async () => {
                    const session = await getSession();
                    const authToken = session?.tokens?.idToken?.toString();
                    return {Authorization: authToken!};
                },
            },
        },
    },
);

const app = createApp(App);

registerPlugins(app);

app.use(router).mount('#app');
