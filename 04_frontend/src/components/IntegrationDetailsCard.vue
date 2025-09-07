<script setup lang="ts">
    import {ref} from 'vue';

    const props = defineProps<{
        onClose: () => void;
        onSave: (label: string) => void;
    }>();

    const form = ref<any>(null);
    const label = ref('');

    const handleSave = async () => {
        const {valid} = await form.value.validate();
        if (valid) {
            props.onSave(label.value);
        }
    };
</script>
<template>
    <v-card
        prepend-icon="mdi-account-cog"
        title="Integration"
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
