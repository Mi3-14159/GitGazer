import { createRouter, createWebHistory } from 'vue-router';
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
      path: '/alerting',
      name: 'alerting',
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
