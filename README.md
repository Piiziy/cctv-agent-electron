# CCTV 수집기 (cctv-agent)

무인매장 CCTV 이상행동 감지 시스템의 **영상 수집 모듈**.
매장 PC에 설치되어 ONVIF로 카메라를 찾고, RTSP 스트림을 일정 시간 단위 mp4 조각으로 잘라
백엔드로 올린다.

전체 시스템에서의 위치:

```
[CCTV] → [수집 에이전트] → [백엔드] → [AI(LLM) 서버] → 위험도
              ↑ 이 저장소            └ 임계 초과 → 프론트 표시 + 앱 푸시알림
```

## 설계 원칙

**에이전트는 오직 RTSP로만 영상을 받는다.** 웹캠을 직접 읽는 지름길이 없다.
개발·테스트도 `웹캠/영상파일 → 가짜 카메라(RTSP 서버) → 에이전트` 경로를 그대로 거친다.
그래서 RTSP 주소를 실제 CCTV로 바꾸는 것만으로 코드 수정 없이 동작한다.

## 빠른 시작

```bash
npm install
```

터미널 두 개로 나눠 띄운다.

```bash
npm run fake-camera
```

```bash
npm run dev
```

가짜 카메라가 ONVIF로 자신을 광고하므로, 앱의 카메라 검색 목록에 `FakeCam SIM-1000`이 뜬다.
아이디·비밀번호는 아무 값이나 넣으면 된다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | Electron 앱 개발 모드 |
| `npm run ui` | Electron 없이 브라우저에서 화면만 (`localhost:5174`, 가짜 API로 동작) |
| `npm run fake-camera` | 가짜 CCTV 카메라 (ONVIF + RTSP) 실행 |
| `npm test` | 전체 테스트 |
| `npm run test:unit` | 단위 테스트만 (빠름) |
| `npm run test:e2e` | 전체 파이프라인 E2E (실제 ffmpeg 사용, ~100초) |
| `npm run typecheck` | 타입 검사 |
| `npm run dist` | 설치 파일 빌드 (dmg/exe/AppImage) |

## 백엔드 API 규격

백엔드는 아직 없다. 아래가 계약이며, 에이전트는 이대로 보낸다.

```http
POST {backendBaseUrl}/v1/segments
Content-Type: multipart/form-data
Authorization: Bearer <deviceToken>
Idempotency-Key: <segmentId>

  part "meta"  : application/json
  part "video" : video/mp4
```

```jsonc
// meta
{
  "segmentId": "01K5ZQ8G3M7X2N4P6R8T0V2W4Y",  // ULID. Idempotency-Key 와 동일
  "storeId": "store-gangnam-01",
  "deviceId": "agent-7f3k9m2p",
  "camera": {
    "id": "urn:uuid:2419d68a-...",   // ONVIF 기기 UUID. IP 가 바뀌어도 유지된다
    "name": "계산대",
    "manufacturer": "Hikvision",
    "model": "DS-2CD2143G2",
    "streamProfile": "sub"           // "main" | "sub"
  },
  "video": {
    "codec": "h264",                 // "h264" | "h265"
    "width": 704, "height": 480, "fps": 15,
    "durationMs": 300133,
    "sizeBytes": 19783421,
    "container": "mp4"
  },
  "startedAt": "2026-09-07T14:30:00.000Z",   // UTC
  "endedAt":   "2026-09-07T14:35:00.133Z",
  "sequence": 1284,
  "agentVersion": "1.0.0"
}
```

### 백엔드가 지켜야 할 것

| 응답 | 언제 | 에이전트 동작 |
|---|---|---|
| `201` | 정상 수신 | 조각 삭제, 다음으로 |
| `409` | **이미 받은 `segmentId`** | 성공으로 취급, 조각 삭제 |
| `401` `403` | 토큰 문제 | 재시도 중단, 화면에 경고 |
| `413` | 조각이 너무 큼 | 재시도 중단, 조각 길이 축소 안내 |
| `5xx` `408` `429` | 일시적 장애 | 지수 백오프 재시도 |

**`409` 처리는 선택이 아니라 필수다.** 업로드는 성공했으나 응답을 받지 못하는 경우가 반드시
생기고, 그때 에이전트는 같은 `segmentId`로 다시 보낸다. 백엔드가 이를 걸러내지 않으면
같은 5분이 두 번 분석되어 알림이 중복 발송된다.

`sequence`는 `(deviceId, camera.id)`마다 0부터 증가한다. **생성 순서지 업로드 순서가 아니다** —
인터넷이 끊겼다 복구되면 밀린 조각이 몰려 오지만 번호는 생성 시점 기준으로 유지된다.
번호가 건너뛰면 그 구간의 영상이 유실된 것이다.

## 동작 방식

```
[카메라] ─RTSP/TCP─> ffmpeg ─mp4 조각─> spool/ ─> Uploader ─HTTPS─> [백엔드]
                        │                 │           │
                     사망 감지        상한 초과시    성공시
                        │            오래된것 삭제   파일 삭제
                    Supervisor ──────────> 화면 상태
```

- **재인코딩하지 않는다** (`-c:v copy`). CPU를 거의 쓰지 않고 화질 손실이 없다.
- **키프레임(IDR) 경계에서만 자른다** (`-f segment`). H.264/H.265는 임의 지점에서 자르면
  재생 불가능한 조각이 나온다.
- ffmpeg는 `spool/parts/`에 쓰고, **완성 신호(`-segment_list` manifest)를 받은 뒤에만**
  스풀 루트로 옮긴다. 스풀 루트에 있는 파일은 전부 완성본이라는 불변식이 성립한다.
- 녹화와 업로드는 스풀을 사이에 두고 완전히 분리되어 있다. 한쪽이 죽어도 다른 쪽은 돈다.

### 장애 처리

| 상황 | 동작 |
|---|---|
| 카메라 응답 없음 | 백오프 재시작 (1s→30s) |
| 조각 주기의 1.5배 동안 새 조각 없음 | 스트림이 멈춘 것으로 보고 강제 재시작 |
| **카메라 인증 실패** | **재시도 중단**, 사람 개입 요청 |
| 인터넷 끊김 | 조각을 디스크에 축적, 복구되면 오래된 순으로 전송 |
| 디스크 상한 초과 | 오래된 조각부터 삭제하고 화면에 경고 |
| PC 재부팅 | 자동 시작 → 스풀에 남은 것부터 이어서 업로드 |

되는 재시도와 안 되는 재시도를 구분하는 것이 원칙이다. 네트워크 장애는 기다리면 풀리지만
비밀번호가 틀린 것은 백만 번 시도해도 풀리지 않는다.

## 설정

`{userData}/config.json`에 저장된다 (macOS 기준 `~/Library/Application Support/cctv-agent/`).

| 항목 | 기본값 | 비고 |
|---|---|---|
| `backendBaseUrl` | (필수) | 앱의 서버 설정 화면에서 입력 |
| `deviceToken` | (필수) | |
| `storeId` | (필수) | |
| `deviceId` | 자동 생성 | 최초 실행 시 부여, 편집 불가 |
| `segmentSeconds` | `300` | 조각 길이 |
| `streamProfile` | `sub` | 서브스트림은 대역폭이 약 1/8 |
| `spoolLimitBytes` | `5 GiB` | 서브스트림 기준 약 24시간치 |
| `includeAudio` | `false` | |
| `autoStart` | `true` | 부팅 시 자동 시작 |

**조각 길이는 감지 지연과 직결된다.** 5분으로 두면 이상행동 알림이 최대 5분 늦게 온다.
절도는 통상 30초 내에 끝나므로, 빠른 대응이 목표라면 30초~1분을 권한다.
반대로 배회처럼 느린 행동은 긴 맥락이 유리하다.

## 문서

- [설계 문서](docs/superpowers/specs/2026-09-07-cctv-ingest-agent-design.md) — 프로토콜 조사, 아키텍처, 결정 근거
- [구현 계획서](docs/superpowers/plans/2026-09-07-cctv-ingest-agent.md)

## 현재 범위 밖

모니터가 있는 매장을 대상으로 한다. 아래는 나중에 **수집 엔진을 건드리지 않고** 얹을 수 있다.

- 모니터 없는 매장 (QR 페어링, 소프트AP 프로비저닝, 백엔드 명령중계, LED 상태표시)
- 모바일 앱 (QR 스캔 + 웹뷰 + 푸시 알림)
- 카메라 다중 동시 수집
- 위험도 결과 수신 (ONVIF Profile M)
