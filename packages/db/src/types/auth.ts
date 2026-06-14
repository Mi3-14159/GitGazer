export type UserAttributes = {
    userId?: number;
    sub?: string;
    username?: string;
    email?: string;
    name?: string;
    nickname?: string;
    picture?: string;
};

export const isUserAttributes = (value: unknown): value is UserAttributes => {
    return typeof value === 'object' && value !== null;
};

export type WSToken = {
    userId: number;
    username: string;
    email: string;
    integrations: string[];
    exp: number;
    nonce: string;
};

export type State = {
    redirect_url: string;
};
