import {executeCustomQuery, getAvailableSchema} from '@gitgazer/db/queries/customQuery';
import type {CustomQueryResponse, TableSchema} from '@gitgazer/db/types/metrics';

type CustomMetricsParams = {
    integrationIds: string[];
    query: string;
};

export const runCustomQuery = async ({integrationIds, query}: CustomMetricsParams): Promise<CustomQueryResponse> => {
    return await executeCustomQuery({integrationIds, query});
};

export const getCustomQuerySchema = async ({integrationIds}: {integrationIds: string[]}): Promise<TableSchema[]> => {
    return await getAvailableSchema({integrationIds});
};
