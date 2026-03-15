/**
 * Central registry of public route prefixes that bypass authentication.
 *
 * Each domain declares its own `publicPrefixes` export.
 * This file aggregates them into a single list for the auth middleware.
 */

import {publicPrefixes as authPrefixes} from '@/domains/auth/auth.routes';
import {publicPrefixes as githubAppPrefixes} from '@/domains/github-app/github-app.routes';
import {publicPrefixes as webhookPrefixes} from '@/domains/webhooks/webhooks.routes';
import {publicPrefixes as feFailoverPrefixes} from '@/shared/router/feFailover';

export const publicRoutePrefixes: readonly string[] = [...authPrefixes, ...webhookPrefixes, ...githubAppPrefixes, ...feFailoverPrefixes];
