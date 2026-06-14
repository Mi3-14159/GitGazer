export type NotificationRule = {
    integrationId: string;
    id?: string;
    label: string;
    channels: NotificationRuleChannel[];
    createdAt: string;
    updatedAt: string;
    enabled: boolean;
    ignore_dependabot: boolean;
    rule: NotificationRuleRule;
};

// implement a guard clause for NotificationRule
export const isNotificationRule = (rule: any): rule is NotificationRule => {
    if (typeof rule !== 'object' || rule === null) return false;
    return (
        typeof rule.integrationId === 'string' &&
        typeof rule.label === 'string' &&
        Array.isArray(rule.channels) &&
        rule.channels.every(isNotificationRuleChannel) &&
        typeof rule.createdAt === 'string' &&
        typeof rule.updatedAt === 'string' &&
        typeof rule.enabled === 'boolean' &&
        typeof rule.ignore_dependabot === 'boolean' &&
        isNotificationRuleRule(rule.rule)
    );
};

export enum NotificationRuleChannelType {
    SLACK = 'SLACK',
}

export type NotificationRuleChannel = {
    type: NotificationRuleChannelType;
    webhook_url: string;
};

const ALLOWED_WEBHOOK_HOSTS = new Set(['hooks.slack.com']);

const isAllowedWebhookUrl = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') return false;
        // Block private/internal IPs
        const hostname = parsed.hostname;
        if (
            hostname === 'localhost' ||
            hostname.startsWith('127.') ||
            hostname.startsWith('10.') ||
            hostname.startsWith('192.168.') ||
            hostname === '169.254.169.254' ||
            hostname.startsWith('169.254.') ||
            /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
            hostname === '[::1]' ||
            hostname === '0.0.0.0'
        ) {
            return false;
        }
        return ALLOWED_WEBHOOK_HOSTS.has(parsed.hostname);
    } catch {
        return false;
    }
};

export const isNotificationRuleChannel = (channel: any): channel is NotificationRuleChannel => {
    if (typeof channel !== 'object' || channel === null) return false;
    return (
        Object.values(NotificationRuleChannelType).includes(channel.type) &&
        typeof channel.webhook_url === 'string' &&
        isAllowedWebhookUrl(channel.webhook_url)
    );
};

export type NotificationRuleRule = {
    head_branch?: string;
    owner?: string;
    repository_name?: string;
    workflow_name?: string;
    topics?: string[];
};

export const isNotificationRuleRule = (rule: any): rule is NotificationRuleRule => {
    if (typeof rule !== 'object' || rule === null) return false;
    const isOptionalString = (v: unknown) => v === undefined || typeof v === 'string';
    const isOptionalStringArray = (v: unknown) =>
        v === undefined || (Array.isArray(v) && v.length <= 50 && v.every((t: unknown) => typeof t === 'string' && t.length <= 100));
    return (
        isOptionalString(rule.head_branch) &&
        isOptionalString(rule.owner) &&
        isOptionalString(rule.repository_name) &&
        isOptionalString(rule.workflow_name) &&
        isOptionalStringArray(rule.topics)
    );
};

export type NotificationRuleUpdate = Omit<NotificationRule, 'createdAt' | 'updatedAt' | 'integrationId' | 'id'>;

export const isNotificationRuleUpdate = (rule: any): rule is NotificationRuleUpdate => {
    return (
        typeof rule.label === 'string' &&
        rule.label.trim().length > 0 &&
        rule.label.length <= 100 &&
        Array.isArray(rule.channels) &&
        rule.channels.every(isNotificationRuleChannel) &&
        typeof rule.enabled === 'boolean' &&
        typeof rule.ignore_dependabot === 'boolean' &&
        isNotificationRuleRule(rule.rule)
    );
};
