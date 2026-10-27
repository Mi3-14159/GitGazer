import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {getWorkflowFilterValues, getWorkflows} from '@/domains/workflows/workflows.controller';
import {parseDateFilters, parseWorkflowColumnFilters} from '@/shared/helpers/filters';
import type {AppEnv} from '@/shared/hono/env';
import {BadRequestError, HttpStatusCodes} from '@/shared/errors';
import {isWorkflowsRequestParameters, WORKFLOW_FILTER_COLUMNS, WorkflowFilterColumn} from '@gitgazer/db/types';
import {Hono} from 'hono';

const router = new Hono<AppEnv>();

router.get('/', addUserIntegrationsToCtx, async (c) => {
    const integrationIds = c.var.appContext?.integrations ?? [];
    if (!integrationIds || integrationIds.length === 0) {
        return new Response(JSON.stringify({message: 'No integrations found for user'}), {
            status: HttpStatusCodes.OK,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    // The cursor is parsed in place and the column filters are consumed from it below
    const queryStringParameters: Record<string, any> = {...c.req.query()};

    try {
        if (queryStringParameters.cursor) {
            queryStringParameters.cursor = JSON.parse(queryStringParameters.cursor);
        }
    } catch (error) {
        throw new BadRequestError('Invalid cursor parameter');
    }

    const filters = parseWorkflowColumnFilters(queryStringParameters);

    if (!isWorkflowsRequestParameters(queryStringParameters)) {
        throw new BadRequestError('Invalid query parameters');
    }

    const {limit, cursor} = queryStringParameters;

    const workflows = await getWorkflows({
        integrationIds,
        limit,
        cursor,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
    });

    return new Response(JSON.stringify(workflows), {
        status: HttpStatusCodes.OK,
        headers: {
            'Content-Type': 'application/json',
        },
    });
});

router.get('/filter-values', addUserIntegrationsToCtx, async (c) => {
    const integrationIds = c.var.appContext?.integrations ?? [];
    if (!integrationIds.length) {
        return new Response(JSON.stringify([]), {
            status: HttpStatusCodes.OK,
            headers: {'Content-Type': 'application/json'},
        });
    }

    const column = c.req.query('column');

    if (!column || !WORKFLOW_FILTER_COLUMNS.includes(column as WorkflowFilterColumn)) {
        throw new BadRequestError(`Invalid column. Valid values: ${WORKFLOW_FILTER_COLUMNS.join(', ')}`);
    }

    const search = c.req.query('search');
    const limitParam = c.req.query('limit');
    const limit = limitParam ? Number(limitParam) : undefined;
    const dateFilters = parseDateFilters(c.req.query());

    const values = await getWorkflowFilterValues({
        integrationIds,
        column: column as WorkflowFilterColumn,
        search: search || undefined,
        limit,
        ...dateFilters,
    });

    return new Response(JSON.stringify(values), {
        status: HttpStatusCodes.OK,
        headers: {'Content-Type': 'application/json'},
    });
});

export default router;
