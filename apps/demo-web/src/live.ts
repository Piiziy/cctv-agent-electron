import { $, appUrl, fitPcFrame, renderQr, setupCollapsible, waitForFrameValue, watchViewport } from './shell'

/**
 * 실서버 시연 셸 (`/wanted-test`).
 *
 * `/` 의 데모와 달리 여기서는 아무것도 지어내지 않는다. iframe 안의 PC 앱이 데모 계정으로
 * 로그인해 시연 영상을 실제 서버로 올리고, 경고는 서버 AI 가 판정한 것만 뜬다.
 * 이 셸이 하는 일은 셋이다 — PC 앱을 띄우고, 휴대폰 QR 을 보이고, 조각 업로드와 서버 분석이
 * 어디까지 왔는지 보여 준다. 마지막 것이 없으면 경고가 오기 전 1~2분이 고장처럼 보인다.
 */

// PC 앱(apps/pc/src/renderer/lib/live/*)이 열어 두는 손잡이의 모양. 앱이 달라서 import 대신 옮겨 적는다.
type SegmentPhase = 'pending' | 'uploading' | 'retrying' | 'uploaded' | 'failed'

interface SegmentProgress {
  readonly key: string
  readonly cameraName: string
  readonly index: number
  readonly total: number
  readonly offsetMs: number
  readonly durationMs: number
  readonly phase: SegmentPhase
  readonly error: string | null
  readonly analysis: {
    readonly status: 'uploaded' | 'processing' | 'done' | 'failed'
    readonly progress: number
    readonly anomalyCount: number
  } | null
}

interface LiveProgress {
  readonly phase: 'idle' | 'running' | 'finished' | 'stopped' | 'error'
  readonly message: string | null
  readonly startedAt: number | null
  readonly durationMs: number
  readonly segments: readonly SegmentProgress[]
}

type LiveBootResult =
  | { readonly ok: true; readonly storeName: string; readonly cameraCount: number }
  | { readonly ok: false; readonly message: string }

interface LiveDemoControl {
  readonly configMissing: readonly string[]
  readonly ready: Promise<LiveBootResult>
  restart(): void
  progress(): LiveProgress | null
  onProgress(listener: (progress: LiveProgress) => void): () => void
}

const phoneUrl = appUrl('m/?live=1')

const clock = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** 조각 한 줄의 상태 문구와 색. 서버 분석 상태가 있으면 그게 가장 새 소식이다. */
const describe = (
  segment: SegmentProgress,
  elapsedMs: number,
): { readonly text: string; readonly tone: 'idle' | 'live' | 'busy' | 'ok' | 'alert' | 'bad' } => {
  const analysis = segment.analysis
  if (segment.phase === 'uploaded' && analysis) {
    if (analysis.status === 'processing') return { text: `AI 분석 중 ${analysis.progress}%`, tone: 'busy' }
    if (analysis.status === 'done') {
      return analysis.anomalyCount > 0
        ? { text: `분석 완료 · 이상 구간 ${analysis.anomalyCount}개`, tone: 'alert' }
        : { text: '분석 완료 · 이상 없음', tone: 'ok' }
    }
    if (analysis.status === 'failed') return { text: '서버 분석 실패', tone: 'bad' }
    return { text: '업로드됨 · AI 분석 대기', tone: 'busy' }
  }
  switch (segment.phase) {
    case 'uploaded':
      return { text: '업로드됨 · AI 분석 대기', tone: 'busy' }
    case 'uploading':
      return { text: '서버로 올리는 중', tone: 'busy' }
    case 'retrying':
      return { text: `다시 보내는 중${segment.error ? ` (${segment.error})` : ''}`, tone: 'bad' }
    case 'failed':
      return { text: `못 올림${segment.error ? ` (${segment.error})` : ''}`, tone: 'bad' }
    default: {
      if (elapsedMs < segment.offsetMs) return { text: '대기', tone: 'idle' }
      if (elapsedMs < segment.offsetMs + segment.durationMs) return { text: '녹화 중', tone: 'live' }
      return { text: '조각 마무리 중', tone: 'busy' }
    }
  }
}

const PHASE_TEXT: Record<LiveProgress['phase'], string> = {
  idle: '준비 중',
  running: '시연 영상을 카메라 삼아 30초마다 조각을 실제 서버로 올리고 있습니다.',
  finished: '영상을 끝까지 올렸습니다. 서버 AI 판정 결과가 오는 대로 경고가 뜹니다.',
  stopped: '멈췄습니다.',
  error: '문제가 생겼습니다.',
}

const render = (progress: LiveProgress | null, storeName: string): void => {
  if (!progress) return
  const elapsed = progress.startedAt ? Date.now() - progress.startedAt : 0
  const multiCamera = new Set(progress.segments.map((segment) => segment.cameraName)).size > 1

  $('live-store').textContent = storeName ? `· ${storeName}` : ''
  $('live-clock').textContent =
    progress.durationMs > 0 ? `${clock(Math.min(elapsed, progress.durationMs))} / ${clock(progress.durationMs)}` : ''

  const state = $('live-state')
  state.textContent = progress.phase === 'error' && progress.message ? progress.message : PHASE_TEXT[progress.phase]
  state.className = progress.phase === 'error' ? 'live-state warn' : 'live-state'

  const dot = $('live-dot')
  dot.className = `dot ${progress.phase === 'running' ? 'is-live' : progress.phase === 'error' ? 'is-bad' : 'ready'}`

  const list = $('segments')
  list.replaceChildren(
    ...progress.segments.map((segment) => {
      const { text, tone } = describe(segment, elapsed)
      const item = document.createElement('li')
      item.className = `segment is-${tone}`
      const label = document.createElement('span')
      label.className = 'segment-label'
      label.textContent = `${multiCamera ? `${segment.cameraName} · ` : ''}조각 ${segment.index + 1}/${segment.total} · ${clock(segment.offsetMs)}–${clock(segment.offsetMs + segment.durationMs)}`
      const status = document.createElement('span')
      status.className = 'segment-status'
      status.textContent = text
      item.append(label, status)
      return item
    }),
  )
}

const showNotice = (message: string, missing: readonly string[] = []): void => {
  $('live').hidden = true
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

const main = async (): Promise<void> => {
  const frame = $<HTMLIFrameElement>('pc')
  frame.src = appUrl('pc/?live=1')
  fitPcFrame(frame)
  renderQr($('qr'), phoneUrl)
  setupCollapsible($<HTMLButtonElement>('phone-toggle'), $('phone-body'))
  setupCollapsible($<HTMLButtonElement>('live-toggle'), $('live-body'))
  watchViewport($('handoff'), $<HTMLAnchorElement>('open-phone'), phoneUrl)

  const control = await waitForFrameValue(
    frame,
    (window) => (window as Window & { __sceneStealerLive?: LiveDemoControl }).__sceneStealerLive,
  )
  if (!control) {
    showNotice('매장 PC 화면을 불러오지 못했습니다. 새로고침해 주세요.')
    return
  }

  // 서버가 답을 안 하면 fetch 는 한참 매달린다. 그동안 빈 화면을 두지 않고 이유를 먼저 알린다 —
  // 늦게라도 붙으면 안내를 걷고 그대로 진행한다.
  const slow = setTimeout(
    () => showNotice('실서버가 30초째 응답하지 않습니다. 백엔드 주소 · HTTPS · CORS 설정을 확인해 주세요. 연결되면 바로 시작합니다.'),
    30_000,
  )
  const result = await control.ready
  clearTimeout(slow)
  if (!result.ok) {
    showNotice(result.message, control.configMissing)
    return
  }

  $('notice').hidden = true
  $('live').hidden = false
  const draw = (): void => render(control.progress(), result.storeName)
  draw()
  control.onProgress(draw)
  // 재생 시각과 '녹화 중' 표시는 시간이 흐르는 것만으로 바뀐다.
  setInterval(draw, 1000)
  $('restart').addEventListener('click', () => control.restart())
}

void main()
