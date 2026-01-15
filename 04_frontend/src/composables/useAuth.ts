import {
    AuthSession,
    AuthUser,
    fetchAuthSession,
    fetchUserAttributes,
    FetchUserAttributesOutput,
} from 'aws-amplify/auth';
import {signIn as authSignIn, getUser as authGetUser, signOut as authSignOut, exchangeTokensForCookies} from '@/services/auth';

let promiseGetSession: Promise<AuthSession>;
let promiseGetUserAttributes: Promise<FetchUserAttributesOutput>;
let promiseGetCurrentUser: Promise<AuthUser>;

export const useAuth = () => {
    const getSession = async (params?: {forceRefresh?: boolean}): Promise<AuthSession> => {
        if (!promiseGetSession || params?.forceRefresh) {
            promiseGetSession = fetchAuthSession({forceRefresh: params?.forceRefresh});
        }

        const session = await promiseGetSession;
        const now = Math.floor(new Date().getTime() / 1000);
        if (!session.tokens?.idToken?.payload.exp) {
            return await getSession({forceRefresh: true});
        } else if (session.tokens.idToken.payload.exp < now + 60) {
            console.warn('ID token is expired, refreshing session', session.tokens.idToken.payload.exp, now + 60);
            return await getSession({forceRefresh: true});
        }

        return session;
    };

    const getUserAttributes = async (): Promise<FetchUserAttributesOutput> => {
        if (!promiseGetUserAttributes) {
            promiseGetUserAttributes = fetchUserAttributes();
        }

        return await promiseGetUserAttributes;
    };

    const getUser = async (): Promise<AuthUser> => {
        if (!promiseGetCurrentUser) {
            promiseGetCurrentUser = authGetUser();
        }

        const user = await promiseGetCurrentUser;

        // After getting user, ensure tokens are exchanged for cookies
        try {
            await exchangeTokensForCookies();
        } catch (error) {
            console.warn('Failed to exchange tokens for cookies, continuing with Amplify tokens:', error);
        }

        return user;
    };

    const signIn = async () => {
        return authSignIn();
    };

    const signOut = async () => {
        return authSignOut();
    };

    return {
        getSession,
        getUserAttributes,
        getUser,
        signIn,
        signOut,
    };
};
