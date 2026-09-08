import type { AgentApi } from '../../shared/ipc'
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

export const createMockApi = (): AgentApi => {
  const listeners = new Set<(status: AgentStatus) => void>()
  const store = {
    config: { ...DEFAULT_CONFIG, deviceId: 'agent-mock0001' } as AgentConfig,
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
    previewStart: async () => {
      await delay(300)
      return { ok: true as const, url: PLACEHOLDER }
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
      return store.config
    },
    getStatus: async () => store.status,
    openSpoolFolder: async () => undefined,
    onStatus: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener) as unknown as void
    },
  }
}
