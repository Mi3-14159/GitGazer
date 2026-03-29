<script setup lang="ts">
    import {computed} from 'vue';

    const props = defineProps<{
        targetRect: DOMRect | null;
    }>();

    const padding = 4;
    const borderRadius = 8;

    const cutout = computed(() => {
        if (!props.targetRect) return null;
        return {
            x: props.targetRect.x - padding,
            y: props.targetRect.y - padding,
            width: props.targetRect.width + padding * 2,
            height: props.targetRect.height + padding * 2,
            rx: borderRadius,
            ry: borderRadius,
        };
    });
</script>

<template>
    <Teleport to="body">
        <div class="fixed inset-0 z-[60] pointer-events-none">
            <svg
                class="absolute inset-0 h-full w-full"
                aria-hidden="true"
            >
                <defs>
                    <mask id="tour-spotlight-mask">
                        <rect
                            x="0"
                            y="0"
                            width="100%"
                            height="100%"
                            fill="white"
                        />
                        <rect
                            v-if="cutout"
                            :x="cutout.x"
                            :y="cutout.y"
                            :width="cutout.width"
                            :height="cutout.height"
                            :rx="cutout.rx"
                            :ry="cutout.ry"
                            fill="black"
                            class="tour-cutout"
                        />
                    </mask>
                </defs>
                <rect
                    x="0"
                    y="0"
                    width="100%"
                    height="100%"
                    fill="rgba(0, 0, 0, 0.6)"
                    mask="url(#tour-spotlight-mask)"
                    class="pointer-events-auto"
                />
            </svg>
            <!-- Spotlight ring around target -->
            <div
                v-if="cutout"
                class="absolute rounded-lg ring-2 ring-primary pointer-events-none tour-cutout-ring"
                :style="{
                    left: `${cutout.x}px`,
                    top: `${cutout.y}px`,
                    width: `${cutout.width}px`,
                    height: `${cutout.height}px`,
                }"
            />
        </div>
    </Teleport>
</template>

<style scoped>
    .tour-cutout {
        transition:
            x 400ms cubic-bezier(0.4, 0, 0.2, 1),
            y 400ms cubic-bezier(0.4, 0, 0.2, 1),
            width 400ms cubic-bezier(0.4, 0, 0.2, 1),
            height 400ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .tour-cutout-ring {
        transition:
            left 400ms cubic-bezier(0.4, 0, 0.2, 1),
            top 400ms cubic-bezier(0.4, 0, 0.2, 1),
            width 400ms cubic-bezier(0.4, 0, 0.2, 1),
            height 400ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    @media (prefers-reduced-motion: reduce) {
        .tour-cutout,
        .tour-cutout-ring {
            transition: none;
        }
    }
</style>
