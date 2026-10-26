import {completeSlackInstall} from '@/domains/apps/slack-install';
import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {buildClearStateCookie, extractTokenFromCookies, OAUTH_STATE_COOKIE_NAME} from '@/shared/helpers/cookies';
import {HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {AppRequestContext} from '@gitgazer/backend-core/types';
import {APIGatewayProxyEventV2} from 'aws-lambda';

const router = new Router();

router.get('/api/slack/oauth/callback', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const event = reqCtx.event as APIGatewayProxyEventV2;
    const {redirectUrl} = await completeSlackInstall({
        code: event.queryStringParameters?.code,
        state: event.queryStringParameters?.state,
        oauthStateNonce: extractTokenFromCookies(event.cookies, OAUTH_STATE_COOKIE_NAME),
        userId: reqCtx.appContext!.userId,
        integrationIds: reqCtx.appContext?.integrations ?? [],
        integrationRoles: reqCtx.appContext?.integrationRoles ?? {},
    });

    return new Response(null, {status: HttpStatusCodes.FOUND, headers: {Location: redirectUrl, 'Set-Cookie': buildClearStateCookie()}});
});

// The callbacks need the GitGazer session (the browser returns from Slack with its cookies), so none is public.
export const publicPrefixes = [] as const;

export default router;
