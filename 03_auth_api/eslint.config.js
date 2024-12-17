import {ExplicitAuthFlowsType} from '@aws-sdk/client-cognito-identity-provider';

export default [
    {
        rules: {
            semi: 'error',
            'prefer-const': 'error',
        },
        extends: ['plugin:@aws-appsync/recommended'],
    },
];
