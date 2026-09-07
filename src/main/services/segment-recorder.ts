import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { buildSegmentArgs, MANIFEST_NAME } from '../lib/segment-args'

export interface SegmentEvent {
  readonly path: string
  readonly name: string
}

export interface ManifestWatcherOptions {
  readonly manifestPath: string
  readonly spoolDir: string
  readonly onSegment: (event: SegmentEvent) => void
  readonly pollMs?: number
}

export interface ManifestWatcher {
  start(): void
  stop(): void
}

const DEFAULT_POLL_MS = 500

/**
 * ffmpeg 의 `-segment_list` manifest 를 tail 해서 "조각이 완성되었다"는 신호를 낸다.
 *
 * 디렉토리를 감시해 파일이 보이자마자 업로드하면 안 된다. `-f segment` 는 다음 조각이
 * 시작되어야 이전 조각을 닫으므로, 아직 다 쓰이지 않은 파일을 올리게 된다.
 * manifest 에 한 줄이 추가되는 시점이 그 조각이 완성된 시점이다.
 *
 * fs.watch 는 플랫폼마다 append 감지가 들쭉날쭉해서 오프셋 추적 폴링을 쓴다.
 */
export const createManifestWatcher = (options: ManifestWatcherOptions): ManifestWatcher => {
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS
  const state = { running: false, offset: 0, pending: '', timer: null as NodeJS.Timeout | null }

  const tick = async (): Promise<void> => {
    if (!state.running) return
    const stats = await stat(options.manifestPath).catch(() => null)
    if (!stats) return

    // ffmpeg 재시작 시 manifest 가 truncate 되므로 오프셋을 되돌린다.
    if (stats.size < state.offset) {
      state.offset = 0
      state.pending = ''
    }
    if (stats.size === state.offset) return

    const length = stats.size - state.offset
    const buffer = Buffer.alloc(length)
    const handle = await open(options.manifestPath, 'r').catch(() => null)
    if (!handle) return
    await handle.read(buffer, 0, length, state.offset).catch(() => null)
    await handle.close().catch(() => null)
    state.offset = stats.size

    const lines = `${state.pending}${buffer.toString('utf8')}`.split('\n')
    // 마지막 조각은 개행이 아직 안 온 미완성 줄이므로 다음 tick 으로 넘긴다.
    state.pending = lines.pop() ?? ''

    if (!state.running) return
    lines
      .map((line) => line.trim())
      .filter((name) => name.length > 0)
      .forEach((name) => options.onSegment({ name, path: join(options.spoolDir, name) }))
  }

  return {
    start: () => {
      state.running = true
      state.pending = ''
      // 시작 시점에 이미 있던 줄은 이전 세션이 처리했으므로 건너뛴다.
      state.offset = (() => {
        try {
          return statSync(options.manifestPath).size
        } catch {
          return 0
        }
      })()
      state.timer = setInterval(() => void tick(), pollMs)
    },
    stop: () => {
      state.running = false
      if (state.timer) clearInterval(state.timer)
      state.timer = null
    },
  }
}

export interface SegmentRecorderOptions {
  readonly ffmpegPath: string
  readonly rtspUri: string
  readonly spoolDir: string
  readonly segmentSeconds: number
  readonly includeAudio: boolean
  readonly onSegment: (event: SegmentEvent) => void
  readonly onExit: (event: { code: number | null; stderr: string }) => void
  readonly pollMs?: number
}

export interface SegmentRecorder {
  start(): void
  stop(): Promise<void>
  isRunning(): boolean
}

const KILL_GRACE_MS = 3000

export const createSegmentRecorder = (options: SegmentRecorderOptions): SegmentRecorder => {
  const manifestPath = join(options.spoolDir, MANIFEST_NAME)
  const state = { child: null as ChildProcess | null, stderr: '', stopping: false }

  const watcher = createManifestWatcher({
    manifestPath,
    spoolDir: options.spoolDir,
    onSegment: options.onSegment,
    ...(options.pollMs === undefined ? {} : { pollMs: options.pollMs }),
  })

  return {
    isRunning: () => state.child !== null,

    start: () => {
      if (state.child) return
      mkdirSync(options.spoolDir, { recursive: true })
      state.stderr = ''
      state.stopping = false

      const args = buildSegmentArgs({
        rtspUri: options.rtspUri,
        spoolDir: options.spoolDir,
        segmentSeconds: options.segmentSeconds,
        includeAudio: options.includeAudio,
      })
      const child = spawn(options.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
      state.child = child

      // stderr 는 진단용으로만 보관한다. 무한히 쌓이지 않도록 끝부분만 남긴다.
      child.stderr?.on('data', (chunk: Buffer) => {
        state.stderr = `${state.stderr}${chunk.toString()}`.slice(-8000)
      })

      child.on('exit', (code) => {
        state.child = null
        watcher.stop()
        if (!state.stopping) options.onExit({ code, stderr: state.stderr })
      })

      child.on('error', (error) => {
        state.child = null
        watcher.stop()
        if (!state.stopping) options.onExit({ code: null, stderr: `${state.stderr}\n${error.message}` })
      })

      watcher.start()
    },

    stop: async () => {
      state.stopping = true
      watcher.stop()
      const child = state.child
      if (!child) return
      await new Promise<void>((resolve) => {
        const forceKill = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS)
        child.once('exit', () => {
          clearTimeout(forceKill)
          resolve()
        })
        child.kill('SIGTERM')
      })
      state.child = null
    },
  }
}
