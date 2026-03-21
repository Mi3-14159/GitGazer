<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Label from '@/components/ui/Label.vue';
    import Popover from '@/components/ui/Popover.vue';
    import {cn} from '@/lib/utils';
    import {format, subDays, subHours} from 'date-fns';
    import {Calendar as CalendarIcon} from 'lucide-vue-next';
    import {computed, ref, watch} from 'vue';

    export interface DateRange {
        from?: Date;
        to?: Date;
        window?: string;
    }

    const dateRange = defineModel<DateRange>('dateRange', {default: () => ({})});

    const props = defineProps<{
        class?: string;
    }>();

    const open = ref(false);

    const shortcuts = [
        {label: 'Past 1 hour', value: '1h', getRange: () => ({from: subHours(new Date(), 1), to: new Date()})},
        {label: 'Past 24 hours', value: '24h', getRange: () => ({from: subDays(new Date(), 1), to: new Date()})},
        {label: 'Past 7 days', value: '7d', getRange: () => ({from: subDays(new Date(), 7), to: new Date()})},
        {label: 'Past 30 days', value: '30d', getRange: () => ({from: subDays(new Date(), 30), to: new Date()})},
    ] as const;

    // Derive internal state from the model value
    const activeShortcut = ref<(typeof shortcuts)[number] | null>(
        dateRange.value.window ? (shortcuts.find((s) => s.value === dateRange.value.window) ?? null) : null,
    );
    const fromDate = ref(dateRange.value.from ? format(dateRange.value.from, 'yyyy-MM-dd') : '');
    const toDate = ref(dateRange.value.to ? format(dateRange.value.to, 'yyyy-MM-dd') : '');
    const fromTime = ref(dateRange.value.from ? format(dateRange.value.from, 'HH:mm') : '00:00');
    const toTime = ref(dateRange.value.to ? format(dateRange.value.to, 'HH:mm') : '23:59');

    // Keep internal state in sync when model is updated externally
    watch(dateRange, (val) => {
        activeShortcut.value = val.window ? (shortcuts.find((s) => s.value === val.window) ?? null) : null;
        fromDate.value = val.from ? format(val.from, 'yyyy-MM-dd') : '';
        toDate.value = val.to ? format(val.to, 'yyyy-MM-dd') : '';
        fromTime.value = val.from ? format(val.from, 'HH:mm') : '00:00';
        toTime.value = val.to ? format(val.to, 'HH:mm') : '23:59';
    });

    function emitRange() {
        activeShortcut.value = null;
        if (!fromDate.value) {
            dateRange.value = {};
            return;
        }

        const [fH, fM] = fromTime.value.split(':').map(Number);
        const [tH, tM] = toTime.value.split(':').map(Number);

        const from = new Date(fromDate.value);
        from.setHours(fH, fM, 0, 0);

        const to = toDate.value ? new Date(toDate.value) : new Date(fromDate.value);
        to.setHours(tH, tM, 59, 999);

        dateRange.value = {from, to};
    }

    function applyShortcut(shortcut: (typeof shortcuts)[number]) {
        activeShortcut.value = shortcut;
        const range = shortcut.getRange();
        fromDate.value = format(range.from, 'yyyy-MM-dd');
        toDate.value = format(range.to, 'yyyy-MM-dd');
        fromTime.value = format(range.from, 'HH:mm');
        toTime.value = format(range.to, 'HH:mm');
        dateRange.value = {from: range.from, to: range.to, window: shortcut.value};
    }

    function clearRange() {
        activeShortcut.value = null;
        fromDate.value = '';
        toDate.value = '';
        fromTime.value = '00:00';
        toTime.value = '23:59';
        dateRange.value = {};
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

        <div class="p-3 space-y-3 w-[280px]">
            <!-- Quick Select -->
            <div class="space-y-1.5">
                <Label class="text-xs">Quick Select</Label>
                <select
                    :value="activeShortcut?.value ?? ''"
                    class="flex h-7 w-full rounded-md border border-border bg-input-background px-1.5 py-0.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    @change="
                        (e) => {
                            const val = (e.target as HTMLSelectElement).value;
                            const s = shortcuts.find((s) => s.value === val);
                            if (s) applyShortcut(s);
                        }
                    "
                >
                    <option
                        value=""
                        disabled
                    >
                        Select a preset...
                    </option>
                    <option
                        v-for="shortcut in shortcuts"
                        :key="shortcut.value"
                        :value="shortcut.value"
                    >
                        {{ shortcut.label }}
                    </option>
                </select>
            </div>

            <div class="border-t pt-3 grid grid-cols-2 gap-2">
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
                        class="flex h-7 w-full rounded-md border border-border bg-input-background px-1.5 py-0.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        @change="emitRange"
                    />
                    <input
                        v-model="fromTime"
                        type="time"
                        class="flex h-7 w-full rounded-md border border-border bg-input-background px-1.5 py-0.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                        class="flex h-7 w-full rounded-md border border-border bg-input-background px-1.5 py-0.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        @change="emitRange"
                    />
                    <input
                        v-model="toTime"
                        type="time"
                        class="flex h-7 w-full rounded-md border border-border bg-input-background px-1.5 py-0.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

<style scoped>
    input[type='date'],
    input[type='time'] {
        position: relative;
    }

    input[type='date']::-webkit-calendar-picker-indicator,
    input[type='time']::-webkit-calendar-picker-indicator {
        position: absolute;
        right: 0.375rem;
        cursor: pointer;
        opacity: 0.5;
    }
</style>
