export type GitGazerWorkflowJobEvent = {
    integrationId: string;
    job_id: number;
    created_at: string;
    expire_at: number;
    workflow_job_event: {
        action: string;
        workflow_job: {
            id: number;
            run_id: number;
            run_url: string;
            status: string;
            conclusion: string;
            name: string;
            workflow_name: string;
            run_attempt: number;
            created_at: string;
            started_at: string;
            completed_at: string;
        };
        repository: {
            full_name: string;
            html_url: string;
        };
    };
};

const jobsProperties = `{
    job_id
    created_at
    workflow_job_event {
        workflow_job {
            run_id
            run_url
            status
            name
            workflow_name
            created_at
            started_at
            completed_at
            conclusion
        }
        repository {
            full_name
            html_url
        }
    }
}`;

export const listJobs = (integrationId: string): string => `query ListJobs {
    listJobs(filter: { integrationId: "${integrationId}" }) {
        nextToken
        items ${jobsProperties}
    }
}`;

export const onPutJob = `subscription MySubscription {
    onPutJob ${jobsProperties}
}`;

export interface listJobsResponse {
    listJobs: {
        items: GitGazerWorkflowJobEvent[];
    };
}

export interface onPutJobSubscriptionResponse {
    onPutJob: GitGazerWorkflowJobEvent;
}
