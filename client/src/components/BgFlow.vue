<template>
  <div class="bg-flow" aria-hidden="true">
    <div class="bg-band band-1"></div>
    <div class="bg-band band-2"></div>
    <div class="bg-band band-3"></div>
    <div class="bg-band band-4"></div>
    <div class="bg-band band-5"></div>
  </div>
</template>

<style scoped>
.bg-flow {
  position: fixed;
  inset: 0;
  z-index: -2;
  overflow: hidden;
  pointer-events: none;
}

.bg-band {
  position: absolute;
  top: -10vh;
  height: 120vh;
  filter: blur(60px);
  opacity: 0.48;
  will-change: transform;
}

/* ── 柱体 1：翠绿宽柱 ── */
.band-1 {
  width: 28vw;
  background: #00a651;
  animation: flowRight 22s linear infinite;
}

/* ── 柱体 2：深绿中柱 ── */
.band-2 {
  width: 22vw;
  background: #008a3d;
  animation: flowRight 26s linear infinite;
  animation-delay: -6s;
}

/* ── 柱体 3：亮绿窄柱 ── */
.band-3 {
  width: 18vw;
  background: #2db864;
  animation: flowRight 20s linear infinite;
  animation-delay: -12s;
}

/* ── 柱体 4：青绿中柱 ── */
.band-4 {
  width: 24vw;
  background: #1ea85c;
  animation: flowRight 30s linear infinite;
  animation-delay: -18s;
}

/* ── 柱体 5：浅绿宽柱 ── */
.band-5 {
  width: 20vw;
  background: #3cc97a;
  animation: flowRight 24s linear infinite;
  animation-delay: -3s;
}

/* 统一从左到右，到头后无缝循环 */
@keyframes flowRight {
  0%   { transform: translate(-35vw, 0); }
  100% { transform: translate(110vw, 0); }
}
</style>
