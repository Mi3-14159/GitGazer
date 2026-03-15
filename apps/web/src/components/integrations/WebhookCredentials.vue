<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Input from '@/components/ui/Input.vue';
    import {copyToClipboard} from '@/utils/clipboard';
    import {Copy, Eye, EyeOff, Key, RefreshCw, Webhook} from 'lucide-vue-next';
    import {ref} from 'vue';

    defineProps<{
        integrationId: string;
        webhookUrl: string;
        secret: string;
    }>();

    const emit = defineEmits<{
        rotate: [integrationId: string];
    }>();

    const visibleSecret = ref(false);
</script>

<template>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <!-- Webhook URL -->
        <div class="space-y-1">
            <div class="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Webhook class="h-3 w-3" />
                Webhook URL
            </div>
            <div class="flex items-center gap-1">
                <Input
                    :model-value="webhookUrl"
                    type="text"
                    readonly
                    class="font-mono text-xs !h-8 !px-2"
                />
                <Button
                    variant="ghost"
                    size="sm"
                    class="h-8 w-8 p-0 shrink-0"
                    @click="copyToClipboard(webhookUrl)"
                >
                    <Copy class="h-3 w-3" />
                </Button>
            </div>
        </div>

        <!-- Secret -->
        <div class="space-y-1">
            <div class="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Key class="h-3 w-3" />
                Webhook Secret
            </div>
            <div class="flex items-center gap-1">
                <Input
                    :model-value="secret"
                    :type="visibleSecret ? 'text' : 'password'"
                    readonly
                    class="font-mono text-xs !h-8 !px-2"
                />
                <Button
                    variant="ghost"
                    size="sm"
                    class="h-8 w-8 p-0 shrink-0"
                    @click="visibleSecret = !visibleSecret"
                >
                    <EyeOff
                        v-if="visibleSecret"
                        class="h-3 w-3"
                    />
                    <Eye
                        v-else
                        class="h-3 w-3"
                    />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    class="h-8 w-8 p-0 shrink-0"
                    @click="copyToClipboard(secret)"
                >
                    <Copy class="h-3 w-3" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    class="h-8 px-2 shrink-0"
                    title="Rotate Secret"
                    @click="emit('rotate', integrationId)"
                >
                    <RefreshCw class="h-3 w-3 mr-1" />
                    <span class="text-xs">Rotate</span>
                </Button>
            </div>
        </div>
    </div>
</template>
