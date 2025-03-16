<script setup lang="ts">
    import {Integration} from '@graphql/api';
    import {ref} from 'vue';

    const props = defineProps<{
        integration?: Integration;
        onClose: () => void;
        onSave: (integration: Integration) => void;
    }>();

    const integration = ref<Integration>(
        props.integration ?? {
            __typename: 'Integration',
            owner: '',
            id: '',
            label: '',
            secret: '',
            users: [],
        },
    );
</script>
<template>
    <v-card
        prepend-icon="mdi-bell"
        title="Notification rule"
    >
        <v-card-text>
            <v-row dense>
                <v-col
                    cols="12"
                    md="12"
                    sm="6"
                >
                    <v-text-field
                        label="Label*"
                        v-model="integration.label"
                        required
                    ></v-text-field>
                </v-col>
            </v-row>
            <small class="text-caption text-medium-emphasis">*indicates required field</small>
        </v-card-text>
        <v-divider></v-divider>
        <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn
                text="Close"
                variant="plain"
                @click="props.onClose"
            ></v-btn>
            <v-btn
                color="primary"
                text="Save"
                variant="tonal"
                @click="props.onSave(integration)"
            ></v-btn>
        </v-card-actions>
    </v-card>
</template>
