import {withRlsTransaction} from '@gitgazer/db/client';
import {describe, expect, it} from 'vitest';

// These guards run before any database access, so the real function can be exercised
// without a live connection.
describe('withRlsTransaction guards', () => {
    const INTEGRATION_ID = '11111111-1111-1111-1111-111111111111';
    const noop = async (): Promise<void> => undefined;

    it('rejects a non-positive or non-integer statementTimeoutS', async () => {
        await expect(withRlsTransaction({integrationIds: [INTEGRATION_ID], statementTimeoutS: 0, callback: noop})).rejects.toThrow(
            /statementTimeoutS/,
        );
        await expect(withRlsTransaction({integrationIds: [INTEGRATION_ID], statementTimeoutS: -5, callback: noop})).rejects.toThrow(
            /statementTimeoutS/,
        );
        await expect(withRlsTransaction({integrationIds: [INTEGRATION_ID], statementTimeoutS: 1.5, callback: noop})).rejects.toThrow(
            /statementTimeoutS/,
        );
    });

    it('rejects an invalid integration id', async () => {
        await expect(withRlsTransaction({integrationIds: ['not-a-uuid'], callback: noop})).rejects.toThrow(/Invalid integration ID/);
    });

    it('rejects a non-positive lockTimeoutS', async () => {
        await expect(withRlsTransaction({integrationIds: [INTEGRATION_ID], lockTimeoutS: 0, callback: noop})).rejects.toThrow(/lockTimeoutS/);
    });
});
