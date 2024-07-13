export interface Job {
  run_id: number;
  job_id: number;
  action: string;
  workflow_name: string;
  job_name: string;
  repository: {
    full_name: string;
  };
  workflow_job: {
    created_at: string;
    conclusion: string;
  };
}

const jobsProperties = `{
  run_id
  job_id
  workflow_name
  job_name
  action
  repository {
      full_name
  }
  workflow_job {
    created_at
    conclusion
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
    items: Job[];
  };
}

export interface onPutJobSubscriptionResponse {
  onPutJob: Job;
}
