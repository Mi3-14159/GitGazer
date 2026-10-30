import {describe, expect, it, vi} from 'vitest';

import {checkAccess, forbiddenFor} from '@/shared/permissions/check-access';
import {getLogger} from '@gitgazer/backend-core/logger';
import type {MemberRole} from '@gitgazer/db/types';

const lastLogger = () => vi.mocked(getLogger).mock.results[0]!.value;

const caller = (roles: Record<string, MemberRole>) => ({userId: 1, integrationRoles: roles});

describe('checkAccess', () => {
    it('lets anyone through public and authenticated operations', () => {
        expect(checkAccess(caller({}), 'auth.login')).toEqual({allowed: true});
        expect(checkAccess(caller({}), 'workflow.list')).toEqual({allowed: true});
    });

    it('allows the minimum role and above', () => {
        expect(checkAccess(caller({i1: 'admin'}), 'integration.rename', 'i1')).toEqual({allowed: true, role: 'admin'});
        expect(checkAccess(caller({i1: 'owner'}), 'integration.rename', 'i1')).toEqual({allowed: true, role: 'owner'});
    });

    it('refuses a lower role', () => {
        expect(checkAccess(caller({i1: 'member'}), 'integration.rename', 'i1')).toEqual({allowed: false, reason: 'insufficient role'});
    });

    it('refuses a caller with roles only in other integrations', () => {
        expect(checkAccess(caller({i2: 'owner'}), 'member.list', 'i1')).toEqual({allowed: false, reason: 'not a member'});
    });

    it('throws when a role-gated operation is checked without an integration id', () => {
        expect(() => checkAccess(caller({i1: 'owner'}), 'integration.rename')).toThrow('Missing integration identifier');
    });

    it('logs denials as authz with the operation as action', () => {
        checkAccess(caller({i1: 'viewer'}), 'integration.delete', 'i1');

        expect(lastLogger().info).toHaveBeenCalledWith('authz', {
            userId: 1,
            integrationId: 'i1',
            role: 'viewer',
            minimumRole: 'owner',
            action: 'integration.delete',
            allowed: false,
            reason: 'insufficient role',
        });
    });

    it('logs allows at debug level', () => {
        checkAccess(caller({i1: 'owner'}), 'integration.delete', 'i1');

        expect(lastLogger().debug).toHaveBeenCalledWith('authz', {
            userId: 1,
            integrationId: 'i1',
            role: 'owner',
            minimumRole: 'owner',
            action: 'integration.delete',
            allowed: true,
        });
    });
});

describe('forbiddenFor', () => {
    it('maps refusals to the existing 403 messages', () => {
        expect(forbiddenFor({allowed: false, reason: 'not a member'}).message).toBe('Not a member of this integration');
        expect(forbiddenFor({allowed: false, reason: 'insufficient role'}).message).toBe('Insufficient permissions');
    });
});
