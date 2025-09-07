import {NotificationRule} from '@common/types';
import {del, get, post} from 'aws-amplify/api';
import {ref} from 'vue';

export const useNotification = () => {
    const isLoadingNotifications = ref(false);

    const getNotifications = async () => {
        isLoadingNotifications.value = true;
        const restOperation = get({
            apiName: 'api',
            path: '/notifications',
        });

        const {body} = await restOperation.response;
        const notifications = (await body.json()) as NotificationRule[];
        isLoadingNotifications.value = false;

        return notifications;
    };

    const postNotification = async (notificationRule: NotificationRule) => {
        const restOperation = post({
            apiName: 'api',
            path: '/notifications',
            options: {
                body: notificationRule,
            },
        });

        const {body} = await restOperation.response;
        return (await body.json()) as NotificationRule;
    };

    const deleteNotification = async (id: string) => {
        const restOperation = del({
            apiName: 'api',
            path: `/notifications/${id}`,
        });

        return (await restOperation.response).statusCode === 204;
    };

    return {
        getNotifications,
        isLoadingNotifications,
        postNotification,
        deleteNotification,
    };
};
