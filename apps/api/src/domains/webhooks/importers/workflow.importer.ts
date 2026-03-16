import {RdsTransaction} from '@gitgazer/db/client';
import {enterprises, organizations, repositories, user} from '@gitgazer/db/schema/github/workflows';
import {WorkflowJobEvent, WorkflowRunEvent} from '@gitgazer/db/types';
import {InferSelectModel} from 'drizzle-orm';
import {upsertEnterprise, upsertOrganization, upsertRepository, upsertUsers} from './shared';

export const importWorkflow = async (
    integrationId: string,
    event: WorkflowJobEvent | WorkflowRunEvent,
    tx: RdsTransaction,
): Promise<{
    enterprise: InferSelectModel<typeof enterprises>;
    organization: InferSelectModel<typeof organizations>;
    repository: InferSelectModel<typeof repositories>;
    owner: InferSelectModel<typeof user>;
    sender: InferSelectModel<typeof user>;
    actor?: InferSelectModel<typeof user>;
}> => {
    const enterprisePayload =
        'enterprise' in event && event.enterprise ? {id: (event.enterprise as any).id, name: (event.enterprise as any).name} : undefined;
    const {enterprise, enterpriseId} = await upsertEnterprise(tx, integrationId, enterprisePayload);

    const orgPayload = event.organization
        ? {id: event.organization.id, login: event.organization.login, description: event.organization.description}
        : undefined;
    const {organization, organizationId} = await upsertOrganization(tx, integrationId, enterpriseId, orgPayload);

    const userPayloads = [
        {id: event.repository.owner.id, login: event.repository.owner.login, type: event.repository.owner.type},
        {id: event.sender.id, login: event.sender.login, type: event.sender.type},
    ];
    if ('workflow_run' in event) {
        userPayloads.push({
            id: event.workflow_run.actor.id,
            login: event.workflow_run.actor.login,
            type: event.workflow_run.actor.type,
        });
    }

    const userMap = await upsertUsers(tx, integrationId, userPayloads);

    const repository = await upsertRepository(tx, integrationId, organizationId, {
        id: event.repository.id,
        name: event.repository.name,
        private: event.repository.private,
        created_at: event.repository.created_at,
        updated_at: event.repository.updated_at,
        owner: event.repository.owner,
        defaultBranch: event.repository.default_branch,
    });

    return {
        enterprise: enterprise[0],
        organization: organization[0],
        repository,
        owner: userMap.get(event.repository.owner.id)!,
        sender: userMap.get(event.sender.id)!,
        actor: 'workflow_run' in event ? userMap.get(event.workflow_run.actor.id)! : undefined,
    };
};
