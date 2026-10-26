import {useIntegrationApps} from '@/composables/useIntegrationApps';
import {shallowRef, toValue, type MaybeRefOrGetter} from 'vue';

export const useConnectSlack = (integrationId: MaybeRefOrGetter<string>) => {
    const {connectSlack} = useIntegrationApps();

    const connecting = shallowRef(false);
    const connectError = shallowRef<string | null>(null);

    async function connect() {
        connecting.value = true;
        connectError.value = null;
        try {
            await connectSlack(toValue(integrationId));
        } catch (e) {
            connectError.value = e instanceof Error ? e.message : 'Failed to connect Slack';
        } finally {
            connecting.value = false;
        }
    }

    return {connecting, connectError, connect};
};
