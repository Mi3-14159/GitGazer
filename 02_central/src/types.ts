import {WorkflowJobEvent, WorkflowRunEvent} from '@octokit/webhooks-types';

export type GQLInput = {
    run_id: number;
    job_id: number;
    workflow_name: string;
    job_name: string;
    expire_at: number;
    integrationId: string;
    created_at: string;
} & WorkflowJobEvent;

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
