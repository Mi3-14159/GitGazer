import {mintSignedState, verifySignedState} from '@/domains/auth/auth.controller';
import {validateRedirectUrl} from '@/domains/auth/auth.helpers';
import {buildStateCookie} from '@/shared/helpers/cookies';
import {BadRequestError, ForbiddenError} from '@aws-lambda-powertools/event-handler/http';

type SlackState = {purpose: 'slack_install' | 'slack_sign_in'; integrationId: string; userId: number; redirect_url: string};

/** Mints the state for a Slack round trip, bound to the user, the integration and an allow-listed frontend URL. */
export const mintSlackState = (
    purpose: SlackState['purpose'],
    params: {integrationId: string; userId: number; redirectUrl: string | undefined},
): {token: string; nonce: string; stateCookie: string} => {
    const redirectUrl = params.redirectUrl && validateRedirectUrl(params.redirectUrl);
    if (!redirectUrl) {
        throw new BadRequestError('Invalid redirect_url parameter');
    }

    const {token, nonce} = mintSignedState<SlackState>({
        purpose,
        integrationId: params.integrationId,
        userId: params.userId,
        redirect_url: redirectUrl,
    });
    return {token, nonce, stateCookie: buildStateCookie(nonce)};
};

export const verifySlackState = (purpose: SlackState['purpose'], state: string | undefined, nonce: string | null, userId: number): SlackState => {
    const verified = verifySignedState<SlackState>(state, nonce);
    if (!verified || verified.purpose !== purpose || verified.userId !== userId) {
        throw new ForbiddenError('Invalid or expired OAuth state');
    }
    return verified;
};

export const outcomeRedirect = (redirect_url: string, outcome: string, success: string): {redirectUrl: string} => {
    const redirectUrl = new URL(redirect_url);
    redirectUrl.searchParams.set(outcome === success ? 'slack' : 'slack_error', outcome);
    return {redirectUrl: redirectUrl.toString()};
};
