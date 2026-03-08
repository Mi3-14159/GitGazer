import {useAuth} from '@/composables/useAuth';
import {NotificationRule, NotificationRuleUpdate} from '@common/types';
import {ref} from 'vue';

const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

export const useNotification = () => {
    const {fetchWithAuth} = useAuth();
    const isLoadingNotifications = ref(false);

    const getNotifications = async () => {
        isLoadingNotifications.value = true;
        try {
            const response = await fetchWithAuth(`${API_ENDPOINT}/notifications`);

            if (!response.ok) {
                throw new Error(`Failed to fetch notifications: ${response.status}`);
            }

            const notifications = (await response.json()) as NotificationRule[];
            return notifications;
        } finally {
            isLoadingNotifications.value = false;
        }
    };

    const upsertNotification = async (notificationRule: NotificationRuleUpdate, integrationId: string, notificationId?: string) => {
        const response = await fetchWithAuth(
            `${API_ENDPOINT}/integrations/${integrationId}/notifications${notificationId ? `/${notificationId}` : ''}`,
            {
                method: notificationId ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(notificationRule),
            },
        );

        if (!response.ok) {
            throw new Error(`Failed to create notification: ${response.status}`);
        }

        return (await response.json()) as NotificationRule;
    };

    const deleteNotification = async (id: string, integrationId: string) => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/notifications/${id}`, {
            method: 'DELETE',
        });

        return response.status === 204;
    };

    return {
        getNotifications,
        isLoadingNotifications,
        upsertNotification,
        deleteNotification,
    };
};
