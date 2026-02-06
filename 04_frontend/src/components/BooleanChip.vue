<script setup lang="ts">
    interface Props {
        value: boolean;
        trueColor?: string;
        falseColor?: string;
        trueLabel?: string;
        falseLabel?: string;
        size?: 'x-small' | 'small' | 'default' | 'large' | 'x-large';
        density?: 'default' | 'comfortable' | 'compact';
    }

    const props = withDefaults(defineProps<Props>(), {
        trueColor: 'green',
        falseColor: 'red',
        trueLabel: 'Yes',
        falseLabel: 'No',
        size: 'small',
        density: 'compact',
    });
</script>

<template>
    <v-chip
        :color="props.value ? props.trueColor : props.falseColor"
        :size="props.size"
        :density="props.density"
        variant="flat"
    >
        {{ props.value ? props.trueLabel : props.falseLabel }}
    </v-chip>
</template>

<style scoped></style>
