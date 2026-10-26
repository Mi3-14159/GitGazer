import {isSlackUserId} from '@gitgazer/db/types';
import {describe, expect, it} from 'vitest';

describe('isSlackUserId', () => {
    it.each(['U012AB3CD', 'W0ABC'])('accepts %s', (id) => {
        expect(isSlackUserId(id)).toBe(true);
    });

    it.each(['u012', '<!here>', 'U12 3', '', 42, null])('rejects %s', (value) => {
        expect(isSlackUserId(value)).toBe(false);
    });
});
