import {
  AGENT_VERSION,
  type AgentStatus,
  type CameraStatus,
  type SegmentMeta,
  type SelectedCamera,
  type UploadStatus,
} from '../../shared/types'
import { nextDelayMs } from '../lib/backoff'
import type { ConfigStore } from './config-store'
import type { ProbedMedia } from './media-probe'
import type { SegmentEvent, SegmentRecorder } from './segment-recorder'
import type { SpoolEntry, SpoolStore } from './spool-store'
import type { UploadArgs, UploadResult } from './uploader'

export interface RecorderFactoryArgs {
  readonly rtspUri: string
  readonly spoolDir: string
  readonly segmentSeconds: number
  readonly includeAudio: boolean
  readonly onSegment: (event: SegmentEvent) => void
  readonly onExit: (event: { code: number | null; stderr: string }) => void
}

export interface SupervisorDeps {
  readonly config: ConfigStore
  readonly spool: SpoolStore
  readonly spoolDir: string
  readonly createRecorder: (args: RecorderFactoryArgs) => SegmentRecorder
  readonly upload: (args: UploadArgs) => Promise<UploadResult>
  readonly probeMedia: (path: string) => Promise<ProbedMedia | null>
  readonly newSegmentId: () => string
  readonly now: () => Date
  readonly delay: (ms: number) => Promise<void>
  readonly onStatus: (status: AgentStatus) => void
  readonly idleMs?: number
  /** 미지정 시 조각 주기의 1.5배. 그동안 새 조각이 없으면 스트림이 멈춘 것으로 본다. */
  readonly stallTimeoutMs?: number
}

export interface Supervisor {
  start(camera: SelectedCamera): Promise<void>
  stop(): Promise<void>
  status(): AgentStatus
}

/** RTSP 인증 실패는 재시도로 풀리지 않으므로 다른 연결 오류와 구분한다. */
export const isRtspAuthFailure = (stderr: string): boolean =>
  /401|unauthor|authentication failed/i.test(stderr)

/** ffmpeg stderr 은 길고 반복적이라 마지막 의미 있는 줄만 남긴다. */
export const summarizeStderr = (stderr: string): string =>
  stderr.split('\n').map((line) => line.trim()).filter(Boolean).at(-1) ?? '알 수 없는 오류'

const RESTART_BACKOFF = { baseMs: 1000, maxMs: 30_000 } as const
const UPLOAD_BACKOFF = { baseMs: 1000, maxMs: 300_000 } as const

export const createSupervisor = (deps: SupervisorDeps): Supervisor => {
  const idleMs = deps.idleMs ?? 500

  const state = {
    running: false,
    camera: null as SelectedCamera | null,
    recorder: null as SegmentRecorder | null,
    cameraStatus: 'idle' as CameraStatus,
    uploadStatus: 'idle' as UploadStatus,
    uploadedCount: 0,
    pendingCount: 0,
    lastUploadAt: null as string | null,
    spoolBytes: 0,
    bytesUploadedToday: 0,
    todayKey: '',
    lastError: null as string | null,
    spoolEvicted: false,
    recorderAttempt: 0,
    uploadAttempt: 0,
    stallTimer: null as NodeJS.Timeout | null,
    restartTimer: null as NodeJS.Timeout | null,
    loopRunning: false,
    loopPromise: null as Promise<void> | null,
    metaByPath: new Map<string, SegmentMeta>(),
  }

  const status = (): AgentStatus => ({
    running: state.running,
    camera: state.cameraStatus,
    upload: state.uploadStatus,
    uploadedCount: state.uploadedCount,
    pendingCount: state.pendingCount,
    lastUploadAt: state.lastUploadAt,
    spoolBytes: state.spoolBytes,
    spoolLimitBytes: deps.config.read().spoolLimitBytes,
    bytesUploadedToday: state.bytesUploadedToday,
    lastError: state.lastError,
    spoolEvicted: state.spoolEvicted,
  })

  const emit = (): void => deps.onStatus(status())

  const setCameraStatus = (next: CameraStatus): void => {
    if (state.cameraStatus === next) return
    state.cameraStatus = next
    emit()
  }

  const setUploadStatus = (next: UploadStatus): void => {
    if (state.uploadStatus === next) return
    state.uploadStatus = next
    emit()
  }

  const clearTimers = (): void => {
    if (state.stallTimer) clearTimeout(state.stallTimer)
    if (state.restartTimer) clearTimeout(state.restartTimer)
    state.stallTimer = null
    state.restartTimer = null
  }

  const refreshSpoolStats = async (): Promise<void> => {
    const entries = await deps.spool.list()
    state.pendingCount = entries.length
    state.spoolBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0)
  }

  const recordUploadedBytes = (bytes: number): void => {
    const today = deps.now().toISOString().slice(0, 10)
    const carried = state.todayKey === today ? state.bytesUploadedToday : 0
    state.todayKey = today
    state.bytesUploadedToday = carried + bytes
  }

  /**
   * 조각 하나의 meta 를 만들고 경로별로 기억해 둔다.
   *
   * 캐시가 핵심이다. 재시도할 때마다 새 segmentId 를 뽑으면 백엔드에 같은 5분이
   * 여러 건으로 저장되어 멱등성이 무너지고 알림이 중복 발송된다.
   * sequence 도 마찬가지로 한 번만 발급해야 번호가 건너뛰지 않는다.
   */
  const metaFor = async (entry: SpoolEntry): Promise<SegmentMeta | null> => {
    const cached = state.metaByPath.get(entry.path)
    if (cached) return cached

    const probed = await deps.probeMedia(entry.path)
    const camera = state.camera
    if (!probed || !camera) return null

    const config = deps.config.read()
    const meta: SegmentMeta = {
      segmentId: deps.newSegmentId(),
      storeId: config.storeId,
      deviceId: config.deviceId,
      camera: {
        id: camera.id,
        name: camera.name,
        manufacturer: camera.manufacturer,
        model: camera.model,
        streamProfile: camera.streamProfile,
      },
      video: {
        codec: probed.codec,
        width: probed.width,
        height: probed.height,
        fps: probed.fps,
        durationMs: probed.durationMs,
        sizeBytes: entry.sizeBytes,
        container: 'mp4',
      },
      // 파일명에 새겨진 시각은 조각이 '닫힌' 시각이다. 시작 시각은 실제 길이를 빼서 구한다.
      startedAt: new Date(entry.closedAt.getTime() - probed.durationMs).toISOString(),
      endedAt: entry.closedAt.toISOString(),
      sequence: deps.config.nextSequence(camera.id),
      agentVersion: AGENT_VERSION,
    }
    state.metaByPath.set(entry.path, meta)
    return meta
  }

  const completeUpload = async (entry: SpoolEntry): Promise<void> => {
    await deps.spool.remove(entry.path)
    state.metaByPath.delete(entry.path)
    state.uploadedCount += 1
    state.uploadAttempt = 0
    state.lastUploadAt = deps.now().toISOString()
    recordUploadedBytes(entry.sizeBytes)
  }

  const runUploadLoop = async (): Promise<void> => {
    while (state.running) {
      await refreshSpoolStats()
      const entry = await deps.spool.oldest()
      if (!entry) {
        setUploadStatus('idle')
        await deps.delay(idleMs)
        continue
      }

      const meta = await metaFor(entry)
      if (!meta) {
        // ffprobe 가 못 읽는 조각은 재시도해도 못 읽는다. 스풀을 막지 않도록 버린다.
        state.lastError = `읽을 수 없는 조각을 버렸습니다: ${entry.name}`
        await deps.spool.remove(entry.path)
        continue
      }

      setUploadStatus('uploading')
      const config = deps.config.read()
      const result = await deps.upload({
        baseUrl: config.backendBaseUrl,
        token: config.deviceToken,
        meta,
        filePath: entry.path,
      })

      if (result.kind === 'ok' || result.kind === 'duplicate') {
        await completeUpload(entry)
        continue
      }

      if (result.kind === 'retry') {
        state.lastError = result.reason
        // 서버에 닿기는 했으면 retrying, 아예 못 닿았으면 offline.
        setUploadStatus(result.reason.startsWith('HTTP ') ? 'retrying' : 'offline')
        await deps.delay(nextDelayMs(state.uploadAttempt++, UPLOAD_BACKOFF))
        continue
      }

      if (result.cause === 'missing-file') {
        state.metaByPath.delete(entry.path)
        continue
      }

      // 인증 실패나 용량 초과는 재시도로 풀리지 않는다. 조각은 남겨 두고 사람을 부른다.
      state.lastError = result.reason
      setUploadStatus(result.cause === 'auth' ? 'auth-failed' : 'payload-too-large')
      return
    }
  }

  /** 업로드 루프는 항상 하나만 돈다. stop() 이 끝나기를 기다릴 수 있도록 약속을 붙들어 둔다. */
  const kickUploadLoop = (): void => {
    // 사람이 고쳐야 하는 상태에서는 다시 두드리지 않는다.
    if (state.uploadStatus === 'auth-failed' || state.uploadStatus === 'payload-too-large') return
    if (state.loopRunning || !state.running) return
    state.loopRunning = true
    state.loopPromise = runUploadLoop().finally(() => {
      state.loopRunning = false
    })
  }

  const armStallTimer = (): void => {
    if (state.stallTimer) clearTimeout(state.stallTimer)
    if (!state.running) return
    const timeoutMs = deps.stallTimeoutMs ?? deps.config.read().segmentSeconds * 1500
    state.stallTimer = setTimeout(() => void forceRestart(), timeoutMs)
  }

  const startRecorder = (): void => {
    const camera = state.camera
    if (!camera || !state.running) return
    const config = deps.config.read()
    state.recorder = deps.createRecorder({
      rtspUri: camera.rtspUri,
      spoolDir: deps.spoolDir,
      segmentSeconds: config.segmentSeconds,
      includeAudio: config.includeAudio,
      onSegment: handleSegment,
      onExit: handleExit,
    })
    setCameraStatus('connecting')
    state.recorder.start()
    armStallTimer()
  }

  const forceRestart = async (): Promise<void> => {
    if (!state.running) return
    state.lastError = '스트림이 멈춰 재시작합니다'
    setCameraStatus('reconnecting')
    const recorder = state.recorder
    state.recorder = null
    await recorder?.stop()
    startRecorder()
  }

  function handleSegment(event: SegmentEvent): void {
    state.recorderAttempt = 0
    setCameraStatus('streaming')
    armStallTimer()
    void (async () => {
      const evicted = await deps.spool.enforceLimit()
      if (evicted > 0) {
        state.spoolEvicted = true
        state.lastError = `저장 공간 상한을 넘어 오래된 조각 ${evicted}개를 버렸습니다`
        emit()
      }
      kickUploadLoop()
    })()
    void event
  }

  function handleExit(event: { code: number | null; stderr: string }): void {
    if (!state.running) return
    state.recorder = null
    state.lastError = summarizeStderr(event.stderr)

    if (isRtspAuthFailure(event.stderr)) {
      if (state.stallTimer) clearTimeout(state.stallTimer)
      state.stallTimer = null
      setCameraStatus('auth-failed')
      return
    }

    setCameraStatus('reconnecting')
    if (state.stallTimer) clearTimeout(state.stallTimer)
    state.stallTimer = null
    state.restartTimer = setTimeout(
      () => startRecorder(),
      nextDelayMs(state.recorderAttempt++, RESTART_BACKOFF),
    )
  }

  const stop = async (): Promise<void> => {
    state.running = false
    clearTimers()
    const recorder = state.recorder
    const loop = state.loopPromise
    state.recorder = null
    await recorder?.stop()
    // 루프가 파일을 만지는 도중에 호출자가 디렉토리를 지우면 곤란하다. 끝날 때까지 기다린다.
    await loop
    state.loopPromise = null
    state.cameraStatus = 'idle'
    emit()
  }

  return {
    status,
    stop,
    start: async (camera) => {
      await stop()
      deps.config.write({ selectedCamera: camera })
      state.camera = camera
      state.running = true
      state.uploadStatus = 'idle'
      state.spoolEvicted = false
      state.recorderAttempt = 0
      state.uploadAttempt = 0
      state.metaByPath.clear()
      startRecorder()
      kickUploadLoop()
      emit()
    },
  }
}
