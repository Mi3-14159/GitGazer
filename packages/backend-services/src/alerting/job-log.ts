const REDACTED = '[REDACTED]';
const LOG_PREFIX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z ?/;
// CI tools force colors on, and a code inside `token\x1b[39m: value` would hide the assignment from redaction
// Full ECMA-48 CSI shape: parameter bytes include ':' (as in 38:2:r:g:b truecolor), then intermediates and a final byte
const ANSI_SEQUENCE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const ERROR_MARKER = '##[error]';
const GROUP_MARKER = '##[group]';
const STEP_MARKER = '##[group]Run ';
const CONTEXT_LINES = 3;
const MAX_EXCERPT_LINES = 10;
const MAX_EXCERPT_CHARS = 1500;

const SECRET_PATTERNS: Array<[RegExp, string]> = [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, REDACTED],
    [/github_pat_[A-Za-z0-9_]{20,}/g, REDACTED],
    [/gh[pousr]_[A-Za-z0-9]{20,}/g, REDACTED],
    [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, REDACTED],
    [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`],
    // User info runs to the last @ in the authority: passwords may contain @, and a token can be the user name alone.
    [/:\/\/[^\s/?#]*@/g, `://${REDACTED}@`],
    // An object or array value is redacted to the end of the line, since its nested keys need not look secret.
    [/((?:password|secret|token|api[_-]?key)\w*["']?\s*[=:]\s*)(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[{[].*|\S+)/gi, `$1${REDACTED}`],
];

export const redactSecrets = (text: string): string =>
    SECRET_PATTERNS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);

export const stripLogPrefix = (line: string): string => line.replace(LOG_PREFIX, '').replace(ANSI_SEQUENCE, '');

const lastIndexStartingWith = (lines: string[], prefix: string, from: number): number => {
    for (let i = from; i >= 0; i--) {
        if (lines[i].startsWith(prefix)) return i;
    }
    return -1;
};

export const failedStepTail = (log: string, maxChars: number): string => {
    const lines = log.split(/\r?\n/).map(stripLogPrefix);
    const lastError = lastIndexStartingWith(lines, ERROR_MARKER, lines.length - 1);

    // A step's output can open its own groups, so the failing step runs from its "Run" header to the next group after the error.
    let failing = lines;
    if (lastError !== -1) {
        const start = lastIndexStartingWith(lines, STEP_MARKER, lastError);
        const end = lines.findIndex((line, index) => index > lastError && line.startsWith(GROUP_MARKER));
        failing = lines.slice(Math.max(start, 0), end === -1 ? lines.length : end);
    }

    const text = redactSecrets(failing.join('\n'));
    return text.length > maxChars ? text.slice(-maxChars) : text;
};

export const extractErrorExcerpt = (log: string): string | null => {
    const lines = failedStepTail(log, Number.MAX_SAFE_INTEGER).split('\n');

    const picked = new Set<number>();
    lines.forEach((line, index) => {
        if (!line.startsWith(ERROR_MARKER)) return;
        picked.add(index);
        let context = 0;
        for (let i = index - 1; i >= 0 && context < CONTEXT_LINES; i--) {
            if (lines[i].trim() === '' || /^##\[(?:end)?group\]/.test(lines[i])) continue;
            picked.add(i);
            context++;
        }
    });

    const candidates = picked.size > 0 ? [...picked].sort((a, b) => a - b).map((i) => lines[i]) : lines.filter((line) => line.trim() !== '');
    if (candidates.length === 0) return null;

    const unique = [...new Set(candidates.map((line) => (line.startsWith(ERROR_MARKER) ? line.slice(ERROR_MARKER.length) : line)))];
    const excerpt = unique.slice(-MAX_EXCERPT_LINES).join('\n');
    return excerpt.length > MAX_EXCERPT_CHARS ? excerpt.slice(-MAX_EXCERPT_CHARS) : excerpt;
};
