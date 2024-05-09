export interface Job {
  run_id: number;
  action: string;
  workflow_name: string;
  repository: {
    full_name: string;
  };
  workflow_job: {
    created_at: string;
    conclusion: string;
  };
}

export interface listJobsResponse {
  listJobs: {
    items: Job[];
  };
}

export interface onPutJobSubscriptionResponse {
  onPutJob: Job;
}
