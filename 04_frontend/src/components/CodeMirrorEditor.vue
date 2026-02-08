<script setup lang="ts">
    import {sql} from '@codemirror/lang-sql';
    import {Compartment, EditorState} from '@codemirror/state';
    import {EditorView, basicSetup} from 'codemirror';
    import {onMounted, onUnmounted, ref, watch} from 'vue';

    interface Props {
        modelValue: string;
        disabled?: boolean;
        minHeight?: string;
        maxHeight?: string;
    }

    const props = withDefaults(defineProps<Props>(), {
        disabled: false,
        maxHeight: '400px',
    });

    const emit = defineEmits<{
        'update:modelValue': [value: string];
    }>();

    const editorContainer = ref<HTMLElement | null>(null);
    let editorView: EditorView | null = null;
    const editableCompartment = new Compartment();

    const initializeEditor = () => {
        if (!editorContainer.value || editorView) return;

        const startState = EditorState.create({
            doc: props.modelValue,
            extensions: [
                basicSetup,
                sql(),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        emit('update:modelValue', update.state.doc.toString());
                    }
                }),
                EditorView.theme({
                    '&': {
                        fontSize: '14px',
                        border: '1px solid rgba(var(--v-border-color), var(--v-border-opacity))',
                        borderRadius: '4px',
                        backgroundColor: 'transparent',
                    },
                    '.cm-scroller': {
                        fontFamily: '"Roboto Mono", monospace',
                    },
                    '.cm-gutters': {
                        backgroundColor: 'transparent',
                        borderRight: '1px solid rgba(var(--v-border-color), var(--v-border-opacity))',
                    },
                }),
                editableCompartment.of(EditorView.editable.of(!props.disabled)),
            ],
        });

        editorView = new EditorView({
            state: startState,
            parent: editorContainer.value,
        });
    };

    // Watch for external changes to modelValue (e.g., from generate query)
    watch(
        () => props.modelValue,
        (newValue) => {
            if (editorView && newValue !== editorView.state.doc.toString()) {
                editorView.dispatch({
                    changes: {
                        from: 0,
                        to: editorView.state.doc.length,
                        insert: newValue,
                    },
                });
            }
        },
    );

    // Watch for disabled state changes
    watch(
        () => props.disabled,
        (newDisabled) => {
            if (editorView) {
                editorView.dispatch({
                    effects: editableCompartment.reconfigure(EditorView.editable.of(!newDisabled)),
                });
            }
        },
    );

    onMounted(() => {
        // Initialize CodeMirror after DOM is ready
        setTimeout(() => initializeEditor(), 0);
    });

    onUnmounted(() => {
        if (editorView) {
            editorView.destroy();
            editorView = null;
        }
    });
</script>

<template>
    <div
        ref="editorContainer"
        class="codemirror-wrapper"
        :style="{
            maxHeight: maxHeight,
        }"
    ></div>
</template>

<style scoped>
    .codemirror-wrapper {
        background-color: rgb(var(--v-theme-surface));
    }

    .codemirror-wrapper :deep(.cm-editor) {
        height: 100%;
        background-color: transparent;
    }

    .codemirror-wrapper :deep(.cm-scroller) {
        overflow: auto;
    }

    .codemirror-wrapper :deep(.cm-editor.cm-focused) {
        outline: none;
    }

    .codemirror-wrapper :deep(.cm-content) {
        caret-color: rgb(var(--v-theme-on-surface));
    }
</style>
