<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Label from '@/components/ui/Label.vue';
    import Popover from '@/components/ui/Popover.vue';
    import {cn} from '@/lib/utils';
    import {format, subDays, subHours} from 'date-fns';
    import {Calendar as CalendarIcon} from 'lucide-vue-next';
    import {computed, onMounted, ref} from 'vue';
    import {useRoute, useRouter} from 'vue-router';

    export interface DateRange {
        from?: Date;
        to?: Date;
        window?: string;
    }

    const dateRange = defineModel<DateRange>('dateRange', {default: () => ({})});

    const props = defineProps<{
        class?: string;
    }>();

    const route = useRoute();
    const router = useRouter();

    const open = ref(false);

    const shortcuts = [
        {label: 'Past 1 hour', value: '1h', getRange: () => ({from: subHours(new Date(), 1), to: new Date()})},
        {label: 'Past 24 hours', value: '24h', getRange: () => ({from: subDays(new Date(), 1), to: new Date()})},
        {label: 'Past 7 days', value: '7d', getRange: () => ({from: subDays(new Date(), 7), to: new Date()})},
        {label: 'Past 30 days', value: '30d', getRange: () => ({from: subDays(new Date(), 30), to: new Date()})},
    ] as const;

    const defaultShortcut = shortcuts[2]; // Past 7 days

    // Resolve initial state from URL > model props > default
    function resolveInitialState() {
        const urlWindow = route.query.window as string | undefined;
        const urlFrom = route.query.created_from as string | undefined;
        const urlTo = route.query.created_to as string | undefined;

        if (urlWindow) {
            const match = shortcuts.find((s) => s.value === urlWindow);
            if (match) {
                const range = match.getRange();
                return {shortcut: match, from: range.from, to: range.to, window: match.value};
            }
        }

        if (urlFrom || urlTo) {
            const from = urlFrom ? new Date(urlFrom) : undefined;
            const to = urlTo ? new Date(urlTo) : undefined;
            return {shortcut: null, from, to, window: undefined};
        }

        if (dateRange.value.window) {
            const match = shortcuts.find((s) => s.value === dateRange.value.window);
            if (match) {
                const range = match.getRange();
                return {shortcut: match, from: range.from, to: range.to, window: match.value};
            }
        }

        if (dateRange.value.from) {
            return {shortcut: null, from: dateRange.value.from, to: dateRange.value.to, window: undefined};
        }

        // Default
        const range = defaultShortcut.getRange();
        return {shortcut: defaultShortcut, from: range.from, to: range.to, window: defaultShortcut.value};
    }

    const initial = resolveInitialState();

    const activeShortcut = ref<(typeof shortcuts)[number] | null>(initial.shortcut);
    const fromDate = ref(initial.from ? format(initial.from, 'yyyy-MM-dd') : '');
    const toDate = ref(initial.to ? format(initial.to, 'yyyy-MM-dd') : '');
    const fromTime = ref(initial.from ? format(initial.from, 'HH:mm') : '00:00');
    const toTime = ref(initial.to ? format(initial.to, 'HH:mm') : '23:59');

    function syncToUrl(from: Date | undefined, to: Date | undefined, win?: string) {
        const query: Record<string, string> = {};
        // Preserve unrelated query params
        for (const [key, val] of Object.entries(route.query)) {
            if (key !== 'window' && key !== 'created_from' && key !== 'created_to' && typeof val === 'string') {
                query[key] = val;
            }
        }

        if (win) {
            query.window = win;
        } else {
            if (from) query.created_from = from.toISOString();
            if (to) query.created_to = to.toISOString();
        }

        router.replace({query});
    }

    function update(from: Date | undefined, to: Date | undefined, win?: string) {
        dateRange.value = {from, to, window: win};
        syncToUrl(from, to, win);
    }

    // Set initial state synchronously so downstream watchers (e.g. useMetric)
    // see the resolved filter immediately and don't fire an empty-params fetch first.
    dateRange.value = {from: initial.from, to: initial.to, window: initial.window};

    // Sync to URL on mount (router.replace requires the component to be mounted)
    onMounted(() => {
        syncToUrl(initial.from, initial.to, initial.window);
    });

    function emitRange() {
        activeShortcut.value = null;
        if (!fromDate.value) {
            update(undefined, undefined);
            return;
        }

        const [fH, fM] = fromTime.value.split(':').map(Number);
        const [tH, tM] = toTime.value.split(':').map(Number);

        const from = new Date(fromDate.value);
        from.setHours(fH, fM, 0, 0);

        const to = toDate.value ? new Date(toDate.value) : new Date(fromDate.value);
        to.setHours(tH, tM, 59, 999);

        update(from, to);
    }

    function applyShortcut(shortcut: (typeof shortcuts)[number]) {
        activeShortcut.value = shortcut;
        const range = shortcut.getRange();
        fromDate.value = format(range.from, 'yyyy-MM-dd');
        toDate.value = format(range.to, 'yyyy-MM-dd');
        fromTime.value = format(range.from, 'HH:mm');
        toTime.value = format(range.to, 'HH:mm');
        update(range.from, range.to, shortcut.value);
    }

    function clearRange() {
        activeShortcut.value = null;
        fromDate.value = '';
        toDate.value = '';
        fromTime.value = '00:00';
        toTime.value = '23:59';
        update(undefined, undefined);
    }

    const displayText = computed(() => {
        if (activeShortcut.value) return activeShortcut.value.label;
        if (!dateRange.value.from) return 'Pick a date range';
        const f = dateRange.value.from;
        const t = dateRange.value.to;
        if (!t) return `${format(f, 'MMM dd, yyyy')} at ${fromTime.value}`;
        return `${format(f, 'MMM dd')} ${fromTime.value} – ${format(t, 'MMM dd, yyyy')} ${toTime.value}`;
    });
</script>

<template>
    <Popover
        :open="open"
        align="end"
        content-class="w-auto p-0"
        @update:open="open = $event"
    >
        <template #trigger>
            <Button
                variant="outline"
                size="sm"
                :class="cn('justify-start text-left font-normal', !dateRange.from && 'text-muted-foreground', props.class)"
            >
                <CalendarIcon class="mr-2 h-3.5 w-3.5" />
                {{ displayText }}
            </Button>
        </template>

        <div class="p-3 space-y-3 min-w-[300px]">
            <!-- Shortcuts -->
            <div class="space-y-1.5">
                <Label class="text-xs">Quick Select</Label>
                <div class="flex flex-wrap gap-1">
                    <Button
                        v-for="shortcut in shortcuts"
                        :key="shortcut.value"
                        variant="outline"
                        size="sm"
                        class="text-xs h-7"
                        @click="applyShortcut(shortcut)"
                    >
                        {{ shortcut.label }}
                    </Button>
                </div>
            </div>

            <div class="border-t pt-3 grid grid-cols-2 gap-3">
                <div class="space-y-1.5">
                    <Label
                        for="from-date"
                        class="text-xs"
                        >From</Label
                    >
                    <input
                        id="from-date"
                        v-model="fromDate"
                        type="date"
                        class="flex h-8 w-full rounded-md border border-border bg-input-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        @change="emitRange"
                    />
                    <input
                        v-model="fromTime"
                        type="time"
                        class="flex h-8 w-full rounded-md border border-border bg-input-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        @change="emitRange"
                    />
                </div>
                <div class="space-y-1.5">
                    <Label
                        for="to-date"
                        class="text-xs"
                        >To</Label
                    >
                    <input
                        id="to-date"
                        v-model="toDate"
                        type="date"
                        class="flex h-8 w-full rounded-md border border-border bg-input-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        @change="emitRange"
                    />
                    <input
                        v-model="toTime"
                        type="time"
                        class="flex h-8 w-full rounded-md border border-border bg-input-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        @change="emitRange"
                    />
                </div>
            </div>

            <div
                v-if="dateRange.from"
                class="border-t pt-2"
            >
                <Button
                    variant="ghost"
                    size="sm"
                    class="w-full h-7 text-xs"
                    @click="clearRange"
                >
                    Clear date range
                </Button>
            </div>
        </div>
    </Popover>
</template>
