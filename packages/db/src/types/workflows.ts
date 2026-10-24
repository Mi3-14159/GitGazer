export const WORKFLOW_CONCLUSIONS = ['success', 'failure', 'neutral', 'cancelled', 'timed_out', 'action_required', 'stale', 'skipped'] as const;
export type WorkflowConclusion = (typeof WORKFLOW_CONCLUSIONS)[number];
