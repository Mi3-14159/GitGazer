export const listJobs = `query ListJobs {
    listJobs {
        nextToken
        items {
            run_id
            workflow_name
            expire_at
            action
        }
    }
}`

export const onPutJob = `subscription MySubscription {
    onPutJob {
        action
        run_id
        workflow_name
    }
}`
