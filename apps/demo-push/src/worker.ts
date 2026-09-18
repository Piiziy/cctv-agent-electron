/**
 * 데모용 Web Push 발신기 (Cloudflare Worker).
 *
 * 흐름: 심사위원 폰이 `/subscribe` 로 구독을 맡기고 6자리 코드를 받는다 →
 * 데스크톱 데모가 위험 이벤트를 감지하면 그 코드로 `/notify` 를 때린다 → 폰이 잠겨 있어도 알림이 뜬다.
 */
import {
  audienceOf,
  createVapidJwt,
  encryptPayload,
  importVapidKey,
  utf8,
  vapidAuthorization,
  type SubscriptionKeys,
} from './push-crypto'

/**
 * Workers 런타임 타입을 따로 설치하지 않으려고 쓰는 만큼만 직접 선언한다.
 * (`@cloudflare/workers-types` 를 받으면 루트 lockfile 이 흔들린다)
 */
interface KvNamespace {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

export interface Env {
  readonly SUBS: KvNamespace
  readonly VAPID_PUBLIC_KEY: string
  /** `wrangler secret put VAPID_PRIVATE_KEY` 로 넣는다. 절대 wrangler.toml 에 두지 않는다. */
  readonly VAPID_PRIVATE_KEY: string
  readonly VAPID_SUBJECT: string
}

interface PushSubscriptionJson {
  readonly endpoint: string
  readonly keys: SubscriptionKeys
}

/** 공개 데모라 출처를 가리지 않는다. 구독 키는 코드를 아는 사람만 조회할 수 있다. */
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
}

const SUBSCRIPTION_TTL_SECONDS = 24 * 60 * 60
/** 심사가 길어져도 로그가 무한히 자라지 않게. 데스크톱은 최근 것만 본다. */
const ACK_LOG_LIMIT = 50
/** 데모에서 늦게 도착한 위험 알림은 의미가 없다. 잠깐 끊긴 폰만 따라잡을 만큼만 준다. */
const PUSH_TTL_SECONDS = 300
const PAIRING_CODE = /^[A-Z0-9]{6}$/

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  })

const empty = (status: number): Response => new Response(null, { status, headers: CORS_HEADERS })

/** 폰에서 손으로 옮겨 적는 코드라 대소문자는 따지지 않는다 — 저장·조회 양쪽에서 같은 규칙을 쓴다. */
const normalizeCode = (value: unknown): string | null => {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return PAIRING_CODE.test(code) ? code : null
}

const subscriptionKey = (code: string): string => `sub:${code}`
const ackKey = (code: string): string => `acks:${code}`

const ACK_STATES = ['confirmed', 'false_positive'] as const
type AckState = (typeof ACK_STATES)[number]

interface AckEntry {
  readonly eventId: string
  readonly state: AckState
  /** 서버 시계로 찍는다 — 폰 시계는 틀어져 있을 수 있고, since 필터가 그 값을 믿고 돈다. */
  readonly at: string
}

const isAckState = (value: unknown): value is AckState => ACK_STATES.includes(value as AckState)

/** 폴링은 어떤 경우에도 화면을 깨면 안 된다. 로그가 깨져 있으면 없는 셈 친다. */
const parseAckLog = (stored: string | null): readonly AckEntry[] => {
  if (stored === null) return []
  try {
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? (parsed as AckEntry[]) : []
  } catch {
    return []
  }
}

const isSubscription = (value: unknown): value is PushSubscriptionJson => {
  const candidate = value as PushSubscriptionJson | null
  return (
    typeof candidate?.endpoint === 'string' &&
    candidate.endpoint.startsWith('https://') &&
    typeof candidate.keys?.p256dh === 'string' &&
    typeof candidate.keys?.auth === 'string'
  )
}

const readJson = async (request: Request): Promise<Record<string, unknown> | null> => {
  const parsed = await request.json().catch(() => null)
  return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
}

const handleSubscribe = async (request: Request, env: Env): Promise<Response> => {
  const body = await readJson(request)
  const code = normalizeCode(body?.code)
  if (code === null) return json({ error: 'invalid-code', message: '코드는 영숫자 6자리다' }, 400)
  if (!isSubscription(body?.subscription)) {
    return json({ error: 'invalid-subscription', message: 'endpoint·keys.p256dh·keys.auth 가 필요하다' }, 400)
  }
  const { endpoint, keys } = body.subscription
  await env.SUBS.put(subscriptionKey(code), JSON.stringify({ endpoint, keys }), {
    expirationTtl: SUBSCRIPTION_TTL_SECONDS,
  })
  return empty(204)
}

/**
 * 데스크톱 데모가 폴링한다 — 폰이 붙었는지 미리 알아야 "휴대폰이 연결되었습니다" 를 띄울 수 있다.
 * 발송이 실패할 때까지 기다리면 심사위원 앞에서 알림이 안 오는 이유를 그때서야 알게 된다.
 */
const handleSubscribed = async (request: Request, env: Env): Promise<Response> => {
  const code = normalizeCode(new URL(request.url).searchParams.get('code'))
  // 폴링용이라 코드가 망가져 있어도 200 으로 답한다. 화면은 붙었나 아닌가만 알면 된다
  if (code === null) return json({ subscribed: false })
  return json({ subscribed: (await env.SUBS.get(subscriptionKey(code))) !== null })
}

/**
 * 폰에서 "확인했어요" 를 누르면 여기로 온다. 데스크톱 팝업이 그걸 보고 닫힌다 —
 * 두 화면이 한 제품이라는 걸 보여 주는 유일한 실시간 연결점이다.
 */
const handleAck = async (request: Request, env: Env): Promise<Response> => {
  const body = await readJson(request)
  const code = normalizeCode(body?.code)
  if (code === null) return json({ error: 'invalid-code', message: '코드는 영숫자 6자리다' }, 400)
  if (typeof body?.eventId !== 'string' || body.eventId === '') {
    return json({ error: 'invalid-event', message: 'eventId 가 필요하다' }, 400)
  }
  if (!isAckState(body?.state)) {
    return json({ error: 'invalid-state', message: `state 는 ${ACK_STATES.join(' 또는 ')} 다` }, 400)
  }

  const at = new Date().toISOString()
  // 읽고-고쳐-쓰기라 동시에 두 개가 들어오면 하나가 묻힐 수 있다.
  // 심사위원 한 명이 누르는 데모에서는 문제되지 않지만, 여러 명이 쓸 거면 저장소를 바꿔야 한다
  const previous = parseAckLog(await env.SUBS.get(ackKey(code)))
  const entries = [...previous, { eventId: body.eventId, state: body.state, at }].slice(-ACK_LOG_LIMIT)
  await env.SUBS.put(ackKey(code), JSON.stringify(entries), { expirationTtl: SUBSCRIPTION_TTL_SECONDS })
  return json({ ok: true, at })
}

/** 데스크톱이 몇 초마다 부른다. 뭘 하든 200 으로 답한다. */
const handleAcks = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url)
  const code = normalizeCode(url.searchParams.get('code'))
  if (code === null) return json({ acks: [] })

  const entries = parseAckLog(await env.SUBS.get(ackKey(code)))
  const since = url.searchParams.get('since')
  const sinceMs = since === null ? Number.NaN : Date.parse(since)
  // since 가 없거나 읽을 수 없으면 전부 준다 — 폴링을 400 으로 끊는 것보다 낫다.
  // 저장 순서가 곧 시간 순서라 따로 정렬하지 않는다 (오래된 것부터)
  if (Number.isNaN(sinceMs)) return json({ acks: entries })
  // 같은 밀리초에 두 개가 들어오면 뒤엣것을 놓친다. 사람이 누르는 속도에서는 일어나지 않는다
  return json({ acks: entries.filter((entry) => Date.parse(entry.at) > sinceMs) })
}

const sendWebPush = async (env: Env, subscription: PushSubscriptionJson, payload: unknown): Promise<Response> => {
  const [body, signingKey] = await Promise.all([
    encryptPayload(utf8(JSON.stringify(payload)), subscription.keys),
    importVapidKey(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY),
  ])
  const jwt = await createVapidJwt({
    audience: audienceOf(subscription.endpoint),
    subject: env.VAPID_SUBJECT,
    signingKey,
  })
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      TTL: String(PUSH_TTL_SECONDS),
      // 잠긴 폰을 바로 깨우려면 high 여야 한다. 기본값(normal)은 묶어서 나중에 줄 수 있다
      Urgency: 'high',
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      authorization: vapidAuthorization(jwt, env.VAPID_PUBLIC_KEY),
    },
    body: body as BodyInit,
  })
}

const handleNotify = async (request: Request, env: Env): Promise<Response> => {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY || !env.VAPID_SUBJECT) {
    return json({ error: 'not-configured', message: 'VAPID 키·subject 가 비어 있다' }, 500)
  }
  const body = await readJson(request)
  const code = normalizeCode(body?.code)
  if (code === null) return json({ error: 'invalid-code', message: '코드는 영숫자 6자리다' }, 400)
  if (typeof body?.title !== 'string' || typeof body?.body !== 'string') {
    return json({ error: 'invalid-message', message: 'title·body 는 문자열이어야 한다' }, 400)
  }

  const stored = await env.SUBS.get(subscriptionKey(code))
  if (stored === null) return json({ error: 'no-subscription', message: '그 코드로 구독한 기기가 없다' }, 404)
  const subscription = JSON.parse(stored) as PushSubscriptionJson

  const response = await sendWebPush(env, subscription, {
    title: body.title,
    body: body.body,
    data: body.data ?? {},
  })
  if (response.ok) return json({ sent: true })

  // 404·410 은 구독이 죽었다는 뜻 — 남겨 두면 다음 발송도 같은 실패를 반복한다
  if (response.status === 404 || response.status === 410) {
    await env.SUBS.delete(subscriptionKey(code))
    return json({ error: 'subscription-expired', message: '구독이 만료돼 지웠다. 폰에서 다시 구독해라' }, 410)
  }
  const detail = await response.text().catch(() => '')
  return json({ error: 'push-failed', status: response.status, detail: detail.slice(0, 500) }, 502)
}

const route = (request: Request, env: Env): Promise<Response> | Response => {
  const { pathname } = new URL(request.url)
  if (request.method === 'OPTIONS') return empty(204)
  if (request.method === 'GET' && pathname === '/health') return json({ ok: true })
  if (request.method === 'GET' && pathname === '/subscribed') return handleSubscribed(request, env)
  if (request.method === 'GET' && pathname === '/acks') return handleAcks(request, env)
  if (request.method === 'POST' && pathname === '/subscribe') return handleSubscribe(request, env)
  if (request.method === 'POST' && pathname === '/ack') return handleAck(request, env)
  if (request.method === 'POST' && pathname === '/notify') return handleNotify(request, env)
  return json({ error: 'method-not-allowed' }, 405)
}

export default {
  fetch: async (request: Request, env: Env): Promise<Response> => {
    try {
      return await route(request, env)
    } catch (error) {
      // 데모 중에 원인 모를 500 을 보는 것보다 이유를 그대로 보여주는 편이 낫다
      return json({ error: 'internal', message: error instanceof Error ? error.message : String(error) }, 500)
    }
  },
}
