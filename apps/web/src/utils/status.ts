import {AlertCircle, CheckCircle2, Clock, XCircle} from '@lucide/vue';
import type {WorkflowConclusion} from '@common/types';
import type {Component} from 'vue';

export function statusBadgeVariant(status: string): 'success' | 'destructive' | 'warning' | 'default' | 'secondary' {
    switch (status) {
        case 'success' satisfies WorkflowConclusion:
            return 'success';
        case 'failure' satisfies WorkflowConclusion:
        case 'failed':
            return 'destructive';
        case 'cancelled' satisfies WorkflowConclusion:
            return 'warning';
        default:
            return 'secondary';
    }
}

export function statusIcon(status: string): Component {
    switch (status) {
        case 'success' satisfies WorkflowConclusion:
            return CheckCircle2;
        case 'failure' satisfies WorkflowConclusion:
        case 'failed':
            return XCircle;
        case 'cancelled' satisfies WorkflowConclusion:
            return AlertCircle;
        default:
            return Clock;
    }
}

export function formatDuration(startedAt: string | Date | null, completedAt: string | Date | null): string {
    if (!startedAt) return '-';
    const start = new Date(startedAt);
    const end = completedAt ? new Date(completedAt) : new Date();
    const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
    if (seconds < 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}
