import {describe, expect, it, vi} from 'vitest';

vi.mock('@gitgazer/backend-core/config', () => ({
    default: {get: vi.fn((key: string) => (key === 'allowedFrontendOrigins' ? ['https://app.gitgazer.com'] : undefined))},
}));

import {isAllowedFrontendOrigin} from '@/domains/auth/auth.helpers';

describe('isAllowedFrontendOrigin', () => {
    it('accepts an allowed frontend origin', () => {
        expect(isAllowedFrontendOrigin('https://app.gitgazer.com')).toBe(true);
    });

    it('rejects undefined, null, unparsable and foreign origins', () => {
        for (const origin of [undefined, 'null', 'not a url', 'https://evil.example']) {
            expect(isAllowedFrontendOrigin(origin)).toBe(false);
        }
    });
});
