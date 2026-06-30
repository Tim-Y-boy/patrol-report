<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

const props = withDefaults(defineProps<{
  fileToken: string
  recordId?: string
  alt?: string
  aspectRatio?: string
}>(), {
  alt: '巡检图片',
  aspectRatio: '4/3',
})

const VIDEO_EXTENSIONS = /\.(mp4|mov|webm|avi|mkv|flv|wmv|m4v|3gp)$/i
const isVideo = computed(() => VIDEO_EXTENSIONS.test(props.alt || ''))

// 视频下载 URL
const downloadUrl = computed(() =>
  `/api/image/${props.fileToken}?record_id=${props.recordId || ''}&download=1`
)

// 图片逻辑
const imgRef = ref<HTMLElement>()
const isLoaded = ref(false)
const isError = ref(false)
const isVisible = ref(false)
const imgSrc = ref('')

let observer: IntersectionObserver | null = null

function loadImage() {
  if (imgSrc.value || isError.value) return
  imgSrc.value = `/api/image/${props.fileToken}?record_id=${props.recordId || ''}`
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
  imgSrc.value = `/api/image/${props.fileToken}?record_id=${props.recordId || ''}&_t=${Date.now()}`
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
    <!-- 视频：可点击下载 -->
    <a v-if="isVideo" :href="downloadUrl" target="_blank" class="video-download" title="点击下载视频">
      <span class="video-icon">🎬</span>
      <span class="video-label">点击下载视频</span>
    </a>

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

/* 视频下载区 */
.video-download {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: #1a1a2e;
  color: #fff;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.2s;
}
.video-download:hover { background: #2a2a4e; }
.video-icon { font-size: 32px; }
.video-label { font-size: 12px; opacity: 0.8; }
</style>
