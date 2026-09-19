# 씬스틸러 모바일 (apps/mobile)

사장님이 **매장 밖에 있을 때**의 화면이다. PC 앱이 감시하고, 위험이 잡히면 이 앱이 알려 준다.
실시간 영상은 없다 — 카메라가 살아 있는지, 무슨 일이 있었는지, 그래서 어떻게 할지까지만 한다.

화면은 `design/CCTV 위험감시 UX 뼈대.dc.html` 의 2i–2m 을 따랐고,
색·간격·타이포는 PC 앱과 같은 피그마 토큰(`packages/tokens`)에서 나온다.

| 화면 | 파일 | 뼈대 |
|---|---|---|
| 로그인 (휴대폰 번호) | `src/app/login.tsx` | — |
| 홈 · 매장 상태 | `src/app/(tabs)/index.tsx` | 2k |
| 기록 | `src/app/(tabs)/records.tsx` | 2l |
| 설정 | `src/app/(tabs)/settings.tsx` | 2m |
| 알림 상세 · 대응 | `src/app/events/[id].tsx` | 2j |

뼈대와 일부러 다르게 한 곳:

- **위험 '종류'가 없다.** AI 는 구간과 점수만 주므로 이벤트 이름은 '이상 행동' 하나다.
  그래서 기록의 '종류' 필터와 설정의 '위험 종류별 알림 6/7' 이 사라지고,
  설정은 PC 2g 처럼 "어떤 위험을 알려드릴까요 — 낮음 이상 · 보통 이상 · 높음만" 한 줄로 바뀌었다.
- **'이번 주 요약'에 '신고 N건'이 없다.** 신고 여부를 담는 필드가 API 계약에 없다.
  같은 이유로 "새벽 1시대에 반복" 같은 문장은 같은 시간대에 3건 이상 몰렸을 때만 쓴다.
- **PC 가 꺼져 있으면 '위험 없음'이라고 말하지 않는다.** 볼 수 없었을 뿐이므로
  "PC가 꺼져 있던 동안은 기록이 없습니다" 로 적는다.
- **2j 의 112 안내 카드는 늘 보인다.** 뼈대는 통화 중에 카드가 떠 있는 그림인데, 웹·앱 모두 통화 화면 위에
  무엇을 띄울 수 없다. 그래서 '112 전화하기' 바로 아래에 두었다.
- **2j '전후 영상' · '다른 카메라' 는 누르면 목록이 펼쳐진다.** 뼈대의 버튼 그대로이고, 늘 펼쳐 두면
  '확인했어요'가 화면 아래로 밀린다.

디자인 원본과 맞춘 것 (2026-09-19, 브라우저 390·360 폭으로 뼈대·디자인시스템과 나란히 비교):

- **글꼴** — 디자인시스템 2장대로 본문은 Pretendard, 로고 글자만 Prompt Bold. 웹은 `public/fonts` 에 실어
  둔 글꼴을 쓴다 (Pretendard 는 한글을 조각낸 dynamic subset 판이라 화면에 나온 글자 조각만 받는다).
  네이티브 앱에는 아직 글꼴 파일을 싣지 않아 시스템 글꼴이다 (`src/lib/typography.ts`).
- **로고** — 로그인 화면에 디자인의 로고 마크 + 워드마크 (`src/components/Logo.tsx`).
- **탭바 아이콘** — ⌂ ☰ ⚙ 글자(아이폰에서는 ⚙ 가 컬러 이모지로 나왔다) 대신 24px 선 아이콘 (`src/components/icons.tsx`).
- **2j 버튼 배치** — 112(크게) → 주소 카드 → 전후 영상 → 클립 저장·공유 | 다른 카메라 → 점선 →
  문제 없음(오탐) | 확인했어요. '확인했어요'는 흐름을 끝내는 버튼이라 PC 와 같은 남색. 클립 위에 위험 구간 막대.
- **2l 필터** — 한 줄 (전체 · 미확인 N · 높음 · 카메라 ▾). 카메라는 아래에서 올라오는 목록으로 고른다.
- **2k 상태 점** — 맨 위 한 문장과 카메라 칩 앞에 상태 점 (연결됨 초록 · 끊김 빨강 · 중지 회색).
- **카드 안 여백** — 설정·상세·요약 카드의 글이 카드 테두리에 붙어 있던 것.
- **입력 칸 포커스** — 브라우저의 검은 테두리 대신 디자인의 파란 테두리.
- **넓은 창** — 컴퓨터로 열어도 휴대폰 폭(480)으로 가운데 그린다.

웹에서 고친 동작:

- **'확인했어요'를 누르면 화면이 깨지던 문제.** 서버의 상태 변경 응답은 목록 모양(점수·클립 없음)인데
  상세 전체를 그걸로 바꿔 `anomalyScore.toFixed` 에서 죽었다. 이제 state 만 합친다. 가짜 서버도 진짜처럼
  목록 모양만 돌려주게 바꿨다 (`packages/api`).
- **react-native-web 의 `Alert.alert` 는 아무것도 하지 않는다.** '저장하지 못했습니다' 같은 안내가 소리 없이
  사라졌다 — 웹은 브라우저 기본 창으로 띄운다 (`src/lib/alert.ts`).
- **설정의 테스트 알림** — 웹은 브라우저 알림을 바로 띄우고, 이 브라우저가 알림을 받는 상태(허용 · 거부 ·
  화면을 열어 둔 동안만)를 그대로 적는다. 예전에는 웹에서 "푸시를 받을 수 없습니다"라고만 했다.
- **탭 '기록' 배지** — 처리하거나 새 경고가 와도 그대로였다. 처리 직후, 실서버 시연 중에는 10초마다 다시 읽는다.
- **수면 시간이 비어 있는 새 매장** — `--:--–--:--` 대신 '정하지 않음', 처음 누르면 01:00–07:00 에서 시작.
- **홈 화면에 추가할 때의 앱 이름** — 실서버 시연용 웹앱 정보의 이름이 '씬스틸러 실서버 시연'이었다.
  시연도 실제 앱과 똑같이 보여야 해서 따로 두던 파일을 없애고 `public/manifest.webmanifest`('씬스틸러') 하나를 쓴다.
- **데모 계정은 주소에 `/wanted-test` 가 있을 때만** — 예전에는 `?live=1` 을 붙이면(한 번 연 브라우저는
  붙이지 않아도) 어느 주소에서든 데모 계정으로 들어갔다. 이제 실서버 시연은 따로 구운 `/wanted-test/m/` 빌드이고
  (`EXPO_PUBLIC_LIVE_MODE=1`, `src/lib/config.ts`), `/m/` 빌드에는 데모 계정 값이 들어 있지 않다.

## 아침에 5분 안에 해 볼 것

### 1. 아이폰에서 바로 열기 (계정 필요 없음)

```bash
npm run start -w scene-stealer-mobile
```

터미널에 QR 이 뜬다. 아이폰 **카메라 앱**으로 찍고 Expo Go 로 열면 된다
(Expo Go 는 앱스토어에서 무료). 맥과 아이폰이 같은 와이파이에 있어야 하고,
회사 와이파이처럼 기기 간 통신이 막힌 곳이면 `npm run start -w scene-stealer-mobile -- --tunnel`.

### 2. 브라우저에서 보기

```bash
npm run web -w scene-stealer-mobile
```

`http://localhost:8081`. 손으로 눌러 보기엔 이쪽이 빠르다. 다만 **웹에는 앱 푸시가 없다** —
`expo-notifications` 가 네이티브 모듈이라, 웹은 브라우저 알림(Notification API)으로 대신한다.
설정의 '테스트 알림 보내기'가 이 브라우저가 알림을 받는 상태를 알려 준다.

### 3. 실제 푸시 한 발 쏴 보기

1. 아이폰에서 앱을 연다 → 설정 탭 → 알림 권한을 허용한다.
2. '테스트 알림 보내기' 아래에 `ExponentPushToken[...]` 이 뜬다. 눌러서 복사.
3. 맥에서:

```bash
node apps/mobile/tools/send-push.mjs 'ExponentPushToken[붙여넣기]' ev-1
```

알림이 오고, 탭하면 `ev-1` 상세 화면이 열려야 한다.

> 토큰은 **실기기에서만** 발급된다. 시뮬레이터·웹에서는 발급되지 않고,
> Expo Go 에서 받으려면 Expo 프로젝트 ID 가 필요할 수 있다 — 그때는 `EAS_PROJECT_ID` 를
> 넣고 다시 실행한다(아래 '실제 설치 파일' 참고).
> 서버가 없는 지금은 설정의 '보내기' 버튼이 **로컬 알림**을 띄운다. 알림 → 상세 이동 경로는
> 실제 푸시와 같은 데이터(`data.eventId`)를 쓰므로 그대로 확인된다.

## 실제 설치 파일 (.ipa)

`eas.json` 에 프로필을 넣어 뒀다. 한 번 로그인하면 명령 하나다.

```bash
npx eas login
npx eas init
EAS_PROJECT_ID=<eas init 이 알려 준 id> npx eas build -p ios --profile preview-ios
```

- `preview-ios` = 기기에 설치하는 내부 배포 빌드. **애플 개발자 계정(연 $99)** 이 필요하다.
  기기 UDID 등록까지 EAS 가 대화형으로 안내한다.
- `simulator-ios` = 맥 시뮬레이터용. 애플 계정 없이 Expo 계정만으로 된다.
- 안드로이드 APK 는 `npx eas build -p android --profile preview-android` — 계정 비용이 없다.

`EAS_PROJECT_ID` 는 `app.config.js` 가 읽어 `extra.eas.projectId` 로 넣는다.
이 값이 있어야 실기기에서 Expo 푸시 토큰이 발급된다.

### 맥에서 직접 빌드하는 건 지금 막혀 있다

`npx expo prebuild -p ios` 까지는 되지만, Xcode 26.3 으로 빌드하면 Expo 쪽에서 멈춘다.

```
expo-modules-jsi/apple/Sources/ExpoModulesJSI-Cxx/include/RuntimeScheduler.h:53:26:
error: 'RuntimeScheduler' cannot be annotated with either SWIFT_RETURNS_RETAINED or
SWIFT_RETURNS_UNRETAINED because it is not returning a SWIFT_SHARED_REFERENCE type
```

그 속성을 떼면 이번엔 같은 패키지의 Swift 코드가
`sending 'resultPtr' risks causing data races` 로 줄줄이 터진다 (Package.swift 가
`swiftLanguageModes: [.v6]`, Xcode 26.3 의 Swift 가 Expo 가 맞춰 둔 것보다 엄격하다).
언어 모드를 .v5 로 내리면 이번엔 그 코드가 Swift 5 에서 안 된다. **우리 코드 문제가 아니라
Expo SDK 57 과 Xcode 26.3 의 조합 문제**라서, 셋 다 시도해 보고 원상복구해 뒀다
(expo-modules-jsi 는 57.1.0 이 SDK 57 계열의 마지막 버전이라 올려 볼 것도 없다).

그래서 지금 아이폰에 올리는 길은 **Expo Go** 아니면 **EAS 클라우드 빌드**다.
EAS 는 호환되는 Xcode 가 고정돼 있어 이 문제를 겪지 않는다.

## 서버 연결

기본값은 **가짜 서버**다. 백엔드도 Supabase 프로젝트도 아직 없어서 화면을 이걸로 만들었다.
주소를 넣는 순간 같은 화면이 진짜 서버를 본다 — 화면 코드는 바뀌지 않는다.

`apps/mobile/.env.local`:

```
EXPO_PUBLIC_API_URL=https://api.example.com/v1
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

- `EXPO_PUBLIC_API_URL` 이 비면 `packages/api` 의 가짜 서버를 쓴다.
- Supabase 값이 비면 가짜 로그인 — 아무 번호나 넣고 숫자 6자리면 들어간다.
- 계약은 `docs/api-contract.md`. `packages/api/src/types.ts` 가 그걸 그대로 옮긴 타입이고,
  계약이 바뀌면 거기부터 고치면 타입 에러가 고칠 화면을 알려 준다.

## 확인한 것 / 못 한 것

확인함:

- 웹(`expo start --web`)에서 로그인 → 홈 → 기록 → 상세 → 설정 전 화면. 콘솔 오류 0.
  필터(상태·카메라), 상태 변경(확인/오탐), 알림 설정 저장, 매장 전환까지 눌러서 확인.
- iOS 시뮬레이터(iPhone 17 Pro, iOS 26.3)에서 Expo Go 로 네이티브 실행 — 번들 3.9초, 로그인 화면 정상.
- `node tools/send-push.mjs` 의 요청 경로. Expo 푸시 API 가 요청을 받아
  없는 토큰에 `DeviceNotRegistered` 를 돌려주는 것까지 확인했다.
- 실서버 시연(`/wanted-test/m/`)을 로컬 가짜 백엔드(`apps/demo-web/scripts/stub-backend.mjs`)로 끝까지 —
  노트북 PC 화면의 조각 업로드 → 위험 경고 → 휴대폰 목록 · 상세(클립 재생) → '확인했어요' → PC 경고가 닫히고
  탭 배지가 사라짐. 휴대폰 폭 390 · 360 에서 봤다 (2026-09-19).
- 유닛 테스트 64개 (`npm test -w scene-stealer-mobile` 37, `npm test -w @scene-stealer/api` 27).

못 함:

- **실기기 푸시 수신.** 토큰이 있어야 하고 토큰은 아이폰에서만 나온다. 위 3번이 그 절차다.
- **시뮬레이터에서 손으로 눌러 보기.** 화면 자동 조작에 macOS 손쉬운 사용 권한이 필요한데
  내가 줄 수 없다. 그래서 시뮬레이터에서는 '뜨는 것'까지만 보고, 누르는 것은 웹에서 확인했다.
- **서명된 .ipa.** 애플 개발자 계정이 있어야 한다.
