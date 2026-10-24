import {describe, expect, it} from 'vitest';
import {buildSlackAlert, escapeMrkdwn, type SlackAlertInput} from './slack-payload';

const base: SlackAlertInput = {
    owner: 'acme',
    repository: 'app',
    branch: 'main',
    workflowName: 'CI',
    jobName: 'test',
    jobId: 77,
    runId: 55,
    runAttempt: 2,
    event: 'push',
    senderLogin: 'octocat',
    pullRequestNumber: null,
    verdict: {kind: 'real', evidence: 'failed 5 times in a row on main'},
    details: {summary: 'The cart test failed.', excerpt: 'AssertionError: expected 41 to be 42'},
};

const actionUrls = (input: SlackAlertInput) => {
    const actions = buildSlackAlert(input).attachments[0].blocks.find((b) => b.type === 'actions') as any;
    return actions.elements.map((e: any) => ({text: e.text.text, url: e.url}));
};

describe('slack-payload', () => {
    it('escapes &, < and >', () => {
        expect(escapeMrkdwn('a & <b> c')).toBe('a &amp; &lt;b&gt; c');
    });

    it('renders <!channel> from a log line literally', () => {
        const json = JSON.stringify(buildSlackAlert({...base, details: {summary: null, excerpt: '<!channel> boom'}}));
        expect(json).toContain('&lt;!channel&gt;');
        expect(json).not.toContain('<!channel>');
    });

    it('escapes untrusted names and sender', () => {
        const json = JSON.stringify(buildSlackAlert({...base, jobName: '<!here>', workflowName: '<@U1>', branch: '<b>', senderLogin: '<x>'}));
        expect(json).not.toMatch(/<!here>|<@U1>|<b>|<x>/);
    });

    it('flaky alert uses amber and shows evidence', () => {
        const payload = buildSlackAlert({...base, verdict: {kind: 'flaky', evidence: 'recovered on retry 3 times'}});
        const json = JSON.stringify(payload);
        expect(payload.attachments[0].color).toBe('#ecb22e');
        expect(json).toContain('Probably flaky');
        expect(json).toContain('recovered on retry 3 times');
    });

    it('real alert uses red and the real label', () => {
        const payload = buildSlackAlert(base);
        expect(payload.attachments[0].color).toBe('#e01e5a');
        expect(JSON.stringify(payload)).toContain('Likely a real failure');
    });

    it('unknown verdict omits the verdict context and uses grey', () => {
        const payload = buildSlackAlert({...base, verdict: {kind: 'unknown', evidence: null}});
        const json = JSON.stringify(payload);
        expect(payload.attachments[0].color).toBe('#9e9e9e');
        expect(json).not.toContain('Probably flaky');
        expect(json).not.toContain('Likely a real failure');
    });

    it('details null omits summary and excerpt blocks', () => {
        const json = JSON.stringify(buildSlackAlert({...base, details: null}));
        expect(json).not.toContain('🔎');
        expect(json).not.toContain('```');
    });

    it('renders summary and excerpt in a code block', () => {
        const json = JSON.stringify(buildSlackAlert(base));
        expect(json).toContain('🔎 The cart test failed.');
        expect(json).toContain('```AssertionError: expected 41 to be 42```');
    });

    it('adds Open PR only when a PR number exists', () => {
        expect(actionUrls(base).map((a: any) => a.text)).toEqual(['Open failed step']);
        expect(actionUrls({...base, pullRequestNumber: 9})).toContainEqual({text: 'Open PR', url: 'https://github.com/acme/app/pull/9'});
    });

    it('job link points to the failed job', () => {
        expect(actionUrls(base)[0].url).toBe('https://github.com/acme/app/actions/runs/55/job/77');
    });

    it('has the fallback text and header', () => {
        const payload = buildSlackAlert(base);
        expect(payload.text).toBe('CI / test failed on app');
        expect(JSON.stringify(payload.attachments[0].blocks[0])).toContain('*CI / test failed* · <https://github.com/acme/app|app> · main');
    });

    it('keeps every mrkdwn text within 3000 characters', () => {
        const long = 'x<'.repeat(5000);
        const payload = buildSlackAlert({...base, details: {summary: long, excerpt: long}});
        for (const block of payload.attachments[0].blocks as any[]) {
            for (const t of [block.text, ...(block.elements ?? [])]) {
                if (t?.type === 'mrkdwn') expect(t.text.length).toBeLessThanOrEqual(3000);
            }
        }
        expect(JSON.stringify(payload)).not.toMatch(/&l(?!t;)/);
    });

    it('marks every mrkdwn text verbatim so bare @here in untrusted text is not a mention', () => {
        const payload = buildSlackAlert({...base, jobName: '@here', details: {summary: '@channel', excerpt: '@everyone'}});
        const texts = (payload.attachments[0].blocks as any[])
            .flatMap((block) => [block.text, ...(block.elements ?? [])])
            .filter((t) => t?.type === 'mrkdwn');
        expect(texts.length).toBeGreaterThan(0);
        for (const t of texts) expect(t.verbatim).toBe(true);
    });

    it('breaks bare mentions in the fallback text', () => {
        const payload = buildSlackAlert({...base, workflowName: '@channel', jobName: '@here'});
        expect(payload.text).not.toMatch(/@(here|channel)\b/);
        expect(payload.text).toBe('@\u200bchannel / @\u200bhere failed on app');
    });
});
