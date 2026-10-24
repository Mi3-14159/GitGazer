import {describe, expect, it} from 'vitest';
import {extractErrorExcerpt, failedStepTail, redactSecrets, stripLogPrefix} from './job-log';

const ts = (n: number) => `2026-10-24T10:11:${String(n % 60).padStart(2, '0')}.1234567Z`;
const stamp = (lines: string[]) => lines.map((l, i) => `${ts(i)} ${l}`).join('\n');

const fixture = stamp([
    '##[group]Run actions/checkout@v4',
    'Syncing repository: acme/app',
    '##[endgroup]',
    '##[group]Run pnpm test',
    '',
    'pnpm test',
    '##[endgroup]',
    ' FAIL  src/cart.test.ts > totals the cart',
    'AssertionError: expected 41 to be 42',
    ' ❯ src/cart.test.ts:12:20',
    '##[error]Process completed with exit code 1.',
    '##[group]Post job cleanup',
    'Cleaning up orphan processes',
]);

describe('job-log', () => {
    it('strips timestamps', () => {
        expect(stripLogPrefix(`${ts(1)} hello world`)).toBe('hello world');
        expect(stripLogPrefix('no prefix')).toBe('no prefix');
        expect(failedStepTail(fixture, 10_000)).not.toMatch(/2026-10-24T/);
    });

    it('picks the failing group', () => {
        const tail = failedStepTail(fixture, 10_000);
        expect(tail).toContain('##[group]Run pnpm test');
        expect(tail).toContain('AssertionError');
        expect(tail).not.toContain('Syncing repository');
        expect(tail).not.toContain('Cleaning up orphan');
    });

    it('uses the whole log when no group has an error', () => {
        const log = stamp(['##[group]Run a', 'one', '##[group]Run b', 'two']);
        expect(failedStepTail(log, 10_000)).toContain('one');
    });

    it('keeps only the last maxChars characters', () => {
        expect(failedStepTail(fixture, 20).length).toBeLessThanOrEqual(20);
    });

    it('extracts error with three lines of context', () => {
        expect(extractErrorExcerpt(fixture)).toBe(
            [
                ' FAIL  src/cart.test.ts > totals the cart',
                'AssertionError: expected 41 to be 42',
                ' ❯ src/cart.test.ts:12:20',
                'Process completed with exit code 1.',
            ].join('\n'),
        );
    });

    it('caps at 10 lines and 1500 chars', () => {
        const many = stamp(['##[group]Run x', ...Array.from({length: 40}, (_, i) => `##[error]failure number ${i}`)]);
        expect(extractErrorExcerpt(many)!.split('\n').length).toBeLessThanOrEqual(10);

        const long = stamp(['##[group]Run x', 'y'.repeat(5000), '##[error]boom']);
        expect(extractErrorExcerpt(long)!.length).toBeLessThanOrEqual(1500);
    });

    it('de-duplicates repeated lines', () => {
        const log = stamp(['##[group]Run x', 'same', '##[error]same', '##[error]same']);
        expect(extractErrorExcerpt(log)).toBe('same');
    });

    it('returns null for an empty log', () => {
        expect(extractErrorExcerpt('')).toBeNull();
        expect(extractErrorExcerpt(`${ts(1)} \n`)).toBeNull();
    });

    it('falls back to the last lines when there is no error line', () => {
        expect(extractErrorExcerpt(stamp(['##[group]Run x', 'last words']))).toContain('last words');
    });

    it('redacts common secret shapes', () => {
        const cases: Array<[string, string]> = [
            ['ghp_abcdefghijklmnopqrstuvwxyz0123', 'ghp_abcdefghijklmnopqrstuvwxyz0123'],
            ['github_pat_11ABCDEFG0123456789_abcdef', 'github_pat_11ABCDEFG0123456789_abcdef'],
            ['key AKIAIOSFODNN7EXAMPLE here', 'AKIAIOSFODNN7EXAMPLE'],
            ['key ASIAIOSFODNN7EXAMPLE here', 'ASIAIOSFODNN7EXAMPLE'],
            ['Authorization: Bearer abc.def-123', 'abc.def-123'],
            ['git clone https://deploy:hunter2pw@github.com/acme/app', 'hunter2pw'],
            ['password=hunter2', 'hunter2'],
            ['SECRET: "s3cr3t value"', 's3cr3t value'],
            ['api_key = abc123xyz', 'abc123xyz'],
            ['GITHUB_TOKEN: tok-value-1', 'tok-value-1'],
            ['{"token": "abc123"}', 'abc123'],
            ['{"password":"x9y8z7"}', 'x9y8z7'],
            ["{'api_key': 'k3y-v4lue'}", 'k3y-v4lue'],
        ];
        for (const [input, secret] of cases) {
            const out = redactSecrets(input);
            expect(out, input).not.toContain(secret);
            expect(out, input).toContain('[REDACTED]');
        }

        const key = '-----BEGIN RSA PRIVATE KEY-----\nMIIEabc\ndef\n-----END RSA PRIVATE KEY-----';
        const out = redactSecrets(`before\n${key}\nafter`);
        expect(out).not.toContain('MIIEabc');
        expect(out).toContain('before');
        expect(out).toContain('after');
        expect(redactSecrets('https://user:pw@host/x')).toBe('https://[REDACTED]@host/x');
    });

    it('strips ANSI color codes from the excerpt', () => {
        const log = stamp([
            '##[group]Run pnpm test',
            '\x1b[31mAssertionError\x1b[39m: expected 41 to be 42',
            '\x1b[1m##[error]\x1b[22mProcess completed with exit code 1.',
        ]);
        const excerpt = extractErrorExcerpt(log)!;
        expect(excerpt).not.toContain('\x1b');
        expect(excerpt).toBe(['AssertionError: expected 41 to be 42', 'Process completed with exit code 1.'].join('\n'));
    });

    it('redacts an assignment split by ANSI codes', () => {
        const log = stamp(['##[group]Run deploy', '\x1b[36mtoken\x1b[39m: s3cr3tvalue', '##[error]deploy failed']);
        expect(extractErrorExcerpt(log)).not.toContain('s3cr3tvalue');
        expect(failedStepTail(log, 1000)).not.toContain('s3cr3tvalue');
    });

    it('handles CRLF line endings', () => {
        const log = stamp(['##[group]Run pnpm test', 'AssertionError: expected 41 to be 42', '##[error]Process completed with exit code 1.']).replace(
            /\n/g,
            '\r\n',
        );
        const excerpt = extractErrorExcerpt(log)!;
        expect(excerpt).not.toContain('\r');
        expect(excerpt).toBe(['AssertionError: expected 41 to be 42', 'Process completed with exit code 1.'].join('\n'));
    });

    it('redacts secrets in the excerpt and the tail', () => {
        const log = stamp(['##[group]Run x', 'token=abcdef123456', '##[error]failed']);
        expect(extractErrorExcerpt(log)).not.toContain('abcdef123456');
        expect(failedStepTail(log, 1000)).not.toContain('abcdef123456');
    });
});
