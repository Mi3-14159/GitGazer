<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import Checkbox from '@/components/ui/Checkbox.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import Input from '@/components/ui/Input.vue';
    import Label from '@/components/ui/Label.vue';
    import type {UserInviteFormData, UserRole} from '@/types/user';
    import {ROLE_DESCRIPTIONS} from '@/types/user';
    import {Link as LinkIcon, Mail} from 'lucide-vue-next';
    import {computed, ref, watch} from 'vue';

    const props = defineProps<{
        open: boolean;
    }>();

    const emit = defineEmits<{
        'update:open': [value: boolean];
        invite: [data: UserInviteFormData];
    }>();

    const email = ref('');
    const role = ref<UserRole>('member');
    const emailEnabled = import.meta.env.VITE_ENABLE_INVITATION_EMAIL === 'true';
    const sendEmail = ref(emailEnabled);

    const roleOptions = [
        {value: 'admin', label: 'Admin'},
        {value: 'member', label: 'Member'},
        {value: 'viewer', label: 'Viewer'},
    ];

    const roleDescription = computed(() => ROLE_DESCRIPTIONS[role.value]);
    const hasValidEmail = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value));
    const canSubmit = computed(() => !sendEmail.value || hasValidEmail.value);

    watch(
        () => props.open,
        (v) => {
            if (!v) {
                email.value = '';
                role.value = 'member';
                sendEmail.value = emailEnabled;
            }
        },
    );

    watch(hasValidEmail, (v) => {
        if (!v) sendEmail.value = false;
    });

    function handleSubmit() {
        if (!canSubmit.value) return;
        emit('invite', {
            email: email.value || undefined,
            role: role.value,
            integrationIds: [],
            sendEmail: sendEmail.value,
        });
    }
</script>

<template>
    <Dialog
        :open="open"
        class="max-w-2xl"
        @update:open="emit('update:open', $event)"
    >
        <template #default="{close}">
            <div class="space-y-1">
                <h2 class="text-lg font-semibold">Invite Team Member</h2>
                <p class="text-sm text-muted-foreground">Create an invitation link. Optionally send it via email.</p>
            </div>

            <div class="space-y-6 py-4">
                <!-- Email (optional) -->
                <div
                    v-if="emailEnabled"
                    class="space-y-2"
                >
                    <Label for="invite-email">Email Address</Label>
                    <Input
                        id="invite-email"
                        v-model="email"
                        type="email"
                        placeholder="colleague@company.com"
                    />
                    <p class="text-xs text-muted-foreground">Anyone with the invite link can join, regardless of email.</p>
                </div>

                <!-- Role -->
                <div class="space-y-2">
                    <Label>Role</Label>
                    <FilterDropdown
                        v-model="role"
                        :options="roleOptions"
                        label="Role"
                        width-class="w-full"
                    />
                    <p class="text-sm text-muted-foreground">{{ roleDescription }}</p>
                </div>

                <!-- Delivery Method -->
                <div
                    v-if="emailEnabled"
                    class="space-y-3"
                >
                    <Label>Delivery Method</Label>
                    <div class="space-y-2">
                        <Card
                            :class="['cursor-pointer transition-colors', sendEmail ? 'border-primary' : '']"
                            @click="sendEmail = true"
                        >
                            <CardContent class="p-4 pt-4">
                                <div class="flex items-start gap-3">
                                    <Checkbox
                                        :model-value="sendEmail"
                                        class="mt-0.5"
                                    />
                                    <div class="flex-1 space-y-1">
                                        <div class="flex items-center gap-2">
                                            <Mail class="h-4 w-4" />
                                            <p class="font-medium">Send Email Invitation</p>
                                        </div>
                                        <p class="text-sm text-muted-foreground">
                                            An email with an invite link will be sent to {{ email || 'the user' }}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card
                            :class="['cursor-pointer transition-colors', !sendEmail ? 'border-primary' : '']"
                            @click="sendEmail = false"
                        >
                            <CardContent class="p-4 pt-4">
                                <div class="flex items-start gap-3">
                                    <Checkbox
                                        :model-value="!sendEmail"
                                        class="mt-0.5"
                                    />
                                    <div class="flex-1 space-y-1">
                                        <div class="flex items-center gap-2">
                                            <LinkIcon class="h-4 w-4" />
                                            <p class="font-medium">Generate Invite Link</p>
                                        </div>
                                        <p class="text-sm text-muted-foreground">Get a shareable link to send manually</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>

            <div class="flex justify-end gap-2 pt-4">
                <Button
                    variant="outline"
                    @click="close()"
                >
                    Cancel
                </Button>
                <Button
                    :disabled="!canSubmit"
                    @click="handleSubmit"
                >
                    {{ hasValidEmail && sendEmail ? 'Send Invitation' : 'Generate Link' }}
                </Button>
            </div>
        </template>
    </Dialog>
</template>
