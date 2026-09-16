# 프론트 작업 지시서 — PC 앱 리디자인 (2a ~ 2g)

> 새 Claude Code 세션을 이 워크트리에서 열고 **"docs/frontend-task.md 읽고 시작해줘"** 라고 하면 된다.
> 백엔드(`scene-stealer-back`)는 별도 세션이 `feat/scene-stealer-domain-api` 워크트리에서 병렬로 만들고 있다.

작업 경로: `/Users/kwonheekeun/Documents/GitHub/cctv-agent/.claude/worktrees/scene-stealer-pc-redesign`
브랜치: `feat/scene-stealer-pc-redesign` (base `main`)
**이 워크트리 안에서만 작업한다.** 원본 레포는 건드리지 않는다.

---

## 먼저 읽을 것

| 파일 | 역할 |
|---|---|
| `design/씬스틸러 디자인시스템.dc.html` | 토큰·타이포·형태·컴포넌트 **단일 출처**. 인라인 스타일 값이 정답 |
| `design/씬스틸러 PC 앱.dc.html` | 구현 대상 7화면(id 배지 `2a`~`2g`) 하이파이 |
| `design/CCTV 위험감시 UX 뼈대.dc.html` | 왜 그렇게 만들었는지 — 정보 구조의 근거 |
| `design/ds/fig-tokens.css` | 피그마 변수 94개 (light/dark) |
| `docs/api-contract.md` | 프론트·백엔드 공유 계약. **화면별 엔드포인트 매핑은 9절** |
| `docs/ai-gate-contract.md` | AI 종류 판정이 왜 아직 없는지 (5절 폴백이 프론트에 영향) |
| `handoff/API-요구사항.md` | 기능 근거 |
| `handoff/CLAUDE-CODE-프롬프트.md` | 화면별 주의점 (73~78줄) |

---

## 작업 순서

### 1. 디자인 시스템 이식

- `design/ds/fig-tokens.css`를 `src/renderer/styles`에 넣고 Tailwind를 이 CSS 변수로 매핑
- 폰트: **Pretendard**(본문) + **Prompt 700**(로고 워드마크만). 전역 `letter-spacing: -0.01em`, `tabular-nums`
- `src/renderer/components/ui.tsx`를 디자인시스템 **4장 '컴포넌트'** 기준으로 교체:
  `Button`(primary navy r12 / action blue r8 / secondary outline / danger / loading / link),
  `Input`(48px, r12, default·focus·error·done), `Tag`(r99, 위험도·상태 색), `StatusDot`,
  `Toggle`(44×24), `Segmented`, `Pagination`, `Card`(r12, `shadow 2px 4px 20px rgba(0,0,0,.04)`),
  `CameraTile`, `RiskCard`, `TopNav`(높이 76 — 로고 + 메뉴 4개 + 매장선택 칩 + 사용자 + 로그아웃)
- **완료 확인:** `/dev/components` 라우트에 모든 컴포넌트 상태를 나열

### 2. 셸 + 라우팅

- 상단 `TopNav` (사이드바 없음). 메뉴: 실시간 / 위험 기록(미확인 배지) / 카메라 / 설정
- 페이지 배경 `#F7F8F9`, 좌우 여백 40px, 카드 간 16px
- 라우트: `/onboarding`(2a) `/cameras/add`(2b) `/live`(2c) `/events`(2e) `/events/:id`(2f) `/settings`(2g)
- **2d 위험 팝업은 라우트가 아니다** — 어느 화면 위에서든 뜨는 always-on-top 모달
  (Electron `BrowserWindow` `alwaysOnTop` + 포커스)
- 기존 `App.tsx`의 `서버설정 → 카메라선택 → 대시보드` 흐름을 `2a → 2b → 2c`로 대체.
  서버 주소/토큰 입력은 `/settings/advanced`로 이동

### 3. 화면 하나씩 — 2a → 2b → 2c → 2d → 2e → 2f → 2g

화면별로 꼭 짚을 점:

- **2b** — 3단계 위저드, 좌우 패널 `opacity .55`로 비활성 표현. 기존 `CameraSelect`/`CameraSetup`
  로직(ONVIF 검색, probe, 프로필)을 **재사용하고 UI만 교체**. '조각 길이'는 UI에서 **'알림 빠르기'**, 기본 1분
- **2c** — 카메라 타일 상태 4종(연결됨 / 재연결 중: 마지막 프레임 + 경과시간 + `error/300` 테두리 /
  끊김 / 빈 슬롯 `+추가`, 8대 제한). 우측 '오늘 위험 신호' 피드: 필터 칩(전체/미확인/높음만),
  카드 4종(높음 = 테두리 `error/600` + 배경 `error/50`, 보통, 확인됨 `opacity .6`, 오탐 취소선).
  상단 상태: 감시 중 N/M대, 서버 전송, 마지막 분석 시각, '일시 중지(영업 중)'
- **2d** — alwaysOnTop 창, 소리, 클립 자동 반복재생, 바운딩박스 오버레이, 확인/오탐 버튼 시각 분리,
  `✕` = 미확인 유지. 5분 후 재알림은 **서버 책임**(요구사항 6.5)
- **2e** — 타임라인(카메라별 행, 위험도 색, **영상 없음 = 점선**) + 테이블 + 우측 미리보기 3분할.
  행 클릭 → 미리보기, 더블클릭 → 2f
- **2f** — 조각 단위 타임라인 좌우 이동, 4분할 동시각 카메라 클릭 시 메인과 교체,
  드래그로 내보낼 범위 선택, 증거 묶음 내보내기는 비동기 진행률 표시
- **2g** — 토글/세그먼트 변경 **즉시 저장**(저장 버튼 없음), **쓰러짐 항상 on**(disabled 토글)

### 4. 실시간 연결 (계약 6절 — SSE)

새 이벤트 → 2d 팝업 + 2c 피드 + 내비 배지 / 상태 변경 → 전 화면 동기 / 카메라 상태 → 타일 갱신.
끊기면 **지수 백오프 재연결** + 상단 '서버 연결 끊김' 배너.
재연결 후 `GET /stores/:id/events`로 놓친 구간을 다시 읽는다 (SSE는 재생을 보장하지 않는다).

---

## 제약

**API는 아직 없다.** `docs/api-contract.md` 대로 mock(`src/renderer/mock/*.ts`)을 만들고
연결 지점을 hooks로 분리한다: `useStores`, `useCameras`, `useMonitoring`, `useEvents`, `useEventStream`.
계약이 단일 출처이므로 **필드명 · 시각 포맷(ISO8601 UTC 밀리초 `Z`) · 에러 모양(`{"error":"..."}`)** 을 그대로 맞춘다.

**기존 메인 프로세스 로직은 재사용만 하고 고치지 않는다:**
`discovery.ts`(ONVIF 검색) · `camera-probe.ts` · `uploader.ts` · `preview-stream.ts`.
라이브 미리보기는 **서버를 거치지 않는 PC 로컬 RTSP**다 (요구사항 3.4).

**디자인 값을 임의로 바꾸지 않는다.** 색·반경·간격·폰트 크기 전부.
디자인에 없는 상태(hover/disabled 등)가 필요하면 `design/씬스틸러 디자인시스템.dc.html` 안에서 고르고
**코드 주석에 한 줄 이유를 남긴다.**

**한글 카피는 디자인 그대로.** 용어 고정:
'알림 빠르기'(조각 길이 아님) · '확인했어요' · '문제 없음(오탐)' · '위험 신호'

**색:** 위험도 high `#E01F12`(error/600) · medium `#F9A403` · low `#868B94`(gray/600).
브랜드 main `#14233D` · sub `#3B6FF5`.

**AI 종류 판정은 아직 없다.** `kind === 'unknown'`이면 종류 태그 자리에 **"분석 중"** 을 표시하고,
SSE `event.updated`로 `aiGateStatus === 'done'`이 오면 교체한다 (`docs/ai-gate-contract.md` 5절).

**코딩 컨벤션:** ES6, `const` 우선, 함수형, React 19(`forwardRef` 금지), 불변성,
`cn()` 사용, Tailwind 축약형(`w-5 h-5` → `size-5`).

**작업 중 `check:all`/lint/typecheck를 자동으로 돌리지 않는다** (사용자 전역 규칙). PR 만들 때만 돈다.

**커밋 메시지는 한글**로, 왜 그렇게 했는지가 드러나게. 끝에 붙일 것:
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## 완료 기준

앱을 띄워 `design/씬스틸러 PC 앱.dc.html`과 나란히 비교하고 **차이점을 목록으로 보고**한다.
임의로 바꾼 게 있으면 이유를 명시한다.

---

## 백엔드와의 조율

계약(`docs/api-contract.md`)이 바뀌면 **두 레포 모두** 같은 내용을 반영한다 (계약 10절).
백엔드 세션에 알릴 일이 있으면 `ListAgents`로 찾아 `SendMessage`.
