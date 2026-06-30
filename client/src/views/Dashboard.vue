<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useInspectionStore } from '../stores/inspection'
import { usePolling } from '../composables/usePolling'
import KpiCard from '../components/KpiCard.vue'
import AlarmCard from '../components/AlarmCard.vue'
import TrendChart from '../components/TrendChart.vue'

const router = useRouter()
const store = useInspectionStore()

const activeFilter = ref<'today' | 'violation' | 'pending' | null>(null)
const currentPage = ref(1)
const pageSize = ref(20)

const sortedRecords = computed(() => {
  return [...store.records].sort((a, b) => (b.创建时间 || '').localeCompare(a.创建时间 || ''))
})

const displayRecords = computed(() => {
  if (!activeFilter.value) return sortedRecords.value
  const today = new Date().toISOString().split('T')[0]
  return sortedRecords.value.filter(r => {
    switch (activeFilter.value) {
      case 'today': return r.创建时间?.startsWith(today)
      case 'violation': return r.AI判定结果 === '违规'
      case 'pending': return !r.复核员判定结果
      default: return true
    }
  })
})

const pagedRecords = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return displayRecords.value.slice(start, start + pageSize.value)
})

const totalPages = computed(() => Math.ceil(displayRecords.value.length / pageSize.value))

const kpiData = computed(() => {
  const all = store.records
  const total = all.length
  const violations = all.filter(r => r.AI判定结果 === '违规').length
  const today = new Date().toISOString().split('T')[0]
  const todayCount = all.filter(r => r.创建时间?.startsWith(today)).length
  const pendingReview = all.filter(r => !r.复核员判定结果).length
  return { todayAlarms: todayCount, violations, pendingReview, violationRate: total > 0 ? ((violations / total) * 100).toFixed(1) : '0.0' }
})

const pointDistribution = computed(() => {
  const dist: Record<string, number> = {}
  store.records.forEach(r => { if (r.点位) dist[r.点位] = (dist[r.点位] || 0) + 1 })
  return Object.entries(dist).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
})

const monitorDistribution = computed(() => {
  const dist: Record<string, number> = {}
  store.records.forEach(r => { if (r.监控要点) dist[r.监控要点] = (dist[r.监控要点] || 0) + 1 })
  return Object.entries(dist).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
})

const dailyTrend = computed(() => {
  const dist: Record<string, number> = {}
  store.records.forEach(r => {
    const day = r.创建时间?.split(' ')[0]
    if (day) dist[day] = (dist[day] || 0) + 1
  })
  return Object.entries(dist).sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count }))
})

function toggleFilter(key: 'today' | 'violation' | 'pending') {
  activeFilter.value = activeFilter.value === key ? null : key
  currentPage.value = 1
}
function clearFilter() { activeFilter.value = null; currentPage.value = 1 }
function goPage(p: number) { currentPage.value = Math.max(1, Math.min(p, totalPages.value)) }
function goDetail(id: string) { router.push(`/alarm/${id}`) }

// 启动自动轮询刷新
const { secondsSinceUpdate } = usePolling(
  () => store.fetchIfNeeded(true),
  { interval: 30000, immediate: false }
)

// 首次加载
store.fetchIfNeeded()

// 格式化"上次更新"文案
const lastUpdateText = computed(() => {
  if (secondsSinceUpdate.value === 0 && store.loading.value) return '加载中…'
  const s = secondsSinceUpdate.value
  if (s < 60) return `${s}s 前更新`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}min 前更新`
  const h = Math.floor(m / 60)
  return `${h}h 前更新`
})
</script>

<template>
  <div class="dashboard">
    <div v-if="store.loading && store.records.length === 0" class="loading-state">
      <el-skeleton :rows="6" animated />
    </div>
    <div v-else-if="store.error && store.records.length === 0" class="error-state">
      <div class="error-icon">⚠️</div>
      <p>{{ store.error }}</p>
      <el-button type="primary" @click="store.fetchIfNeeded(true)">重新加载</el-button>
    </div>
    <template v-else>
      <!-- KPI 卡片行：紧凑型 -->
      <div class="kpi-row">
        <KpiCard title="今日告警" :value="kpiData.todayAlarms" unit="次" icon="🔔" color="#e74c3c" :active="activeFilter === 'today'" @click="toggleFilter('today')" />
        <KpiCard title="违规总数" :value="kpiData.violations" unit="条" icon="⚠️" color="#c0392b" :active="activeFilter === 'violation'" @click="toggleFilter('violation')" />
        <KpiCard title="违规率" :value="kpiData.violationRate" unit="%" icon="📈" color="#e67e22" />
        <KpiCard title="待复核" :value="kpiData.pendingReview" unit="条" icon="🩺" color="#2980b9" :active="activeFilter === 'pending'" @click="toggleFilter('pending')" />
      </div>

      <!-- 主区域：告警列表 + 图表 -->
      <div class="main-grid">
        <!-- 左栏：告警列表 -->
        <div class="alarm-panel page-card">
          <div class="card-title">
            最新告警
            <span class="card-subtitle">
              <template v-if="activeFilter">
                筛选 {{ displayRecords.length }} 条
                <span class="filter-tag" @click="clearFilter">✕ 清除</span>
              </template>
              <template v-else>共 {{ displayRecords.length }} 条</template>
              <span class="update-time"> · {{ lastUpdateText }}</span>
            </span>
          </div>
          <div class="alarm-list">
            <AlarmCard v-for="record in pagedRecords" :key="record.id" :record="record" @click="goDetail(record.id)" />
            <div v-if="displayRecords.length === 0" class="empty-hint">暂无匹配告警<span v-if="activeFilter" class="clear-filter-link" @click="clearFilter">清除筛选</span></div>
          </div>
          <div v-if="totalPages > 1" class="pagination">
            <span class="page-btn" :class="{ disabled: currentPage <= 1 }" @click="goPage(currentPage - 1)">‹</span>
            <span v-for="p in totalPages" :key="p" class="page-num" :class="{ active: p === currentPage }" @click="goPage(p)">{{ p }}</span>
            <span class="page-btn" :class="{ disabled: currentPage >= totalPages }" @click="goPage(currentPage + 1)">›</span>
          </div>
        </div>

        <!-- 右栏：图表区 -->
        <div class="charts-column">
          <div class="page-card chart-card">
            <div class="card-title">点位告警分布</div>
            <TrendChart type="bar" :data="pointDistribution.map(d => d.count)" :labels="pointDistribution.map(d => d.name)" height="calc(100% - 36px)" barColor="#00a651" />
          </div>
          <div class="page-card chart-card">
            <div class="card-title">监控要点分布</div>
            <TrendChart type="pie" :data="monitorDistribution.map(d => ({ name: d.name, value: d.count }))" height="calc(100% - 36px)" />
          </div>
          <div class="page-card chart-card">
            <div class="card-title">告警趋势 (按日)</div>
            <TrendChart type="line" :data="dailyTrend.map(d => d.count)" :labels="dailyTrend.map(d => d.date)" height="calc(100% - 36px)" lineColor="#e74c3c" />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dashboard {
  height: calc(100vh - 48px - 30px); /* header 48px + main padding 14px+16px */
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s ease;
}
@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

/* ── KPI 行 ── */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

/* ── 主两栏 ── */
.main-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 14px;
}

/* ── 左栏：告警列表 ── */
.alarm-panel.page-card {
  display: flex;
  flex-direction: column;
  margin-bottom: 0;
  overflow: hidden;
}

.alarm-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0 -8px;
  padding: 0 8px;
}

/* ── 分页器 ── */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 0 0;
  flex-shrink: 0;
  border-top: 1px solid #f0f2f5;
  margin-top: 6px;
}
.page-btn, .page-num {
  min-width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 5px; font-size: 12px;
  cursor: pointer; color: #8c95a3;
  transition: all 0.15s; user-select: none;
}
.page-btn:hover, .page-num:hover { background: #e6f4ec; color: #00a651; }
.page-btn.disabled { opacity: 0.25; cursor: default; pointer-events: none; }
.page-num.active { background: #00a651; color: #fff; font-weight: 600; }

/* ── 右栏：图表区 ── */
.charts-column {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}
.charts-column .page-card {
  margin-bottom: 0;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.chart-card {
  position: relative;
}

/* ── 辅助 ── */
.card-subtitle { font-size: 11px; color: #999; font-weight: 400; margin-left: auto; }
.update-time { color: #bbb; }
.filter-tag {
  display: inline-flex; align-items: center; gap: 2px;
  font-size: 11px; color: #e74c3c; background: #fde8e8;
  padding: 1px 7px; border-radius: 3px; cursor: pointer; margin-left: 6px;
}
.filter-tag:hover { background: #fcd5d5; }

.loading-state, .error-state { padding: 60px 20px; background: #fff; border-radius: 10px; text-align: center; }
.error-icon { font-size: 40px; margin-bottom: 10px; }
.error-state p { color: #999; margin-bottom: 14px; }
.empty-hint { text-align: center; color: #999; padding: 36px; }
.clear-filter-link { display: inline-block; color: #00a651; cursor: pointer; margin-top: 6px; font-size: 12px; }
.clear-filter-link:hover { text-decoration: underline; }

@media (max-width: 1200px) {
  .main-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 900px) {
  .dashboard { height: auto; }
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .main-grid { grid-template-columns: 1fr; }
  .alarm-list { max-height: 50vh; }
  .charts-column { min-height: 600px; }
}
@media (max-width: 500px) {
  .kpi-row { grid-template-columns: 1fr; }
}
</style>
