import { randomBytes } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createJpegSplitter } from '../lib/mjpeg'

/**
 * 실시간 미리보기.
 *
 * 스냅샷을 몇 초마다 새로 찍는 방식은 매번 RTSP 세션을 새로 열어야 해서
 * 몇 초에 한 장이 한계다. 감시 화면이 5초에 한 번 바뀌는 것은 CCTV 라 할 수 없다.
 *
 * 대신 ffmpeg 하나를 계속 띄워 MJPEG 를 뽑고, 로컬 HTTP 로
 * multipart/x-mixed-replace 스트림을 낸다. 브라우저의 <img> 가 이 형식을
 * 그대로 재생하므로 렌더러 쪽에 별도 라이브러리가 필요 없다.
 */

const BOUNDARY = 'cctvframe'

export interface PreviewArgsInput {
  readonly rtspUri: string
  readonly fps: number
  readonly width: number
}

export const buildPreviewArgs = (input: PreviewArgsInput): string[] => [
  '-hide_banner',
  '-loglevel', 'error',
  '-nostdin',
  '-rtsp_transport', 'tcp',
  '-timeout', '15000000',
  // 미리보기는 최신 화면이 중요하다. 버퍼를 줄여 지연을 낮춘다.
  '-fflags', 'nobuffer',
  '-flags', 'low_delay',
  '-i', input.rtspUri,
  '-an',
  '-r', String(input.fps),
  '-vf', `scale=${input.width}:-2`,
  '-q:v', '7',
  '-f', 'mjpeg',
  '-',
]

export interface PreviewService {
  /** 미리보기를 시작하고 <img src> 에 넣을 URL 을 돌려준다. */
  start(rtspUri: string): Promise<string>
  stop(): Promise<void>
  isRunning(): boolean
}

export interface PreviewOptions {
  readonly ffmpegPath: string
  readonly fps?: number
  readonly width?: number
}

export const createPreviewService = (options: PreviewOptions): PreviewService => {
  const fps = options.fps ?? 10
  const width = options.width ?? 640
  const token = randomBytes(12).toString('hex')

  const state = {
    server: null as Server | null,
    port: 0,
    child: null as ChildProcess | null,
    rtspUri: '',
    clients: new Set<ServerResponse>(),
    latest: null as Buffer | null,
  }

  const writeFrame = (response: ServerResponse, frame: Buffer): void => {
    response.write(
      `--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`,
    )
    response.write(frame)
    response.write('\r\n')
  }

  const ensureServer = async (): Promise<number> => {
    if (state.server) return state.port
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      // 로컬 전용이지만 다른 프로세스가 훔쳐보지 못하도록 토큰을 확인한다.
      if (url.pathname !== '/preview' || url.searchParams.get('t') !== token) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, {
        'content-type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
        'cache-control': 'no-store',
        connection: 'close',
      })
      state.clients.add(res)
      // 첫 화면이 바로 뜨도록 마지막 프레임을 즉시 보낸다.
      if (state.latest) writeFrame(res, state.latest)
      req.on('close', () => state.clients.delete(res))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    state.server = server
    state.port = (server.address() as AddressInfo).port
    return state.port
  }

  const stopChild = async (): Promise<void> => {
    const child = state.child
    state.child = null
    state.rtspUri = ''
    state.latest = null
    if (!child) return
    await new Promise<void>((resolve) => {
      const force = setTimeout(() => child.kill('SIGKILL'), 2000)
      child.once('exit', () => {
        clearTimeout(force)
        resolve()
      })
      child.kill('SIGTERM')
    })
  }

  return {
    isRunning: () => state.child !== null,

    start: async (rtspUri) => {
      const port = await ensureServer()
      const url = `http://127.0.0.1:${port}/preview?t=${token}`
      if (state.child && state.rtspUri === rtspUri) return url

      await stopChild()
      const child = spawn(options.ffmpegPath, buildPreviewArgs({ rtspUri, fps, width }), {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      state.child = child
      state.rtspUri = rtspUri

      const push = createJpegSplitter((frame) => {
        state.latest = frame
        state.clients.forEach((response) => {
          if (!response.writableEnded) writeFrame(response, frame)
        })
      })
      child.stdout?.on('data', (chunk: Buffer) => push(chunk))
      child.on('exit', () => {
        if (state.child === child) state.child = null
      })
      return url
    },

    stop: async () => {
      await stopChild()
      state.clients.forEach((response) => response.end())
      state.clients.clear()
      const server = state.server
      state.server = null
      if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
