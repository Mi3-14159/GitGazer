import {getWorkflowsBy, QueryResult} from '@/clients/dynamodb';
import {Event, ProjectionType, WorkflowJobEvent, WorkflowRunEvent} from '@common/types';

export const getWorkflows = async (params: {
    integrationIds: string[];
    limit?: number;
    projection?: ProjectionType;
    exclusiveStartKeys?: {[key: string]: any}[];
}): Promise<QueryResult<Event<Partial<WorkflowJobEvent | WorkflowRunEvent>>>[]> => {
    const {integrationIds, limit, projection, exclusiveStartKeys} = params;
    if (integrationIds.length === 0) {
        return [];
    }

    const workflows = await getWorkflowsBy({
        keys: integrationIds.map((id) => ({integrationId: id})),
        ...(limit && {limit: Math.min(limit, 100)}),
        projection,
        exclusiveStartKeys,
    });

    return workflows;
};
