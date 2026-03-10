import {pgRole} from 'drizzle-orm/pg-core';

export const gitgazerWriter = pgRole('gitgazer_writer', {
    createRole: false,
    createDb: false,
    inherit: false,
});

export const gitgazerReader = pgRole('gitgazer_reader', {
    createRole: false,
    createDb: false,
    inherit: false,
});

export const gitgazerAnalyst = pgRole('gitgazer_analyst', {
    createRole: false,
    createDb: false,
    inherit: false,
});
