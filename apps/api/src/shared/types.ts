import {RequestContext} from '@aws-lambda-powertools/event-handler/types';
import {type MemberRole, type WebSocketChannel} from '@gitgazer/db/types';

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
    /** Maps integrationId → the user's role for that integration. */
    integrationRoles?: Record<string, MemberRole>;
    /** Populated by requireRole middleware: the user's role for the current request's integration. */
    role?: MemberRole;
};

export interface AppRequestContext extends RequestContext {
    appContext?: AppContext;
}
