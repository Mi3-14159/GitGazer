import {testRequest} from '@/shared/hono/test-request';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const {getIndexHtmlMock} = vi.hoisted(() => ({getIndexHtmlMock: vi.fn()}));

vi.mock('@/shared/clients/s3.client', () => ({getIndexHtml: getIndexHtmlMock}));

import feFailover from '@/shared/fe-failover';

describe('fe-failover routes', () => {
    beforeEach(() => {
        getIndexHtmlMock.mockResolvedValue({
            Body: {transformToString: async () => '<html>app</html>'},
            ContentType: 'text/html',
            CacheControl: 'no-cache',
        });
    });

    it('serves index.html for deep fe-failover paths', async () => {
        const res = await testRequest(feFailover, 'GET', '/fe-failover/integrations/abc', {basePath: '/'});

        expect(res.status).toBe(200);
        expect(await res.text()).toBe('<html>app</html>');
        expect(res.headers.get('content-type')).toBe('text/html');
        expect(res.headers.get('cache-control')).toBe('no-cache');
    });

    it('returns 404 for the bare fe-failover path', async () => {
        const res = await testRequest(feFailover, 'GET', '/fe-failover/', {basePath: '/'});

        expect(res.status).toBe(404);
        expect(getIndexHtmlMock).not.toHaveBeenCalled();
    });
});
