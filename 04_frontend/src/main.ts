import App from '@/App.vue';
import {useAuth} from '@/composables/useAuth';
import {registerPlugins} from '@/plugins';
import router from '@/router';
import {Amplify} from 'aws-amplify';
import {createPinia} from 'pinia';
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
                    // Keep Authorization header as fallback during transition
                    // Cookies will be the primary auth mechanism
                    const headers: Record<string, string> = {};
                    try {
                        const session = await getSession();
                        const authToken = session?.tokens?.idToken?.toString();
                        if (authToken) {
                            headers['Authorization'] = authToken;
                        }
                    } catch {
                        // Ignore auth errors
                    }
                    return headers;
                },
            },
        },
    },
);

const app = createApp(App);

registerPlugins(app);

app.use(createPinia());
app.use(router).mount('#app');
