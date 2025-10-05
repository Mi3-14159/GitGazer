export type JWTHeader = {
    kid: string;
    alg: string;
};

export type JWTPayload = {
     sub: string;
    aud: string;
    exp: number;
    'cognito:groups'?: string[];
};

export type JWKSKey = {
    kid: string;
    kty: string;
    use: string;
    n: string;
    e: string;
};

export type JWKSResponse = {
    keys: JWKSKey[];
};

export type ConnectionRecord = {
    integrationId: string;
    connectionId: string;
    sub: string;
    connectedAt: string;
};
