import {NotificationRule} from '@common/types';
import * as api from '@/api/client';
import {ref} from 'vue';

export const useNotification = () => {
    const isLoadingNotifications = ref(false);

    const getNotifications = async () => {
        isLoadingNotifications.value = true;
        const response = await api.get<NotificationRule[]>('/notifications');
        isLoadingNotifications.value = false;
        return response.data;
    };

    const postNotification = async (notificationRule: NotificationRule) => {
        const response = await api.post<NotificationRule>('/notifications', notificationRule);
        return response.data;
    };

    const deleteNotification = async (id: string) => {
        const response = await api.del(`/notifications/${id}`);
        return response.status === 204;
    };

    return {
        getNotifications,
        isLoadingNotifications,
        postNotification,
        deleteNotification,
    };
};
