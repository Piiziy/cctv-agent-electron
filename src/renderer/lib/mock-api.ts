import type { AgentApi, SessionSummary } from '../../shared/ipc'
import { createMockServer, frame } from './mock-server'
import {
  DEFAULT_CONFIG,
  type AgentConfig,
  type AgentStatus,
  type DiscoveredCamera,
  type StreamProfile,
} from '../../shared/types'

/**
 * Electron 없이 브라우저에서 화면을 보기 위한 가짜 API (`npm run ui`).
 * 제품 동작에는 관여하지 않는다 — window.api 가 있으면 언제나 그쪽이 이긴다.
 */

const CAMERAS: DiscoveredCamera[] = [
  {
    id: 'urn:uuid:mock-hik',
    xaddr: 'http://192.168.0.64/onvif/device_service',
    ip: '192.168.0.64',
    port: 80,
    manufacturer: 'HIKVISION',
    model: 'DS-2CD2143G2',
    name: 'HIKVISION',
  },
  {
    id: 'urn:uuid:mock-hanwha',
    xaddr: 'http://192.168.0.65/onvif/device_service',
    ip: '192.168.0.65',
    port: 80,
    manufacturer: 'Hanwha',
    model: 'QNO-8080R',
    name: 'Hanwha',
  },
  {
    id: 'urn:uuid:mock-sim',
    xaddr: 'http://127.0.0.1:8000/onvif/device_service',
    ip: '127.0.0.1',
    port: 8000,
    manufacturer: 'FakeCam',
    model: 'SIM-1000',
    name: '테스트카메라',
  },
]

const PROFILES: StreamProfile[] = [
  {
    token: 'main',
    kind: 'main',
    rtspUri: 'rtsp://admin:***@192.168.0.64:554/Streaming/Channels/101',
    codec: 'h264',
    width: 1920,
    height: 1080,
    fps: 15,
    bitrateKbps: 4096,
  },
  {
    token: 'sub',
    kind: 'sub',
    rtspUri: 'rtsp://admin:***@192.168.0.64:554/Streaming/Channels/102',
    codec: 'h264',
    width: 704,
    height: 480,
    fps: 15,
    bitrateKbps: 512,
  },
]

// 1×1 회색 픽셀. 실제 미리보기 자리를 차지한다.
const PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 새로고침(HMR)해도 로그인·설정이 풀리지 않게 탭 수명만큼 들고 있는다.
 * 저장소를 못 쓰는 환경(시크릿 창 등)이면 그냥 메모리로 돈다.
 */
const persisted = <T>(key: string, fallback: T) => ({
  read: (): T => {
    try {
      const raw = sessionStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  },
  write: (value: T): void => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      // 못 써도 동작은 한다.
    }
  },
})

const configStorage = persisted<AgentConfig>('scene-stealer:mock-config', {
  ...DEFAULT_CONFIG,
  deviceId: 'agent-mock0001',
})
const sessionStorageBox = persisted<SessionSummary>('scene-stealer:mock-session', { signedIn: false })

declare global {
  interface Window {
    /** 개발용 — 콘솔에서 window.__sceneStealer.emitRiskEvent() 로 2d 팝업을 띄운다. */
    __sceneStealer?: { emitRiskEvent: ReturnType<typeof createMockServer>['emitRiskEvent'] }
  }
}

export const createMockApi = (): AgentApi => {
  const listeners = new Set<(status: AgentStatus) => void>()
  const server = createMockServer()
  window.__sceneStealer = { emitRiskEvent: server.emitRiskEvent }

  const store = {
    config: configStorage.read(),
    session: sessionStorageBox.read(),
    status: {
      running: false,
      upload: 'idle',
      cameras: [],
      bytesUploadedToday: 0,
      spoolLimitBytesPerCamera: DEFAULT_CONFIG.spoolLimitBytes,
      lastError: null,
    } as AgentStatus,
    timer: null as ReturnType<typeof setInterval> | null,
  }

  const publish = (next: Partial<AgentStatus>): void => {
    store.status = { ...store.status, ...next }
    listeners.forEach((listener) => listener(store.status))
  }

  return {
    discover: async () => {
      await delay(1200)
      return { ok: true as const, cameras: CAMERAS }
    },
    probe: async () => {
      await delay(700)
      return { ok: true, profiles: PROFILES }
    },
    probeRtsp: async (rtspUri) => {
      await delay(700)
      return { ok: true, profiles: [{ ...PROFILES[1]!, token: 'manual', kind: 'main', rtspUri }] }
    },
    snapshot: async () => {
      await delay(300)
      return { ok: true, dataUrl: PLACEHOLDER }
    },
    previewStart: async (_rtspUri, options) => {
      await delay(300)
      // 격자 타일마다 다른 화면처럼 보이게 키를 라벨로 쓴다.
      return { ok: true as const, url: options?.key ? frame('LIVE') : PLACEHOLDER }
    },
    previewStop: async () => undefined,
    start: async (cameras) => {
      store.config = { ...store.config, cameras }
      const entries = cameras.map((camera) => ({
        cameraId: camera.id,
        name: camera.name,
        camera: 'connecting' as const,
        uploadedCount: 0,
        pendingCount: 0,
        lastUploadAt: null,
        spoolBytes: 0,
        lastError: null,
        spoolEvicted: false,
      }))
      publish({ running: true, cameras: entries, upload: 'idle' })
      await delay(600)
      publish({ cameras: entries.map((e) => ({ ...e, camera: 'streaming' as const })) })
      store.timer = setInterval(() => {
        publish({
          cameras: store.status.cameras.map((c) => ({
            ...c,
            uploadedCount: c.uploadedCount + 1,
            lastUploadAt: new Date().toISOString(),
          })),
          bytesUploadedToday: store.status.bytesUploadedToday + 19_783_421 * cameras.length,
          upload: 'idle',
        })
      }, 3000)
    },
    stop: async () => {
      if (store.timer) clearInterval(store.timer)
      store.timer = null
      publish({ running: false, cameras: [], upload: 'idle' })
    },
    getConfig: async () => store.config,
    setConfig: async (patch) => {
      store.config = { ...store.config, ...patch }
      configStorage.write(store.config)
      return store.config
    },
    getStatus: async () => store.status,
    openSpoolFolder: async () => undefined,
    onStatus: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener) as unknown as void
    },

    authSendOtp: async (phone) => {
      await delay(500)
      const digits = phone.replace(/\D/g, '')
      return /^010\d{8}$/.test(digits)
        ? { ok: true, value: null }
        : { ok: false, message: '휴대폰 번호를 확인해 주세요. (예: 010-1234-5678)' }
    },
    authVerifyOtp: async (phone, code) => {
      await delay(500)
      // 000000 은 틀린 번호로 취급한다 — 에러 화면을 확인하려고.
      if (!/^\d{6}$/.test(code) || code === '000000') {
        return { ok: false, message: '인증번호가 맞지 않거나 만료되었습니다. 다시 확인해 주세요.' }
      }
      const session: SessionSummary = { signedIn: true, userId: 'user-mock-owner', phone }
      store.session = session
      sessionStorageBox.write(session)
      return { ok: true, value: session }
    },
    authSignOut: async () => {
      server.stopStream()
      store.session = { signedIn: false }
      sessionStorageBox.write(store.session)
    },
    authGetSession: async () => store.session,

    serverRequest: async (request) =>
      store.session.signedIn ? server.request(request) : { ok: false, status: 401, error: '로그인이 필요합니다.' },
    serverStreamStart: async (storeId) => server.startStream(storeId),
    serverStreamStop: async () => server.stopStream(),
    onServerStream: (listener) => {
      const off = server.onStream(listener)
      return () => {
        off()
      }
    },
    onServerStreamState: (listener) => {
      const off = server.onStreamState(listener)
      return () => {
        off()
      }
    },

    attention: async (on) => {
      // 브라우저에는 '최상위 창'이 없다. 제목만 바꿔 눈에 띄게 한다.
      document.title = on ? '⚠ 위험 감지 — Scene Stealer' : 'Scene Stealer'
    },
  }
}
