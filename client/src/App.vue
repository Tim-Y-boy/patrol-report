<template>
  <div class="app-container">
    <BgFlow />
    <header class="app-header">
      <div class="header-left">
        <div class="logo-mark" @click="$router.push('/')">
          <span class="logo-icon">⚕️</span>
        </div>
        <h1 class="app-title" @click="$router.push('/')">
          太太药业 · 智能巡检
          <span class="title-badge">GMP</span>
        </h1>
      </div>
      <div class="header-right">
        <div class="status-indicator" :class="statusState.cls">
          <span class="status-dot" :class="statusState.dotCls"></span>
          <span class="status-text">{{ statusState.label }}</span>
        </div>
      </div>
    </header>
    <main class="app-main">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" :key="$route.fullPath" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useInspectionStore } from './stores/inspection'
import BgFlow from './components/BgFlow.vue'

const route = useRoute()
const store = useInspectionStore()

// 仅在仪表盘页面显示状态灯；详情页不需要
const isDashboard = computed(() => route.name === 'dashboard')

// 动态状态：根据 lastUpdated 计算
// 2 分钟内 → 正常绿色  |  2-5 分钟 → 延迟黄色  |  5 分钟+ → 未连接灰色
const statusState = computed(() => {
  if (!store.lastUpdated) return { label: '等待连接', cls: 'status-idle', dotCls: 'dot-idle' }
  const elapsed = Date.now() - store.lastUpdated
  if (elapsed < 2 * 60 * 1000) return { label: '实时监控中', cls: 'status-ok', dotCls: 'dot-ok' }
  if (elapsed < 5 * 60 * 1000) return { label: '更新延迟', cls: 'status-warn', dotCls: 'dot-warn' }
  return { label: '监控中断', cls: 'status-error', dotCls: 'dot-error' }
})
</script>

<style scoped>
.app-container {
  min-height: 100vh;
  /* 背景由 body::before/::after 提供流动渐变，此处透明 */
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 48px;
  background: linear-gradient(135deg, #0d3b2a 0%, #1a4d38 50%, #0d3b2a 100%);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 2px solid #00a651;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-mark {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(0, 166, 81, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 1px solid rgba(0, 166, 81, 0.3);
}

.logo-icon {
  font-size: 18px;
}

.app-title {
  font-size: 17px;
  font-weight: 600;
  color: #d4e8dc;
  cursor: pointer;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: 1px;
}

.title-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: #00a651;
  color: #fff;
  letter-spacing: 1.5px;
}

.header-right {
  display: flex;
  align-items: center;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 20px;
  background: rgba(0, 166, 81, 0.12);
  border: 1px solid rgba(0, 166, 81, 0.2);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 6px rgba(0, 166, 81, 0.5);
}
.dot-ok {
  background: #00a651;
  box-shadow: 0 0 6px rgba(0, 166, 81, 0.5);
  animation: pulse 2s infinite;
}
.dot-warn {
  background: #f0a020;
  box-shadow: 0 0 6px rgba(240, 160, 32, 0.5);
  animation: blink 1s infinite;
}
.dot-error {
  background: #e74c3c;
  box-shadow: 0 0 6px rgba(231, 76, 60, 0.5);
}
.dot-idle {
  background: #95a5a6;
  box-shadow: 0 0 6px rgba(149, 165, 166, 0.5);
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.status-text {
  font-size: 12px;
  color: rgba(212, 232, 220, 0.7);
}

.app-main {
  padding: 14px 20px 16px;
  max-width: 1440px;
  margin: 0 auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
