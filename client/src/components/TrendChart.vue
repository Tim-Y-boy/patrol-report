<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

// 注册必需的组件（按需引入，减少 ~60% 打包体积）
echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, CanvasRenderer])

const props = withDefaults(defineProps<{
  type: 'bar' | 'line' | 'pie'
  data: any[]
  labels?: string[]
  height?: string
  barColor?: string
  lineColor?: string
}>(), {
  height: '240px',
  barColor: '#00a651',
  lineColor: '#d63031',
})

const chartRef = ref<HTMLDivElement>()
let chartInstance: echarts.ECharts | null = null

function renderChart() {
  if (!chartRef.value) return

  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value)
  }

  let option: any

  if (props.type === 'bar') {
    option = {
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 16, top: 10, bottom: 60 },
      xAxis: {
        type: 'category',
        data: props.labels || [],
        axisLabel: { fontSize: 11, color: '#999', rotate: 45, overflow: 'truncate', width: 80 },
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 11, color: '#999' },
        splitLine: { lineStyle: { color: '#f0f0f0' } },
      },
      series: [{
        type: 'bar',
        data: props.data,
        itemStyle: {
          color: props.barColor,
          borderRadius: [4, 4, 0, 0],
        },
        barWidth: 24,
      }],
    }
  } else if (props.type === 'line') {
    option = {
      tooltip: { trigger: 'axis' },
      grid: { left: 44, right: 16, top: 10, bottom: 60 },
      xAxis: {
        type: 'category',
        data: props.labels || [],
        axisLabel: { fontSize: 11, color: '#999', rotate: 45 },
        boundaryGap: false,
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 11, color: '#999' },
        splitLine: { lineStyle: { color: '#f0f0f0' } },
      },
      series: [{
        type: 'line',
        data: props.data,
        smooth: true,
        lineStyle: { color: props.lineColor, width: 2 },
        itemStyle: { color: props.lineColor },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: props.lineColor + '40' },
            { offset: 1, color: props.lineColor + '05' },
          ]),
        },
      }],
    }
  } else if (props.type === 'pie') {
    const colors = ['#00a651', '#2d8a4e', '#d63031', '#e17055', '#0984e3', '#6c5ce7', '#fdcb6e', '#636e72', '#b2bec3']
    option = {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      series: [{
        type: 'pie',
        radius: ['45%', '75%'],
        center: ['50%', '50%'],
        data: props.data,
        label: { fontSize: 12, color: '#666' },
        itemStyle: {
          borderRadius: 4,
          borderColor: '#fff',
          borderWidth: 2,
        },
        color: colors,
      }],
    }
  }

  chartInstance.setOption(option, true)
}

function handleResize() {
  chartInstance?.resize()
}

onMounted(() => {
  renderChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
})

watch(() => [props.data, props.labels], () => {
  renderChart()
}, { deep: true })
</script>

<template>
  <div ref="chartRef" :style="{ height, width: '100%' }"></div>
</template>
