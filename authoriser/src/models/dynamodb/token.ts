export enum TokenType {
    ACCESS,
    REFRESH
}

export interface Token {
    userName: string
    tokenType: TokenType
    token: string
    expiry: number
}

export const isToken = (item: any): item is Token => {
    // check if userName is a string
    if (typeof item.userName !== 'string') {
        return false;
    }

    // check if tokenType is a number
    if (typeof item.tokenType !== 'number') {
        return false;
    }

    // check if token is a string
    if (typeof item.token !== 'string') {
        return false;
    }

    // check if expiry is a number
    if (typeof item.expiry !== 'number') {
        return false;
    }

    return true;
}