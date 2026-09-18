import qrcode from 'qrcode-generator'

/**
 * 데모 진행기.
 *
 * 하는 일은 셋뿐이다 — 휴대폰과 이어 줄 코드를 QR 로 보여 주고, iframe 안의 PC 앱에게
 * 시나리오를 시키고, 위험이 잡히는 순간 그 휴대폰으로 알림을 쏜다.
 *
 * PC 앱은 같은 출처의 iframe 이라 contentWindow 를 그대로 만질 수 있다. 앱이 개발용으로
 * 열어 둔 `window.__sceneStealer` 를 쓰면 되므로 앱 쪽에 데모 전용 배선을 더 넣을 필요가 없다.
 */

interface ScenarioStep {
  readonly phase: 'streaming' | 'segment' | 'risk'
  readonly label: string
  readonly detail?: string
}

interface DemoHook {
  readonly isDemo?: boolean
  startScenario?: () => void
  stopScenario?: () => void
  triggerRisk?: (options?: { cameraId?: string; risk?: 'high' | 'medium' | 'low' }) => {
    eventId: string
    cameraName: string
    at: string
  }
  emitRiskEvent?: (input?: { risk?: 'high' | 'medium' | 'low' }) => { id: string; cameraName?: string }
  onScenario?: (listener: (step: ScenarioStep) => void) => () => void
}

const PUSH_ENDPOINT = (import.meta.env.VITE_PUSH_ENDPOINT ?? '').replace(/\/+$/, '')

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`#${id} 가 없습니다`)
  return el as T
}

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

const code = makeCode()

/** 휴대폰이 열 주소. 앱은 이 코드로 자기 구독을 등록하고, 우리는 같은 코드로 알림을 쏜다. */
const phoneUrl = new URL(`m/?code=${code}`, `${location.origin}${import.meta.env.BASE_URL}`).href

const clock = (): string =>
  new Date().toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

const log = (text: string, hit = false): void => {
  const list = $('log')
  const li = document.createElement('li')
  li.className = hit ? 'hit' : ''
  const time = document.createElement('time')
  time.textContent = clock()
  const span = document.createElement('span')
  span.textContent = text
  li.append(time, span)
  list.prepend(li)
  // 길어지면 패널이 화면을 밀어낸다. 최근 것만 남긴다.
  while (list.children.length > 8) list.lastElementChild?.remove()
}

const renderQr = (): void => {
  const qr = qrcode(0, 'M')
  qr.addData(phoneUrl)
  qr.make()
  $('qr').innerHTML = qr.createSvgTag({ margin: 0, scalable: true })
  $('code').textContent = code
}

/** iframe 안의 PC 앱이 준비될 때까지 기다린다. 로드 직후에는 아직 훅이 없다. */
const waitForPcApp = async (frame: HTMLIFrameElement, timeoutMs = 20_000): Promise<DemoHook | null> => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const hook = (frame.contentWindow as (Window & { __sceneStealer?: DemoHook }) | null)?.__sceneStealer
    if (hook) return hook
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return null
}

type NotifyResult = 'sent' | 'no-phone' | 'no-server' | 'failed'

const notifyPhone = async (title: string, body: string, eventId: string): Promise<NotifyResult> => {
  if (!PUSH_ENDPOINT) return 'no-server'
  try {
    const response = await fetch(`${PUSH_ENDPOINT}/notify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, title, body, data: { eventId } }),
    })
    if (response.ok) return 'sent'
    return response.status === 404 || response.status === 410 ? 'no-phone' : 'failed'
  } catch {
    return 'failed'
  }
}

/**
 * 휴대폰이 QR 을 찍고 알림을 허용했는지 확인한다.
 * 이게 없으면 심사위원은 위험 버튼을 눌러 실패해 봐야 연결이 안 됐다는 걸 안다.
 */
const waitForPhone = (onConnected: () => void): (() => void) => {
  if (!PUSH_ENDPOINT) return () => undefined
  let stopped = false
  const poll = async (): Promise<void> => {
    while (!stopped) {
      try {
        const response = await fetch(`${PUSH_ENDPOINT}/subscribed?code=${code}`)
        const body = (await response.json()) as { subscribed?: boolean }
        if (body.subscribed) return onConnected()
      } catch {
        // 네트워크가 잠깐 끊겨도 계속 본다 — 심사 도중 조용히 멈추면 안 된다.
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }
  void poll()
  return () => {
    stopped = true
  }
}

const NOTIFY_MESSAGE: Record<NotifyResult, string> = {
  sent: '휴대폰으로 알림을 보냈습니다. 잠금화면을 확인해 주세요.',
  'no-phone': '휴대폰이 아직 연결되지 않았습니다. 1번의 QR 을 먼저 찍어 주세요.',
  'no-server': '이 배포에는 알림 서버가 연결돼 있지 않아, 휴대폰 화면 안에서만 알림이 보입니다.',
  failed: '알림을 보내지 못했습니다. 잠시 후 다시 눌러 주세요.',
}

/**
 * 좁은 화면이면 PC 앱 iframe 을 접고 모바일 앱으로 안내한다.
 * 이 주소가 대회 사이트에 걸리는 유일한 링크라 심사위원이 폰으로 먼저 열 수 있다.
 * 가로/세로를 돌리거나 창을 넓히면 따라 바뀌어야 해서 한 번 보고 마는 게 아니라 계속 듣는다.
 */
const watchViewport = (): void => {
  const narrowScreen = globalThis.matchMedia?.('(max-width: 720px)')
  const handoff = $('handoff')
  const pcSection = $('pc').closest('section')
  $<HTMLAnchorElement>('open-phone').href = phoneUrl

  const apply = (narrow: boolean): void => {
    handoff.hidden = !narrow
    if (pcSection) pcSection.hidden = narrow
  }

  apply(narrowScreen?.matches ?? false)
  narrowScreen?.addEventListener('change', (event) => apply(event.matches))
}

const PC_WIDTH = 1280
const PC_HEIGHT = 860

/** 고정 폭으로 그린 PC 앱을 자리 폭에 맞춰 줄인다. 자리가 바뀌면 다시 계산한다. */
const fitPcFrame = (): void => {
  const frame = $<HTMLIFrameElement>('pc')
  const wrap = frame.parentElement
  if (!wrap) return

  const apply = (): void => {
    const scale = Math.min(1, wrap.clientWidth / PC_WIDTH)
    frame.style.transform = `scale(${scale})`
    wrap.style.height = `${Math.round(PC_HEIGHT * scale)}px`
  }

  apply()
  new ResizeObserver(apply).observe(wrap)
}

const main = async (): Promise<void> => {
  renderQr()
  watchViewport()
  fitPcFrame()

  const startButton = $<HTMLButtonElement>('start')
  const riskButton = $<HTMLButtonElement>('risk')

  const hook = await waitForPcApp($<HTMLIFrameElement>('pc'))
  if (!hook) {
    log('PC 앱 화면을 불러오지 못했습니다. 새로고침해 주세요.')
    return
  }

  const phoneStatus = $('phone-status')
  phoneStatus.textContent = PUSH_ENDPOINT
    ? 'QR 을 찍고 앱에서 알림을 허용하면 준비가 끝납니다.'
    : '알림 서버 없이 도는 배포입니다 — 휴대폰에서는 페이지를 열어 둔 동안 알림이 보입니다.'

  waitForPhone(() => {
    phoneStatus.textContent = '휴대폰이 연결되었습니다. 이제 화면을 꺼도 알림이 갑니다.'
    phoneStatus.className = 'sub ok'
    $('step-phone').classList.add('done')
  })

  startButton.addEventListener('click', () => {
    startButton.disabled = true
    startButton.textContent = '감시 중…'
    $('step-run').classList.add('done')
    riskButton.disabled = false

    hook.onScenario?.((step) => log(step.detail ? `${step.label} — ${step.detail}` : step.label))
    hook.startScenario?.()
    log('카메라 5대 연결됨 · 30초 단위로 조각을 만듭니다')
  })

  riskButton.addEventListener('click', async () => {
    riskButton.disabled = true
    const event = hook.triggerRisk?.({ risk: 'high' })
    const camera = event?.cameraName ?? '계산대'
    log(`이상 행동 감지 · ${camera} · 위험도 높음`, true)
    $('step-alert').classList.add('done')

    const status = $('alert-status')
    status.textContent = '휴대폰으로 알림을 보내는 중…'
    status.className = 'sub'

    const result = await notifyPhone(
      `강남 1호점 · ${camera}`,
      '이상 행동이 감지되었습니다 · 위험도 높음',
      event?.eventId ?? 'ev-1',
    )
    status.textContent = NOTIFY_MESSAGE[result]
    status.className = result === 'sent' ? 'sub ok' : result === 'failed' ? 'sub warn' : 'sub'

    riskButton.disabled = false
    riskButton.textContent = '한 번 더 보내기'
  })
}

void main()
