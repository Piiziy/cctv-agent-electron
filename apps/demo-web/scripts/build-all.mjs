#!/usr/bin/env node
/**
 * 심사위원용 웹 데모 한 덩어리로 굽기.
 *
 *   dist/            데모 셸 (이 페이지)
 *   dist/pc/         매장 PC 수집기 화면 — apps/pc 의 렌더러를 브라우저용으로 빌드
 *   dist/m/          사장님 모바일 앱 — apps/mobile 의 Expo 웹 빌드
 *
 * 셋이 같은 출처에 올라가야 데모 셸이 iframe 안의 PC 앱을 직접 만질 수 있다.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const demoWeb = resolve(here, '..')
const repo = resolve(demoWeb, '../..')
const dist = resolve(demoWeb, 'dist')

/** GitHub Pages 의 하위 경로. 사용자 정의 도메인을 쓰면 '/' 로 바꾼다. */
const base = process.env.DEMO_BASE ?? '/cctv-agent-electron/'
const pushEndpoint = process.env.DEMO_PUSH_ENDPOINT ?? ''
const vapidKey = process.env.DEMO_VAPID_PUBLIC_KEY ?? ''

const run = (command, args, options = {}) => {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  execFileSync(command, args, { stdio: 'inherit', cwd: repo, ...options })
}

console.log(`베이스 경로: ${base}`)
console.log(`푸시 엔드포인트: ${pushEndpoint || '(없음 — 휴대폰은 로컬 알림으로 동작)'}`)

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

// 1. 매장 PC 화면.
// apps/pc 안에서 돌린다 — tailwind.config.js 의 content 경로가 상대경로라
// 레포 루트에서 돌리면 클래스를 하나도 못 찾고 `bg-page` 가 없다며 죽는다.
run('npx', [
  'vite', 'build',
  '--config', 'vite.ui.config.ts',
  '--base', `${base}pc/`,
  '--outDir', resolve(dist, 'pc'),
  '--emptyOutDir',
], { cwd: resolve(repo, 'apps/pc') })

// 2. 모바일 앱. Expo 는 출력 경로를 인자로 받고, 베이스 경로는 app.json 의 experiments.baseUrl 이 정한다.
const mobileOut = resolve(dist, 'm')
run('npx', ['expo', 'export', '-p', 'web', '--output-dir', mobileOut], {
  cwd: resolve(repo, 'apps/mobile'),
  env: {
    ...process.env,
    EXPO_PUBLIC_DEMO: '1',
    EXPO_PUBLIC_PUSH_ENDPOINT: pushEndpoint,
    EXPO_PUBLIC_VAPID_PUBLIC_KEY: vapidKey,
    EXPO_PUBLIC_WEB_BASE_URL: `${base}m`.replace(/\/+$/, ''),
    // 같이 구운 영상을 가리킨다. 테스트셋이 들어오면 apps/mobile/public/clips/ 의 파일만 갈아끼우면 된다.
    EXPO_PUBLIC_CLIP_URL: process.env.DEMO_CLIP_URL ?? `${base}m/clips/sample.mp4`,
  },
})

// 라우터가 브라우저에서 도는 SPA 다. 정적 호스팅은 /m/events/ev-1 을 모르니 404 도 같은 문서를 주게 한다.
const mobileIndex = resolve(mobileOut, 'index.html')
if (existsSync(mobileIndex)) cpSync(mobileIndex, resolve(mobileOut, '404.html'))

// PC 앱과 모바일 앱이 같은 영상을 튼다. 두 번 굽지 않게 셸 옆에 한 벌만 둔다.
const clipsSrc = resolve(repo, 'apps/mobile/public/clips')
if (existsSync(clipsSrc)) cpSync(clipsSrc, resolve(dist, 'clips'), { recursive: true })

// 3. 데모 셸.
run('npx', ['vite', 'build'], {
  cwd: demoWeb,
  env: { ...process.env, DEMO_BASE: base, VITE_PUSH_ENDPOINT: pushEndpoint },
})

// GitHub Pages 는 기본적으로 Jekyll 을 태우는데, Jekyll 은 `_` 로 시작하는 폴더를 지운다.
// Expo 는 번들을 `_expo/` 에 넣는다 — 이 파일이 없으면 앱이 통째로 404 가 된다.
writeFileSync(resolve(dist, '.nojekyll'), '')

// 셸도 같은 이유로 404 대비를 해 둔다.
const shellIndex = resolve(dist, 'index.html')
if (existsSync(shellIndex)) cpSync(shellIndex, resolve(dist, '404.html'))

const size = (path) => (existsSync(path) ? `${(readFileSync(path).length / 1024).toFixed(0)}KB` : '없음')
console.log(`\n완료 → ${dist}`)
console.log(`  index.html  ${size(shellIndex)}`)
console.log(`  pc/index.html  ${size(resolve(dist, 'pc/index.html'))}`)
console.log(`  m/index.html   ${size(mobileIndex)}`)
