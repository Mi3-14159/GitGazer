import type {OrgSyncDefaultRole} from './members';

export const INTEGRATION_APP_TYPES = ['github', 'webhook'] as const;
export type IntegrationAppType = (typeof INTEGRATION_APP_TYPES)[number];

export const isIntegrationAppType = (value: unknown): value is IntegrationAppType =>
    typeof value === 'string' && (INTEGRATION_APP_TYPES as readonly string[]).includes(value);

export const MAX_WEBHOOK_HANDLES = 20;

export type NotificationHandle = {
    handleId: string;
    appId: string;
    name: string;
    url: string | null;
    ruleCount: number;
};

export type GithubAppSettings = {
    secret: string | null;
    orgSyncDefaultRole: OrgSyncDefaultRole;
};

export type IntegrationApp =
    | {appId: string; type: 'github'; createdAt: string; settings: GithubAppSettings}
    | {appId: string; type: 'webhook'; createdAt: string; handles: NotificationHandle[]};
