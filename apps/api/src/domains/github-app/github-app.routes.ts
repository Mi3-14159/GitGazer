import {handleGithubAppEvent} from '@/domains/github-app/github-app.controller';
import {verifyGithubAppSignature} from '@/domains/github-app/github-app.middleware';
import {ensureHttpError} from '@/shared/errors';
import {isValidGithubAppEvent} from '@/shared/helpers/validation';
import {getLogger} from '@/shared/logger';
import {BadRequestError, Router} from '@aws-lambda-powertools/event-handler/http';

const router = new Router();

router.post('/api/github/webhook', [verifyGithubAppSignature], async (reqCtx) => {
    const logger = getLogger();

    const githubEventType = reqCtx.event?.headers?.['x-github-event'];
    if (!githubEventType || typeof githubEventType !== 'string') {
        throw new BadRequestError('Missing X-GitHub-Event header');
    }

    if (!isValidGithubAppEvent(githubEventType)) {
        logger.warn(`Unsupported GitHub App event type: ${githubEventType}`);
        throw new BadRequestError('Unsupported event type');
    }

    if (!reqCtx.event.body) {
        throw new BadRequestError('Missing request body');
    }

    let requestBody;
    try {
        requestBody = await reqCtx.req.json();
    } catch {
        throw new BadRequestError('Invalid request body');
    }

    try {
        await handleGithubAppEvent(githubEventType, requestBody);
    } catch (error) {
        logger.error('Error handling GitHub App webhook', {error});
        throw ensureHttpError(error, 'Error handling webhook');
    }

    return {message: 'ok'};
});

export const publicPrefixes = ['/api/github/'] as const;

export default router;
