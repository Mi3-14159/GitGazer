import {createHonoApp} from '@/shared/hono/app';
import type {AppEnv} from '@/shared/hono/env';
import type {AppContext} from '@gitgazer/backend-core/types';
import type {Hono} from 'hono';

export const testRequest = async (
    app: Hono<AppEnv>,
    method: string,
    path: string,
    init: {appContext?: AppContext; cookies?: string[]; headers?: Record<string, string>; body?: string | object} = {},
): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (init.cookies) {
        headers.set('cookie', init.cookies.join('; '));
    }

    let body = init.body;
    if (typeof body === 'object') {
        body = JSON.stringify(body);
        if (!headers.has('content-type')) {
            headers.set('content-type', 'application/json');
        }
    }

    return createHonoApp().route('/', app).request(path, {method, headers, body}, {appContext: init.appContext});
};
