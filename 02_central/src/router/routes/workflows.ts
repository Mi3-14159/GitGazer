import {getWorkflows} from '@/controllers/workflows';
import {extractUserIntegrations} from '@/router/middlewares/authorization';
import {AuthorizerContext} from '@/types';
import {HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {isWorkflowsRequestParameters} from '@common/types';
import {APIGatewayProxyEventV2WithLambdaAuthorizer} from 'aws-lambda';

const router = new Router();

router.get('/api/workflows', [extractUserIntegrations], async (reqCtx) => {
    const event = reqCtx.event as APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>;
    const integrationIds = event.requestContext.authorizer.lambda.integrations ?? [];
    if (!integrationIds || integrationIds.length === 0) {
        return new Response(JSON.stringify({message: 'No integrations found for user'}), {
            status: HttpStatusCodes.OK,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    const {queryStringParameters} = event;

    try {
        if (queryStringParameters?.exclusiveStartKeys) {
            queryStringParameters.exclusiveStartKeys = JSON.parse(queryStringParameters.exclusiveStartKeys || 'null');
        }
    } catch (error) {
        return new Response(JSON.stringify({message: 'Invalid exclusiveStartKeys parameter'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    if (!isWorkflowsRequestParameters(queryStringParameters)) {
        return new Response(JSON.stringify({message: 'Invalid query parameters'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    const {limit, projection, exclusiveStartKeys} = queryStringParameters ?? {};

    const workflows = await getWorkflows({
        integrationIds,
        limit,
        projection,
        exclusiveStartKeys,
    });

    return new Response(JSON.stringify(workflows), {
        status: HttpStatusCodes.OK,
        headers: {
            'Content-Type': 'application/json',
        },
    });
});

export default router;
