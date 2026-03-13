import Default from '@/views/Default.vue';
import Login from '@/views/Login.vue';
import {createRouter, createWebHistory} from 'vue-router';

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            component: Default,
            children: [
                {
                    path: 'dashboard',
                    name: 'dashboard',
                    component: () => import('@/components/WorkflowOverview.vue'),
                    meta: {title: 'Dashboard'},
                },
                {
                    path: 'notifications',
                    name: 'notifications',
                    component: () => import('@/components/NotificationsOverview.vue'),
                    meta: {title: 'Notifications'},
                },
                {
                    path: 'integrations',
                    name: 'integrations',
                    component: () => import('@/components/IntegrationsOverview.vue'),
                    meta: {title: 'Integrations'},
                },
                {
                    path: 'analytics',
                    redirect: '/analytics/system-dora',
                },
                {
                    path: 'analytics/:id',
                    name: 'analytics-dashboard',
                    component: () => import('@/components/AnalyticsShell.vue'),
                    meta: {title: 'Analytics'},
                },
                {
                    path: 'metrics',
                    redirect: '/analytics/system-dora',
                },
                {
                    path: '',
                    redirect: '/dashboard',
                },
            ],
        },
        {
            path: '/login',
            name: 'login',
            component: Login,
        },
        {
            path: '/:pathMatch(.*)*',
            name: 'not-found',
            redirect: '/dashboard',
        },
    ],
});

router.afterEach((to) => {
    const title = to.meta?.title as string | undefined;
    document.title = title ? `${title} | GitGazer` : 'GitGazer';
});

export default router;
