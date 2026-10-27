import {completeSlackInstall} from '@/domains/apps/slack-install';
import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {buildSlackConnectRedirect, completeSlackSignIn, disconnectSlack} from '@/domains/slack/connect';
import {buildClearStateCookie, extractTokenFromCookies, getRequestCookies, OAUTH_STATE_COOKIE_NAME} from '@/shared/helpers/cookies';
import type {AppEnv} from '@/shared/hono/env';
import {HttpStatusCodes} from '@/shared/errors';
import {requireRole} from '@/shared/middleware/require-role';
import type {Context} from 'hono';
import {Hono} from 'hono';

const router = new Hono<AppEnv>();

const callbackParams = (c: Context<AppEnv>) => ({
    code: c.req.query('code'),
    state: c.req.query('state'),
    oauthStateNonce: extractTokenFromCookies(getRequestCookies(c), OAUTH_STATE_COOKIE_NAME),
    userId: c.var.appContext!.userId,
    integrationIds: c.var.appContext?.integrations ?? [],
    integrationRoles: c.var.appContext?.integrationRoles ?? {},
});

const redirect = (location: string, cookie: string) =>
    new Response(null, {status: HttpStatusCodes.FOUND, headers: {Location: location, 'Set-Cookie': cookie}});

router.get('/slack/oauth/callback', addUserIntegrationsToCtx, async (c) => {
    const {redirectUrl} = await completeSlackInstall(callbackParams(c));
    return redirect(redirectUrl, buildClearStateCookie());
});

router.get('/integrations/:integrationId/slack/connect', addUserIntegrationsToCtx, requireRole('viewer'), async (c) => {
    const {location, stateCookie} = buildSlackConnectRedirect({
        integrationId: c.req.param('integrationId'),
        userId: c.var.appContext!.userId,
        redirectUrl: c.req.query('redirect_url'),
    });
    return redirect(location, stateCookie);
});

router.get('/slack/sign-in/callback', addUserIntegrationsToCtx, async (c) => {
    const {redirectUrl} = await completeSlackSignIn(callbackParams(c));
    return redirect(redirectUrl, buildClearStateCookie());
});

router.delete('/integrations/:integrationId/slack/connection', addUserIntegrationsToCtx, requireRole('viewer'), async (c) => {
    await disconnectSlack({
        integrationId: c.req.param('integrationId'),
        integrationIds: c.var.appContext?.integrations ?? [],
        userId: c.var.appContext!.userId,
    });
    return new Response(null, {status: HttpStatusCodes.NO_CONTENT});
});

// The callbacks need the GitGazer session (the browser returns from Slack with its cookies), so none is public.
export const publicPrefixes = [] as const;

export default router;
