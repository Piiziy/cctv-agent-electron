import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// 기본은 도메인 루트. 하위 경로에 올릴 때만 DEMO_BASE 로 알려 준다.
export default defineConfig(() => ({
  // 개발 중에는 루트에서 띄운다 — 아래 프록시 경로(/pc, /m)와 맞아야 하기 때문이다.
  base: process.env.DEMO_BASE ?? '/',
  // scripts/demo-video.mjs 가 자른 시연 영상(.generated/demo-video/)을 /demo-video/ 로 내보낸다.
  // 개발 서버는 그대로 서빙하고(구간 요청 지원 — 영상 탐색에 필요), 빌드는 dist 로 복사한다.
  publicDir: resolve(__dirname, '.generated'),
  server: {
    port: 5180,
    // 배포본에서는 PC 앱과 모바일 앱이 같은 출처의 하위 폴더에 있다. 셸이 iframe 안을
    // 직접 만져야 하므로 개발 중에도 같은 출처로 보여야 한다 — 그래서 각자의 dev 서버로 프록시한다.
    //   npm run ui -w cctv-agent                 → 5174 (PC 앱)
    //   npm run web -w scene-stealer-mobile      → 8081 (모바일 앱)
    // /wanted-test/pc · /wanted-test/m 은 실서버 시연 빌드 자리다. 개발 중에 그쪽을 보려면 두 dev 서버를
    // VITE_LIVE_MODE=1 · EXPO_PUBLIC_LIVE_MODE=1 과 LIVE_* 값으로 띄운다 (배포 빌드는 build-all.mjs 가 나눠 굽는다).
    proxy: {
      '/wanted-test/pc': {
        target: 'http://localhost:5174',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/wanted-test\/pc/, ''),
      },
      '/wanted-test/m': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/wanted-test\/m/, ''),
      },
      '/pc': { target: 'http://localhost:5174', changeOrigin: true, rewrite: (path) => path.replace(/^\/pc/, '') },
      '/m': { target: 'http://localhost:8081', changeOrigin: true, rewrite: (path) => path.replace(/^\/m/, '') },
    },
  },
  // `vite preview` 는 굽힌 dist 를 그대로 보여 줘야 한다. 비워 두지 않으면 위 개발용 프록시를
  // 물려받아 /pc · /m 을 떠 있지도 않은 개발 서버로 보낸다 (500).
  preview: { proxy: {} },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        // `/`            가짜 서버로 도는 데모
        main: resolve(__dirname, 'index.html'),
        // `/wanted-test` 실서버 시연 (대회 제출용 비공개 주소)
        wantedTest: resolve(__dirname, 'wanted-test/index.html'),
      },
    },
  },
}))
