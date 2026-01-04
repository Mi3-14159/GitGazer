import {getWorkflowsBy, QueryResult} from '@/clients/dynamodb';
import {ProjectionType, Workflow, WorkflowEvent} from '@common/types';

export const getWorkflows = async (params: {
    integrationIds: string[];
    limit?: number;
    projection?: ProjectionType;
    exclusiveStartKeys?: {[key: string]: any}[];
}): Promise<QueryResult<Workflow<Partial<WorkflowEvent<any>>>>[]> => {
    const {integrationIds, limit, projection, exclusiveStartKeys} = params;
    if (integrationIds.length === 0) {
        return [];
    }

    const jobs = await getWorkflowsBy({
        keys: integrationIds.map((id) => ({integrationId: id})),
        ...(limit && {limit: Math.min(limit, 100)}),
        projection,
        exclusiveStartKeys,
    });

    return jobs;
};
