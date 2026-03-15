<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import CardHeader from '@/components/ui/CardHeader.vue';
    import CardTitle from '@/components/ui/CardTitle.vue';
    import type {WidgetSize} from '@/types/analytics';
    import {X} from 'lucide-vue-next';
    import {computed} from 'vue';

    const props = withDefaults(
        defineProps<{
            title: string;
            size: WidgetSize;
            removable?: boolean;
        }>(),
        {removable: false},
    );

    const emit = defineEmits<{
        remove: [];
    }>();

    const sizeClass = computed(() => {
        const map: Record<WidgetSize, string> = {
            small: 'col-span-1',
            medium: 'col-span-1 md:col-span-2',
            large: 'col-span-1 md:col-span-3',
            full: 'col-span-1 md:col-span-4',
        };
        return map[props.size];
    });
</script>

<template>
    <Card :class="[sizeClass, removable ? 'group relative' : '']">
        <CardHeader class="pb-3">
            <div class="flex items-center justify-between">
                <CardTitle class="text-base">{{ title }}</CardTitle>
                <Button
                    v-if="removable"
                    variant="ghost"
                    size="sm"
                    class="h-6 w-6 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    @click="emit('remove')"
                >
                    <X class="h-3 w-3" />
                </Button>
            </div>
        </CardHeader>
        <CardContent>
            <slot />
        </CardContent>
    </Card>
</template>
