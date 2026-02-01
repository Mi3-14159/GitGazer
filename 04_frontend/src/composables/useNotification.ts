import {NotificationRule} from '@common/types';
import {ref} from 'vue';

const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

export const useNotification = () => {
    const isLoadingNotifications = ref(false);

    const getNotifications = async () => {
        isLoadingNotifications.value = true;
        try {
            const response = await fetch(`${API_ENDPOINT}/notifications`, {
                credentials: 'include',
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch notifications: ${response.status}`);
            }

            const notifications = (await response.json()) as NotificationRule[];
            return notifications;
        } finally {
            isLoadingNotifications.value = false;
        }
    };

    const postNotification = async (notificationRule: NotificationRule) => {
        const response = await fetch(`${API_ENDPOINT}/notifications`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(notificationRule),
        });

        if (!response.ok) {
            throw new Error(`Failed to create notification: ${response.status}`);
        }

        return (await response.json()) as NotificationRule;
    };

    const deleteNotification = async (id: string) => {
        const response = await fetch(`${API_ENDPOINT}/notifications/${id}`, {
            method: 'DELETE',
            credentials: 'include',
        });

        return response.status === 204;
    };

    return {
        getNotifications,
        isLoadingNotifications,
        postNotification,
        deleteNotification,
    };
};
