<script setup lang="ts">
    import Badge from '@/components/ui/Badge.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import CardDescription from '@/components/ui/CardDescription.vue';
    import CardHeader from '@/components/ui/CardHeader.vue';
    import CardTitle from '@/components/ui/CardTitle.vue';
    import type {Dashboard} from '@/types/analytics';
    import {ArrowRight, Grid3X3, LayoutDashboard, Lock} from 'lucide-vue-next';
    import {computed} from 'vue';

    const props = defineProps<{
        dashboards: Dashboard[];
    }>();

    const emit = defineEmits<{
        select: [id: string];
    }>();

    const builtInDashboards = computed(() => props.dashboards.filter((d) => d.isDefault));
</script>

<template>
    <div class="space-y-6">
        <!-- Built-in Dashboards -->
        <div class="space-y-3">
            <h3 class="text-lg font-semibold flex items-center gap-2">
                <Lock class="h-4 w-4" />
                Built-in Dashboards
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card
                    v-for="dashboard in builtInDashboards"
                    :key="dashboard.id"
                    class="cursor-pointer hover:border-primary transition-colors group"
                    @click="emit('select', dashboard.id)"
                >
                    <CardHeader>
                        <div class="flex items-start justify-between">
                            <div class="space-y-1 flex-1">
                                <CardTitle class="flex items-center gap-2">
                                    <LayoutDashboard class="h-5 w-5" />
                                    {{ dashboard.name }}
                                </CardTitle>
                                <CardDescription>{{ dashboard.description }}</CardDescription>
                            </div>
                            <ArrowRight class="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div class="flex items-center gap-4 text-sm text-muted-foreground">
                            <div class="flex items-center gap-1">
                                <Grid3X3 class="h-4 w-4" />
                                <span>{{ dashboard.widgets.length }} widgets</span>
                            </div>
                            <Badge variant="outline">
                                <Lock class="mr-1 h-3 w-3" />
                                Read-only
                            </Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    </div>
</template>
