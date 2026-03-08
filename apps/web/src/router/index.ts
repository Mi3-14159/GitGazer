import Default from '@/views/Default.vue';
import Login from '@/views/Login.vue';
import {createRouter, createWebHistory} from 'vue-router';

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/dashboard',
            name: 'dashboard',
            component: Default,
        },
        {
            path: '/notifications',
            name: 'notifications',
            component: Default,
        },
        {
            path: '/integrations',
            name: 'integrations',
            component: Default,
        },
        {
            path: '/analytics',
            name: 'analytics',
            component: Default,
        },
        {
            path: '/login',
            name: 'login',
            component: Login,
        },
        {
            path: '/:pathMatch(.*)*',
            name: 'dashboard',
            component: Default,
        },
    ],
});

export default router;
