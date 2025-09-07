import {
    AdminAddUserToGroupCommand,
    CognitoIdentityProviderClient,
    CreateGroupCommand,
    DeleteGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({});

const cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID;
if (!cognitoUserPoolId) {
    throw new Error('Missing COGNITO_USER_POOL_ID environment variable');
}

export const newGroup = async (name: string, description?: string): Promise<void> => {
    const command = new CreateGroupCommand({
        GroupName: name,
        UserPoolId: cognitoUserPoolId,
        Description: description,
    });
    await cognitoClient.send(command);
};

export const addUserToGroup = async (username: string, groupName: string): Promise<void> => {
    const command = new AdminAddUserToGroupCommand({
        UserPoolId: cognitoUserPoolId,
        Username: username,
        GroupName: groupName,
    });
    await cognitoClient.send(command);
};

export const deleteGroup = async (groupName: string): Promise<void> => {
    const command = new DeleteGroupCommand({
        GroupName: groupName,
        UserPoolId: cognitoUserPoolId,
    });
    await cognitoClient.send(command);
};
