import {completeSlackInstall} from '@/domains/apps/slack-install';
import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {buildSlackConnectRedirect, completeSlackSignIn, disconnectSlack} from '@/domains/slack/connect';
import {buildClearStateCookie, extractTokenFromCookies, OAUTH_STATE_COOKIE_NAME} from '@/shared/helpers/cookies';
import {requireRole} from '@/shared/middleware/require-role';
import {HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {AppRequestContext} from '@gitgazer/backend-core/types';
import {APIGatewayProxyEventV2} from 'aws-lambda';

const router = new Router();

const callbackParams = (reqCtx: AppRequestContext) => {
    const event = reqCtx.event as APIGatewayProxyEventV2;
    return {
        code: event.queryStringParameters?.code,
        state: event.queryStringParameters?.state,
        oauthStateNonce: extractTokenFromCookies(event.cookies, OAUTH_STATE_COOKIE_NAME),
        userId: reqCtx.appContext!.userId,
        integrationIds: reqCtx.appContext?.integrations ?? [],
        integrationRoles: reqCtx.appContext?.integrationRoles ?? {},
    };
};

const redirect = (location: string, cookie: string) =>
    new Response(null, {status: HttpStatusCodes.FOUND, headers: {Location: location, 'Set-Cookie': cookie}});

router.get('/api/slack/oauth/callback', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const {redirectUrl} = await completeSlackInstall(callbackParams(reqCtx));
    return redirect(redirectUrl, buildClearStateCookie());
});

router.get('/api/integrations/:integrationId/slack/connect', [addUserIntegrationsToCtx, requireRole('viewer')], async (reqCtx: AppRequestContext) => {
    const {location, stateCookie} = buildSlackConnectRedirect({
        integrationId: reqCtx.params.integrationId,
        userId: reqCtx.appContext!.userId,
        redirectUrl: (reqCtx.event as APIGatewayProxyEventV2).queryStringParameters?.redirect_url,
    });
    return redirect(location, stateCookie);
});

router.get('/api/slack/sign-in/callback', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const {redirectUrl} = await completeSlackSignIn(callbackParams(reqCtx));
    return redirect(redirectUrl, buildClearStateCookie());
});

router.delete(
    '/api/integrations/:integrationId/slack/connection',
    [addUserIntegrationsToCtx, requireRole('viewer')],
    async (reqCtx: AppRequestContext) => {
        await disconnectSlack({
            integrationId: reqCtx.params.integrationId,
            integrationIds: reqCtx.appContext?.integrations ?? [],
            userId: reqCtx.appContext!.userId,
        });
        return new Response(null, {status: HttpStatusCodes.NO_CONTENT});
    },
);

// The callbacks need the GitGazer session (the browser returns from Slack with its cookies), so none is public.
export const publicPrefixes = [] as const;

export default router;
