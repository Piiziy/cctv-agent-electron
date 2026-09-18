import { ulid } from 'ulid'
import { createHeartbeat } from '../../../main/services/heartbeat'
import { createServerClient } from '../../../main/services/server-client'
import { createServerSession, SessionError, type SessionTokens, type TokenStore } from '../../../main/services/server-session'
import { createServerStream } from '../../../main/services/server-stream'
import type { AgentApi, ServerRequest, ServerResult, SessionSummary, StreamConnectionState } from '../../../shared/ipc'
import type { ServerStreamMessage, StoreDto } from '../../../shared/server-types'
import { DEFAULT_CONFIG, type AgentConfig, type AgentStatus } from '../../../shared/types'
import { createCollector, segmentKey, type Collector, type LiveProgress, type SegmentAnalysis } from './collector'
import { LIVE_ACCOUNT_LABEL, liveConfig, missingLiveConfig, type LiveConfig } from './config'
import { loadManifest, type DemoManifest } from './manifest'

/**
 * 실서버 데모의 AgentApi — Electron 의 preload 가 주는 것과 같은 모양이다.
 * 화면들은 자기가 데모인지 모른다.
 *
 * 서버 쪽 절반(로그인·API·실시간 채널·하트비트)은 메인 프로세스의 모듈을 그대로 쓴다.
 * 전부 fetch 만 쓰도록 짜여 있어서 브라우저에서도 돈다. 에이전트 쪽 절반(카메라 검색·
 * RTSP·ffmpeg)만 시연 영상 수집기(collector.ts)로 바뀐다.
 */

export type LiveBootResult =
  | { readonly ok: true; readonly storeName: string; readonly cameraCount: number }
  | { readonly ok: false; readonly message: string }

/** 바깥 데모 셸(/wanted-test)이 iframe 너머로 부르는 손잡이. */
export interface LiveDemoControl {
  readonly configMissing: readonly string[]
  readonly ready: Promise<LiveBootResult>
  restart(): void
  progress(): LiveProgress | null
  onProgress(listener: (progress: LiveProgress) => void): () => void
}

declare global {
  interface Window {
    __sceneStealerLive?: LiveDemoControl
  }
}

const NOT_IN_DEMO = '웹 체험판에서는 시연 영상이 카메라를 대신합니다. 실제 카메라 연결은 매장 PC 앱에서 합니다.'
const SESSION_KEY = 'scene-stealer:live:session'
const ANALYSIS_POLL_MS = 4000

/** 탭을 닫으면 사라지는 세션 저장소. 새로고침해도 다시 로그인하지 않게만 한다. */
const tabTokenStore = (): TokenStore => ({
  load: () => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      return raw ? (JSON.parse(raw) as SessionTokens) : null
    } catch {
      return null
    }
  },
  save: (tokens) => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(tokens))
    } catch {
      // 저장이 막혀도 이 탭 안에서는 메모리로 돈다.
    }
  },
  clear: () => {
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      // 위와 같다.
    }
  },
})

const idleStatus: AgentStatus = {
  running: false,
  upload: 'idle',
  cameras: [],
  bytesUploadedToday: 0,
  spoolLimitBytesPerCamera: DEFAULT_CONFIG.spoolLimitBytes,
  lastError: null,
}

interface VideoListItem {
  readonly storeId?: string
  readonly cameraLocation?: string | null
  readonly status?: string
  readonly progress?: number
  readonly recordedStartedAt?: string
  readonly anomalyCount?: number
}

const ANALYSIS_STATUSES = new Set(['uploaded', 'processing', 'done', 'failed'])

export const createLiveApi = (config: LiveConfig = liveConfig): AgentApi => {
  // 브라우저의 fetch 는 window 에 묶여 있어야 한다. 그냥 넘기면 'Illegal invocation'.
  const browserFetch: typeof fetch = (input, init) => globalThis.fetch(input, init)

  const session = createServerSession({
    getConfig: () => ({ supabaseUrl: config.supabaseUrl, supabaseAnonKey: config.supabaseAnonKey }),
    fetch: browserFetch,
    store: tabTokenStore(),
  })
  const client = createServerClient({ getBaseUrl: () => config.apiUrl, session, fetch: browserFetch })

  const streamListeners = new Set<(message: ServerStreamMessage) => void>()
  const streamStateListeners = new Set<(state: StreamConnectionState) => void>()
  const stream = createServerStream({
    getBaseUrl: () => config.apiUrl,
    session,
    fetch: browserFetch,
    onMessage: (message) => streamListeners.forEach((listener) => listener(message)),
    onState: (next) => streamStateListeners.forEach((listener) => listener(next)),
  })

  const statusListeners = new Set<(status: AgentStatus) => void>()
  const progressListeners = new Set<(progress: LiveProgress) => void>()

  const state = {
    config: {
      ...DEFAULT_CONFIG,
      deviceId: 'web-demo',
      backendBaseUrl: config.apiUrl,
      supabaseUrl: config.supabaseUrl,
      supabaseAnonKey: config.supabaseAnonKey,
      deviceToken: config.deviceToken,
    } as AgentConfig,
    collector: null as Collector | null,
    manifest: null as DemoManifest | null,
    store: null as StoreDto | null,
    analysisTimer: null as ReturnType<typeof setTimeout> | null,
  }

  const summary = (): SessionSummary => {
    const current = session.summary()
    return current ? { signedIn: true, ...current } : { signedIn: false }
  }

  const request = (req: ServerRequest): Promise<ServerResult> => client.request(req)

  /**
   * 서버 분석 진행률. /videos 가 이 계정의 최근 조각과 분석 상태를 준다.
   * 조각 id 는 응답에 없어서 (카메라 이름, 시작 시각)으로 맞춘다 — 시작 시각은 우리가 보낸 값 그대로다.
   */
  const pollAnalysis = async (): Promise<void> => {
    state.analysisTimer = null
    const collector = state.collector
    const store = state.store
    if (!collector || !store) return

    const waiting = collector
      .progress()
      .segments.filter(
        (segment) =>
          segment.phase === 'uploaded' &&
          segment.analysis?.status !== 'done' &&
          segment.analysis?.status !== 'failed',
      )
    if (waiting.length > 0) {
      const result = await request({ method: 'GET', path: '/videos?limit=50' })
      const videos = result.ok ? ((result.data as { videos?: VideoListItem[] } | null)?.videos ?? []) : []
      const found = new Map<string, SegmentAnalysis>()
      waiting.forEach((segment) => {
        const startedAt = Date.parse(segment.startedAt)
        const match = videos.find(
          (video) =>
            video.storeId === store.id &&
            video.cameraLocation === segment.cameraName &&
            Date.parse(video.recordedStartedAt ?? '') === startedAt,
        )
        if (match && typeof match.status === 'string' && ANALYSIS_STATUSES.has(match.status)) {
          found.set(segmentKey(segment.cameraId, segment.index), {
            status: match.status as SegmentAnalysis['status'],
            progress: typeof match.progress === 'number' ? match.progress : 0,
            anomalyCount: typeof match.anomalyCount === 'number' ? match.anomalyCount : 0,
          })
        }
      })
      collector.mergeAnalysis(found)
    }

    const stillWaiting = collector
      .progress()
      .segments.some(
        (segment) =>
          segment.phase === 'pending' ||
          segment.phase === 'uploading' ||
          segment.phase === 'retrying' ||
          (segment.phase === 'uploaded' &&
            segment.analysis?.status !== 'done' &&
            segment.analysis?.status !== 'failed'),
      )
    if (stillWaiting) state.analysisTimer = setTimeout(() => void pollAnalysis(), ANALYSIS_POLL_MS)
  }

  const watchAnalysis = (): void => {
    if (state.analysisTimer) clearTimeout(state.analysisTimer)
    state.analysisTimer = setTimeout(() => void pollAnalysis(), ANALYSIS_POLL_MS)
  }

  const fail = (message: string): LiveBootResult => ({ ok: false, message })

  const boot = async (): Promise<LiveBootResult> => {
    const missing = missingLiveConfig(config)
    if (missing.length > 0) {
      return fail(`실서버 설정이 이 배포에 없습니다: ${missing.join(', ')}`)
    }

    // 1) 데모 계정 로그인. 이 탭에서 이미 했으면 그 세션을 쓴다(만료가 가까우면 갱신).
    const existing = session.summary() ? await session.accessToken() : null
    if (!existing) {
      try {
        await session.signInWithPassword(config.email, config.password, LIVE_ACCOUNT_LABEL)
      } catch (error) {
        return fail(
          error instanceof SessionError
            ? error.message
            : '로그인 서버(Supabase)에 연결할 수 없습니다. 주소를 확인해 주세요.',
        )
      }
    }

    // 2) 매장. 데모 계정의 매장 중 지정한 것, 없으면 첫 번째.
    const stores = await request({ method: 'GET', path: '/stores' })
    if (!stores.ok) {
      return fail(
        stores.status === 0
          ? // 브라우저는 CORS 거절도 '연결 실패'로만 알려 준다. 가장 흔한 원인부터 적는다.
            `백엔드(${new URL(config.apiUrl).host})에 연결할 수 없습니다. 이 페이지가 백엔드와 같은 도메인의 https 주소로 ` +
            `열렸는지(CORS — *.vercel.app 은 막힌다), 백엔드가 떠 있고 HTTPS 인증서가 있는지 확인해 주세요.`
          : `매장을 불러오지 못했습니다: ${stores.error}`,
      )
    }
    const list = (stores.data as { stores?: StoreDto[] } | null)?.stores ?? []
    const store = (config.storeId ? list.find((candidate) => candidate.id === config.storeId) : list[0]) ?? null
    if (!store) {
      return fail(
        config.storeId
          ? `데모 계정에서 매장(${config.storeId})을 찾지 못했습니다.`
          : '데모 계정에 매장이 없습니다. 매장을 먼저 만들어 주세요.',
      )
    }
    state.store = store

    // 3) 시연 영상 = 카메라.
    let manifest: DemoManifest
    try {
      manifest = await loadManifest(browserFetch)
    } catch (error) {
      return fail(error instanceof Error ? error.message : '시연 영상 목록을 읽지 못했습니다')
    }
    if (manifest.videos.length === 0) {
      return fail('시연 영상이 없습니다. public/demo-video 에 영상을 넣고 다시 배포해 주세요.')
    }
    state.manifest = manifest

    // 서버가 조각을 이 카메라에 달 수 있게 등록해 둔다. 같은 id 로 다시 등록하면 기존 것을 돌려준다.
    const registered = await Promise.all(
      manifest.videos.map((video, index) =>
        request({
          method: 'POST',
          path: `/stores/${encodeURIComponent(store.id)}/cameras`,
          body: { agentCameraId: video.id, name: video.name, sortOrder: index, streamProfile: 'sub' },
        }),
      ),
    )
    const rejected = registered.find((result) => !result.ok)
    if (rejected && !rejected.ok) {
      return fail(`카메라를 서버에 등록하지 못했습니다: ${rejected.error}`)
    }

    // 조각 길이는 매장 설정이 단일 출처다. 미리 자른 길이와 맞춰 둔다 (30초 / 1분 / 5분만 된다).
    if (store.segmentSeconds !== manifest.segmentSeconds && [30, 60, 300].includes(manifest.segmentSeconds)) {
      await request({
        method: 'PATCH',
        path: `/stores/${encodeURIComponent(store.id)}`,
        body: { segmentSeconds: manifest.segmentSeconds },
      })
    }

    const collector = createCollector({
      manifest,
      apiUrl: config.apiUrl,
      deviceToken: config.deviceToken,
      storeId: store.id,
      deviceId: store.device?.deviceId ?? state.config.deviceId,
      fetch: browserFetch,
      newSegmentId: () => ulid(),
    })
    state.collector = collector
    state.config = {
      ...state.config,
      storeId: store.id,
      deviceId: store.device?.deviceId ?? state.config.deviceId,
      segmentSeconds: manifest.segmentSeconds,
      cameras: collector.cameras,
    }
    collector.onStatus((status) => statusListeners.forEach((listener) => listener(status)))
    collector.onProgress((progress) => progressListeners.forEach((listener) => listener(progress)))

    // 들어오자마자 돈다. 심사위원이 누를 것은 없다.
    collector.start()
    watchAnalysis()

    // 하트비트는 탭이 열려 있는 동안 계속 간다 — 모바일의 'PC 켜짐'이 여기서 나온다.
    // 수집기를 먼저 켜야 첫 하트비트부터 카메라가 connected 로 간다.
    // 영상이 끝난 카메라는 에이전트의 '일시 중지'처럼 unknown 으로 보고된다.
    createHeartbeat({
      getConfig: () => state.config,
      getStatus: () => collector.status(),
      fetch: browserFetch,
      onSegmentSeconds: () => undefined,
    }).start()
    return { ok: true, storeName: store.name, cameraCount: manifest.videos.length }
  }

  const ready = boot().catch(
    (error: unknown): LiveBootResult => fail(error instanceof Error ? error.message : '실서버 데모를 시작하지 못했습니다'),
  )

  window.__sceneStealerLive = {
    configMissing: missingLiveConfig(config),
    ready,
    restart: () => {
      state.collector?.start()
      watchAnalysis()
    },
    progress: () => state.collector?.progress() ?? null,
    onProgress: (listener) => {
      progressListeners.add(listener)
      return () => {
        progressListeners.delete(listener)
      }
    },
  }

  return {
    discover: async () => ({ ok: false, message: NOT_IN_DEMO }),
    probe: async () => ({ ok: false, kind: 'unknown', message: NOT_IN_DEMO }),
    probeRtsp: async () => ({ ok: false, kind: 'unknown', message: NOT_IN_DEMO }),
    snapshot: async () => ({ ok: false, message: NOT_IN_DEMO }),

    previewStart: async (rtspUri) => {
      await ready
      const collector = state.collector
      const camera = collector?.cameras.find((candidate) => candidate.rtspUri === rtspUri)
      const video = camera ? state.manifest?.videos.find((candidate) => candidate.id === camera.id) : undefined
      if (!collector || !camera || !video) return { ok: false, message: '시연 영상을 찾지 못했습니다' }
      // 수집기가 올리고 있는 지점부터 튼다 — 화면에 보이는 장면이 곧 서버로 가는 조각이다.
      const seconds = collector.playheadMs(camera.id) / 1000
      return { ok: true, url: `${video.url}#t=${seconds.toFixed(2)}` }
    },
    previewStop: async () => undefined,

    start: async () => {
      await ready
      state.collector?.start()
      watchAnalysis()
    },
    stop: async () => {
      await ready
      state.collector?.stop()
    },
    getConfig: async () => {
      await ready
      return state.config
    },
    setConfig: async (patch) => {
      await ready
      state.config = { ...state.config, ...patch }
      return state.config
    },
    getStatus: async () => {
      await ready
      return state.collector?.status() ?? idleStatus
    },
    onStatus: (listener) => {
      statusListeners.add(listener)
      return () => {
        statusListeners.delete(listener)
      }
    },
    openSpoolFolder: async () => undefined,

    authSendOtp: async () => ({ ok: false, message: '체험판은 데모 계정으로 자동 로그인됩니다.' }),
    authVerifyOtp: async () => ({ ok: false, message: '체험판은 데모 계정으로 자동 로그인됩니다.' }),
    authSignOut: async () => {
      // 체험판에는 다른 계정이 없다. 로그아웃은 '처음부터 다시'로 쓴다.
      stream.stop()
      await session.signOut()
      window.location.reload()
    },
    authGetSession: async () => {
      await ready
      return summary()
    },

    serverRequest: request,
    serverStreamStart: async (storeId) => stream.start(storeId),
    serverStreamStop: async () => stream.stop(),
    onServerStream: (listener) => {
      streamListeners.add(listener)
      return () => {
        streamListeners.delete(listener)
      }
    },
    onServerStreamState: (listener) => {
      streamStateListeners.add(listener)
      return () => {
        streamStateListeners.delete(listener)
      }
    },

    attention: async (on) => {
      // 브라우저에는 '최상위 창'이 없다. 제목만 바꿔 눈에 띄게 한다.
      document.title = on ? '⚠ 위험 감지 — Scene Stealer' : 'Scene Stealer'
    },
    openExternal: async (url) => {
      window.open(url, '_blank', 'noopener')
      return true
    },
    copyText: async (text) => {
      await navigator.clipboard?.writeText(text).catch(() => undefined)
    },
  }
}
