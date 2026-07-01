<script setup lang="ts">
import AlarmImage from './AlarmImage.vue'

defineProps<{
  record: {
    id: string
    记录编号: string
    创建时间: string
    点位: string
    监控要点: string
    AI判定结果: string
    复核员判定结果: string
    照片: Array<{ file_token: string; name: string; record_id?: string; url?: string }>
  }
}>()
</script>

<template>
  <div class="alarm-card">
    <div class="alarm-thumb">
      <AlarmImage
        v-if="record.照片?.[0]"
        :file-token="record.照片[0].file_token"
        :record-id="record.照片[0].record_id"
        :url="record.照片[0].url"
        :alt="record.照片[0].name"
        aspect-ratio="4/3"
      />
      <div class="alarm-thumb placeholder" v-else>
        <span>📷</span>
      </div>
    </div>
    <div class="alarm-body">
      <div class="alarm-header">
        <span :class="record.AI判定结果 === '违规' ? 'tag-danger' : 'tag-success'">
          {{ record.AI判定结果 }}
        </span>
        <span class="alarm-point">{{ record.点位 }}</span>
        <span class="alarm-id">{{ record.记录编号 }}</span>
      </div>
      <div class="alarm-title">{{ record.监控要点 || '监控告警' }}</div>
      <div class="alarm-meta">
        <span class="alarm-time">{{ record.创建时间?.slice(5) }}</span>
        <span v-if="record.复核员判定结果" :class="record.复核员判定结果 === '违规' ? 'tag-danger' : 'tag-success'">
          {{ record.复核员判定结果 }}
        </span>
        <span v-else class="tag-info">待复核</span>
      </div>
    </div>
    <div class="alarm-arrow">
      <svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" stroke="#c4c9d0" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
    </div>
  </div>
</template>

<style scoped>
.alarm-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: 1px;
}

.alarm-card:hover {
  background: #f8f9fc;
  transform: translateX(2px);
}

.alarm-thumb {
  width: 68px;
  height: 52px;
  border-radius: 6px;
  overflow: hidden;
  background: #f5f6f8;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.alarm-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.alarm-thumb.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.alarm-body {
  flex: 1;
  min-width: 0;
}

.alarm-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.alarm-point {
  font-size: 11px;
  color: #0d7a3e;
  background: #e6f4ec;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
}

.alarm-id {
  font-size: 10px;
  color: #b0b8c1;
  margin-left: auto;
}

.alarm-title {
  font-size: 13px;
  font-weight: 500;
  color: #2c3e50;
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alarm-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.alarm-time {
  font-size: 11px;
  color: #a4aeb9;
}

.alarm-arrow {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
}
.alarm-card:hover .alarm-arrow {
  opacity: 1;
}
</style>
