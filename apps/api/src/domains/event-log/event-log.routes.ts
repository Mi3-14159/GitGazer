import {getEventLogEntries, getEventLogStats, markAllEventLogRead, toggleEventLogRead} from '@/domains/event-log/event-log.controller';
import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {AppRequestContext} from '@/shared/types';
import {BadRequestError, NotFoundError, Router} from '@aws-lambda-powertools/event-handler/http';
import {EVENT_LOG_CATEGORIES, EVENT_LOG_TYPES, type EventLogCategory, type EventLogFilters, type EventLogType} from '@gitgazer/db/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const router = new Router();

router.get('/api/event-log', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    const params = reqCtx.event.queryStringParameters ?? {};

    const filters: EventLogFilters = {};

    if (params.type && EVENT_LOG_TYPES.includes(params.type as EventLogType)) {
        filters.type = params.type as EventLogType;
    }

    if (params.category && EVENT_LOG_CATEGORIES.includes(params.category as EventLogCategory)) {
        filters.category = params.category as EventLogCategory;
    }

    if (params.read === 'true') filters.read = true;
    if (params.read === 'false') filters.read = false;

    if (params.search) filters.search = params.search.slice(0, 500);

    if (params.limit) {
        const parsed = parseInt(params.limit, 10);
        if (!isNaN(parsed) && parsed > 0) filters.limit = parsed;
    }

    if (params.offset) {
        const parsed = parseInt(params.offset, 10);
        if (!isNaN(parsed) && parsed >= 0) filters.offset = parsed;
    }

    return await getEventLogEntries({integrationIds, filters});
});

router.get('/api/event-log/stats', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    return await getEventLogStats({integrationIds});
});

router.patch('/api/event-log/:id/read', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationIds = reqCtx.appContext?.integrations ?? [];

    if (!UUID_RE.test(reqCtx.params.id)) {
        throw new BadRequestError('Invalid event log entry ID');
    }

    let body;
    try {
        body = await reqCtx.req.json();
    } catch {
        throw new BadRequestError('Invalid request body');
    }

    if (typeof body.read !== 'boolean') {
        throw new BadRequestError('Missing or invalid "read" field');
    }

    const entry = await toggleEventLogRead({id: reqCtx.params.id, integrationIds, read: body.read});
    if (!entry) {
        throw new NotFoundError('Event log entry not found');
    }

    return entry;
});

router.post('/api/event-log/mark-all-read', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    const count = await markAllEventLogRead({integrationIds});
    return {updated: count};
});

export default router;
