export enum TokenType {
    ACCESS = "ACCESS",
    REFRESH = "REFRESH",
}

export interface Token {
    userId: number
    userHandle: string
    type: TokenType
    token: string
    createdAt: number
    expireAt: number
}

export const isToken = (item: any): item is Token => {
    // check if userId is a string
    if (typeof item.userId !== 'number') {
        return false;
    }

    // check if userHandle is a string
    if (typeof item.userHandle !== 'string') {
        return false;
    }

    // check if type is a number
    if (typeof item.type !== 'string') {
        return false;
    }

    // check if token is a string
    if (typeof item.token !== 'string') {
        return false;
    }

    // check if createdAt is a number
    if (typeof item.createdAt !== 'number' || item.createdAt <= 0) {
        return false;
    }

    // check if expireAt is a number
    if (typeof item.expireAt !== 'number' || item.expireAt < item.createdAt) {
        return false;
    }

    return true;
}
