import {BadRequestError, ForbiddenError} from '@/shared/errors';
import {OPERATIONS, type Operation} from '@/shared/permissions/table';
import {getLogger} from '@gitgazer/backend-core/logger';
import {hasRole, type MemberRole} from '@gitgazer/db/types';

export type AccessCaller = {userId: number; integrationRoles: Record<string, MemberRole>};

export type AccessDenial = {allowed: false; reason: 'not a member' | 'insufficient role'};
export type AccessDecision = {allowed: true; role?: MemberRole} | AccessDenial;

export const checkAccess = (caller: AccessCaller, operation: Operation, integrationId?: string): AccessDecision => {
    const {access} = OPERATIONS[operation];
    if (access === 'public' || access === 'authenticated') {
        return {allowed: true};
    }

    const logger = getLogger();
    const {userId, integrationRoles} = caller;
    const minimumRole = access.minRole;

    if (!integrationId) {
        logger.error('checkAccess: missing integrationId for a role-gated operation', {operation});
        throw new BadRequestError('Missing integration identifier');
    }

    const role = integrationRoles[integrationId];
    const log = {userId, integrationId, role: role ?? null, minimumRole, action: operation};

    if (!role) {
        logger.info('authz', {...log, allowed: false, reason: 'not a member'});
        return {allowed: false, reason: 'not a member'};
    }

    if (!hasRole(role, minimumRole)) {
        logger.info('authz', {...log, allowed: false, reason: 'insufficient role'});
        return {allowed: false, reason: 'insufficient role'};
    }

    logger.debug('authz', {...log, allowed: true});
    return {allowed: true, role};
};

export const forbiddenFor = (decision: AccessDenial): ForbiddenError =>
    new ForbiddenError(decision.reason === 'not a member' ? 'Not a member of this integration' : 'Insufficient permissions');
