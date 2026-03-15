<script setup lang="ts">
    import Badge from '@/components/ui/Badge.vue';
    import Button from '@/components/ui/Button.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import CardDescription from '@/components/ui/CardDescription.vue';
    import CardHeader from '@/components/ui/CardHeader.vue';
    import CardTitle from '@/components/ui/CardTitle.vue';
    import type {Dashboard} from '@/types/analytics';
    import {LayoutDashboard, Lock} from 'lucide-vue-next';

    defineProps<{
        dashboards: Dashboard[];
        selectedId: string | null;
    }>();

    const emit = defineEmits<{
        select: [id: string];
    }>();
</script>

<template>
    <Card>
        <CardHeader>
            <CardTitle>Analytics Dashboards</CardTitle>
            <CardDescription>View built-in DORA &amp; SPACE dashboards for engineering metrics</CardDescription>
        </CardHeader>
        <CardContent>
            <div class="flex flex-wrap gap-2">
                <Button
                    v-for="dashboard in dashboards"
                    :key="dashboard.id"
                    :variant="selectedId === dashboard.id ? 'default' : 'outline'"
                    class="gap-2"
                    @click="emit('select', dashboard.id)"
                >
                    <Lock
                        v-if="dashboard.isDefault"
                        class="h-3 w-3"
                    />
                    <LayoutDashboard class="h-4 w-4" />
                    {{ dashboard.name }}
                    <Badge
                        variant="secondary"
                        class="ml-1"
                    >
                        {{ dashboard.widgets.length }}
                    </Badge>
                </Button>
            </div>
        </CardContent>
    </Card>
</template>
