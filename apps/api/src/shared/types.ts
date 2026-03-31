import {RequestContext} from '@aws-lambda-powertools/event-handler/types';
import {type WebSocketChannel} from '@gitgazer/db/types';

export type WebsocketConnection = {
    integrationId: string;
    connectionId: string;
    userId: number;
    connectedAt: string;
    channel: WebSocketChannel;
};

export type AppContext = {
    userId: number;
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
