import {useIntegrationApps} from '@/composables/useIntegrationApps';
import type {SlackChannel} from '@common/types';
import {shallowRef, toValue, type MaybeRefOrGetter} from 'vue';

export const useSlackChannels = (integrationId: MaybeRefOrGetter<string>, appId: MaybeRefOrGetter<string>) => {
    const {listSlackChannels} = useIntegrationApps();

    const channels = shallowRef<SlackChannel[] | null>(null);
    const loading = shallowRef(false);
    const loadError = shallowRef<string | null>(null);

    async function load() {
        loading.value = true;
        loadError.value = null;
        try {
            channels.value = await listSlackChannels(toValue(integrationId), toValue(appId));
        } catch (e) {
            loadError.value = e instanceof Error ? e.message : 'Failed to load Slack channels';
        } finally {
            loading.value = false;
        }
    }

    return {channels, loading, loadError, load};
};
