<script setup lang="ts">
    import Badge from '@/components/ui/Badge.vue';
    import type {NotificationRule} from '@common/types';

    defineProps<{
        rule: NotificationRule;
    }>();
</script>

<template>
    <div class="space-y-1">
        <div class="text-xs font-medium text-muted-foreground">Active Filters</div>
        <div class="flex flex-wrap gap-1">
            <Badge
                v-if="rule.rule.owner"
                variant="outline"
                class="text-xs h-5 px-1.5 font-mono"
            >
                {{ rule.rule.owner }}
            </Badge>
            <Badge
                v-if="rule.rule.repository_name"
                variant="outline"
                class="text-xs h-5 px-1.5 font-mono"
            >
                {{ rule.rule.repository_name }}
            </Badge>
            <Badge
                v-if="rule.rule.workflow_name"
                variant="secondary"
                class="text-xs h-5 px-1.5"
            >
                {{ rule.rule.workflow_name }}
            </Badge>
            <Badge
                v-if="rule.rule.head_branch"
                variant="secondary"
                class="text-xs h-5 px-1.5"
            >
                {{ rule.rule.head_branch }}
            </Badge>
            <Badge
                v-if="rule.ignore_dependabot"
                variant="warning"
                class="text-xs h-5 px-1.5"
            >
                No Dependabot
            </Badge>
            <Badge
                v-for="topic in rule.rule.topics"
                :key="topic"
                variant="outline"
                class="text-xs h-5 px-1.5"
            >
                #{{ topic }}
            </Badge>
        </div>
    </div>
</template>
