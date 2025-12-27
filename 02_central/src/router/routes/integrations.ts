import {createIntegration, deleteIntegration, getIntegrations} from '@/controllers/integrations';
import {extractCognitoGroups} from '@/router/middlewares/authorization';
import {HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda';

const router = new Router();

router.get('/api/integrations', [extractCognitoGroups], async (reqCtx) => {
    const event = reqCtx.event as APIGatewayProxyEventV2WithJWTAuthorizer;
    const groups: string[] = (event.requestContext.authorizer.jwt.claims['cognito:groups'] as string[]) ?? [];
    return await getIntegrations({
        integrationIds: groups,
    });
});

router.post('/api/integrations', [extractCognitoGroups], async (reqCtx) => {
    const event = reqCtx.event as APIGatewayProxyEventV2WithJWTAuthorizer;
    if (!event.body) {
        return new Response(JSON.stringify({error: 'Missing request body'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    let requestBody;
    try {
        requestBody = JSON.parse(event.body);
    } catch (error) {
        return new Response(JSON.stringify({error: 'Invalid request body'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    if (!requestBody.label || typeof requestBody.label !== 'string') {
        return new Response(JSON.stringify({error: 'Invalid label'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    return await createIntegration(
        requestBody.label,
        event.requestContext.authorizer.jwt.claims.sub as string,
        event.requestContext.authorizer.jwt.claims['cognito:username'] as string,
    );
});

router.delete('/api/integrations/:integrationId', [extractCognitoGroups], async (reqCtx) => {
    const event = reqCtx.event as APIGatewayProxyEventV2WithJWTAuthorizer;
    if (!reqCtx.params.integrationId) {
        return new Response(JSON.stringify({error: 'Missing integration ID'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    const groups: string[] = (event.requestContext.authorizer.jwt.claims['cognito:groups'] as string[]) ?? [];
    await deleteIntegration(reqCtx.params.integrationId, groups);

    return new Response(null, {
        status: HttpStatusCodes.NO_CONTENT,
    });
});

export default router;
