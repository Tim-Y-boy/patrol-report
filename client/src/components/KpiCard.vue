<script setup lang="ts">
defineProps<{
  title: string
  value: string | number
  unit: string
  icon: string
  color: string
  active?: boolean
}>()
</script>

<template>
  <div class="kpi-card" :class="{ active }" :style="{ '--kpi-color': color }">
    <div class="kpi-icon-box">
      <span class="kpi-icon">{{ icon }}</span>
    </div>
    <div class="kpi-info">
      <span class="kpi-title">{{ title }}</span>
      <div class="kpi-value">
        <span class="kpi-number">{{ value }}</span>
        <span class="kpi-unit">{{ unit }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kpi-card {
  background: #fff;
  border-radius: 10px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #eef0f4;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}

.kpi-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
}

.kpi-card.active {
  border-color: var(--kpi-color);
  background: linear-gradient(135deg, #fff 0%, color-mix(in srgb, var(--kpi-color) 4%, #fff) 100%);
}

.kpi-icon-box {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--kpi-color) 12%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.kpi-icon { font-size: 18px; }

.kpi-info { display: flex; flex-direction: column; gap: 1px; }

.kpi-title { font-size: 11px; color: #8c95a3; }

.kpi-value { display: flex; align-items: baseline; gap: 2px; }

.kpi-number { font-size: 22px; font-weight: 700; color: var(--kpi-color); line-height: 1.1; }

.kpi-unit { font-size: 11px; color: #aab2bd; }
</style>
