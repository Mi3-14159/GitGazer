import {putJob} from '@/clients/dynamodb';
import {Job} from '@common/types';
import {WorkflowJobEvent} from '@octokit/webhooks-types';

const _expireInSec = process.env.EXPIRE_IN_SEC;
if (!_expireInSec) {
    throw new Error('Missing EXPIRE_IN_SEC environment variable');
}
const expireInSec = parseInt(_expireInSec);

export const createWorkflowJob = async (integrationId: string, event: WorkflowJobEvent): Promise<Job<WorkflowJobEvent>> => {
    const job: Job<WorkflowJobEvent> = {
        integrationId,
        job_id: event.workflow_job.id,
        created_at: event.workflow_job.created_at,
        expire_at: Math.floor(new Date().getTime() / 1000) + expireInSec,
        workflow_job_event: event,
    };

    return await putJob(job);
};
