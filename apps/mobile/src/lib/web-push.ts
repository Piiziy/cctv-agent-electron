import { Platform } from 'react-native'
import { config } from './config'

/**
 * 웹에서의 알림 — 데모용.
 *
 * 네이티브 앱은 `notifications.ts` 의 Expo 푸시를 쓰지만, 심사위원이 여는 것은
 * 브라우저다. 브라우저에는 두 가지 길이 있고 우리는 둘 다 깐다.
 *
 *  1. **Web Push** (서비스워커 + VAPID) — 폰이 잠겨 있어도 온다. 발송 엔드포인트가 필요하다.
 *  2. **Notification API** — 페이지가 살아 있을 때만. 서버가 전혀 필요 없다.
 *
 * 1번이 설정돼 있으면 1번, 아니면 2번으로 조용히 내려앉는다. 데모가 서버 때문에
 * 죽는 일은 없어야 한다.
 *
 * FCM(Firebase)은 쓰지 않는다. 웹 푸시 표준은 VAPID 키쌍만 요구하고,
 * 전송은 브라우저 제조사의 푸시 서비스가 알아서 한다.
 */

export const isWeb = Platform.OS === 'web'

const swSupported = (): boolean =>
  isWeb && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in globalThis

const notificationSupported = (): boolean => isWeb && typeof Notification !== 'undefined'

/**
 * VAPID 공개키는 base64url 문자열로 오는데 subscribe 는 바이트 배열을 원한다.
 * ArrayBuffer 를 명시해 만든다 — 그냥 Uint8Array.from 을 쓰면 SharedArrayBuffer 가능성 때문에
 * BufferSource 로 안 받아 준다.
 */
const urlBase64ToUint8Array = (value: string): Uint8Array<ArrayBuffer> => {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  raw.split('').forEach((char, index) => {
    bytes[index] = char.charCodeAt(0)
  })
  return bytes
}

export type WebPushState =
  | { readonly kind: 'unsupported'; readonly reason: string }
  | { readonly kind: 'denied' }
  | { readonly kind: 'push'; readonly code: string }
  | { readonly kind: 'local' }

/**
 * 페어링 코드 6자리. 서버가 [A-Z0-9]{6} 만 받는데
 * `Math.random().toString(36).slice(2, 8)` 은 운이 나쁘면 6자리가 안 나온다.
 * 헷갈리는 글자(I·L·O·0·1)는 뺐다 — 심사위원이 눈으로 옮겨 적을 수도 있다.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const makeCode = (): string => {
  const bytes = new Uint8Array(6)
  globalThis.crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
}

/** 페어링 코드 — 데스크톱 데모가 QR 로 넘겨준다. 없으면 이 브라우저용으로 하나 만든다. */
export const pairingCode = (): string => {
  if (!isWeb) return ''
  const fromUrl = new URLSearchParams(globalThis.location?.search ?? '').get('code')
  if (fromUrl) return fromUrl
  const stored = globalThis.localStorage?.getItem('scene-stealer.code')
  if (stored) return stored
  const made = makeCode()
  try {
    globalThis.localStorage?.setItem('scene-stealer.code', made)
  } catch {
    // 시크릿 창이면 저장이 막힌다. 이번 세션 동안만 쓰면 된다.
  }
  return made
}

export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!swSupported()) return null
  try {
    return await navigator.serviceWorker.register(`${config.webBaseUrl}/sw.js`, {
      scope: `${config.webBaseUrl}/`,
    })
  } catch {
    return null
  }
}

/**
 * 알림을 받을 준비를 한다. 권한을 묻고, 가능하면 푸시 구독까지 서버에 등록한다.
 * 반환값으로 어느 경로를 타게 됐는지 알려 준다 — 화면이 그대로 안내 문구를 띄운다.
 */
export const enableWebNotifications = async (): Promise<WebPushState> => {
  if (!notificationSupported()) {
    return { kind: 'unsupported', reason: '이 브라우저는 알림을 지원하지 않습니다' }
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()
  if (permission !== 'granted') return { kind: 'denied' }

  const registration = await registerServiceWorker()
  const canPush = registration && config.pushEndpoint && config.vapidPublicKey
  if (!canPush) return { kind: 'local' }

  try {
    const existing = await registration.pushManager.getSubscription()
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey),
      }))

    const code = pairingCode()
    const response = await fetch(`${config.pushEndpoint}/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, subscription: subscription.toJSON() }),
    })
    if (!response.ok) return { kind: 'local' }
    return { kind: 'push', code }
  } catch {
    // 구독이 막히는 경우(아이폰 사파리에서 홈 화면 추가 전 등)는 로컬 알림으로 간다.
    return { kind: 'local' }
  }
}

/** 서버 없이 지금 당장 알림 하나를 띄운다. 페이지가 살아 있을 때만 보인다. */
export const showLocalNotification = async (
  title: string,
  body: string,
  eventId: string,
): Promise<boolean> => {
  if (!notificationSupported() || Notification.permission !== 'granted') return false
  const registration = await registerServiceWorker()
  const options: NotificationOptions = {
    body,
    icon: `${config.webBaseUrl}/icon.png`,
    tag: `event-${eventId}`,
    data: { eventId },
  }
  // 서비스워커를 통해 띄우면 탭했을 때의 처리가 실제 푸시와 같은 코드를 탄다.
  if (registration) await registration.showNotification(title, options)
  else new Notification(title, options)
  return true
}

/** 알림 탭 → 상세 화면. 이미 열려 있는 탭은 서비스워커가 메시지로 알려 준다. */
export const onNotificationOpen = (handler: (eventId: string) => void): (() => void) => {
  if (!isWeb) return () => undefined

  const fromQuery = new URLSearchParams(globalThis.location?.search ?? '').get('event')
  if (fromQuery) {
    // 주소창에 흔적을 남기지 않는다 — 새로고침하면 또 열리는 게 이상하다.
    globalThis.history?.replaceState({}, '', globalThis.location.pathname)
    handler(fromQuery)
  }

  if (!swSupported()) return () => undefined
  const listener = (event: MessageEvent): void => {
    if (event.data?.type === 'notification-click' && event.data.eventId) handler(event.data.eventId)
  }
  navigator.serviceWorker.addEventListener('message', listener)
  return () => navigator.serviceWorker.removeEventListener('message', listener)
}
