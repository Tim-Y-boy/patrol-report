import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        proxyTimeout: 180000,  // 3 分钟超时，视频文件 (10-15MB) 下载较慢
        timeout: 180000,
      },
    },
  },
})
