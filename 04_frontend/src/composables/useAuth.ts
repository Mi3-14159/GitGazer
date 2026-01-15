import {signIn as authSignIn, signOut as authSignOut, checkAuth} from '@/services/auth';

export const useAuth = () => {
    const signIn = async () => {
        return authSignIn();
    };

    const signOut = async () => {
        return authSignOut();
    };

    const isAuthenticated = async (): Promise<boolean> => {
        return checkAuth();
    };

    return {
        signIn,
        signOut,
        isAuthenticated,
    };
};
