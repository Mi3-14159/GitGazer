import {handleEvent} from '@gitgazer/backend-services/webhooks.controller';
import {isValidImportEvent} from '@/shared/helpers/validation';
import {getLogger} from '@gitgazer/backend-core/logger';
import type {AppEnv} from '@/shared/hono/env';
import {BadRequestError, HttpError, InternalServerError} from '@/shared/errors';
import {EventPayloadMap} from '@gitgazer/db/types';
import type {EmitterWebhookEventName} from '@octokit/webhooks';
import {Hono} from 'hono';
import {verifyGithubSign} from './webhooks.middleware';

const router = new Hono<AppEnv>();

router.post('/:integrationId', verifyGithubSign, async (c) => {
    const logger = getLogger();

    const githubEventType = c.req.header('x-github-event');
    if (!githubEventType || typeof githubEventType !== 'string') {
        throw new BadRequestError('Missing X-GitHub-Event header');
    }

    if (!isValidImportEvent(githubEventType)) {
        logger.error('Invalid GitHub event name', {githubEventType});
        throw new BadRequestError('Invalid X-GitHub-Event header');
    }

    if (githubEventType === 'ping') {
        return c.json({message: 'ok'});
    }

    if (!(await c.req.text())) {
        throw new BadRequestError('Missing request body');
    }

    let requestBody;
    try {
        requestBody = await c.req.json();
    } catch (error) {
        throw new BadRequestError('Invalid request body');
    }

    const source = c.req.header('x-gitgazer-source') === 'backfill' ? ('backfill' as const) : undefined;

    try {
        await handleEvent(c.req.param('integrationId'), githubEventType as EmitterWebhookEventName & keyof EventPayloadMap, requestBody, {source});
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }

        logger.error('Error storing event', {error});
        throw new InternalServerError('Error storing event');
    }

    return c.json({message: 'ok'});
});

export const publicPrefixes = ['/api/import/'] as const;

export default router;
