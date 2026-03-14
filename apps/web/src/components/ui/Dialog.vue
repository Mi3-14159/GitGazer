<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {type HTMLAttributes, ref, watch} from 'vue';

    const props = defineProps<{
        class?: HTMLAttributes['class'];
        open?: boolean;
    }>();

    const emit = defineEmits<{
        'update:open': [value: boolean];
    }>();

    const isOpen = ref(props.open ?? false);

    watch(
        () => props.open,
        (val) => {
            isOpen.value = val ?? false;
        },
    );

    function close() {
        isOpen.value = false;
        emit('update:open', false);
    }

    function onOverlayClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            close();
        }
    }

    function onKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            close();
        }
    }
</script>

<template>
    <Teleport to="body">
        <div
            v-if="isOpen"
            class="fixed inset-0 z-50 flex items-center justify-center"
            @keydown="onKeydown"
        >
            <!-- Overlay -->
            <div
                class="fixed inset-0 bg-black/50 backdrop-blur-sm"
                @click="onOverlayClick"
            />
            <!-- Content -->
            <div
                :class="cn('relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border bg-card p-6 shadow-lg', props.class)"
                role="dialog"
                aria-modal="true"
            >
                <slot :close="close" />
            </div>
        </div>
    </Teleport>
</template>
