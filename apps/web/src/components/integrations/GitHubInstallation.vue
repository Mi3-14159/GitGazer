<script setup lang="ts">
    import Badge from '@/components/ui/Badge.vue';
    import Button from '@/components/ui/Button.vue';
    import {Github, Unlink} from 'lucide-vue-next';

    defineProps<{
        installation: any;
        integrationId: string;
        canUnlink: boolean;
    }>();

    const emit = defineEmits<{
        unlink: [integrationId: string, installationId: number];
    }>();

    function getRepoNames(inst: any): string[] {
        const repos = new Set<string>();
        inst.webhooks?.forEach((w: any) => {
            if (w.targetName) repos.add(w.targetName);
        });
        return Array.from(repos);
    }

    function getPermissionCount(inst: any): number {
        const events = new Set<string>();
        inst.webhooks?.forEach((w: any) => {
            if (Array.isArray(w.events)) {
                w.events.forEach((e: string) => events.add(e));
            }
        });
        return events.size;
    }
</script>

<template>
    <div class="space-y-2">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Github class="h-3 w-3" />
                GitHub App: {{ installation.accountLogin }}
            </div>
            <Button
                v-if="canUnlink"
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-xs text-destructive hover:text-destructive"
                @click="emit('unlink', integrationId, installation.installationId)"
            >
                <Unlink class="h-3 w-3 mr-1" />
                Unlink
            </Button>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs mb-2">
            <div>
                <div class="text-muted-foreground">App ID</div>
                <div class="font-mono">{{ installation.accountId }}</div>
            </div>
            <div>
                <div class="text-muted-foreground">Installation</div>
                <div class="font-mono">inst-{{ installation.installationId }}</div>
            </div>
            <div>
                <div class="text-muted-foreground">Repositories</div>
                <div>{{ getRepoNames(installation).length }}</div>
            </div>
            <div>
                <div class="text-muted-foreground">Permissions</div>
                <div>{{ getPermissionCount(installation) }}</div>
            </div>
        </div>
        <div
            v-if="getRepoNames(installation).length > 0"
            class="flex flex-wrap gap-1"
        >
            <Badge
                v-for="repo in getRepoNames(installation).slice(0, 3)"
                :key="repo"
                variant="outline"
                class="font-mono text-xs h-5 px-1.5"
            >
                {{ repo }}
            </Badge>
            <Badge
                v-if="getRepoNames(installation).length > 3"
                variant="outline"
                class="text-xs h-5 px-1.5"
            >
                +{{ getRepoNames(installation).length - 3 }} more
            </Badge>
        </div>
    </div>
</template>
