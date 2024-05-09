export interface Job {
  run_id: number;
  action: string;
  workflow_name: string;
  repository: {
    full_name: string;
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
