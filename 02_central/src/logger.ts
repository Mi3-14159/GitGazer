import pino from 'pino';

export const newLogger = (): pino.Logger => {
    return pino({
        level: process.env.PINO_LOG_LEVEL || 'info', // Set log level from env var, default to info
        transport:
            process.env.ENVIRONMENT === 'dev'
                ? {
                      target: 'pino-pretty',
                      options: {
                          colorize: true,
                      },
                  }
                : undefined,
        formatters: {
            level: (label) => {
                return {level: label.toUpperCase()};
            },
        },
    });
};

let logger = newLogger();

export const getLogger = () => logger;

export const set = (key: string, value: unknown): pino.Logger => {
    logger = logger.child({[key]: value});
    return logger;
};
