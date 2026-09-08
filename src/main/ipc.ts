import { randomBytes } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ipcMain, shell, type BrowserWindow } from 'electron'
import {
  IPC,
  type DiscoverResult,
  type PreviewResult,
  type ProbeArgs,
  type ProbeResult,
  type SnapshotResult,
} from '../shared/ipc'
import type { AgentConfig, AgentStatus, SelectedCamera } from '../shared/types'
import { resolveFfmpegPath } from './lib/ffmpeg'
import type { Agent } from './services/agent'
import { classifyProfiles, isAuthFailure, probeCamera } from './services/camera-probe'
import { discoverCameras } from './services/discovery'
import { probeMedia } from './services/media-probe'
import { createPreviewService } from './services/preview-stream'
import { captureSnapshot } from './services/snapshot'

const toProbeFailure = (error: unknown): ProbeResult => {
  if (isAuthFailure(error)) {
    return {
      ok: false,
      kind: 'auth',
      message:
        '카메라 인증에 실패했습니다. 일부 제조사(하이크비전 등)는 관리자 계정과 별개로 ' +
        'ONVIF 전용 계정을 만들어야 합니다. 카메라 웹설정 → 네트워크 → 고급 → ONVIF 에서 ' +
        '계정을 추가한 뒤 그 계정으로 시도해 보세요.',
    }
  }
  return {
    ok: false,
    kind: 'unreachable',
    message: `카메라에 연결하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
  }
}

export const registerIpc = (agent: Agent, getWindow: () => BrowserWindow | null, spoolDir: string): void => {
  const preview = createPreviewService({ ffmpegPath: resolveFfmpegPath() })

  ipcMain.handle(IPC.previewStart, async (_event, rtspUri: string): Promise<PreviewResult> => {
    try {
      return { ok: true, url: await preview.start(rtspUri) }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(IPC.previewStop, () => preview.stop())

  ipcMain.handle(IPC.discover, async (_event, timeoutMs?: number): Promise<DiscoverResult> => {
    try {
      return { ok: true, cameras: await discoverCameras(timeoutMs ?? 5000) }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(IPC.probe, async (_event, args: ProbeArgs): Promise<ProbeResult> => {
    try {
      const probed = await probeCamera({
        camera: {
          id: args.xaddr,
          xaddr: args.xaddr,
          ip: new URL(args.xaddr).hostname,
          port: Number(new URL(args.xaddr).port || 80),
          manufacturer: null,
          model: null,
          name: null,
        },
        username: args.username,
        password: args.password,
      })
      return { ok: true, profiles: probed.profiles }
    } catch (error) {
      return toProbeFailure(error)
    }
  })

  ipcMain.handle(IPC.probeRtsp, async (_event, rtspUri: string): Promise<ProbeResult> => {
    const probed = await probeMedia(rtspUri, { timeoutMs: 20_000 })
    if (!probed) {
      return {
        ok: false,
        kind: 'unreachable',
        message: '이 주소에서 영상을 읽지 못했습니다. 주소·아이디·비밀번호를 확인해 주세요.',
      }
    }
    return {
      ok: true,
      profiles: classifyProfiles([
        {
          token: 'manual',
          name: '직접 입력',
          encoding: probed.codec === 'h265' ? 'H265' : 'H264',
          width: probed.width,
          height: probed.height,
          fps: probed.fps,
          bitrateKbps: null,
          rtspUri,
        },
      ]),
    }
  })

  ipcMain.handle(IPC.snapshot, async (_event, rtspUri: string): Promise<SnapshotResult> => {
    const outPath = join(tmpdir(), `cctv-snap-${randomBytes(4).toString('hex')}.jpg`)
    try {
      await captureSnapshot(rtspUri, outPath, { timeoutMs: 20_000 })
      const buffer = await readFile(outPath)
      return { ok: true, dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}` }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : '미리보기를 가져오지 못했습니다',
      }
    } finally {
      await rm(outPath, { force: true })
    }
  })

  ipcMain.handle(IPC.start, (_event, camera: SelectedCamera) => agent.supervisor.start(camera))
  ipcMain.handle(IPC.stop, () => agent.supervisor.stop())
  ipcMain.handle(IPC.getConfig, (): AgentConfig => agent.config.read())
  ipcMain.handle(IPC.setConfig, (_event, patch: Partial<AgentConfig>): AgentConfig =>
    agent.config.write(patch),
  )
  ipcMain.handle(IPC.getStatus, (): AgentStatus => agent.supervisor.status())
  ipcMain.handle(IPC.openSpoolFolder, () => shell.openPath(spoolDir))

  void getWindow
}
