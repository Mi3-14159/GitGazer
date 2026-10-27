import {beforeEach, describe, expect, it, vi} from 'vitest';

import router from '@/domains/metrics/metrics.routes';
import {testRequest} from '@/shared/hono/test-request';

const mocks = vi.hoisted(() => ({getWidgetMetric: vi.fn(), listRepositories: vi.fn(), listTopics: vi.fn()}));

const INTEGRATION_ID = '11111111-1111-4111-8111-111111111111';

vi.mock('@/domains/metrics/metrics.controller', () => ({
    getWidgetMetric: mocks.getWidgetMetric,
    VALID_METRIC_NAMES: new Set(['pr-cycle-time']),
}));
vi.mock('@gitgazer/db/queries/metrics', () => ({listRepositories: mocks.listRepositories, listTopics: mocks.listTopics}));
vi.mock('@/domains/integrations/integrations.middleware', () => ({
    addUserIntegrationsToCtxHono: async (c: {var: {appContext?: {integrations?: string[]}}}, next: () => Promise<void>) => {
        c.var.appContext!.integrations = [INTEGRATION_ID];
        await next();
    },
}));

const appContext = {userId: 1, username: '', email: '', name: '', nickname: '', picture: ''};

describe('metrics routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('GET /api/metrics/widget passes the query values to the controller', async () => {
        mocks.getWidgetMetric.mockResolvedValue({value: 1});

        const res = await testRequest(
            router,
            'GET',
            '/api/metrics/widget?metricName=pr-cycle-time&repositoryIds=1,2&topics=a,b&from=2026-01-01&granularity=day&groupBy=topic&defaultBranchOnly=true',
            {appContext},
        );

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({value: 1});
        expect(mocks.getWidgetMetric).toHaveBeenCalledWith({
            integrationIds: [INTEGRATION_ID],
            metricName: 'pr-cycle-time',
            filter: expect.objectContaining({
                repositoryIds: [1, 2],
                topics: ['a', 'b'],
                from: '2026-01-01',
                granularity: 'day',
                groupBy: 'topic',
                defaultBranchOnly: true,
            }),
        });
    });

    it('GET /api/metrics/widget rejects an unknown metric name', async () => {
        const res = await testRequest(router, 'GET', '/api/metrics/widget?metricName=nope', {appContext});

        expect(res.status).toBe(400);
    });

    it('GET /api/metrics/repositories narrows to the requested authorized integrations', async () => {
        mocks.listRepositories.mockResolvedValue([{id: 1}]);

        const res = await testRequest(router, 'GET', `/api/metrics/repositories?integrationIds=${INTEGRATION_ID},22222222-2222-4222-8222-222222222222`, {
            appContext,
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual([{id: 1}]);
        expect(mocks.listRepositories).toHaveBeenCalledWith({integrationIds: [INTEGRATION_ID]});
    });

    it('GET /api/metrics/topics selects the single integration passed as integrationId', async () => {
        mocks.listTopics.mockResolvedValue(['a']);

        const res = await testRequest(router, 'GET', `/api/metrics/topics?integrationId=${INTEGRATION_ID}`, {appContext});

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(['a']);
        expect(mocks.listTopics).toHaveBeenCalledWith({integrationIds: [INTEGRATION_ID]});
    });
});
