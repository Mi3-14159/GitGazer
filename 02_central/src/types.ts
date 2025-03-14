import {Repository, WorkflowJob, WorkflowJobEvent, WorkflowRunEvent} from '@octokit/webhooks-types';

export type GitGazerWorkflowJobEventInput = {
    integrationId: string;
    job_id: number;
    created_at: string;
    expire_at: number;
    workflow_job_event: {
        action: string;
        repository: Partial<Repository>;
        workflow_job: Partial<WorkflowJob>;
    };
};

export type IntegrationSecret = {
    secret: string;
    owner: string;
};

export const isWorkflowJobEvent = (event: any) => {
    return (event as WorkflowJobEvent).workflow_job !== undefined && (event as WorkflowJobEvent).workflow_job.id !== undefined;
};

export const isWorkflowRunEvent = (event: any) => {
    return (event as WorkflowRunEvent).workflow_run !== undefined && (event as WorkflowRunEvent).workflow_run.id !== undefined;
};
