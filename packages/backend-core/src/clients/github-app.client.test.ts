import {beforeEach, describe, expect, it, vi} from 'vitest';

const downloadJobLogsForWorkflowRun = vi.fn();

vi.mock('@octokit/rest', () => ({
    Octokit: class {
        actions = {downloadJobLogsForWorkflowRun};
    },
}));
vi.mock('@octokit/auth-app', () => ({createAppAuth: vi.fn()}));
vi.mock('./proxy-fetch', () => ({proxyFetch: vi.fn()}));
vi.mock('../config', () => ({
    default: {get: () => ({id: '1', privateKey: 'key'})},
}));

import {downloadJobLog} from './github-app.client';

beforeEach(() => {
    downloadJobLogsForWorkflowRun.mockReset();
});

describe('downloadJobLog', () => {
    it('calls downloadJobLogsForWorkflowRun with job_id and opts into proxy tail truncation', async () => {
        downloadJobLogsForWorkflowRun.mockResolvedValue({data: 'line1\nline2'});

        const log = await downloadJobLog(42, 'acme', 'web', 99);

        expect(downloadJobLogsForWorkflowRun).toHaveBeenCalledWith({
            owner: 'acme',
            repo: 'web',
            job_id: 99,
            headers: {'x-gitgazer-truncate-tail': 'true'},
        });
        expect(log).toBe('line1\nline2');
    });

    it('decodes an ArrayBuffer body as UTF-8', async () => {
        const bytes = new TextEncoder().encode('héllo');
        downloadJobLogsForWorkflowRun.mockResolvedValue({data: bytes.buffer});

        await expect(downloadJobLog(42, 'acme', 'web', 99)).resolves.toBe('héllo');
    });
});
