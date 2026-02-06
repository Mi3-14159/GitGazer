import {getLogger} from '@/logger';
import {InternalServerError} from '@aws-lambda-powertools/event-handler/http';
import {
    AttachRolePolicyCommand,
    AttachRolePolicyCommandInput,
    CreateRoleCommand,
    DeleteRoleCommand,
    DetachRolePolicyCommand,
    IAMClient,
    Role,
    type CreateRoleCommandInput,
} from '@aws-sdk/client-iam';

export const iamClient = new IAMClient();

const athenaQueryResultsS3Bucket = process.env.ATHENA_QUERY_RESULT_S3_BUCKET;
if (!athenaQueryResultsS3Bucket) {
    throw new Error('ATHENA_QUERY_RESULT_S3_BUCKET environment variable is not set');
}

const environment = process.env.ENVIRONMENT;
if (!environment) {
    throw new Error('ENVIRONMENT environment variable is not set');
}

const policyArn = process.env.API_RUNTIME_POLICY_ARN;
if (!policyArn) {
    throw new Error('API_RUNTIME_POLICY_ARN environment variable is not set');
}

const accountId = process.env.AWS_ACCOUNT_ID;
if (!accountId) {
    throw new Error('AWS_ACCOUNT_ID environment variable is not set');
}

const trustPolicy = {
    Version: '2012-10-17',
    Statement: [
        {
            Effect: 'Allow',
            Principal: {
                Service: 'lambda.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
        },
    ],
};

const TAGS = [
    {
        Key: 'gitgazer',
        Value: 'true',
    },
    {
        Key: 'env',
        Value: `${environment}`,
    },
];

export const createLambdaRole = async (roleName: string, description: string): Promise<Role> => {
    const logger = getLogger();
    logger.info(`Creating IAM role ${roleName} with description: ${description}`);

    const params: CreateRoleCommandInput = {
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
        Description: description,
        Tags: TAGS,
        MaxSessionDuration: 60 * 60, // 1 hour
    };

    const command = new CreateRoleCommand(params);

    logger.trace('CreateRole command parameters', {params});
    const response = await iamClient.send(command);
    await attachPolicy(roleName);

    if (!response.Role) {
        throw new InternalServerError(`Failed to create IAM role ${roleName}`);
    }

    return response.Role;
};

const attachPolicy = async (roleName: string) => {
    const logger = getLogger();
    logger.info(`Attaching policy to role ${roleName}`);

    const params: AttachRolePolicyCommandInput = {
        RoleName: roleName,
        PolicyArn: policyArn,
    };
    const command = new AttachRolePolicyCommand(params);
    logger.trace('AttachRolePolicy command parameters', {params});
    await iamClient.send(command);
};

export const deleteRole = async (roleName: string) => {
    const logger = getLogger();
    logger.info(`Deleting IAM role ${roleName}`);

    await iamClient.send(new DetachRolePolicyCommand({RoleName: roleName, PolicyArn: policyArn}));
    await iamClient.send(new DeleteRoleCommand({RoleName: roleName}));
};

export const getIamRoleName = (integrationId: string) => `gitgazer-${environment}-${integrationId}-api`;

export const getIamRoleArn = (integrationId: string) => `arn:aws:iam::${accountId}:role/${getIamRoleName(integrationId)}`;
