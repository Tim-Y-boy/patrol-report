<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter, onBeforeRouteUpdate } from 'vue-router'
import { useInspectionStore, type AlarmRecord } from '../stores/inspection'
import AlarmImage from '../components/AlarmImage.vue'

const props = defineProps<{ id: string }>()
const router = useRouter()
const store = useInspectionStore()

const record = ref<AlarmRecord | null>(null)
const samePointRecords = ref<AlarmRecord[]>([])
const loading = ref(true)
const error = ref('')
const activeImageIndex = ref(0)

const currentImage = computed(() => {
  const photos = record.value?.照片
  if (!photos || photos.length === 0) return null
  return photos[activeImageIndex.value] || photos[0]
})

const alarmClass = computed(() => {
  const result = record.value?.AI判定结果
  if (result === '违规') return 'alarm-violation'
  if (result === '正常') return 'alarm-normal'
  return 'alarm-unknown'
})

// idOverride: onBeforeRouteUpdate 触发时传入目标 ID（此时 props.id 可能尚未更新）
async function fetchDetail(idOverride?: string) {
  const targetId = idOverride || props.id
  if (!targetId) return

  // 已经是当前记录，跳过重复加载
  if (record.value?.id === targetId) return

    loading.value = true
    error.value = ''
    record.value = null      // 清空旧记录，强制渲染新内容
    samePointRecords.value = []
    try {
    // 1. 从 store 缓存中查找（通常已由 Dashboard 预加载）
    const cached = store.getRecordById(targetId)
    if (cached) {
      record.value = cached
      // 同点位历史直接从缓存过滤，无需额外请求
      samePointRecords.value = store.getRecordsByPoint(cached.点位)
        .filter(r => r.id !== targetId)
        .slice(0, 10)
      loading.value = false
      return
    }

    // 2. 缓存未命中，请求单条记录
    const detailRes: any = await store.fetchSingleRecord(targetId)
    if (detailRes) {
      record.value = detailRes
      // 确保列表数据已加载
      await store.fetchIfNeeded()
      if (record.value) {
        samePointRecords.value = store.getRecordsByPoint(record.value.点位)
          .filter(r => r.id !== targetId)
          .slice(0, 10)
      }
    } else {
      error.value = '记录不存在'
      loading.value = false
      return
    }
  } catch (e: any) {
    error.value = '加载失败，请重试'
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.back()
}

function goDetail(id: string) {
  router.push(`/alarm/${id}`)
}

function goPointHistory(name: string) {
  router.push(`/point/${encodeURIComponent(name)}`)
}

onMounted(fetchDetail)

// keep-alive + transition mode="out-in" 场景下，路由参数变化
watch(() => props.id, (newId, oldId) => {
  if (newId && newId !== oldId) fetchDetail()
})

// Vue Router 导航守卫：同一组件实例复用时路由参数变化的专用钩子
// （处理 keep-alive + transition mode="out-in" 可能导致的 watch 未触发问题）
onBeforeRouteUpdate((to) => {
  const nextId = to.params.id as string
  if (nextId && nextId !== record.value?.id) {
    activeImageIndex.value = 0
    fetchDetail(nextId)
  }
})
</script>

<template>
  <div class="alarm-detail">
    <div v-if="loading" class="loading-state">
      <el-skeleton :rows="5" animated />
    </div>

    <div v-else-if="error && !record" class="error-state">
      <div class="error-icon">⚠️</div>
      <p>{{ error }}</p>
      <div class="error-actions">
        <el-button @click="goBack">返回</el-button>
        <el-button type="primary" @click="fetchDetail()">重新加载</el-button>
      </div>
    </div>

    <template v-else-if="record">
      <div class="breadcrumb">
        <span class="breadcrumb-link" @click="$router.push('/')">← 返回列表</span>
        <span class="breadcrumb-current">{{ record.监控要点 || '告警详情' }}</span>
      </div>

      <div class="detail-main">
        <!-- 左：图片 -->
        <div class="detail-image">
          <div class="image-container" :class="alarmClass">
            <template v-if="currentImage">
              <AlarmImage
                :file-token="currentImage.file_token"
                :record-id="currentImage.record_id"
                :url="currentImage.url"
                :alt="currentImage.name"
                class="main-image-wrapper"
              />
              <div class="image-overlay">
                <span class="image-label">{{ record.AI判定结果 }}</span>
              </div>
            </template>
            <div v-else class="no-image"><span>📷 暂无图像</span></div>
          </div>
          <div class="thumbnails" v-if="record.照片?.length > 1">
            <div
              v-for="(photo, idx) in record.照片"
              :key="photo.file_token"
              class="thumb-item"
              :class="{ active: idx === activeImageIndex }"
              @click="activeImageIndex = idx"
            >
              <AlarmImage :file-token="photo.file_token" :record-id="photo.record_id" :url="photo.url" :alt="photo.name" aspect-ratio="1/1" />
            </div>
          </div>
        </div>

        <!-- 右：信息 -->
        <div class="detail-info">
          <div class="page-card info-card">
            <div class="card-title">告警信息</div>
            <div class="info-grid">
              <div class="info-item"><span class="info-label">记录编号</span><span class="info-value">{{ record.记录编号 }}</span></div>
              <div class="info-item"><span class="info-label">创建时间</span><span class="info-value">{{ record.创建时间 }}</span></div>
              <div class="info-item"><span class="info-label">创建人</span><span class="info-value">{{ record.创建人 }}</span></div>
              <div class="info-item"><span class="info-label">巡检点位</span><span class="info-value link-value" @click="goPointHistory(record.点位)">{{ record.点位 }}</span></div>
              <div class="info-item"><span class="info-label">监控要点</span><span class="info-value">{{ record.监控要点 }}</span></div>
              <div class="info-item"><span class="info-label">AI判定</span><span class="info-value"><span :class="record.AI判定结果 === '违规' ? 'tag-danger' : record.AI判定结果 === '正常' ? 'tag-success' : 'tag-warning'">{{ record.AI判定结果 }}</span></span></div>
              <div class="info-item"><span class="info-label">复核员判定</span><span class="info-value"><span v-if="record.复核员判定结果" :class="record.复核员判定结果 === '违规' ? 'tag-danger' : record.复核员判定结果 === '正常' ? 'tag-success' : 'tag-warning'">{{ record.复核员判定结果 }}</span><span v-else class="tag-info">待复核</span></span></div>
              <div class="info-item" v-if="record.复核人员"><span class="info-label">复核人员</span><span class="info-value">{{ record.复核人员 }}</span></div>
            </div>
          </div>

          <div class="page-card ai-card" v-if="record.AI识别结论">
            <div class="card-title">AI 识别结论</div>
            <div class="ai-conclusion">{{ record.AI识别结论 }}</div>
          </div>
        </div>
      </div>

      <!-- 同点位历史（竖状列表） -->
      <div class="page-card timeline-card" v-if="samePointRecords.length > 0">
        <div class="card-title">同点位历史 · {{ record.点位 }} <span class="card-subtitle">最近 {{ samePointRecords.length }} 条</span></div>
        <div class="timeline-list">
          <div
            v-for="r in samePointRecords"
            :key="r.id"
            class="timeline-item"
            :class="r.AI判定结果 === '违规' ? 'item-danger' : 'item-normal'"
            @click="goDetail(r.id)"
          >
            <div class="item-thumb">
              <AlarmImage
                v-if="r.照片?.[0]"
                :file-token="r.照片[0].file_token"
                :record-id="r.照片[0].record_id"
                :url="r.照片[0].url"
                :alt="r.照片[0].name"
                aspect-ratio="4/3"
              />
              <span v-else class="item-thumb-placeholder">📷</span>
            </div>
            <div class="item-body">
              <div class="item-top">
                <span class="item-desc">{{ r.监控要点 }}</span>
                <span :class="r.AI判定结果 === '违规' ? 'tag-danger' : 'tag-success'">{{ r.AI判定结果 }}</span>
              </div>
              <div class="item-bottom">
                <span class="item-time">{{ r.创建时间?.slice(5) }}</span>
                <span v-if="r.复核员判定结果" :class="r.复核员判定结果 === '违规' ? 'tag-danger' : 'tag-success'">复核：{{ r.复核员判定结果 }}</span>
                <span v-else class="tag-info">待复核</span>
              </div>
            </div>
            <svg class="item-arrow" width="14" height="14" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" stroke="#c4c9d0" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.alarm-detail {
  height: calc(100vh - 48px - 30px);
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s ease;
}
@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

/* ── 面包屑 ── */
.breadcrumb { display: flex; align-items: center; gap: 6px; padding: 0 0 10px; font-size: 13px; color: #999; flex-shrink: 0; }
.breadcrumb-link { color: #00a651; cursor: pointer; font-weight: 500; }
.breadcrumb-link:hover { text-decoration: underline; }
.breadcrumb-current { color: #333; font-weight: 500; }

/* ── 主内容：左图右文 ── */
.detail-main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 420px;
  gap: 14px;
  margin-bottom: 12px;
}

.detail-image { display: flex; flex-direction: column; min-height: 0; }

.image-container {
  flex: 1;
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  background: #1a1a2e;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}
.image-container.alarm-violation { border: 2px solid #e74c3c; }
.image-container.alarm-normal    { border: 2px solid #00a651; }
.image-container.alarm-unknown   { border: 2px solid #f0ad4e; }

.main-image-wrapper { width: 100%; height: 100%; }

.image-overlay {
  position: absolute; bottom: 0; left: 0; right: 0;
  padding: 10px 14px;
  background: linear-gradient(transparent, rgba(0,0,0,0.7));
}
.image-label { color: #fff; font-size: 14px; font-weight: 600; }

.no-image { text-align: center; color: #999; padding: 60px; font-size: 14px; }

.thumbnails { display: flex; gap: 6px; margin-top: 8px; overflow-x: auto; padding: 2px 0; flex-shrink: 0; }
.thumb-item {
  width: 52px; height: 52px; border-radius: 6px; overflow: hidden;
  border: 2px solid transparent; cursor: pointer; flex-shrink: 0; transition: border-color 0.15s;
}
.thumb-item.active { border-color: #00a651; }

/* ── 右栏信息 ── */
.detail-info { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; }

.info-card.page-card { margin-bottom: 0; }
.ai-card.page-card { margin-bottom: 0; flex: 1; display: flex; flex-direction: column; min-height: 0; }

.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
.info-item { display: flex; flex-direction: column; gap: 2px; }
.info-label { font-size: 11px; color: #999; }
.info-value { font-size: 13px; color: #333; word-break: break-all; }
.link-value { color: #00a651; cursor: pointer; font-weight: 500; }
.link-value:hover { text-decoration: underline; }

.ai-conclusion {
  font-size: 12px; color: #555; line-height: 1.7; white-space: pre-wrap;
  flex: 1; min-height: 0; overflow-y: auto;
  padding: 10px; background: #fafafa; border-radius: 6px; border: 1px solid #f0f0f0;
}

/* ── 同点位历史（竖状列表 · 流动绿底） ── */
.timeline-card.page-card {
  margin-bottom: 0; flex-shrink: 0;
  display: flex; flex-direction: column;
  max-height: 240px;
  /* 覆盖默认白色背景 */
  background: linear-gradient(135deg, #d9f0df, #c3e8cc, #d2efd8, #bde4c7, #cce8d4);
  background-size: 300% 300%;
  animation: pharmaFlow 10s ease-in-out infinite;
  border: 1px solid #a3d4ae;
  position: relative;
  overflow: hidden;
}
/* 流动光晕叠加层 */
.timeline-card.page-card::after {
  content: '';
  position: absolute; top: -50%; left: -50%; right: -50%; bottom: -50%;
  background: radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.3) 0%, transparent 60%),
              radial-gradient(ellipse at 70% 80%, rgba(0,166,81,0.08) 0%, transparent 60%);
  animation: pharmaShimmer 6s ease-in-out infinite;
  pointer-events: none; z-index: 0;
}
@keyframes pharmaFlow {
  0%   { background-position: 0% 0%; }
  25%  { background-position: 100% 0%; }
  50%  { background-position: 100% 100%; }
  75%  { background-position: 0% 100%; }
  100% { background-position: 0% 0%; }
}
@keyframes pharmaShimmer {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50%      { opacity: 0.9; transform: scale(1.08); }
}

.timeline-card .card-title { position: relative; z-index: 1; border-bottom-color: rgba(0,0,0,0.08); }
.timeline-card .card-subtitle { font-size: 11px; color: #4a7c56; font-weight: 400; margin-left: auto; }

.timeline-list { flex: 1; overflow-y: auto; margin: 0 -8px; padding: 0 8px; position: relative; z-index: 1; }

.timeline-item {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 10px; cursor: pointer;
  transition: all 0.2s ease; border-radius: 6px;
  border-left: 3px solid transparent;
  margin-bottom: 2px;
  background: rgba(255,255,255,0.42);
  backdrop-filter: blur(4px);
}
.timeline-item:hover {
  background: rgba(255,255,255,0.72);
  transform: translateX(3px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.timeline-item.item-danger { border-left-color: #e74c3c; }
.timeline-item.item-normal  { border-left-color: #00a651; }

.item-thumb {
  width: 52px; height: 39px; border-radius: 4px; overflow: hidden;
  background: #f5f6f8; flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.item-thumb-placeholder {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%; font-size: 16px; color: #ccc;
}

.item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.item-top { display: flex; align-items: center; gap: 8px; }
.item-desc { font-size: 12px; color: #1a3b2a; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.item-bottom { display: flex; align-items: center; gap: 10px; }
.item-time { font-size: 11px; color: #5a7a62; }

.item-arrow { flex-shrink: 0; opacity: 0; transition: opacity 0.15s; }
.timeline-item:hover .item-arrow { opacity: 1; }

/* ── 状态页 ── */
.loading-state { padding: 40px; background: #fff; border-radius: 10px; }
.error-state { text-align: center; padding: 60px 20px; background: #fff; border-radius: 10px; }
.error-icon { font-size: 40px; margin-bottom: 10px; }
.error-state p { color: #999; margin-bottom: 14px; }
.error-actions { display: flex; gap: 8px; justify-content: center; }

@media (max-width: 900px) {
  .alarm-detail { height: auto; }
  .detail-main { grid-template-columns: 1fr; }
  .image-container { min-height: 300px; }
}
@media (max-width: 600px) {
  .info-grid { grid-template-columns: 1fr; }
}
</style>
