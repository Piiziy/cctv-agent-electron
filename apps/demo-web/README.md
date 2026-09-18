# 심사위원용 웹 데모 (apps/demo-web)

대회 규정상 APK·exe 를 직접 내려받게 할 수 없고, 스토어 출시도 기간 안에 불가능하다.
그래서 규정이 허용하는 길인 **"핵심 기능을 웹에서 체험할 수 있는 데모"** 를 만든다.

이 페이지 하나가 여러 덩어리를 합쳐 놓은 것이다.

```
dist/              가짜 서버 데모 셸 (/)
dist/wanted-test/  실서버 시연 셸 (/wanted-test) — 대회 제출용 비공개 주소
dist/pc/           매장 PC 수집기 화면  ← apps/pc 렌더러를 브라우저용으로 빌드
dist/m/            사장님 모바일 앱     ← apps/mobile 의 Expo 웹 빌드
dist/demo-video/   시연 영상 + 30초 조각 ← 레포루트/public/demo-video 원본을 빌드가 자른다
```

같은 출처에 올라가야 셸이 iframe 안의 PC 앱을 직접 조종할 수 있다.

## 실서버 시연 (/wanted-test)

셸이 PC 앱을 `?live=1` 로 연다. 그러면 PC 앱이 데모 계정으로 **실제 백엔드**에 로그인하고,
`public/demo-video` 의 영상을 카메라 삼아 30초 조각을 `POST /v1/segments` 로 올린다. 경고는 서버 AI 가
판정한 것만 뜬다. 휴대폰 QR 은 `/m/?live=1` — 같은 데모 계정으로 열린다.

설정은 `LIVE_*` 환경변수다 (아래 표). 백엔드 CORS 는 같은 최상위 도메인의 https 페이지만 받으므로,
웹 데모도 그 도메인의 하위 주소(Vercel 사용자 지정 도메인)로 열어야 한다 — `*.vercel.app` 에서는 막힌다.
흐름·남은 작업은 [`docs/demo-target-architecture.md`](../../docs/demo-target-architecture.md).

```bash
node scripts/demo-video.mjs                       # 영상만 미리 잘라 보기 → .generated/demo-video/
npm run build -w @scene-stealer/demo-web          # 전체 굽기
npm run preview -w @scene-stealer/demo-web        # 구운 것 띄우기 → http://localhost:4173/wanted-test/
```

## 심사위원 동선

1. 노트북에서 데모 링크를 연다 → 매장 PC 화면이 그대로 뜬다
2. **QR 을 휴대폰으로 찍는다** → 사장님 앱이 열리고 알림 권한을 묻는다
3. 노트북에서 **데모 시작** → 카메라 5대가 붙고 30초마다 조각이 올라간다
4. **위험 상황 만들기** → PC 에 경고가 뜨고, 같은 순간 휴대폰에 알림이 간다
5. 알림을 탭하면 그 클립이 재생되는 상세 화면 → **확인했어요** 로 처리한다

## 진짜인 것과 흉내인 것

페이지에도 적어 두었지만, 여기서도 분명히 해 둔다.

- **진짜**: 화면, 조각을 나누고 올리는 흐름, 휴대폰 알림(Web Push)
- **흉내**: "이 구간이 위험하다"는 AI 판정과 서버 응답. 실제 서비스에서는 영상 분석 서버가 맡는다

## 빌드

```bash
npm run build -w @scene-stealer/demo-web
```

환경변수로 조절한다. 전부 비워도 빌드는 되고, 알림만 약해진다.

| 변수 | 없으면 |
|---|---|
| `DEMO_BASE` | `/` (도메인 루트). GitHub Pages 처럼 하위 경로일 때만 지정한다 |
| `DEMO_PUSH_ENDPOINT` | 휴대폰이 **페이지를 열어 둔 동안에만** 알림을 받는다 |
| `DEMO_VAPID_PUBLIC_KEY` | 위와 같음 |
| `DEMO_CLIP_URL` | 같이 구운 `m/clips/sample.mp4` 를 쓴다 |
| `LIVE_SUPABASE_URL` · `LIVE_SUPABASE_ANON_KEY` · `LIVE_EMAIL` · `LIVE_PASSWORD` · `LIVE_DEVICE_TOKEN` | `/wanted-test` 가 빠진 이름을 화면에 띄운다. `/` 는 영향 없음 |
| `LIVE_API_URL` | `https://api.scene-stealer.site` |
| `LIVE_STORE_ID` | 데모 계정의 첫 매장 |
| `DEMO_VIDEO_HEIGHT` · `DEMO_VIDEO_FPS` · `DEMO_SEGMENT_SECONDS` | 480 · 15 · 30 |

`LIVE_*` 는 번들에 박혀 공개된다. 데모 전용 계정·매장·기기 토큰만 넣는다.

## 배포 — Vercel

저장소 루트의 `vercel.json` 이 빌드 명령과 출력 폴더를 이미 갖고 있다.
Vercel 에서 이 저장소를 Import 할 때 **Root Directory 를 비워 두기만** 하면 된다.

| 항목 | 값 |
|---|---|
| Root Directory | (비움 — 저장소 루트) |
| Framework Preset | Other |
| Build Command | `vercel.json` 이 지정 (`npm run build -w @scene-stealer/demo-web`) |
| Output Directory | `vercel.json` 이 지정 (`apps/demo-web/dist`) |
| 환경변수 | 없어도 됨 |

Root Directory 를 `apps/pc` 같은 하위 폴더로 잡으면 안 된다 — PC 앱만 나오고
데모 셸과 모바일 앱이 빠진다. 워크스페이스라 설치도 루트에서 해야 한다.

`vercel.json` 의 rewrite 는 모바일 앱이 SPA 라서 있다. `/m/` 아래 경로는 실제 파일이
없으면 `index.html` 로 넘겨야 라우터가 받는다 (실제 파일이 있으면 그게 먼저 나간다).
`/wanted-test` (끝에 `/` 없이) 도 같은 식으로 `wanted-test/index.html` 로 넘긴다.

### GitHub Pages 로 가야 한다면

`.github/workflows/demo.yml` 이 예비로 남아 있다. 자동 실행은 꺼 두었으니
Settings → Pages → Source 를 `GitHub Actions` 로 바꾸고 Actions 탭에서 손으로 실행한다.
그때는 저장소 하위 경로에 올라가므로 워크플로가 `DEMO_BASE=/cctv-agent-electron/` 를 넘긴다.

## 잠금화면 알림을 켜려면

없어도 데모는 돈다. 켜면 심사위원이 **폰을 주머니에 넣었다가 꺼내는** 동선을 체험할 수 있다.
`apps/demo-push/README.md` 를 따라 Cloudflare Worker 를 올린 뒤,
Vercel 프로젝트 설정의 Environment Variables 에 두 개를 넣는다.

| 이름 | 값 |
|---|---|
| `DEMO_PUSH_ENDPOINT` | `https://<워커주소>.workers.dev` |
| `DEMO_VAPID_PUBLIC_KEY` | `npm run vapid -w @scene-stealer/demo-push` 가 찍어 주는 공개키 |
Firebase 는 필요 없다 — 웹 푸시는 VAPID 키쌍만 쓴다.

## 테스트셋 영상 갈아끼우기

지금은 자리만 채운 30초짜리 무지 영상이 들어 있다.

```bash
cp <받은영상>.mp4 apps/mobile/public/clips/sample.mp4
npm run build -w @scene-stealer/demo-web
```

파일 이름만 맞추면 되고, 다른 곳은 손대지 않아도 된다.
가짜 카메라에 먹여 진짜로 잘라 보려면 `apps/pc` 의 `tools/fake-camera` 를 쓴다.
