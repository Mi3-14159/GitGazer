import {getLogger} from '@/logger';
import {AssumeRoleCommand, AssumeRoleCommandInput, AssumeRoleCommandOutput, STSClient} from '@aws-sdk/client-sts';

const client = new STSClient();

export const assumeRole = async (roleArn: string): Promise<AssumeRoleCommandOutput> => {
    const logger = getLogger();
    logger.info(`Assuming role ${roleArn}`);

    const input: AssumeRoleCommandInput = {
        RoleArn: roleArn,
        RoleSessionName: 'gitgazer-session',
    };
    const command = new AssumeRoleCommand(input);
    return await client.send(command);
};
