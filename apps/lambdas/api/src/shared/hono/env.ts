import type {AppContext} from '@gitgazer/backend-core/types';
import type {LambdaContext, LambdaEvent} from '@hono/aws-lambda';

export type AppEnv = {
    Bindings: {event?: LambdaEvent; lambdaContext?: LambdaContext};
    Variables: {appContext?: AppContext};
};
