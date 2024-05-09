const jobsProperties = `{
  run_id
  workflow_name
  action
  repository {
      full_name
  }
}`;

export const listJobs = `query ListJobs {
    listJobs {
        nextToken
        items ${jobsProperties}
    }
}`;

export const onPutJob = `subscription MySubscription {
    onPutJob ${jobsProperties}
}`;
