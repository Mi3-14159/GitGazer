import {Sha256} from '@aws-crypto/sha256-js';
import {defaultProvider} from '@aws-sdk/credential-provider-node';
import {HttpRequest} from '@aws-sdk/protocol-http';
import {SignatureV4} from '@aws-sdk/signature-v4';
import {WorkflowJobEvent} from '@octokit/webhooks-types';
import {getLogger} from './logger';
import {GQLInput} from './types';

const log = getLogger();

export const putJob = async (integrationId: string, job: WorkflowJobEvent) => {
    log.info('put job', JSON.stringify(job));
    const input = getInput(job, integrationId);
    const inputAsString = JSON.stringify(input).replace(/"([^"]+)":/g, '$1:');
    const allKeys = getAllKeysStructuredFormatted(input);
    const body = JSON.stringify({
        operationName: 'PutJob',
        query: `
            mutation PutJob {
                putJob(
                    input: ${inputAsString}
                ) ${allKeys}
            }
        `,
        variables: {},
    });
    log.debug('put job body', JSON.stringify(body));

    const uri = new URL(process.env.GRAPHQL_URI);
    const httpRequest = new HttpRequest({
        headers: {
            'Content-Type': 'application/json',
            host: uri.host,
        },
        hostname: uri.hostname,
        method: 'POST',
        body,
        path: uri.pathname,
    });

    const signer = new SignatureV4({
        credentials: defaultProvider(),
        region: process.env.AWS_REGION,
        service: 'appsync',
        sha256: Sha256,
    });

    const signedRequest = await signer.sign(httpRequest);
    const response = await fetch(uri.href, {
        method: signedRequest.method,
        body: signedRequest.body,
        headers: signedRequest.headers,
    });

    const json = await response.json();
    if (json.errors) {
        throw new Error(JSON.stringify(json.errors));
    }
};

const getInput = (event: WorkflowJobEvent, integrationId: string): GQLInput => {
    const input: GQLInput = {
        ...event,
        run_id: event.workflow_job.run_id,
        job_id: event.workflow_job.id,
        workflow_name: event.workflow_job.workflow_name,
        job_name: event.workflow_job.name,
        expire_at: Math.floor(new Date().getTime() / 1000) + parseInt(process.env.EXPIRE_IN_SEC),
        integrationId,
        created_at: event.workflow_job.created_at,
    };

    delete input.workflow_job.steps;
    delete input.workflow_job.labels;
    delete input.repository.topics;
    delete input.repository.custom_properties;
    delete input.repository.license;
    delete input.deployment;

    return input;
};

// TODO: this breaks on all the edge cases -> needs refactoring
const getAllKeysStructuredFormatted = (input: GQLInput) => {
    function extractKeys(item) {
        let currentKeys = [];
        for (let key in item) {
            currentKeys.push(key); // Push key into the current array
            if (item[key] !== null && typeof item[key] === 'object') {
                let nestedKeys = extractKeys(item[key]); // Recursive call for nested objects or arrays
                if (nestedKeys.length > 0) {
                    currentKeys.push(nestedKeys); // Include nested keys if not empty
                }
            }
        }
        return `{${currentKeys.join(',')}}`; // Format the current array as a string with curly braces
    }

    return extractKeys(input); // Start the recursion with the initial object
};
