# 심사위원용 웹 데모 (apps/demo-web)

대회 규정상 APK·exe 를 직접 내려받게 할 수 없고, 스토어 출시도 기간 안에 불가능하다.
그래서 규정이 허용하는 길인 **"핵심 기능을 웹에서 체험할 수 있는 데모"** 를 만든다.

이 페이지 하나가 세 덩어리를 합쳐 놓은 것이다.

```
dist/            이 데모 셸
dist/pc/         매장 PC 수집기 화면  ← apps/pc 렌더러를 브라우저용으로 빌드
dist/m/          사장님 모바일 앱     ← apps/mobile 의 Expo 웹 빌드
```

셋이 같은 출처에 올라가야 셸이 iframe 안의 PC 앱을 직접 조종할 수 있다.

## 심사위원 동선

1. 노트북에서 데모 링크를 연다 → 매장 PC 화면이 그대로 뜬다
2. **QR 을 휴대폰으로 찍는다** → 사장님 앱이 열리고 알림 권한을 묻는다
3. 노트북에서 **데모 시작** → 카메라 5대가 붙고 30초마다 조각이 올라간다
4. **위험 상황 만들기** → PC 에 경고가 뜨고, 같은 순간 휴대폰에 알림이 간다
5. 알림을 탭하면 그 클립이 재생되는 상세 화면 → **확인했어요** 를 누르면 PC 쪽도 함께 해소된다

## 진짜인 것과 흉내인 것

페이지에도 적어 두었지만, 여기서도 분명히 해 둔다.

- **진짜**: 화면, 조각을 나누고 올리는 흐름, 휴대폰 알림(Web Push), 확인·오탐이 양쪽에 동기화되는 것
- **흉내**: "이 구간이 위험하다"는 AI 판정과 서버 응답. 실제 서비스에서는 영상 분석 서버가 맡는다

## 빌드

```bash
npm run build -w @scene-stealer/demo-web
```

환경변수로 조절한다. 전부 비워도 빌드는 되고, 알림만 약해진다.

| 변수 | 없으면 |
|---|---|
| `DEMO_BASE` | `/cctv-agent-electron/` — 사용자 정의 도메인을 쓰면 `/` 로 |
| `DEMO_PUSH_ENDPOINT` | 휴대폰이 **페이지를 열어 둔 동안에만** 알림을 받는다 |
| `DEMO_VAPID_PUBLIC_KEY` | 위와 같음 |
| `DEMO_CLIP_URL` | 같이 구운 `m/clips/sample.mp4` 를 쓴다 |

## 배포 — GitHub Pages

`.github/workflows/demo.yml` 이 `main` 에 올라갈 때마다 굽고 올린다. 처음 한 번만 설정이 필요하다.

1. 저장소 **Settings → Pages → Source** 를 `GitHub Actions` 로
2. (선택) **Settings → Secrets and variables → Actions → Variables** 에 두 개 추가
   - `DEMO_PUSH_ENDPOINT` — 예: `https://scene-stealer-demo-push.<계정>.workers.dev`
   - `DEMO_VAPID_PUBLIC_KEY` — `npm run vapid -w @scene-stealer/demo-push` 가 찍어 주는 공개키

주소는 `https://piiziy.github.io/cctv-agent-electron/` 가 된다.

> Jekyll 이 `_` 로 시작하는 폴더를 지우기 때문에 빌드가 `.nojekyll` 을 같이 넣는다.
> Expo 가 번들을 `_expo/` 에 넣으므로 이게 없으면 모바일 앱이 통째로 404 가 된다.

## 잠금화면 알림을 켜려면

없어도 데모는 돈다. 켜면 심사위원이 **폰을 주머니에 넣었다가 꺼내는** 동선을 체험할 수 있다.
`apps/demo-push/README.md` 를 따라 Cloudflare Worker 를 올린 뒤, 위 2번의 변수 두 개를 넣으면 된다.
Firebase 는 필요 없다 — 웹 푸시는 VAPID 키쌍만 쓴다.

## 테스트셋 영상 갈아끼우기

지금은 자리만 채운 30초짜리 무지 영상이 들어 있다.

```bash
cp <받은영상>.mp4 apps/mobile/public/clips/sample.mp4
npm run build -w @scene-stealer/demo-web
```

파일 이름만 맞추면 되고, 다른 곳은 손대지 않아도 된다.
가짜 카메라에 먹여 진짜로 잘라 보려면 `apps/pc` 의 `tools/fake-camera` 를 쓴다.
