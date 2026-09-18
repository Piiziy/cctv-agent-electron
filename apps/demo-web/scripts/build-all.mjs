#!/usr/bin/env node
/**
 * 심사위원용 웹 데모 한 덩어리로 굽기.
 *
 *   dist/              데모 셸 — 가짜 서버로 도는 데모
 *   dist/wanted-test/  실서버 시연 셸 — 대회 제출용 비공개 주소
 *   dist/pc/           매장 PC 수집기 화면 — apps/pc 의 렌더러를 브라우저용으로 빌드
 *   dist/m/            사장님 모바일 앱 — apps/mobile 의 Expo 웹 빌드
 *   dist/demo-video/   시연 영상과 30초 조각 — 레포루트/public/demo-video 원본으로 만든다
 *
 * 넷이 같은 출처에 올라가야 데모 셸이 iframe 안의 PC 앱을 직접 만질 수 있다.
 * PC·모바일 앱은 한 벌이고, `?live=1` 로 열렸을 때만 실서버 설정(LIVE_*)을 쓴다.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDemoVideos } from './demo-video.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const demoWeb = resolve(here, '..')
const repo = resolve(demoWeb, '../..')
const dist = resolve(demoWeb, 'dist')

/**
 * 앱이 올라갈 경로. 기본은 도메인 루트다.
 * GitHub Pages 처럼 저장소 하위 경로에 올릴 때만 DEMO_BASE 로 알려 준다.
 */
const base = process.env.DEMO_BASE ?? '/'
const pushEndpoint = process.env.DEMO_PUSH_ENDPOINT ?? ''
const vapidKey = process.env.DEMO_VAPID_PUBLIC_KEY ?? ''

/**
 * 실서버 시연(/wanted-test) 설정. Vercel 프로젝트 환경변수로 넣는다 (docs/demo-submission.md).
 * 없어도 빌드는 된다 — /wanted-test 가 무엇이 빠졌는지 화면에 알린다. `/` 데모는 영향이 없다.
 * 전부 번들에 박혀 공개되는 값이다. 데모 전용 계정·매장·기기 토큰만 넣는다.
 */
const LIVE_KEYS = [
  'LIVE_API_URL',
  'LIVE_SUPABASE_URL',
  'LIVE_SUPABASE_ANON_KEY',
  'LIVE_EMAIL',
  'LIVE_PASSWORD',
  'LIVE_DEVICE_TOKEN',
  'LIVE_STORE_ID',
]
/**
 * 서비스 도메인은 고정이라 기본값으로 박아 둔다 — 웹은 app.scene-stealer.site, API 는 api.scene-stealer.site.
 * 백엔드 CORS 도 같은 최상위 도메인만 받는다. 다른 서버를 볼 때만 LIVE_API_URL 로 바꾼다.
 */
const LIVE_DEFAULTS = { LIVE_API_URL: 'https://api.scene-stealer.site' }
const live = Object.fromEntries(
  LIVE_KEYS.map((key) => [key, (process.env[key] ?? '').trim() || (LIVE_DEFAULTS[key] ?? '')]),
)
/** 앱마다 번들러가 받아 주는 접두사가 다르다 (Vite: VITE_, Expo: EXPO_PUBLIC_). */
const liveEnv = (prefix, keys = LIVE_KEYS) => Object.fromEntries(keys.map((key) => [`${prefix}${key}`, live[key]]))

/**
 * 워크스페이스에서 보이는 패키지의 CLI 를 node 로 직접 부른다.
 * `npx` 는 윈도에서 npx.cmd 라 execFile 로 부를 수 없다 (셸을 거치면 공백 든 경로가 깨진다).
 */
const runBin = (cwd, pkg, args, options = {}) => {
  const manifestPath = createRequire(resolve(cwd, 'package.json')).resolve(`${pkg}/package.json`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const entry = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[pkg]
  if (!entry) throw new Error(`${pkg} 의 실행 파일을 찾지 못했습니다`)
  console.log(`\n$ ${pkg} ${args.join(' ')}`)
  execFileSync(process.execPath, [resolve(dirname(manifestPath), entry), ...args], { stdio: 'inherit', cwd, ...options })
}

console.log(`베이스 경로: ${base}`)
console.log(`푸시 엔드포인트: ${pushEndpoint || '(없음 — 휴대폰은 로컬 알림으로 동작)'}`)
// 값은 찍지 않는다 — 빌드 로그는 공유되는 경우가 많다.
const missingLive = LIVE_KEYS.filter((key) => key !== 'LIVE_STORE_ID' && !live[key])
console.log(`실서버 시연 설정: ${missingLive.length === 0 ? '있음' : `빠짐 → ${missingLive.join(', ')}`}`)

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

// 0. 시연 영상을 30초 조각으로. 셸 빌드(3)가 .generated/ 를 dist 로 복사한다.
buildDemoVideos()

// 1. 매장 PC 화면.
// apps/pc 안에서 돌린다 — tailwind.config.js 의 content 경로가 상대경로라
// 레포 루트에서 돌리면 클래스를 하나도 못 찾고 `bg-page` 가 없다며 죽는다.
runBin(resolve(repo, 'apps/pc'), 'vite', [
  'build',
  '--config', 'vite.ui.config.ts',
  '--base', `${base}pc/`,
  '--outDir', resolve(dist, 'pc'),
  '--emptyOutDir',
], { env: { ...process.env, ...liveEnv('VITE_') } })

// 2. 모바일 앱. Expo 는 출력 경로를 인자로 받고, 베이스 경로는 app.json 의 experiments.baseUrl 이 정한다.
// --clear: EXPO_PUBLIC_* 는 번들에 글자 그대로 박히는데, Metro 캐시(임시 폴더)는 값이 바뀐 걸 모른다.
// 비우지 않으면 로컬에서 LIVE_* 를 바꿔 구워도 예전 값이 남는다. (Vercel 은 매번 새 컨테이너라 상관없다.)
const mobileOut = resolve(dist, 'm')
runBin(resolve(repo, 'apps/mobile'), 'expo', ['export', '-p', 'web', '--clear', '--output-dir', mobileOut], {
  env: {
    ...process.env,
    EXPO_PUBLIC_DEMO: '1',
    EXPO_PUBLIC_PUSH_ENDPOINT: pushEndpoint,
    EXPO_PUBLIC_VAPID_PUBLIC_KEY: vapidKey,
    // 앱이 올라갈 경로. 정적 자산 주소(EXPO_WEB_BASE_URL)와 런타임 주소(EXPO_PUBLIC_*)가 같아야 한다.
    EXPO_WEB_BASE_URL: `${base}m`.replace(/\/+$/, ''),
    EXPO_PUBLIC_WEB_BASE_URL: `${base}m`.replace(/\/+$/, ''),
    // 같이 구운 영상을 가리킨다. 테스트셋이 들어오면 apps/mobile/public/clips/ 의 파일만 갈아끼우면 된다.
    EXPO_PUBLIC_CLIP_URL: process.env.DEMO_CLIP_URL ?? `${base}m/clips/sample.mp4`,
    // 실서버 시연. 모바일은 업로드를 하지 않으므로 기기 토큰은 넘기지 않는다.
    ...liveEnv('EXPO_PUBLIC_', ['LIVE_API_URL', 'LIVE_SUPABASE_URL', 'LIVE_SUPABASE_ANON_KEY', 'LIVE_EMAIL', 'LIVE_PASSWORD', 'LIVE_STORE_ID']),
  },
})

// 홈 화면에 추가할 때 쓰는 아이콘. 아이폰은 홈 화면에 추가한 웹앱만 웹 푸시를 받는다 (manifest 는 public/ 에 있다).
const mobileIcon = resolve(repo, 'apps/mobile/assets/images/icon.png')
if (existsSync(mobileIcon) && !existsSync(resolve(mobileOut, 'icon.png'))) cpSync(mobileIcon, resolve(mobileOut, 'icon.png'))

// 라우터가 브라우저에서 도는 SPA 다. 정적 호스팅은 /m/events/ev-1 을 모르니 404 도 같은 문서를 주게 한다.
const mobileIndex = resolve(mobileOut, 'index.html')
if (existsSync(mobileIndex)) cpSync(mobileIndex, resolve(mobileOut, '404.html'))

// PC 앱과 모바일 앱이 같은 영상을 튼다. 두 번 굽지 않게 셸 옆에 한 벌만 둔다.
const clipsSrc = resolve(repo, 'apps/mobile/public/clips')
if (existsSync(clipsSrc)) cpSync(clipsSrc, resolve(dist, 'clips'), { recursive: true })

// 3. 데모 셸.
runBin(demoWeb, 'vite', ['build'], {
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
console.log(`  index.html              ${size(shellIndex)}`)
console.log(`  wanted-test/index.html  ${size(resolve(dist, 'wanted-test/index.html'))}`)
console.log(`  pc/index.html           ${size(resolve(dist, 'pc/index.html'))}`)
console.log(`  m/index.html            ${size(mobileIndex)}`)
console.log(`  demo-video/manifest.json ${size(resolve(dist, 'demo-video/manifest.json'))}`)
