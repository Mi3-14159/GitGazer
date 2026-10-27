import {handleGithubAppEvent} from '@/domains/github-app/github-app.controller';
import {verifyGithubAppSignature} from '@/domains/github-app/github-app.middleware';
import {ensureHttpError} from '@/shared/errors';
import {isValidGithubAppEvent} from '@/shared/helpers/validation';
import {getLogger} from '@gitgazer/backend-core/logger';
import type {AppEnv} from '@/shared/hono/env';
import {BadRequestError} from '@/shared/hono/http-errors';
import {Hono} from 'hono';

const router = new Hono<AppEnv>();

router.post('/api/github/webhook', verifyGithubAppSignature, async (c) => {
    const logger = getLogger();

    const githubEventType = c.req.header('x-github-event');
    if (!githubEventType || typeof githubEventType !== 'string') {
        throw new BadRequestError('Missing X-GitHub-Event header');
    }

    if (!isValidGithubAppEvent(githubEventType)) {
        logger.warn(`Unsupported GitHub App event type: ${githubEventType}`);
        throw new BadRequestError('Unsupported event type');
    }

    if (!(await c.req.text())) {
        throw new BadRequestError('Missing request body');
    }

    let requestBody;
    try {
        requestBody = await c.req.json();
    } catch {
        throw new BadRequestError('Invalid request body');
    }

    try {
        await handleGithubAppEvent(githubEventType, requestBody);
    } catch (error) {
        logger.error('Error handling GitHub App webhook', {error});
        throw ensureHttpError(error, 'Error handling webhook');
    }

    return c.json({message: 'ok'});
});

export const publicPrefixes = ['/api/github/'] as const;

export default router;
