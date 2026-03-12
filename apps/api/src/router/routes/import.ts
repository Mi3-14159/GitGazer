import {handleEvent} from '@/controllers/imports';
import {getLogger} from '@/logger';

import {BadRequestError, HttpError, InternalServerError, Router} from '@aws-lambda-powertools/event-handler/http';
import {EventPayloadMap} from '@gitgazer/db/types';
import type {EmitterWebhookEventName} from '@octokit/webhooks';

const router = new Router();

router.post('/api/import/:integrationId', [], async (reqCtx) => {
    const logger = getLogger();

    const githubEventType = reqCtx.event?.headers?.['x-github-event'];
    if (!githubEventType || typeof githubEventType !== 'string') {
        throw new BadRequestError('Missing X-GitHub-Event header');
    }

    if (!validateEventName(githubEventType)) {
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

// TODO: use the validateEventName from @octokit/webhooks package
// currently it's not used because it requires type: module in package.json which causes issues
const validateEventName = (eventName: string): boolean => {
    const validEventNames: EmitterWebhookEventName[] = ['workflow_job', 'workflow_run', 'pull_request', 'ping'];

    return validEventNames.includes(eventName as EmitterWebhookEventName);
};

export default router;
