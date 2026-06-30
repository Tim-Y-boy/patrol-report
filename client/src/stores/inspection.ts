import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'

export interface AlarmPhoto {
  file_token: string
  name: string
  size: number
  record_id?: string
}

export interface AlarmRecord {
  id: string
  记录编号: string
  创建时间: string
  创建人: string
  点位: string
  监控要点: string
  AI识别结论: string
  AI判定结果: string
  复核员判定结果: string
  复核人员?: string
  巡检单位?: any[]
  照片: AlarmPhoto[]
}

const CACHE_TTL = 5 * 60 * 1000 // 5 分钟缓存

export const useInspectionStore = defineStore('inspection', () => {
  const records = ref<AlarmRecord[]>([])
  const loading = ref(false)
  const error = ref('')
  const lastFetch = ref(0)
  const lastUpdated = ref<number | null>(null)

  const needsRefresh = computed(() => {
    return records.value.length === 0 || Date.now() - lastFetch.value > CACHE_TTL
  })

  async function fetchIfNeeded(force = false) {
    if (!force && !needsRefresh.value) return

    loading.value = true
    error.value = ''
    try {
      const res: any = await api.get('/inspection')
      if (res.ok) {
        records.value = res.data.records || []
        lastFetch.value = Date.now()
        lastUpdated.value = Date.now()
      } else {
        error.value = res.error || '数据加载失败'
        await loadMockData()
      }
    } catch (e: any) {
      console.warn('后端不可用，使用 mock 数据')
      await loadMockData()
    } finally {
      loading.value = false
    }
  }

  async function loadMockData() {
    try {
      const res = await fetch('/data/inspection.json')
      const data = await res.json()
      records.value = data.records || []
      lastFetch.value = Date.now()
      lastUpdated.value = Date.now()
      error.value = ''
    } catch {
      // 忽略 mock 加载失败
    }
  }

  function getRecordById(id: string): AlarmRecord | undefined {
    // 优先从缓存找
    const cached = records.value.find(r => r.id === id)
    if (cached) return cached
    // 触发异步获取单条（不阻塞当前返回）
    fetchSingleRecord(id)
    return undefined
  }

  async function fetchSingleRecord(id: string): Promise<AlarmRecord | null> {
    try {
      const res: any = await api.get(`/inspection/${id}`)
      if (res.ok && res.data) {
        // 更新到缓存中
        const idx = records.value.findIndex(r => r.id === id)
        if (idx >= 0) {
          records.value[idx] = res.data
        } else {
          records.value.push(res.data)
        }
        return res.data
      }
    } catch {
      // 忽略
    }
    return null
  }

  function getRecordsByPoint(pointName: string): AlarmRecord[] {
    return records.value.filter(r => r.点位 === pointName)
  }

  return {
    records,
    loading,
    error,
    lastFetch,
    lastUpdated,
    needsRefresh,
    fetchIfNeeded,
    getRecordById,
    fetchSingleRecord,
    getRecordsByPoint,
  }
})
