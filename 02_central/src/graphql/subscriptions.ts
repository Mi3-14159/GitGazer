/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

import * as APITypes from './api';
type GeneratedSubscription<InputType, OutputType> = string & {
    __generatedSubscriptionInput: InputType;
    __generatedSubscriptionOutput: OutputType;
};

export const onPutJob = /* GraphQL */ `subscription OnPutJob {
  onPutJob {
    integrationId
    job_id
    created_at
    expire_at
    workflow_job_event {
      action
      workflow_job {
        id
        run_id
        workflow_name
        run_url
        run_attempt
        status
        conclusion
        created_at
        started_at
        completed_at
        name
        __typename
      }
      repository {
        full_name
        html_url
        __typename
      }
      __typename
    }
    __typename
  }
}
` as GeneratedSubscription<APITypes.OnPutJobSubscriptionVariables, APITypes.OnPutJobSubscription>;
