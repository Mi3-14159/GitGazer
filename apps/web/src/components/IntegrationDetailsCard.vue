<script setup lang="ts">
    import {Integration} from '@common/types';
    import {ref} from 'vue';

    const props = defineProps<{
        integration?: Integration;
        onClose: () => void;
        onSave: (label: string, id?: string) => void;
    }>();

    const form = ref<any>(null);
    const label = ref(props.integration?.label ?? '');

    const handleSave = async () => {
        const {valid} = await form.value.validate();
        if (valid) {
            props.onSave(label.value, props.integration?.id);
        }
    };
</script>
<template>
    <v-card
        prepend-icon="mdi-account-cog"
        :title="integration ? 'Edit Integration' : 'Create Integration'"
    >
        <v-form ref="form">
            <v-card-text>
                <v-row dense>
                    <v-col
                        cols="12"
                        md="12"
                        sm="6"
                    >
                        <v-text-field
                            label="Label *"
                            v-model="label"
                            :rules="[(v) => !!v || 'Label is required']"
                            required
                        ></v-text-field>
                    </v-col>
                </v-row>
                <small class="text-caption text-medium-emphasis">*indicates required field</small>
            </v-card-text>
        </v-form>
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
                @click="handleSave"
            ></v-btn>
        </v-card-actions>
    </v-card>
</template>
