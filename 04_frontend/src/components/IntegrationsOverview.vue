<script setup lang="ts">
    import IntegrationDetailsCard from '@/components/IntegrationDetailsCard.vue';
    import {useAuth} from '@/composables/useAuth';
    import {useIntegration} from '@/composables/useIntegration';
    import {Integration} from '@common/types';
    import {computed, onMounted, reactive, ref} from 'vue';

    const {getUserAttributes} = useAuth();
    const {getIntegrations, isLoadingIntegrations, createIntegration, deleteIntegration} = useIntegration();

    const integrations = reactive(new Map());
    const userId = ref<string>();
    const dialog = ref(false);
    const showSecret = reactive(new Map<string, boolean>());

    const handleListIntegrations = async () => {
        const response = await getIntegrations();
        response.forEach((integration: Integration) => {
            integrations.set(integration.id, integration);
        });
    };

    const handlePutIntegration = async (label: string) => {
        const integration = await createIntegration(label);
        integrations.set(integration.id, integration);
    };

    const handleDeleteIntegration = async (id: string) => {
        await deleteIntegration(id);
        integrations.delete(id);
    };

    const onSave = async (label: string) => {
        await handlePutIntegration(label);
        dialog.value = false;
    };

    const toggleSecret = (id: string) => {
        showSecret.set(id, !showSecret.get(id));
    };

    const getIntegrationUrl = (id: string) => {
        return `${import.meta.env.VITE_IMPORT_URL_BASE}/${id}`;
    };

    const getOwnerAnnotation = (owner: string) => {
        return owner === userId.value ? 'you' : 'not you';
    };

    const headers = [
        {title: 'Label', key: 'label', sortable: true},
        {title: 'Webhook URL', key: 'webhookUrl', sortable: false},
        {title: 'Secret', key: 'secret', sortable: false},
        {title: 'Owner', key: 'owner', sortable: true},
        {title: 'Actions', key: 'actions', sortable: false, align: 'end' as const},
    ];

    const integrationsArray = computed(() => {
        return Array.from(integrations.values());
    });

    onMounted(async () => {
        const userAttrs = await getUserAttributes();
        userId.value = userAttrs.sub;
        handleListIntegrations();
    });
</script>

<template>
    <v-main>
        <v-dialog
            v-model="dialog"
            max-width="600"
        >
            <IntegrationDetailsCard
                v-if="dialog"
                :onClose="() => (dialog = false)"
                :onSave="onSave"
            />
        </v-dialog>

        <v-data-table-virtual
            :headers="headers"
            :items="integrationsArray"
            item-value="id"
            class="elevation-1"
            hide-default-footer
            fixed-header
            :loading="isLoadingIntegrations"
            height="calc(100vh - 64px)"
            :items-per-page="-1"
        >
            <template v-slot:top>
                <v-toolbar flat>
                    <v-toolbar-title>Integrations</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-btn
                        class="me-2"
                        prepend-icon="mdi-plus"
                        rounded="lg"
                        text="Add a integration"
                        @click="dialog = true"
                    ></v-btn>
                </v-toolbar>
            </template>

            <template v-slot:loading>
                <v-skeleton-loader type="table-row@5"></v-skeleton-loader>
            </template>

            <template v-slot:item.label="{item}">
                <span class="font-weight-medium">{{ item.label }}</span>
            </template>

            <template v-slot:item.webhookUrl="{item}">
                <a
                    :href="getIntegrationUrl(item.id)"
                    target="_blank"
                    class="text-decoration-none"
                >
                    {{ getIntegrationUrl(item.id) }}
                </a>
            </template>

            <template v-slot:item.secret="{item}">
                <div class="d-flex align-center">
                    <span class="secret-container">
                        <Transition
                            name="fade"
                            mode="out-in"
                        >
                            <span
                                v-if="showSecret.get(item.id)"
                                key="visible"
                            >
                                {{ item.secret }}
                            </span>
                            <span
                                v-else
                                key="hidden"
                            >
                                ••••••••••••••••
                            </span>
                        </Transition>
                    </span>
                    <v-btn
                        variant="text"
                        density="compact"
                        @click="toggleSecret(item.id)"
                        class="ml-2"
                        :color="showSecret.get(item.id) ? 'warning' : undefined"
                        :icon="showSecret.get(item.id) ? 'mdi-eye-off' : 'mdi-eye'"
                    ></v-btn>
                </div>
            </template>

            <template v-slot:item.owner="{item}">{{ getOwnerAnnotation(item.owner) }}</template>

            <template v-slot:item.actions="{item}">
                <v-dialog max-width="500">
                    <template v-slot:activator="{props: activatorProps}">
                        <v-btn
                            v-bind="activatorProps"
                            color="error"
                            variant="text"
                            icon="mdi-delete"
                            density="compact"
                        ></v-btn>
                    </template>

                    <template v-slot:default="{isActive}">
                        <v-card>
                            <v-card-title>Delete Integration</v-card-title>
                            <v-card-text>
                                Do you really want to delete this integration? This is irreversible and will break your current import workflows!
                            </v-card-text>
                            <v-card-actions>
                                <v-spacer></v-spacer>
                                <v-btn
                                    text="Cancel"
                                    @click="isActive.value = false"
                                ></v-btn>
                                <v-btn
                                    text="Yes, delete"
                                    color="error"
                                    @click="
                                        handleDeleteIntegration(item.id);
                                        isActive.value = false;
                                    "
                                ></v-btn>
                            </v-card-actions>
                        </v-card>
                    </template>
                </v-dialog>
            </template>
        </v-data-table-virtual>
    </v-main>
</template>

<style scoped>
    .secret-container {
        min-width: 265px;
        display: inline-block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .fade-enter-active,
    .fade-leave-active {
        transition: opacity 0.3s ease;
    }

    .fade-enter-from,
    .fade-leave-to {
        opacity: 0;
    }
</style>
