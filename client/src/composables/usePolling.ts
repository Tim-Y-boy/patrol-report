import { ref, onMounted, onUnmounted, type Ref } from 'vue'

export interface PollingOptions {
  /** 轮询间隔（毫秒），默认 30000 */
  interval?: number
  /** 是否在挂载时立即执行一次，默认 true */
  immediate?: boolean
  /** 是否启用轮询，默认 true */
  enabled?: boolean
}

export interface PollingReturn {
  /** 上次成功执行的时间戳（ms），null 表示尚未成功执行过 */
  lastUpdated: Ref<number | null>
  /** 当前是否正在轮询 */
  isPolling: Ref<boolean>
  /** 暂停轮询，保留定时器引用 */
  pause: () => void
  /** 恢复轮询 */
  resume: () => void
  /** 立即执行一次（防抖：如果正在执行则跳过） */
  refreshNow: () => Promise<void>
  /** 距离上次更新的秒数（计算属性） */
  secondsSinceUpdate: Ref<number>
}

/**
 * 通用的前端轮询 composable
 *
 * 特性：
 * - 页面不可见（visibilitychange）时暂停轮询，切回时立即执行一次
 * - 防抖：上一次请求未完成时跳过本次，避免请求堆积
 * - 组件卸载时自动清除定时器
 *
 * @param callback  要周期性执行的异步函数
 * @param options   轮询配置
 */
export function usePolling(
  callback: () => Promise<void>,
  options: PollingOptions = {}
): PollingReturn {
  const { interval = 30000, immediate = true, enabled = true } = options

  const lastUpdated = ref<number | null>(null)
  const isPolling = ref(false)
  const secondsSinceUpdate = ref(0)

  let timer: ReturnType<typeof setInterval> | null = null
  let running = false
  let paused = !enabled
  let secondsTimer: ReturnType<typeof setInterval> | null = null

  // 倒计时刷新器：每秒更新 secondsSinceUpdate
  function startSecondsCounter() {
    if (secondsTimer) return
    secondsTimer = setInterval(() => {
      if (lastUpdated.value != null) {
        secondsSinceUpdate.value = Math.floor((Date.now() - lastUpdated.value) / 1000)
      }
    }, 1000)
  }

  function stopSecondsCounter() {
    if (secondsTimer) {
      clearInterval(secondsTimer)
      secondsTimer = null
    }
  }

  async function execute() {
    if (running) return // 防抖：上一次未完成则跳过
    running = true
    isPolling.value = true
    try {
      await callback()
      lastUpdated.value = Date.now()
    } catch {
      // 静默处理错误，不中断轮询
    } finally {
      running = false
      isPolling.value = false
    }
  }

  function startTimer() {
    if (timer || paused) return
    timer = setInterval(execute, interval)
    startSecondsCounter()
  }

  function clearTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    stopSecondsCounter()
  }

  function pause() {
    paused = true
    clearTimer()
  }

  function resume() {
    paused = false
    startTimer()
    // 恢复时立即刷新一次
    execute()
  }

  async function refreshNow() {
    await execute()
  }

  // 页面可见性变化处理
  function onVisibilityChange() {
    if (document.hidden) {
      clearTimer()
    } else {
      // 页面恢复可见：立即刷新一次，然后恢复定时轮询
      paused = false
      execute()
      startTimer()
    }
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)
    if (!paused) {
      if (immediate) execute()
      startTimer()
    } else if (immediate) {
      execute()
    }
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    clearTimer()
  })

  return {
    lastUpdated,
    isPolling,
    secondsSinceUpdate,
    pause,
    resume,
    refreshNow,
  }
}
