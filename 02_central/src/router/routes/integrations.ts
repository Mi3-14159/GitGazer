import {createIntegration, deleteIntegration, getIntegrations} from '@/controllers/integrations';
import {Router} from '../router';

const router = new Router();

router.get('/api/integrations', async (event) => {
    const groups: string[] = (event.requestContext.authorizer.jwt.claims['cognito:groups'] as string[]) ?? [];
    const integrations = await getIntegrations({
        integrationIds: groups,
    });

    return {
        statusCode: 200,
        body: JSON.stringify(integrations),
        headers: {
            'Content-Type': 'application/json',
        },
    };
});

router.post('/api/integrations', async (event) => {
    if (!event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({error: 'Missing request body'}),
            headers: {
                'Content-Type': 'application/json',
            },
        };
    }

    let requestBody;
    try {
        requestBody = JSON.parse(event.body);
    } catch (error) {
        return {
            statusCode: 400,
            body: JSON.stringify({error: 'Invalid request body'}),
            headers: {
                'Content-Type': 'application/json',
            },
        };
    }

    if (!requestBody.label || typeof requestBody.label !== 'string') {
        return {
            statusCode: 400,
            body: JSON.stringify({error: 'Invalid label'}),
            headers: {
                'Content-Type': 'application/json',
            },
        };
    }

    const integration = await createIntegration(
        requestBody.label,
        event.requestContext.authorizer.jwt.claims.sub as string,
        event.requestContext.authorizer.jwt.claims['cognito:username'] as string,
    );

    return {
        statusCode: 200,
        body: JSON.stringify(integration),
        headers: {
            'Content-Type': 'application/json',
        },
    };
});

router.delete('/api/integrations/{id}', async (event) => {
    const integrationId = event.pathParameters?.id;
    if (!integrationId) {
        return {
            statusCode: 400,
            body: JSON.stringify({error: 'Missing integration ID'}),
            headers: {
                'Content-Type': 'application/json',
            },
        };
    }

    const groups: string[] = (event.requestContext.authorizer.jwt.claims['cognito:groups'] as string[]) ?? [];
    await deleteIntegration(integrationId, groups);

    return {
        statusCode: 204,
    };
});

export default router;
