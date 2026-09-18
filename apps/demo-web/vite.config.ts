import { defineConfig } from 'vite'

// GitHub Pages 의 저장소 하위 경로에 올라간다. 자산 주소가 이 경로를 알아야 한다.
export default defineConfig(({ command }) => ({
  // 개발 중에는 루트에서 띄운다 — 아래 프록시 경로(/pc, /m)와 맞아야 하기 때문이다.
  base: process.env.DEMO_BASE ?? (command === 'serve' ? '/' : '/cctv-agent-electron/'),
  server: {
    port: 5180,
    // 배포본에서는 PC 앱과 모바일 앱이 같은 출처의 하위 폴더에 있다. 셸이 iframe 안을
    // 직접 만져야 하므로 개발 중에도 같은 출처로 보여야 한다 — 그래서 각자의 dev 서버로 프록시한다.
    //   npm run ui -w cctv-agent                 → 5174 (PC 앱)
    //   npm run web -w scene-stealer-mobile      → 8081 (모바일 앱)
    proxy: {
      '/pc': { target: 'http://localhost:5174', changeOrigin: true, rewrite: (path) => path.replace(/^\/pc/, '') },
      '/m': { target: 'http://localhost:8081', changeOrigin: true, rewrite: (path) => path.replace(/^\/m/, '') },
    },
  },
  build: { outDir: 'dist', emptyOutDir: false },
}))
