# 씬스틸러 (Scene Stealer)

무인매장 CCTV 이상행동 감시 서비스의 **클라이언트 모노레포**. npm workspaces + Turborepo.
백엔드는 [scene-stealer-back](https://github.com/yimsNEO/scene-stealer-back) 이다.

## 구성

| 경로 | 무엇 |
|---|---|
| [`apps/pc`](apps/pc/README.md) | 매장 PC 앱 `cctv-agent` (Electron) — 카메라 영상 수집·업로드, 사장님 화면 |
| `packages/*` | 앱끼리 나눠 쓰는 코드 (아직 없음) |
| [`docs/api-contract.md`](docs/api-contract.md) | 백엔드 API 계약 (백엔드 레포와 같은 사본) |
| `design/` | 디자인 원본 (`.dc.html` 인라인 스타일이 정확한 값) |
| `handoff/` | 디자인 넘겨받을 때 받은 요구사항·프롬프트 |

## 시작

Node 22 · npm 10. 설치는 저장소 루트에서 한 번만 한다 (`node_modules` 는 루트 하나).

```bash
npm install
```

## 명령

루트에서 실행한다.

| 명령 | 설명 |
|---|---|
| `npm run build` | 모든 워크스페이스 빌드 (Turborepo, 결과 캐시) |
| `npm run typecheck` | 타입 검사 (Turborepo) |
| `npm run test:unit` | 단위 테스트 (Turborepo, 결과 캐시) |
| `npm run test:e2e` | E2E (캐시 안 함) |
| `npm run dev` | PC 앱 개발 모드 |
| `npm run ui` | PC 앱 화면만 브라우저로 (`localhost:5174`, 가짜 API) |
| `npm run fake-camera` | 가짜 CCTV 카메라 |
| `npm run dist` | PC 앱 설치 파일 |

`dev`·`ui`·`fake-camera`·`dist` 는 `npm run <명령> -w cctv-agent` 로 PC 앱에 넘긴다. 인자는
`--` 뒤에 붙인다 (예: `npm run dev -- --remoteDebuggingPort 9339`). 한 워크스페이스만 Turborepo 로
돌리려면 `npx turbo run build --filter=cctv-agent`.

빌드 때 앱에 박는 환경변수(`SCENE_STEALER_API_URL` 등)는 [`turbo.json`](turbo.json) 의 `env` 에
적어 둔다. 적지 않은 변수는 Turborepo 가 빌드에 넘기지 않고, 캐시 키에도 들어가지 않는다.
