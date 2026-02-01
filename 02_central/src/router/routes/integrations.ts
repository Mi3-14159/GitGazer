import {createIntegration, deleteIntegration, getIntegrations} from '@/controllers/integrations';
import {extractUserIntegrations} from '@/router/middlewares/authorization';
import {AuthorizerContext} from '@/types';
import {HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {APIGatewayProxyEventV2WithLambdaAuthorizer} from 'aws-lambda';

const router = new Router();

router.get('/api/integrations', [extractUserIntegrations], async (reqCtx) => {
    const event = reqCtx.event as APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>;
    const integrationIds = event.requestContext.authorizer.lambda.integrations ?? [];
    return await getIntegrations({
        integrationIds: integrationIds,
    });
});

router.post('/api/integrations', [extractUserIntegrations], async (reqCtx) => {
    const event = reqCtx.event as any;
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

    const userId = event.requestContext?.authorizer?.lambda?.userId;
    const username = event.requestContext?.authorizer?.lambda?.username;

    return await createIntegration(requestBody.label, userId, username);
});

router.delete('/api/integrations/:integrationId', [extractUserIntegrations], async (reqCtx) => {
    const event = reqCtx.event as APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>;
    if (!reqCtx.params.integrationId) {
        return new Response(JSON.stringify({error: 'Missing integration ID'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    const integrationIds = event.requestContext.authorizer.lambda.integrations ?? [];
    await deleteIntegration(reqCtx.params.integrationId, integrationIds);

    return new Response(null, {
        status: HttpStatusCodes.NO_CONTENT,
    });
});

export default router;
