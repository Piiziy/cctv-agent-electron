import type {
  AgentConfig,
  AgentStatus,
  DiscoveredCamera,
  SelectedCamera,
  StreamProfile,
} from './types'

export const IPC = {
  discover: 'agent:discover',
  probe: 'agent:probe',
  probeRtsp: 'agent:probe-rtsp',
  snapshot: 'agent:snapshot',
  previewStart: 'agent:preview-start',
  previewStop: 'agent:preview-stop',
  start: 'agent:start',
  stop: 'agent:stop',
  getConfig: 'agent:get-config',
  setConfig: 'agent:set-config',
  getStatus: 'agent:get-status',
  statusChanged: 'agent:status-changed',
  openSpoolFolder: 'agent:open-spool-folder',
} as const

/** 실패 사유를 구분해 화면이 제조사별 안내를 띄울 수 있게 한다. */
export type ProbeFailure = 'auth' | 'unreachable' | 'unknown'

export type ProbeResult =
  | { readonly ok: true; readonly profiles: readonly StreamProfile[] }
  | { readonly ok: false; readonly kind: ProbeFailure; readonly message: string }

/** 검색이 '0대'인 것과 '검색 자체가 실패'한 것을 구분한다. 섞으면 사용자가 네트워크를 의심하게 된다. */
export type DiscoverResult =
  | { readonly ok: true; readonly cameras: readonly DiscoveredCamera[] }
  | { readonly ok: false; readonly message: string }

export type PreviewResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly message: string }

export type SnapshotResult =
  | { readonly ok: true; readonly dataUrl: string }
  | { readonly ok: false; readonly message: string }

export interface ProbeArgs {
  readonly xaddr: string
  readonly username: string
  readonly password: string
}

export interface AgentApi {
  discover(timeoutMs?: number): Promise<DiscoverResult>
  probe(args: ProbeArgs): Promise<ProbeResult>
  /** ONVIF 검색에 안 잡히는 카메라를 위한 수동 경로. RTSP 주소를 직접 조사한다. */
  probeRtsp(rtspUri: string): Promise<ProbeResult>
  snapshot(rtspUri: string): Promise<SnapshotResult>
  /** 실시간 미리보기 스트림을 켜고 <img src> 에 넣을 URL 을 받는다. */
  previewStart(rtspUri: string): Promise<PreviewResult>
  previewStop(): Promise<void>
  start(camera: SelectedCamera): Promise<void>
  stop(): Promise<void>
  getConfig(): Promise<AgentConfig>
  setConfig(patch: Partial<AgentConfig>): Promise<AgentConfig>
  getStatus(): Promise<AgentStatus>
  /** 구독 해제 함수를 돌려준다. */
  onStatus(listener: (status: AgentStatus) => void): () => void
  openSpoolFolder(): Promise<void>
}
