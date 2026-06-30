import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 15000,
});

// 响应拦截
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    console.error('API 请求失败:', err.message);
    return Promise.reject(err);
  }
);

export default api;
