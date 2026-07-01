<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

const props = withDefaults(defineProps<{
  fileToken: string
  recordId?: string
  url?: string
  alt?: string
  aspectRatio?: string
}>(), {
  alt: '巡检图片',
  aspectRatio: '4/3',
})

const VIDEO_EXTENSIONS = /\.(mp4|mov|webm|avi|mkv|flv|wmv|m4v|3gp)$/i
const isVideo = computed(() => VIDEO_EXTENSIONS.test(props.alt || ''))

// 视频重试计数器（递增触发 URL 变化，带 retry=1 通知服务端清除缓存）
const videoRetryKey = ref(0)

// 视频播放 URL（inline，支持 Range 拖拽进度条）
const videoUrl = computed(() => {
  const base = `/api/image/${props.fileToken}?record_id=${props.recordId || ''}&url=${encodeURIComponent(props.url || '')}`
  return videoRetryKey.value > 0 ? `${base}&retry=1&_t=${videoRetryKey.value}` : base
})

// 视频下载 URL（强制下载）
const downloadUrl = computed(() =>
  `${videoUrl.value}&download=1`
)

// 视频缩略图（poster）
const posterUrl = computed(() =>
  `/api/image/thumb/${props.fileToken}`
)

// ---- 视频状态 ----
const videoLoading = ref(false)   // 初始 false，让 poster 可见
const videoError = ref(false)
const videoErrMsg = ref('')
const hasStartedPlaying = ref(false) // 用户是否已点击播放
const showPlayButton = ref(true)     // 是否显示自定义播放按钮（初始显示，点击后隐藏）
const videoRef = ref<HTMLVideoElement>()

function playVideo() {
  showPlayButton.value = false
  videoLoading.value = true
  videoRef.value?.play().catch(() => {
    videoLoading.value = false
  })
}
function onPlay() {
  hasStartedPlaying.value = true
}
function onWaiting() {
  if (hasStartedPlaying.value) {
    videoLoading.value = true
  }
}
function onCanPlay() {
  videoLoading.value = false
}
function onVideoError(e: Event) {
  videoLoading.value = false
  videoError.value = true
  showPlayButton.value = false
  const el = e.target as HTMLVideoElement
  const mediaErr = el.error
  videoErrMsg.value = mediaErr ? `code=${mediaErr.code} msg=${mediaErr.message}` : '未知错误'
  console.error('[AlarmImage] 视频加载失败:', videoErrMsg.value, 'src:', el.src)
}
function retryVideo() {
  videoError.value = false
  videoLoading.value = false
  hasStartedPlaying.value = false
  showPlayButton.value = true
  videoErrMsg.value = ''
  videoRetryKey.value++ // 触发 URL 变化 + retry=1 通知服务端清除缓存重新转码
}

// 图片逻辑
const imgRef = ref<HTMLElement>()
const isLoaded = ref(false)
const isError = ref(false)
const isVisible = ref(false)
const imgSrc = ref('')

let observer: IntersectionObserver | null = null

function loadImage() {
  if (imgSrc.value || isError.value) return
  imgSrc.value = `/api/image/${props.fileToken}?record_id=${props.recordId || ''}&url=${encodeURIComponent(props.url || '')}`
}

onMounted(() => {
  if (!imgRef.value || isVideo.value) return
  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        isVisible.value = true
        loadImage()
        observer?.unobserve(entry.target)
        observer?.disconnect()
        observer = null
      }
    },
    { rootMargin: '200px', threshold: 0.01 }
  )
  observer.observe(imgRef.value)
})

onUnmounted(() => observer?.disconnect())

function onLoad() { isLoaded.value = true }
function onError() { isError.value = true }
function retry() {
  isError.value = false
  isLoaded.value = false
  isVisible.value = true
  imgSrc.value = ''
  imgSrc.value = `/api/image/${props.fileToken}?record_id=${props.recordId || ''}&url=${encodeURIComponent(props.url || '')}&_t=${Date.now()}`
}

// 格式化文件大小
function fmtSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1048576).toFixed(1)}MB`
}
</script>

<template>
  <div ref="imgRef" class="alarm-image-wrapper" :style="{ aspectRatio }">
    <!-- 视频：自定义播放按钮 + 海报图 -->
    <div v-if="isVideo" class="video-player">
      <!-- 播放按钮（海报上方居中，点击后消失） -->
      <div v-if="showPlayButton && !videoError" class="video-overlay video-play-overlay" @click="playVideo">
        <div class="play-btn-circle">
          <svg width="24" height="28" viewBox="0 0 24 28" fill="none">
            <path d="M2 2L22 14L2 26Z" fill="#fff" stroke="none" />
          </svg>
        </div>
      </div>
      <!-- 加载中（仅播放后显示） -->
      <div v-if="videoLoading && !videoError" class="video-overlay video-loading-overlay">
        <span class="loading-spinner"></span>
        <span class="loading-text">视频加载中…</span>
      </div>
      <!-- 浏览器不支持此编码 -->
      <div v-else-if="videoError" class="video-overlay video-error-overlay" @click="retryVideo">
        <span class="error-icon">🎬</span>
        <span class="error-text">浏览器不支持此视频编码</span>
        <span class="error-hint">点击重试 / 下载后用本地播放器观看</span>
      </div>
      <!-- 视频 -->
      <video
        v-show="!videoError"
        ref="videoRef"
        :src="videoUrl"
        :poster="posterUrl"
        :controls="!showPlayButton"
        preload="metadata"
        playsinline
        @play="onPlay"
        @waiting="onWaiting"
        @canplay="onCanPlay"
        @error="onVideoError"
      >
        您的浏览器不支持视频播放
      </video>
      <a :href="downloadUrl" target="_blank" class="video-download-btn" title="下载视频">
        ⬇
      </a>
    </div>

    <!-- 图片：懒加载 -->
    <template v-else>
      <div v-if="!isLoaded && !isError" class="image-placeholder">
        <span class="placeholder-icon">📷</span>
      </div>
      <div v-else-if="isError" class="image-error" @click="retry" title="点击重试">
        <span class="error-icon">🔄</span>
        <span class="retry-text">点击重试</span>
      </div>
      <img
        v-if="isVisible && !isError"
        :src="imgSrc"
        :alt="alt"
        class="alarm-media"
        :class="{ loaded: isLoaded }"
        decoding="async"
        @load="onLoad"
        @error="onError"
      />
    </template>
  </div>
</template>

<style scoped>
.alarm-image-wrapper {
  position: relative;
  overflow: hidden;
  background: #f5f5f5;
  border-radius: 6px;
}

.alarm-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.alarm-media.loaded { opacity: 1; }

.image-placeholder,
.image-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
}
.placeholder-icon { font-size: 28px; opacity: 0.3; }

.image-error {
  background: #fff1f0;
  cursor: pointer;
  flex-direction: column;
  gap: 4px;
}
.image-error:hover { background: #ffe7e7; }
.error-icon { font-size: 20px; }
.retry-text { font-size: 11px; color: #999; }

/* 视频播放区 */
.video-player {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
}
.video-player video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 1; /* 覆盖 .alarm-media 的默认 opacity: 0 */
}
.video-download-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.55);
  color: #fff;
  border-radius: 6px;
  text-decoration: none;
  font-size: 16px;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 2;
}
.video-player:hover .video-download-btn { opacity: 1; }
.video-player:has(.video-error-overlay) .video-download-btn { opacity: 1; }
.video-download-btn:hover { background: rgba(0,0,0,0.8); }

/* 视频加载/错误覆盖层 */
.video-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  z-index: 1;
  pointer-events: none;
}
.video-error-overlay {
  pointer-events: auto;
  cursor: pointer;
  background: rgba(0,0,0,0.6);
  color: #fff;
}
.video-error-overlay:hover { background: rgba(0,0,0,0.75); }
.video-error-overlay .error-icon { font-size: 28px; }
.video-error-overlay .error-text { font-size: 13px; opacity: 0.8; }
.video-loading-overlay { background: rgba(0,0,0,0.5); }
/* 播放按钮覆盖层：透明背景，鼠标悬停时微微变暗 */
.video-play-overlay {
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  transition: background 0.2s ease;
}
.video-play-overlay:hover {
  background: rgba(0,0,0,0.15);
}
.play-btn-circle {
  width: 56px; height: 56px;
  border-radius: 50%;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease, background 0.15s ease;
  box-shadow: 0 2px 12px rgba(0,0,0,0.3);
}
.video-play-overlay:hover .play-btn-circle {
  transform: scale(1.08);
  background: rgba(0,0,0,0.7);
}
.loading-spinner {
  width: 28px; height: 28px;
  border: 3px solid rgba(255,255,255,0.25);
  border-top-color: #fff;
  border-radius: 50%;
  animation: v-spin 0.8s linear infinite;
}
@keyframes v-spin { to { transform: rotate(360deg); } }
.loading-text { color: #fff; font-size: 12px; opacity: 0.7; }
</style>
