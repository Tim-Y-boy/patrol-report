import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'

export interface PointRecord {
  id: string
  巡检点位: string
  编码: string
  录制类型: string[]
  检测集: string[]
  频率: number
  工作时长: string[]
  状态: string[]
  监控事项: string
  开始时间: string[]
  link: string[]
  关键帧: string[]
  框选模式: string[]
  [key: string]: any
}

const CACHE_TTL = 5 * 60 * 1000

export const usePointsStore = defineStore('points', () => {
  const records = ref<PointRecord[]>([])
  const loading = ref(false)
  const error = ref('')
  const lastFetch = ref(0)

  const needsRefresh = computed(() => {
    return records.value.length === 0 || Date.now() - lastFetch.value > CACHE_TTL
  })

  async function fetchIfNeeded(force = false) {
    if (!force && !needsRefresh.value) return

    loading.value = true
    error.value = ''
    try {
      const res: any = await api.get('/points')
      if (res.ok) {
        records.value = res.data.records || []
        lastFetch.value = Date.now()
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
      const res = await fetch('/data/points.json')
      const data = await res.json()
      records.value = data.records || []
      lastFetch.value = Date.now()
      error.value = ''
    } catch {
      // 忽略
    }
  }

  function getPointByName(name: string): PointRecord | undefined {
    return records.value.find(p => p.巡检点位 === name)
  }

  return {
    records,
    loading,
    error,
    lastFetch,
    needsRefresh,
    fetchIfNeeded,
    getPointByName,
  }
})
