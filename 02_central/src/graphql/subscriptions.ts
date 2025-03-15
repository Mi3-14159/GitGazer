/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

import * as APITypes from "../api";
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
      __typename
    }
    __typename
  }
}
` as GeneratedSubscription<
  APITypes.OnPutJobSubscriptionVariables,
  APITypes.OnPutJobSubscription
>;
