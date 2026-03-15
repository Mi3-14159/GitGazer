import {AlertCircle, CheckCircle2, Clock, XCircle} from 'lucide-vue-next';
import type {Component} from 'vue';

export function statusBadgeVariant(status: string): 'success' | 'destructive' | 'warning' | 'default' | 'secondary' {
    switch (status) {
        case 'success':
            return 'success';
        case 'failure':
        case 'failed':
            return 'destructive';
        case 'cancelled':
            return 'warning';
        default:
            return 'secondary';
    }
}

export function statusIcon(status: string): Component {
    switch (status) {
        case 'success':
            return CheckCircle2;
        case 'failure':
        case 'failed':
            return XCircle;
        case 'cancelled':
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
