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
                    path: 'overview',
                    name: 'overview',
                    component: () => import('@/views/OverviewPage.vue'),
                    meta: {title: 'Overview'},
                },
                {
                    path: 'dashboards/:dashboardId?',
                    name: 'dashboards',
                    component: () => import('@/views/DashboardsPage.vue'),
                    meta: {title: 'Dashboards'},
                },
                {
                    path: 'workflows',
                    name: 'workflows',
                    component: () => import('@/views/WorkflowsPage.vue'),
                    meta: {title: 'Workflows'},
                },
                {
                    path: 'notifications',
                    name: 'notifications',
                    component: () => import('@/views/NotificationsPage.vue'),
                    meta: {title: 'Notifications'},
                },
                {
                    path: 'integrations',
                    name: 'integrations',
                    component: () => import('@/views/IntegrationsPage.vue'),
                    meta: {title: 'Integrations'},
                },

                {
                    path: '',
                    redirect: '/overview',
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
            redirect: '/overview',
        },
    ],
});

router.afterEach((to) => {
    const title = to.meta?.title as string | undefined;
    document.title = title ? `${title} | GitGazer` : 'GitGazer';
});

export default router;
