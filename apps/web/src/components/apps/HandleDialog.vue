<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import Input from '@/components/ui/Input.vue';
    import Label from '@/components/ui/Label.vue';
    import {isAllowedWebhookUrl, type NotificationHandle} from '@common/types';
    import {computed, nextTick, shallowRef, useTemplateRef, watch} from 'vue';

    const props = defineProps<{
        open: boolean;
        handle: NotificationHandle | null;
        saving: boolean;
        error: string | null;
    }>();

    const emit = defineEmits<{
        'update:open': [value: boolean];
        submit: [input: {name: string; url: string}];
    }>();

    const name = shallowRef('');
    const url = shallowRef('');
    const nameError = shallowRef<string | null>(null);
    const urlError = shallowRef<string | null>(null);
    const nameInput = useTemplateRef<{$el: HTMLInputElement}>('nameInput');
    const urlInput = useTemplateRef<{$el: HTMLInputElement}>('urlInput');

    const isEditing = computed(() => props.handle !== null);
    const title = computed(() => (isEditing.value ? 'Edit handle' : 'Add handle'));

    const touched = shallowRef(false);

    watch(
        () => props.open,
        (open) => {
            if (!open) return;
            name.value = props.handle?.name ?? '';
            url.value = props.handle?.url ?? '';
            nameError.value = null;
            urlError.value = null;
            touched.value = false;
        },
        {immediate: true},
    );

    function validate(): boolean {
        nameError.value = name.value.trim() ? null : 'Enter a name.';
        urlError.value = isAllowedWebhookUrl(url.value.trim()) ? null : 'Enter a Slack incoming webhook URL starting with https://hooks.slack.com/';
        return !nameError.value && !urlError.value;
    }

    async function submit() {
        touched.value = true;
        if (!validate()) {
            await nextTick();
            (nameError.value ? nameInput.value : urlInput.value)?.$el.focus();
            return;
        }
        emit('submit', {name: name.value.trim(), url: url.value.trim()});
    }

    watch([name, url], () => {
        if (touched.value) validate();
    });
</script>

<template>
    <Dialog
        :open="open"
        @update:open="emit('update:open', $event)"
    >
        <form
            novalidate
            @submit.prevent="submit"
        >
            <h3 class="text-lg font-semibold">{{ title }}</h3>
            <p class="mt-1 text-sm text-muted-foreground">A handle is a named Slack incoming webhook that notification rules can send to.</p>

            <div class="mt-5 space-y-4">
                <div class="space-y-2">
                    <Label for="handle-name">Name</Label>
                    <Input
                        id="handle-name"
                        ref="nameInput"
                        v-model="name"
                        placeholder="#ci-alerts"
                        autocomplete="off"
                        :aria-invalid="nameError ? 'true' : undefined"
                        :aria-describedby="nameError ? 'handle-name-error' : undefined"
                    />
                    <p
                        v-if="nameError"
                        id="handle-name-error"
                        class="text-xs text-destructive"
                    >
                        {{ nameError }}
                    </p>
                </div>
                <div class="space-y-2">
                    <Label for="handle-url">Slack webhook URL</Label>
                    <Input
                        id="handle-url"
                        ref="urlInput"
                        v-model="url"
                        type="url"
                        placeholder="https://hooks.slack.com/services/…"
                        autocomplete="off"
                        class="font-mono text-xs"
                        :aria-invalid="urlError ? 'true' : undefined"
                        :aria-describedby="urlError ? 'handle-url-error' : undefined"
                    />
                    <p
                        v-if="urlError"
                        id="handle-url-error"
                        class="text-xs text-destructive"
                    >
                        {{ urlError }}
                    </p>
                </div>
                <p
                    v-if="error"
                    role="alert"
                    class="text-sm text-destructive"
                >
                    {{ error }}
                </p>
            </div>

            <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                    variant="outline"
                    @click="emit('update:open', false)"
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    :loading="saving"
                >
                    {{ isEditing ? 'Save' : 'Add handle' }}
                </Button>
            </div>
        </form>
    </Dialog>
</template>
