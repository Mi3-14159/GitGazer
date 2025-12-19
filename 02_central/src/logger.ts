import {Logger} from '@aws-lambda-powertools/logger';
import {correlationPaths, search} from '@aws-lambda-powertools/logger/correlationId';

export const newLogger = (): Logger => {
    const logger = new Logger({
        environment: process.env.ENVIRONMENT,
        logBufferOptions: {
            enabled: false,
        },
        correlationIdSearchFn: search,
    });
    return logger;
};

let logger = newLogger();
logger.injectLambdaContext({
    correlationIdPath: correlationPaths.API_GATEWAY_HTTP,
});

export const getLogger = (): Logger => logger;

export const resetLogger = (): Logger => {
    logger = newLogger();
    return logger;
};
