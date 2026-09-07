import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConfigStore } from '../../src/main/services/config-store'
import { createSpoolStore } from '../../src/main/services/spool-store'
import { createSupervisor, type RecorderFactoryArgs, type Supervisor } from '../../src/main/services/supervisor'
import type { ProbedMedia } from '../../src/main/services/media-probe'
import type { UploadArgs, UploadResult } from '../../src/main/services/uploader'
import type { AgentStatus, SegmentMeta, SelectedCamera } from '../../src/shared/types'

export const CAMERA: SelectedCamera = {
  id: 'urn:uuid:cam-01',
  name: '계산대',
  manufacturer: 'Hikvision',
  model: 'DS-2CD2143G2',
  rtspUri: 'rtsp://admin:pw@192.168.0.64/Streaming/Channels/102',
  streamProfile: 'sub',
  codec: 'h264',
  width: 704,
  height: 480,
  fps: 15,
}

const PROBED: ProbedMedia = {
  codec: 'h264',
  width: 704,
  height: 480,
  fps: 15,
  durationMs: 5000,
  sizeBytes: 100,
}

export interface Harness {
  readonly supervisor: Supervisor
  readonly uploads: SegmentMeta[]
  readonly statuses: AgentStatus[]
  readonly spoolDir: string
  /** 조각 파일을 만들고 recorder 가 완성 이벤트를 낸 것처럼 흉내낸다. */
  emitSegment(name: string, bytes?: number): void
  /** ffmpeg 프로세스가 죽은 것처럼 흉내낸다. */
  emitExit(stderr?: string): void
  recorderStarts(): number
  setUploadResults(results: UploadResult[]): void
  setProbeResult(result: ProbedMedia | null): void
  cleanup(): void
}

export const makeHarness = (
  options: { spoolLimitBytes?: number; stallTimeoutMs?: number } = {},
): Harness => {
  const dir = mkdtempSync(join(tmpdir(), 'cctv-sup-'))
  const spoolDir = join(dir, 'spool')
  // 실제 SegmentRecorder 는 start() 에서 스풀 디렉토리를 만든다. 가짜 recorder 도 같게 맞춘다.
  mkdirSync(spoolDir, { recursive: true })
  const config = createConfigStore(join(dir, 'config.json'))
  config.write({
    backendBaseUrl: 'http://backend.test',
    deviceToken: 'tok',
    storeId: 'store-1',
    segmentSeconds: 5,
  })
  const spool = createSpoolStore(spoolDir, options.spoolLimitBytes ?? 10 * 1024 * 1024)

  const state = {
    recorderArgs: null as RecorderFactoryArgs | null,
    starts: 0,
    uploadResults: [] as UploadResult[],
    probeResult: PROBED as ProbedMedia | null,
    idCounter: 0,
  }
  const uploads: SegmentMeta[] = []
  const statuses: AgentStatus[] = []

  const supervisor = createSupervisor({
    config,
    spool,
    spoolDir,
    createRecorder: (args) => {
      state.recorderArgs = args
      return {
        start: () => {
          state.starts += 1
        },
        stop: async () => {},
        isRunning: () => true,
      }
    },
    upload: async ({ meta }: UploadArgs) => {
      uploads.push(meta)
      return state.uploadResults.shift() ?? { kind: 'ok' }
    },
    probeMedia: async () => state.probeResult,
    newSegmentId: () => `seg-id-${state.idCounter++}`,
    now: () => new Date('2026-09-07T05:30:00.000Z'),
    delay: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 5))),
    onStatus: (status) => statuses.push(status),
    idleMs: 5,
    stallTimeoutMs: options.stallTimeoutMs ?? 60_000,
  })

  return {
    supervisor,
    uploads,
    statuses,
    spoolDir,
    emitSegment: (name, bytes = 100) => {
      const path = join(spoolDir, name)
      writeFileSync(path, Buffer.alloc(bytes, 1))
      state.recorderArgs?.onSegment({ name, path })
    },
    emitExit: (stderr = 'Connection timed out') => {
      state.recorderArgs?.onExit({ code: 1, stderr })
    },
    recorderStarts: () => state.starts,
    setUploadResults: (results) => {
      state.uploadResults = [...results]
    },
    setProbeResult: (result) => {
      state.probeResult = result
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

export const waitFor = async (
  predicate: () => boolean | Promise<boolean>,
  { timeoutMs = 3000, stepMs = 5 } = {},
): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, stepMs))
  }
  throw new Error('조건이 시간 안에 만족되지 않았습니다')
}
