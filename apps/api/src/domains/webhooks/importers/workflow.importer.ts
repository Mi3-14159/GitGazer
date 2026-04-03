import {upsertEnterprises, upsertOrganizations, upsertRepositories, upsertUsers} from '@/domains/webhooks/importers/shared';
import {RdsTransaction} from '@gitgazer/db/client';
import {EnterpriseSelect, OrganizationSelect, RepositorySelect, UserSelect, WorkflowJobEvent, WorkflowRunEvent} from '@gitgazer/db/types';
import {isEnterprise} from './types';

export const importWorkflow = async (
    tx: RdsTransaction,
    integrationId: string,
    event: WorkflowJobEvent | WorkflowRunEvent,
): Promise<{
    enterprise?: EnterpriseSelect;
    organization?: OrganizationSelect;
    repository: RepositorySelect;
    owner: UserSelect;
    sender: UserSelect;
    actor?: UserSelect;
}> => {
    let enterprise: EnterpriseSelect | undefined = undefined;
    if ('enterprise' in event && event.enterprise && isEnterprise(event.enterprise)) {
        const result = await upsertEnterprises(tx, [
            {
                name: event.enterprise.name,
                id: event.enterprise.id,
                integrationId,
            },
        ]);
        enterprise = result.enterprises[0];
    }

    let organization: OrganizationSelect | undefined = undefined;
    if (event.organization) {
        const result = await upsertOrganizations(tx, [
            {
                id: event.organization.id,
                login: event.organization.login,
                description: event.organization.description,
                integrationId,
                enterpriseId: enterprise?.id,
            },
        ]);

        organization = result.organizations[0];
    }

    const userPayloads: UserSelect[] = [
        {integrationId, id: event.repository.owner.id, login: event.repository.owner.login, type: event.repository.owner.type},
        {integrationId, id: event.sender.id, login: event.sender.login, type: event.sender.type},
    ];
    if ('workflow_run' in event && event.workflow_run) {
        userPayloads.push({
            integrationId,
            id: event.workflow_run.actor.id,
            login: event.workflow_run.actor.login,
            type: event.workflow_run.actor.type,
        });
    }

    const {users} = await upsertUsers(tx, userPayloads);

    const upsertRepositoriesResult = await upsertRepositories(tx, [
        {
            integrationId,
            organizationId: organization?.id,
            id: event.repository.id,
            name: event.repository.name,
            private: event.repository.private,
            createdAt: new Date(event.repository.created_at),
            updatedAt: new Date(event.repository.updated_at),
            ownerId: event.repository.owner.id,
            defaultBranch: event.repository.default_branch,
            topics: event.repository.topics,
        },
    ]);

    return {
        enterprise,
        organization,
        repository: upsertRepositoriesResult.repositories[0],
        owner: users.find((user) => user.id === event.repository.owner.id)!,
        sender: users.find((user) => user.id === event.sender.id)!,
        actor: 'workflow_run' in event ? users.find((user) => user.id === event.workflow_run.actor.id)! : undefined,
    };
};
