import {del, get, post} from 'aws-amplify/api';
import {fetchAuthSession} from 'aws-amplify/auth';
import {NotificationRule} from '../../../02_central/src/types';

export const useNotification = () => {
    const getNotifications = async () => {
        const session = await fetchAuthSession();
        const authToken = session.tokens?.idToken;

        const restOperation = get({
            apiName: 'api',
            path: '/api/notifications',
            options: {
                withCredentials: true,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            },
        });

        const {body} = await restOperation.response;
        return (await body.json()) as NotificationRule[];
    };

    const postNotification = async (notificationRule: NotificationRule) => {
        const session = await fetchAuthSession();
        const authToken = session.tokens?.idToken;

        const restOperation = post({
            apiName: 'api',
            path: '/api/notifications',
            options: {
                withCredentials: true,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                body: notificationRule,
            },
        });

        const {body} = await restOperation.response;
        return (await body.json()) as NotificationRule;
    };

    const deleteNotification = async (id: string) => {
        const session = await fetchAuthSession();
        const authToken = session.tokens?.idToken;

        const restOperation = del({
            apiName: 'api',
            path: `/api/notifications/${id}`,
            options: {
                withCredentials: true,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            },
        });

        return (await restOperation.response).statusCode === 204;
    };

    return {
        getNotifications,
        postNotification,
        deleteNotification,
    };
};
