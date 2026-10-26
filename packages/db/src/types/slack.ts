export const SLACK_LINK_SOURCES = ['gitgazer_email', 'github_profile_email', 'slack_sign_in'] as const;
export type SlackLinkSource = (typeof SLACK_LINK_SOURCES)[number];

export const MAX_SLACK_HANDLES = 20;

export const isSlackUserId = (value: unknown): value is string => typeof value === 'string' && /^[UW][A-Z0-9]+$/.test(value);

export type SlackChannel = {id: string; name: string; isPrivate: boolean};

export type SlackWorkspaceSummary = {teamId: string; teamName: string; disconnected: boolean};

export type SlackText = {type: 'mrkdwn'; text: string; verbatim: true};
export type SlackButton = {type: 'button'; text: {type: 'plain_text'; text: string}; url: string};
export type SlackBlock = {type: 'section'; text: SlackText} | {type: 'context'; elements: SlackText[]} | {type: 'actions'; elements: SlackButton[]};

export type SlackPayload = {text: string; attachments: [{color: string; blocks: SlackBlock[]}]};
