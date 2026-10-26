import type {SlackBlock, SlackButton, SlackPayload, SlackText, VerdictKind} from '@gitgazer/db/types';
import type {Verdict} from './verdict';

export type SlackAlertInput = {
    owner: string;
    repository: string;
    branch: string | null;
    workflowName: string;
    jobName: string;
    jobId: number;
    runId: number;
    runAttempt: number;
    event: string | null;
    senderLogin: string;
    pullRequestNumber: number | null;
    verdict: Verdict;
    details: {summary: string | null; excerpt: string | null} | null;
};

export type {SlackBlock, SlackPayload};

const MAX_MRKDWN_LENGTH = 3000;
const COLORS: Record<VerdictKind, string> = {real: '#e01e5a', flaky: '#ecb22e', unknown: '#9e9e9e'};
const VERDICT_LABELS: Record<Exclude<VerdictKind, 'unknown'>, string> = {flaky: 'Probably flaky', real: 'Likely a real failure'};

export const escapeMrkdwn = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The fallback text cannot be sent verbatim, so a zero-width space keeps a bare @here in a job name from notifying.
const neutralizeMentions = (text: string): string => text.replace(/@(here|channel|everyone)\b/gi, '@\u200b$1');

// Cutting after escaping must not leave half an entity such as "&l".
const clip = (escaped: string, max: number): string => (escaped.length <= max ? escaped : escaped.slice(0, max - 1).replace(/&[a-z]*$/, '') + '…');

// verbatim stops Slack from turning a bare @here or @channel in untrusted text into a mention.
const mrkdwn = (text: string): SlackText => ({type: 'mrkdwn', text: clip(text, MAX_MRKDWN_LENGTH), verbatim: true});

const button = (text: string, url: string): SlackButton => ({type: 'button', text: {type: 'plain_text', text}, url});

export const buildSlackAlert = (input: SlackAlertInput): SlackPayload => {
    const {owner, repository, runId, jobId, verdict, details} = input;
    const repoUrl = `https://github.com/${owner}/${repository}`;
    const runUrl = `${repoUrl}/actions/runs/${runId}`;
    const title = `${escapeMrkdwn(input.workflowName)} / ${escapeMrkdwn(input.jobName)}`;
    const branch = input.branch ? ` · ${escapeMrkdwn(input.branch)}` : '';

    const blocks: SlackBlock[] = [{type: 'section', text: mrkdwn(`*${title} failed* · <${repoUrl}|${escapeMrkdwn(repository)}>${branch}`)}];

    if (verdict.kind !== 'unknown') {
        const evidence = verdict.evidence ? ` · ${escapeMrkdwn(verdict.evidence)}` : '';
        blocks.push({type: 'context', elements: [mrkdwn(`${VERDICT_LABELS[verdict.kind]}${evidence}`)]});
    }

    if (details?.summary) {
        blocks.push({type: 'section', text: mrkdwn(`🔎 ${escapeMrkdwn(details.summary)}`)});
    }
    if (details?.excerpt) {
        // Reserve room for the fences so the clipped text never cuts them off.
        blocks.push({type: 'section', text: mrkdwn('```' + clip(escapeMrkdwn(details.excerpt), MAX_MRKDWN_LENGTH - 6) + '```')});
    }

    const event = input.event ? ` · ${escapeMrkdwn(input.event)}` : '';
    blocks.push({
        type: 'context',
        elements: [mrkdwn(`by ${escapeMrkdwn(input.senderLogin)}${event} · <${runUrl}|run #${runId}> · attempt ${input.runAttempt}`)],
    });

    const buttons = [button('Open failed step', `${runUrl}/job/${jobId}`)];
    if (input.pullRequestNumber !== null) {
        buttons.push(button('Open PR', `${repoUrl}/pull/${input.pullRequestNumber}`));
    }
    blocks.push({type: 'actions', elements: buttons});

    return {
        text: neutralizeMentions(`${title} failed on ${escapeMrkdwn(repository)}`),
        attachments: [{color: COLORS[verdict.kind], blocks}],
    };
};
