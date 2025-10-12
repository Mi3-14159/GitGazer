import {
    AuthSession,
    AuthUser,
    fetchAuthSession,
    fetchUserAttributes,
    FetchUserAttributesOutput,
    getCurrentUser,
    signInWithRedirect,
} from 'aws-amplify/auth';

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
            promiseGetCurrentUser = getCurrentUser();
        }

        return await promiseGetCurrentUser;
    };

    const signIn = async () => {
        return signInWithRedirect({provider: {custom: 'Github'}});
    };

    return {
        getSession,
        getUserAttributes,
        getUser,
        signIn,
    };
};
