export const VERDICT_KINDS = ['flaky', 'real', 'unknown'] as const;
export type VerdictKind = (typeof VERDICT_KINDS)[number];
