import {handleEvent} from '@/domains/webhooks/webhooks.controller';
import {verifyGithubSign} from '@/domains/webhooks/webhooks.middleware';
import {isValidImportEvent} from '@/shared/helpers/validation';
import {getLogger} from '@/shared/logger';
import {BadRequestError, HttpError, InternalServerError, Router} from '@aws-lambda-powertools/event-handler/http';
import {EventPayloadMap} from '@gitgazer/db/types';
import type {EmitterWebhookEventName} from '@octokit/webhooks';

const router = new Router();

router.post('/api/import/:integrationId', [verifyGithubSign], async (reqCtx) => {
    const logger = getLogger();

    const githubEventType = reqCtx.event?.headers?.['x-github-event'];
    if (!githubEventType || typeof githubEventType !== 'string') {
        throw new BadRequestError('Missing X-GitHub-Event header');
    }

    if (!isValidImportEvent(githubEventType)) {
        logger.error('Invalid GitHub event name', {githubEventType});
        throw new BadRequestError('Invalid X-GitHub-Event header');
    }

    if (githubEventType === 'ping') {
        return {message: 'ok'};
    }

    if (!reqCtx.event.body) {
        throw new BadRequestError('Missing request body');
    }

    let requestBody;
    try {
        requestBody = await reqCtx.req.json();
    } catch (error) {
        throw new BadRequestError('Invalid request body');
    }

    try {
        await handleEvent(reqCtx.params.integrationId, githubEventType as EmitterWebhookEventName & keyof EventPayloadMap, requestBody);
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }

        logger.error('Error storing event', {error});
        throw new InternalServerError('Error storing event');
    }

    return {message: 'ok'};
});

export const publicPrefixes = ['/api/import/'] as const;

export default router;
