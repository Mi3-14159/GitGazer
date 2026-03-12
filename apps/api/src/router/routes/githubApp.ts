import {handleGithubAppEvent} from '@/controllers/githubApp';
import {getLogger} from '@/logger';
import {verifyGithubAppSignature} from '@/router/middlewares/verifyGithubAppSignature';
import {BadRequestError, InternalServerError, Router} from '@aws-lambda-powertools/event-handler/http';

const router = new Router();

const validEventNames = ['installation', 'installation_repositories', 'installation_target'];

router.post('/api/github/webhook', [verifyGithubAppSignature], async (reqCtx) => {
    const logger = getLogger();

    const githubEventType = reqCtx.event?.headers?.['x-github-event'];
    if (!githubEventType || typeof githubEventType !== 'string') {
        throw new BadRequestError('Missing X-GitHub-Event header');
    }

    if (!validEventNames.includes(githubEventType)) {
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
        throw new InternalServerError('Error handling webhook');
    }

    return {message: 'ok'};
});

export default router;
