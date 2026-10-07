import { defineEnvVars } from '@sveltejs/kit/env';
export const variables = defineEnvVars({
  DATABASE_URL: { schema: (value: string | undefined) => value, description: 'Server-only Postgres connection URL.' },
  DAILY_TOKEN_SECRET: { schema: (value: string | undefined) => value, description: 'Shared signing secret, at least 32 characters.' }
});
