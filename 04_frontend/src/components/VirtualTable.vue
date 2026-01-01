<script setup lang="ts" generic="T">
    const props = withDefaults(
        defineProps<{
            items: T[];
            height?: string | number;
            threshold?: number;
            loading?: boolean;
        }>(),
        {
            height: '100%',
            threshold: 200,
            loading: false,
        },
    );

    const emit = defineEmits<{
        (e: 'load-more'): void;
    }>();

    const onScroll = (e: Event) => {
        const target = e.target as HTMLElement;
        if (!target) return;

        // Check if we are near the bottom
        if (target.scrollTop + target.clientHeight >= target.scrollHeight - props.threshold && !props.loading) {
            emit('load-more');
        }
    };
</script>

<template>
    <div class="virtual-table">
        <!-- Fixed Header Area -->
        <div class="virtual-table__header">
            <slot name="header"></slot>
            <v-progress-linear
                :active="loading"
                indeterminate
                color="primary"
                height="2"
                absolute
                location="bottom"
            />
        </div>

        <!-- Virtual Scroller -->
        <v-virtual-scroll
            :items="items"
            :height="height"
            class="virtual-table__scroller"
            @scroll="onScroll"
        >
            <template v-slot:default="{item, index}">
                <slot
                    name="row"
                    :item="item"
                    :index="index"
                ></slot>
            </template>
        </v-virtual-scroll>
    </div>
</template>

<style scoped>
    .virtual-table {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        overflow: hidden;
    }

    .virtual-table__header {
        flex-shrink: 0;
        background: rgb(var(--v-theme-surface));
        z-index: 1;
        border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
        position: relative;
    }

    .virtual-table__scroller {
        flex-grow: 1;
    }
</style>
