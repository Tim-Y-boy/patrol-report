import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('../views/Dashboard.vue'),
    },
    {
      path: '/alarm/:id',
      name: 'alarm-detail',
      component: () => import('../views/AlarmDetail.vue'),
      props: true,
    },
    {
      path: '/point/:name',
      name: 'point-history',
      component: () => import('../views/PointHistory.vue'),
      props: true,
    },
  ],
});

export default router;
