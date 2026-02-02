import {RequestContext} from '@aws-lambda-powertools/event-handler/types';

export type WebsocketConnection = {
    integrationId: string;
    connectionId: string;
    sub: string;
    connectedAt: string;
};

export type AppContext = {
    userId: string;
    username: string;
    email: string;
    name: string;
    nickname: string;
    picture: string;
    integrations?: string[];
};

export interface AppRequestContext extends RequestContext {
    appContext?: AppContext;
}
