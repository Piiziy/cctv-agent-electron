import { $, appUrl } from './shell'

/**
 * 실서버 시연 셸 (`/wanted-test`).
 *
 * 실제 앱 화면만 보인다 — 설명·진행 표시·QR 을 덧붙이지 않는다.
 *  - 컴퓨터: 매장 PC 앱을 창 가득 띄운다. 앱이 데모 계정으로 로그인해 시연 영상을 카메라 삼아
 *    실제 서버로 조각을 올리고, 경고는 서버 AI 가 판정한 것만 뜬다.
 *  - 휴대폰: 사장님 앱(`/m/?live=1`)으로 바로 넘어간다. 같은 데모 계정으로 열린다.
 * 셸이 직접 그리는 것은 시작하지 못했을 때의 이유뿐이다.
 */

// PC 앱(apps/pc/src/renderer/lib/live/live-api.ts)이 열어 두는 손잡이의 모양. 앱이 달라서 import 대신 옮겨 적는다.
type LiveBootResult =
  | { readonly ok: true; readonly storeName: string; readonly cameraCount: number }
  | { readonly ok: false; readonly message: string }

interface LiveDemoControl {
  readonly configMissing: readonly string[]
  readonly ready: Promise<LiveBootResult>
}

// 매장 PC 앱 창의 최소 크기 (apps/pc/src/main/index.ts 의 minWidth · minHeight). 앱 화면은 이보다 좁은 창을 전제하지 않는다.
const MIN_WIDTH = 1180
const MIN_HEIGHT = 720

/**
 * 휴대폰인가. 창 너비가 아니라 기기로 본다 — 컴퓨터에서 창을 좁혔다고 사장님 앱으로 넘기지 않는다.
 * 짧은 변이 600px 보다 작은 터치 기기가 휴대폰이다. 태블릿은 PC 앱을 줄여서 본다.
 */
const isPhone = (): boolean =>
  Math.min(screen.width, screen.height) < 600 &&
  (globalThis.matchMedia?.('(pointer: coarse)').matches === true || navigator.maxTouchPoints > 0)

/**
 * 앱이 창을 가득 채운다 — 데스크톱 앱 창과 같다. 창이 앱의 최소 크기보다 작으면 최소 크기로 그리고
 * 통째로 줄인다. 레이아웃이 깨지는 대신 작게 보인다.
 */
const fillWindow = (frame: HTMLIFrameElement): void => {
  const apply = (): void => {
    // 탭이 가려져 있으면 창 크기가 0 으로 온다. 보이게 되면 다시 불린다.
    if (!globalThis.innerWidth || !globalThis.innerHeight) return
    const scale = Math.min(1, globalThis.innerWidth / MIN_WIDTH, globalThis.innerHeight / MIN_HEIGHT)
    frame.style.width = `${globalThis.innerWidth / scale}px`
    frame.style.height = `${globalThis.innerHeight / scale}px`
    frame.style.transform = scale < 1 ? `scale(${scale})` : ''
  }
  apply()
  // resize 이벤트보다 확실하다 — 브라우저 확대·축소, 개발자 도구의 화면 흉내에서도 온다.
  new ResizeObserver(apply).observe(document.documentElement)
}

/** 탭 제목은 앱을 따라간다 — 위험 경고가 뜨면 앱이 제목을 바꿔 눈에 띄게 한다. */
const followTitle = (inner: Document): void => {
  const sync = (): void => {
    if (inner.title) document.title = inner.title
  }
  sync()
  new MutationObserver(sync).observe(inner.head ?? inner.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
  })
}

const showNotice = (message: string, missing: readonly string[] = []): void => {
  $('notice').hidden = false
  $('notice-message').textContent = message
  const list = $('notice-missing')
  list.hidden = missing.length === 0
  list.replaceChildren(
    ...missing.map((name) => {
      const item = document.createElement('li')
      item.textContent = name
      return item
    }),
  )
  $('notice-hint').hidden = missing.length === 0
}

/** 몇 번째로 뜬 앱인가. 앞선 앱의 늦은 결과가 지금 화면에 안내를 띄우지 않게 한다. */
let generation = 0

/**
 * 앱 문서가 뜰 때마다 (로그아웃하면 앱이 스스로 새로 뜬다). 앱은 스크립트가 돌 때 바로 손잡이를
 * 열어서 load 가 오면 이미 있다 — 시간으로 기다리지 않는다. 뒤에서 연 탭은 브라우저가 느리게 돌려서,
 * 시간으로 재면 멀쩡한 앱을 '못 불러왔다'고 할 수 있다.
 */
const onAppLoad = async (frame: HTMLIFrameElement): Promise<void> => {
  const inner = frame.contentDocument
  // iframe 이 처음 붙을 때 생기는 빈 문서의 load 는 건너뛴다.
  if (!inner || inner.URL === 'about:blank') return
  const mine = ++generation
  const stale = (): boolean => mine !== generation
  followTitle(inner)
  $('notice').hidden = true

  const control = (frame.contentWindow as (Window & { __sceneStealerLive?: LiveDemoControl }) | null)
    ?.__sceneStealerLive
  if (!control) {
    showNotice('매장 PC 화면을 불러오지 못했습니다. 새로고침해 주세요.')
    return
  }

  // 서버가 답을 안 하면 fetch 는 한참 매달린다. 그동안 빈 화면을 두지 않고 이유를 먼저 알린다 —
  // 늦게라도 붙으면 안내를 걷고 그대로 진행한다.
  const slow = setTimeout(() => {
    if (!stale()) {
      showNotice('실서버가 30초째 응답하지 않습니다. 백엔드 주소 · HTTPS · CORS 설정을 확인해 주세요. 연결되면 바로 시작합니다.')
    }
  }, 30_000)
  const result = await control.ready
  clearTimeout(slow)
  if (stale()) return
  if (result.ok) $('notice').hidden = true
  else showNotice(result.message, control.configMissing)
}

const main = (): void => {
  if (isPhone()) {
    globalThis.location.replace(appUrl('m/?live=1'))
    return
  }

  const frame = $<HTMLIFrameElement>('pc')
  fillWindow(frame)
  frame.addEventListener('load', () => void onAppLoad(frame))
  frame.src = appUrl('pc/?live=1')
}

main()
