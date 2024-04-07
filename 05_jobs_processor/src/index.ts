import { HttpRequest } from "@aws-sdk/protocol-http";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { Sha256 } from "@aws-crypto/sha256-js";
import { URL } from "url";
import { SQSHandler, SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from "aws-lambda";
import { getLogger } from './logger';
import { GithubWebhookEvent } from "./types";

const log = getLogger();

export const handler: SQSHandler = async (event: SQSEvent) => {
    log.info({msg: 'handle event', data: event});
    const batchItemFailures: SQSBatchItemFailure[] = [];

    for (const record of event.Records) {
        try {
            const githubEvent: GithubWebhookEvent = JSON.parse(record.body);
            await putJob(githubEvent);
        } catch (error) {
            log.error({msg: `error processing record: ${record.messageId}`, err: error, record});
            batchItemFailures.push({ itemIdentifier: record.messageId });
        }
    }

    const response: SQSBatchResponse = {
        batchItemFailures
    };

    return response;
}

const putJob = async (job: GithubWebhookEvent) => {
    log.info({msg: 'put job', data: job});

    const body = JSON.stringify({
        operationName: 'PutJob',
        query: `
            mutation PutJob {
                putJob(
                    input: {
                        runId: "${job.workflow_job.run_id}"
                        workflowName: "${job.workflow_job.workflow_name}"
                        ${job.workflow_job.completed_at ? "completedAt: \"" + job.workflow_job.completed_at + "\"" : ''}
                        createdAt: "${job.workflow_job.created_at}"
                        htmlUrl: "${job.workflow_job.html_url}"
                        owner: "${job.repository.owner.login}"
                        repositoryName: "${job.repository.name}"
                        runAttempt: "${job.workflow_job.run_attempt}"
                        ${job.workflow_job.started_at ? "startedAt: \"" + job.workflow_job.started_at + "\"" : ''}
                        status: "${job.workflow_job.status}"
                        ${job.workflow_job.conclusion ? "conclusion: \"" + job.workflow_job.conclusion + "\"" : ''}
                    }
                ) {
                    runId
                }
            }
        `,
        variables: {},
    });
    log.debug({msg: 'put job body', data: body});

    const uri = new URL(process.env.GRAPHQL_URI);
    const httpRequest = new HttpRequest({
        headers: {
            'Content-Type': 'application/json',
            'host': uri.host
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
}