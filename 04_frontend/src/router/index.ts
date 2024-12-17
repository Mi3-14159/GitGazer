import {createRouter, createWebHistory} from 'vue-router';
import Default from '../views/Default.vue';
import Login from '../views/Login.vue';

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
