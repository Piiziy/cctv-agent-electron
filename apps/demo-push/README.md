# @scene-stealer/demo-push

데모용 Web Push 발신기. Cloudflare Worker 하나로 돌아간다.

데스크톱 데모 화면이 위험 이벤트를 감지하면 이 Worker 를 호출하고, 미리 구독해 둔 폰으로 **진짜 푸시 알림**이
간다. 폰이 잠겨 있어도 뜬다. 폰과 데스크톱은 6자리 페어링 코드로만 연결된다.

```
폰 (서비스 워커)  --- POST /subscribe {code, subscription} --->  Worker  --- KV: sub:<code>
데스크톱 데모     --- POST /notify    {code, title, body}   --->  Worker  --- 암호화 --->  푸시 서비스 --->  폰
```

## FCM 이 아니라 VAPID 인 이유

Firebase 프로젝트가 없고, 데모 때문에 만들 생각도 없다. Web Push 는 W3C·IETF 표준이라 브라우저가 알아서
자기 푸시 서비스(크롬이면 FCM, 사파리면 Apple, 파폭이면 Mozilla)로 붙는다. 서버가 할 일은 **VAPID 키로
신원을 증명하고 페이로드를 암호화해서 보내는 것**뿐이다. 벤더 SDK도, 서버 키도, 앱 등록도 필요 없다.

- 신원 증명: VAPID JWT (RFC 8292, ES256)
- 페이로드 암호화: aes128gcm (RFC 8291 · RFC 8188)

`web-push` npm 패키지는 쓰지 않는다. Node 의 `crypto` 모듈에 묶여 있어서 Worker 에서 안 돌아간다. 그래서
[`src/push-crypto.ts`](src/push-crypto.ts) 에 Web Crypto 만으로 직접 구현했다. RFC 시험 벡터로 검증한다
(`npm test`).

## API

| 메서드 | 경로 | 본문 | 응답 |
|---|---|---|---|
| `POST` | `/subscribe` | `{ code, subscription }` | `204` |
| `POST` | `/notify` | `{ code, title, body, data? }` | `{ sent: true }` · `404` 구독 없음 · `410` 구독 만료 |
| `GET` | `/subscribed?code=ABC123` | — | `{ subscribed: true \| false }` (항상 `200`) |
| `POST` | `/ack` | `{ code, eventId, state }` | `{ ok: true, at }` · `400` |
| `GET` | `/acks?code=ABC123&since=<ISO>` | — | `{ acks: [...] }` (항상 `200`) |
| `GET` | `/health` | — | `{ ok: true }` |

- `code`: 영숫자 6자리. 대소문자는 안 가린다 (`abc123` == `ABC123`).
- `subscription`: 브라우저의 `PushSubscription.toJSON()` 그대로 — `{ endpoint, keys: { p256dh, auth } }`.
- `/subscribed` 는 데스크톱 화면이 폴링해서 "휴대폰이 연결되었습니다" 를 띄우는 데 쓴다. 코드가 망가져
  있어도 `200 { subscribed: false }` 다 — 폴링이 에러로 끊기면 안 되기 때문이다.
- `/ack` 은 폰에서 "확인했어요" 를 누른 걸 기록한다. `state` 는 `confirmed` 또는 `false_positive`.
  `at` 은 **서버가** 찍는다 (폰 시계는 못 믿고, `since` 필터가 그 값을 믿고 돈다). 코드당 최근 50개만 남는다.
- `/acks` 는 데스크톱이 폴링한다. `since` 보다 **엄격히 뒤**엣것만, 오래된 것부터 준다. `since` 가 없거나
  날짜로 못 읽으면 전부 준다. 모르는 코드·망가진 코드·깨진 로그 전부 `200 { acks: [] }` 다.
- 구독은 KV 에 24시간만 산다. 데모 끝나면 알아서 사라진다.
- 모든 응답에 CORS 가 열려 있다 (공개 데모라 origin 을 안 가린다).
- `410` 이 오면 그 구독은 KV 에서 지워진다. 폰에서 다시 구독해야 한다.

## ⚠️ `/acks` 는 KV 위에 있고, KV 는 이 용도에 안 맞는다

읽어야 할 사람은 **데모를 돌리는 사람**이다.

Workers KV 는 최종 일관성이다. 쓴 값이 다른 colo 에 퍼지는 데 **최대 60초**가 걸리고, 읽은 값은 colo 마다
**최소 60초** 캐시된다 (`cacheTtl` 하한이 60이라 더 줄일 수 없다). 그런데 우리 패턴은 정확히 그 최악의
경우다:

1. 데스크톱이 `/acks` 를 폴링한다 → 아직 아무것도 없다 → **"비어 있음" 이 그 colo 에 캐시된다**
2. 심사위원이 폰에서 "확인했어요" 를 누른다 → 폰의 colo 에 쓰인다 (LTE 라 노트북과 다른 colo 일 가능성이 높다)
3. 데스크톱은 캐시가 만료될 때까지 **계속 빈 배열을 본다**

즉 폴링이 먼저 돌수록 더 늦게 보인다. 최악은 팝업이 **1분 뒤에** 닫히는 것이고, 더 나쁜 건 이게
**재현이 잘 안 된다**는 점이다 — 같은 colo 에서 테스트하면 멀쩡히 통과한다.

다른 경로는 이 문제가 없다. `/subscribe` → `/notify` 는 구독이 몇 분 전에 쓰이고, `/subscribed` 는 늦게
true 가 돼도 "연결 대기 중" 으로 보일 뿐이다. **확인 팝업만** 초 단위 읽기-쓰기를 요구한다.

**바꾼다면 Durable Object 다** (무료 플랜에 있다). 페어링 코드마다 `idFromName(code)` 로 객체 하나를 잡으면
쓰기와 읽기가 같은 객체를 지나므로 강한 일관성이 보장되고, 나중에 WebSocket 으로 올리면 폴링 자체가 없어진다.
차선은 D1 (기본이 단일 프라이머리라 역시 강한 일관성). 둘 다 이 Worker 안에서 `/ack`·`/acks` 만 갈아 끼우면
되고, 나머지 경로는 KV 그대로 둬도 된다.

그때까지는 **`/acks` 가 늦을 수 있다고 보고 화면을 짜라.** 팝업은 확인이 오면 닫히되, 안 와도 심사위원이
직접 닫을 수 있어야 한다.

## 배포

의존성은 저장소 루트에서 한 번만 받는다. `wrangler` 가 아직 안 깔려 있으면 먼저:

```bash
cd <저장소 루트>
npm install
```

### 1. Cloudflare 계정 · 로그인

[dash.cloudflare.com](https://dash.cloudflare.com) 에서 무료 계정을 만든다. 카드 정보는 안 받는다.
Workers 무료 플랜은 하루 10만 요청이라 데모에는 남는다.

```bash
cd apps/demo-push
npx wrangler login
```

브라우저가 열리고 권한을 물어본다. 허용하면 CLI 로 돌아온다.

### 2. KV 네임스페이스 만들기

```bash
npx wrangler kv namespace create SUBS
npx wrangler kv namespace create SUBS --preview
```

각각 `id = "..."` 와 `preview_id = "..."` 를 찍어 준다. [`wrangler.toml`](wrangler.toml) 의
`여기에_KV_NAMESPACE_ID` · `여기에_PREVIEW_ID` 자리에 붙여 넣는다.

> wrangler 3 을 쓰면 명령이 `wrangler kv:namespace create SUBS` 다 (콜론).

### 3. VAPID 키 만들기

```bash
npm run vapid
```

공개키와 개인키를 찍어 준다.

- **공개키** → `wrangler.toml` 의 `VAPID_PUBLIC_KEY` 에 넣는다. 공개돼도 되는 값이라 커밋해도 된다.
  폰 쪽 `applicationServerKey` 에도 같은 값을 쓴다.
- **개인키** → 아래 4번에서만 쓴다. **파일에 쓰지 말고 커밋하지 마라.**

`VAPID_SUBJECT` 도 실제 연락 가능한 값으로 바꾼다 (`mailto:` 또는 https URL). 푸시 서비스가 문제 생겼을 때
연락할 곳이라, 아무 값이나 넣으면 일부 서비스가 거절한다.

### 4. 배포하고 개인키를 시크릿으로 넣기

```bash
npm run deploy
npx wrangler secret put VAPID_PRIVATE_KEY   # 붙여 넣고 엔터
```

시크릿은 바로 반영된다. 다시 배포할 필요 없다. 순서를 바꿔도 되는데, 그러면 wrangler 가 "그런 이름의
Worker 가 없는데 만들까?" 하고 물어본다.

배포가 끝나면 `https://scene-stealer-demo-push.<계정>.workers.dev` 같은 주소를 찍어 준다. 이 주소를
데스크톱 데모와 폰 구독 페이지가 쓴다.

### 로컬에서 돌려 보기

```bash
echo 'VAPID_PRIVATE_KEY="<개인키>"' > .dev.vars
npm run dev
```

`.dev.vars` 는 `.gitignore` 에 들어 있다. 로컬 KV 는 `.wrangler/` 안에 파일로 쌓인다.

## curl 로 확인

```bash
WORKER=https://scene-stealer-demo-push.<계정>.workers.dev

# 살아 있나
curl "$WORKER/health"
# {"ok":true}

# 구독 넣기 — subscription 은 폰에서 얻는다 (아래 참고)
curl -X POST "$WORKER/subscribe" \
  -H 'content-type: application/json' \
  -d '{
    "code": "ABC123",
    "subscription": {
      "endpoint": "https://fcm.googleapis.com/fcm/send/...",
      "keys": { "p256dh": "BN...", "auth": "k9..." }
    }
  }'
# 204, 본문 없음

# 폰이 붙었나 (데스크톱 화면이 이걸 폴링한다)
curl "$WORKER/subscribed?code=ABC123"
# {"subscribed":true}

# 알림 쏘기
curl -X POST "$WORKER/notify" \
  -H 'content-type: application/json' \
  -d '{"code":"ABC123","title":"이상 행동 감지","body":"1번 카메라 · 방금","data":{"eventId":"evt_1"}}'
# {"sent":true}   ← 여기서 폰이 울린다

# 없는 코드
curl -i -X POST "$WORKER/notify" \
  -H 'content-type: application/json' \
  -d '{"code":"ZZZZZZ","title":"t","body":"b"}'
# 404 {"error":"no-subscription",...}

# 폰에서 "확인했어요" 를 누른 것 (폰 앱이 보내는 것과 같은 요청)
curl -X POST "$WORKER/ack" \
  -H 'content-type: application/json' \
  -d '{"code":"ABC123","eventId":"evt_1","state":"confirmed"}'
# {"ok":true,"at":"2026-09-18T07:21:04.512Z"}

# 데스크톱이 폴링하는 것 — 처음엔 since 없이 전부
curl "$WORKER/acks?code=ABC123"
# {"acks":[{"eventId":"evt_1","state":"confirmed","at":"2026-09-18T07:21:04.512Z"}]}

# 그 다음부터는 마지막으로 본 at 을 since 로 넘긴다
curl "$WORKER/acks?code=ABC123&since=2026-09-18T07:21:04.512Z"
# {"acks":[]}   ← 새 확인이 없다
```

`/acks` 가 바로 안 바뀌면 위의 KV 일관성 경고를 보라. 버그가 아니라 저장소 성질이다.

문제가 생기면 로그를 실시간으로 본다:

```bash
npx wrangler tail
```

## 폰 쪽에서 구독 얻기

푸시는 **https 또는 localhost** 에서만 된다. 아이폰은 사파리에서 **홈 화면에 추가**한 뒤 그 아이콘으로
열어야 알림 권한을 준다 (iOS 16.4+).

서비스 워커 (`sw.js`):

```js
self.addEventListener('push', (event) => {
  const { title, body, data } = event.data.json()
  event.waitUntil(self.registration.showNotification(title, { body, data, tag: 'scene-stealer' }))
})
```

구독 페이지:

```js
const registration = await navigator.serviceWorker.register('/sw.js')
await Notification.requestPermission()
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: '<VAPID_PUBLIC_KEY>',
})

await fetch(`${WORKER}/subscribe`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: 'ABC123', subscription }),
})

// curl 로 시험할 때 쓸 값
console.log(JSON.stringify(subscription))
```

일부 브라우저는 `applicationServerKey` 로 문자열 대신 `Uint8Array` 를 요구한다. 그때는 base64url 을
바이트로 풀어서 넘긴다.

## 명령

| 명령 | 하는 일 |
|---|---|
| `npm run vapid` | VAPID 키쌍 생성 |
| `npm run dev` | 로컬 Worker (`wrangler dev`) |
| `npm run deploy` | 배포 (`wrangler deploy`) |
| `npm test` | 암호화 단위 테스트 (`vitest run`) |
| `npm run typecheck` | 타입 검사 |

## 파일

| 경로 | 무엇 |
|---|---|
| [`src/worker.ts`](src/worker.ts) | 라우팅 · KV · 발송 |
| [`src/push-crypto.ts`](src/push-crypto.ts) | aes128gcm 암호화 · VAPID JWT (Worker 전역 없이 돌아가서 테스트된다) |
| [`scripts/generate-vapid.mjs`](scripts/generate-vapid.mjs) | VAPID 키 생성 |
| [`tests/crypto.test.ts`](tests/crypto.test.ts) | RFC 5869 A.1 · RFC 8291 §5 시험 벡터 포함 |
| [`tests/worker.test.ts`](tests/worker.test.ts) | 가짜 KV · 가짜 푸시 서비스로 라우트 전체. 폰이 푸는 것까지 재현한다 |

> RFC 8291 §5 시험 벡터는 빼지 마라. 왕복 테스트(암호화했다가 다시 푸는 것)는 양쪽이 같은 코드를 쓰기
> 때문에 키 유도가 통째로 틀려도 통과한다. 실제로 nonce 유도를 망가뜨려 보면 저 벡터만 잡아낸다.
