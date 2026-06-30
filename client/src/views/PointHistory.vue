<script setup lang="ts">
import { ref, onMounted, onActivated, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useInspectionStore } from '../stores/inspection'
import { usePointsStore, type PointRecord } from '../stores/points'
import TrendChart from '../components/TrendChart.vue'

const props = defineProps<{ name: string }>()
const router = useRouter()
const inspectionStore = useInspectionStore()
const pointsStore = usePointsStore()

const pointInfo = ref<PointRecord | null>(null)
const loading = ref(true)
const filterResult = ref('')

const decodedName = decodeURIComponent(props.name)

// 该点位的告警记录（从 store 缓存获取）
const pointRecords = computed(() => {
  let list = inspectionStore.getRecordsByPoint(decodedName)
  if (filterResult.value) {
    list = list.filter(r => r.AI判定结果 === filterResult.value)
  }
  return list.sort((a, b) => b.创建时间.localeCompare(a.创建时间))
})

// 日趋势统计
const dailyTrend = computed(() => {
  const dist: Record<string, { date: string; violations: number; normal: number }> = {}
  pointRecords.value.forEach(r => {
    const day = r.创建时间?.split(' ')[0]
    if (!day) return
    if (!dist[day]) dist[day] = { date: day, violations: 0, normal: 0 }
    if (r.AI判定结果 === '违规') dist[day].violations++
    else dist[day].normal++
  })
  return Object.values(dist).sort((a, b) => a.date.localeCompare(b.date))
})

// 监控要点分布
const monitorDist = computed(() => {
  const dist: Record<string, number> = {}
  pointRecords.value.forEach(r => {
    if (r.监控要点) dist[r.监控要点] = (dist[r.监控要点] || 0) + 1
  })
  return Object.entries(dist).map(([name, count]) => ({ name, count }))
})

async function fetchData() {
  loading.value = true
  try {
    // 两个 store 并行加载（如果已缓存则立即返回）
    await Promise.all([
      inspectionStore.fetchIfNeeded(),
      pointsStore.fetchIfNeeded(),
    ])

    // 从 points store 获取点位配置
    pointInfo.value = pointsStore.getPointByName(decodedName) || null
  } finally {
    loading.value = false
  }
}

function goDetail(id: string) {
  router.push(`/alarm/${id}`)
}

function goBack() {
  router.back()
}

onMounted(fetchData)
onActivated(() => {
  // keep-alive 激活时静默刷新
  inspectionStore.fetchIfNeeded()
  pointsStore.fetchIfNeeded()
})
</script>

<template>
  <div class="point-history">
    <div v-if="loading" class="loading-state">
      <el-skeleton :rows="4" animated />
    </div>
    <template v-else>
      <div class="breadcrumb">
        <span class="breadcrumb-link" @click="$router.push('/')">← 返回列表</span>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-current">{{ decodedName }}</span>
      </div>

      <!-- 点位配置（紧凑） -->
      <div class="page-card config-card" v-if="pointInfo">
        <div class="card-title">点位配置</div>
        <div class="config-grid">
          <div class="config-item"><span class="config-label">名称</span><span class="config-value">{{ pointInfo.巡检点位 }}</span></div>
          <div class="config-item"><span class="config-label">编码</span><span class="config-value">{{ pointInfo.编码 }}</span></div>
          <div class="config-item"><span class="config-label">录制类型</span><span class="config-value">{{ pointInfo.录制类型?.join(', ') }}</span></div>
          <div class="config-item"><span class="config-label">检测集</span><span class="config-value">{{ pointInfo.检测集?.join(', ') }}</span></div>
          <div class="config-item"><span class="config-label">频率</span><span class="config-value">每 {{ pointInfo.频率 }} 分钟</span></div>
          <div class="config-item"><span class="config-label">工作时长</span><span class="config-value">{{ pointInfo.工作时长 }}h</span></div>
          <div class="config-item"><span class="config-label">状态</span><span class="config-value"><span :class="pointInfo.状态?.some((s: string) => s.includes('有效')) ? 'tag-success' : 'tag-danger'">{{ pointInfo.状态?.join(', ') }}</span></span></div>
          <div class="config-item" v-if="pointInfo.关键帧"><span class="config-label">关键帧</span><span class="config-value">{{ pointInfo.关键帧?.join(', ') }}</span></div>
        </div>
      </div>

      <!-- 图表 + 历史列表 -->
      <div class="main-grid">
        <div class="charts-stack">
          <div class="page-card chart-box">
            <div class="card-title">告警趋势 (按日)</div>
            <TrendChart type="line" :data="dailyTrend.map(d => d.violations)" :labels="dailyTrend.map(d => d.date)" height="calc(100% - 36px)" lineColor="#e74c3c" />
          </div>
          <div class="page-card chart-box">
            <div class="card-title">监控要点分布</div>
            <TrendChart type="pie" :data="monitorDist.map(d => ({ name: d.name, value: d.count }))" height="calc(100% - 36px)" />
          </div>
        </div>

        <div class="page-card table-card">
          <div class="card-title">
            历史告警
            <span class="total-hint">共 {{ pointRecords.length }} 条</span>
            <el-select v-model="filterResult" placeholder="全部" clearable size="small" style="width: 100px; margin-left: auto;">
              <el-option label="全部" value="" />
              <el-option label="违规" value="违规" />
              <el-option label="正常" value="正常" />
            </el-select>
          </div>
          <div class="table-scroll">
            <table class="record-table">
              <thead>
                <tr>
                  <th>编号</th>
                  <th>时间</th>
                  <th>监控要点</th>
                  <th>AI</th>
                  <th>复核</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in pointRecords" :key="r.id" @click="goDetail(r.id)" class="clickable-row">
                  <td>{{ r.记录编号 }}</td>
                  <td>{{ r.创建时间?.slice(5) }}</td>
                  <td class="monitor-cell">{{ r.监控要点 }}</td>
                  <td><span :class="r.AI判定结果 === '违规' ? 'tag-danger' : 'tag-success'">{{ r.AI判定结果 }}</span></td>
                  <td>
                    <span v-if="r.复核员判定结果" :class="r.复核员判定结果 === '违规' ? 'tag-danger' : 'tag-success'">{{ r.复核员判定结果 }}</span>
                    <span v-else class="tag-info">待复核</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.point-history {
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
.breadcrumb-sep { color: #ccc; }
.breadcrumb-current { color: #333; font-weight: 500; }

/* ── 点位配置 ── */
.config-card.page-card { margin-bottom: 0; flex-shrink: 0; margin-bottom: 12px; }
.config-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px 14px; }
.config-item { display: flex; flex-direction: column; gap: 2px; }
.config-label { font-size: 11px; color: #999; }
.config-value { font-size: 13px; color: #333; }

/* ── 主内容：图表 + 表格 ── */
.main-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 14px;
}

.charts-stack { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
.chart-box.page-card { margin-bottom: 0; flex: 1; min-height: 0; }

.table-card.page-card {
  margin-bottom: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.total-hint { font-size: 11px; color: #999; font-weight: 400; }

.table-scroll { flex: 1; min-height: 0; overflow-y: auto; margin: 0 -8px; padding: 0 8px; }

.record-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.record-table th {
  background: #fafafa; padding: 7px 10px; text-align: left;
  font-weight: 500; color: #666; border-bottom: 2px solid #f0f0f0;
  position: sticky; top: 0; z-index: 1;
}
.record-table td { padding: 7px 10px; border-bottom: 1px solid #f5f5f5; color: #333; }
.monitor-cell { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.clickable-row { cursor: pointer; transition: background 0.15s; }
.clickable-row:hover { background: #f8faf9; }

.loading-state { padding: 40px; background: #fff; border-radius: 10px; }

@media (max-width: 1000px) {
  .point-history { height: auto; }
  .main-grid { grid-template-columns: 1fr; }
  .config-grid { grid-template-columns: repeat(2, 1fr); }
  .charts-stack { min-height: 400px; }
}
@media (max-width: 500px) {
  .config-grid { grid-template-columns: 1fr; }
}
</style>
