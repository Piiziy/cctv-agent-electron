// Electron 없이 브라우저에서 렌더러만 띄우는 개발용 설정.
// window.api 가 없으면 renderer/lib/mock-api.ts 가 대신 붙는다.
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  server: { port: 5174 },
})
