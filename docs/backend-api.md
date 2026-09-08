# 백엔드 API 규격 — 영상 조각 수신

수집 에이전트가 백엔드로 보내는 요청의 계약이다. 에이전트는 이대로 보내며,
백엔드는 이 문서만 보고 구현할 수 있다.

- 버전: v1
- 마지막 수정: 2026-09-08
- 에이전트 구현: `src/main/services/uploader.ts`

---

## 1. 엔드포인트

```http
POST {backendBaseUrl}/v1/segments
Content-Type: multipart/form-data; boundary=...
Authorization: Bearer <deviceToken>
Idempotency-Key: <segmentId>
```

`backendBaseUrl` 은 매장마다 앱에서 설정한다. 끝의 슬래시는 있어도 없어도 된다.

### 파트

| 이름 | Content-Type | 내용 |
|---|---|---|
| `meta` | `application/json` | 아래 스키마 |
| `video` | `video/mp4` | 조각 파일. 파일명은 `<segmentId>.mp4` |

---

## 2. meta 스키마

```jsonc
{
  "segmentId": "01K5ZQ8G3M7X2N4P6R8T0V2W4Y",
  "storeId": "store-gangnam-01",
  "deviceId": "agent-7f3k9m2p",
  "camera": {
    "id": "urn:uuid:2419d68a-2dd2-21b2-a205-ec1bd0d0b0ff",
    "name": "계산대",
    "manufacturer": "Hikvision",
    "model": "DS-2CD2143G2",
    "streamProfile": "sub"
  },
  "video": {
    "codec": "h264",
    "width": 704,
    "height": 480,
    "fps": 15,
    "durationMs": 300133,
    "sizeBytes": 19783421,
    "container": "mp4"
  },
  "startedAt": "2026-09-07T14:30:00.000Z",
  "endedAt": "2026-09-07T14:35:00.133Z",
  "sequence": 1284,
  "agentVersion": "1.0.0"
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `segmentId` | ULID (26자) | 조각의 전역 고유 ID. `Idempotency-Key` 헤더와 항상 동일 |
| `storeId` | string | 매장 식별자. 앱에서 설정 |
| `deviceId` | string | 수집기 식별자. 최초 실행 시 자동 생성 후 고정 |
| `camera.id` | string | ONVIF 기기 UUID. **DHCP 로 IP 가 바뀌어도 유지된다.** 수동 입력 카메라는 RTSP 주소 |
| `camera.name` | string | 사용자가 붙인 위치 이름. 알림에 그대로 노출된다 |
| `camera.manufacturer` / `model` | string \| null | 검색으로 알아낸 값. 수동 입력이면 `null` |
| `camera.streamProfile` | `"main"` \| `"sub"` | 메인스트림(고화질) / 서브스트림(저대역폭) |
| `video.codec` | `"h264"` \| `"h265"` | 재인코딩하지 않으므로 카메라가 낸 코덱 그대로 |
| `video.width` / `height` / `fps` | number | 실제 조각에서 ffprobe 로 읽은 값 |
| `video.durationMs` | number | 실제 조각 길이. 설정값과 정확히 같지 않다 (아래 3.2) |
| `video.sizeBytes` | number | `video` 파트의 바이트 수 |
| `video.container` | `"mp4"` | 현재는 항상 mp4 |
| `startedAt` / `endedAt` | ISO 8601 UTC | 조각의 시작·종료 벽시계 시각 |
| `sequence` | number | `(deviceId, camera.id)` 별 0부터의 일련번호 |
| `agentVersion` | string | 수집기 버전 |

---

## 3. 백엔드가 반드시 지켜야 할 것

### 3.1 멱등 처리 — 선택이 아니라 필수

같은 `segmentId` 를 두 번 받으면 **두 번째는 `409` 로 답하고 저장하지 말아야 한다.**

업로드는 성공했는데 응답만 못 받는 경우(회선 순단, 게이트웨이 타임아웃)가 반드시 생기고,
그때 에이전트는 **같은 `segmentId` 로 재시도한다.** 걸러내지 않으면 같은 5분이 두 번
분석되어 점주에게 알림이 중복 발송된다.

```sql
-- 최소 구현
CREATE UNIQUE INDEX ON segments (segment_id);
-- INSERT ... ON CONFLICT (segment_id) DO NOTHING → 영향 행이 0이면 409
```

### 3.2 조각 길이는 설정값과 정확히 일치하지 않는다

H.264/H.265 는 키프레임(IDR) 경계에서만 자를 수 있다. 에이전트는 설정된 길이가 지난 뒤
**다음 키프레임에서** 자르므로 실제 길이는 설정값보다 조금 길다.
카메라 GOP 가 2초면 5분 설정에서 300~302초 사이가 나온다.

`durationMs` 를 신뢰하고, 설정값을 가정해 계산하지 말 것.

### 3.3 `sequence` 는 생성 순서지 도착 순서가 아니다

인터넷이 끊긴 동안 조각은 디스크에 쌓였다가 복구되면 몰려서 올라온다.
번호는 **만들어진 시점** 기준이며 오래된 것부터 전송된다.

- 번호가 건너뛰면 → 그 구간 영상이 유실된 것 (디스크 상한 초과 등)
- 번호가 한참 늦게 도착하면 → 그동안 매장 인터넷이 끊겨 있었던 것

수집기가 재설치되면 번호는 0부터 다시 시작한다. `(deviceId, camera.id, sequence)` 로
묶어 판단할 것.

---

## 4. 응답 규격

| 상태 | 의미 | 에이전트 동작 |
|---|---|---|
| `201 Created` | 정상 수신 | 조각 삭제, 다음으로 |
| `409 Conflict` | 이미 받은 `segmentId` | **성공으로 취급**, 조각 삭제 |
| `401` `403` | 토큰 문제 | **재시도 중단**, 화면에 경고. 조각은 보관 |
| `413` | 조각이 너무 큼 | 재시도 중단, 조각 길이 축소 안내 |
| `400` 등 기타 4xx | 규격 위반 | 재시도 중단 |
| `408` `429` | 일시적 | 지수 백오프 재시도 |
| `5xx` | 서버 장애 | 지수 백오프 재시도 |
| 응답 없음 (네트워크) | 인터넷 끊김 | 조각 보관 후 지수 백오프 재시도 |

재시도 백오프는 1초에서 시작해 2배씩 늘어나며 5분에서 고정된다(지터 포함).

응답 본문은 사용하지 않는다. 다음 형태를 권한다.

```json
{ "segmentId": "01K5ZQ8G3M7X2N4P6R8T0V2W4Y", "received": true }
```

---

## 5. 용량 산정

조각 하나의 크기는 `비트레이트 × 조각길이 / 8` 이다.

| 스트림 | 전형적 비트레이트 | 5분 조각 | 카메라 1대 하루 |
|---|---|---|---|
| 서브스트림 (권장) | 512 kbps | 약 19 MB | 약 5.4 GB |
| 메인스트림 | 4 Mbps | 약 150 MB | 약 42 GB |

요청 빈도는 **카메라 1대당 조각 길이마다 1회**다. 5분 조각이면 하루 288회.
`413` 을 쓸 계획이라면 메인스트림 5분 조각(150MB)이 통과하도록 업로드 상한을 잡아야 한다.

에이전트는 **한 번에 하나씩 순차 업로드**한다. 매장 업링크를 아끼기 위함이며,
인터넷이 끊겼다 복구되면 밀린 조각이 순차로 몰려 온다.

---

## 6. 참고 — 최소 수신 구현

```ts
app.post('/v1/segments', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!isValidDeviceToken(token)) return res.status(401).end()

  const meta = JSON.parse(await req.file('meta'))
  const video = await req.file('video')

  const inserted = await db.insertIfAbsent({
    segmentId: meta.segmentId,          // UNIQUE
    storeId: meta.storeId,
    cameraId: meta.camera.id,
    sequence: meta.sequence,
    startedAt: meta.startedAt,
    endedAt: meta.endedAt,
    durationMs: meta.video.durationMs,
  })
  if (!inserted) return res.status(409).json({ segmentId: meta.segmentId, received: true })

  await storage.put(`segments/${meta.segmentId}.mp4`, video)
  await analysisQueue.push(meta.segmentId)   // → AI 서버

  res.status(201).json({ segmentId: meta.segmentId, received: true })
})
```

**저장을 마친 뒤에 `201` 을 보낼 것.** 저장 전에 응답하면, 저장이 실패했는데
에이전트는 조각을 지워버려 영상이 영구히 사라진다.

---

## 7. 아직 정하지 않은 것

- **위험도 결과를 에이전트로 되돌리는 경로** — 현재 에이전트는 단방향으로 올리기만 한다.
  필요해지면 ONVIF Profile M(메타데이터·이벤트 표준)을 따르는 것을 권한다.
- **기기 토큰 발급 절차** — 지금은 사람이 앱에 붙여넣는다.
- **S3 presigned URL 방식** — 백엔드 부하를 줄일 수 있으나 요청이 2단계가 된다.
  현재 규격을 유지한 채 나중에 얹을 수 있다.
