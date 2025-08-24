import {getParameters} from '@/clients/ssm';
import {Integration} from '@/types';

export const getIntegrations = async (params: {integrationIds: string[]; limit?: number}): Promise<Integration[]> => {
    const {integrationIds} = params;
    if (integrationIds.length === 0) {
        return [];
    }

    const integrations = await getParameters({
        names: integrationIds,
    });

    return integrations as Integration[];
};
