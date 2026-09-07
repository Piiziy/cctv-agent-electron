import { setTimeout as sleep } from 'node:timers/promises'
import { ulid } from 'ulid'
import type { AgentStatus } from '../../shared/types'
import { resolveFfmpegPath } from '../lib/ffmpeg'
import { createConfigStore, type ConfigStore } from './config-store'
import { probeMedia } from './media-probe'
import { createSegmentRecorder } from './segment-recorder'
import { createSpoolStore } from './spool-store'
import { createSupervisor, type Supervisor } from './supervisor'
import { uploadSegment } from './uploader'

export interface AgentPaths {
  readonly configFile: string
  readonly spoolDir: string
}

export interface Agent {
  readonly supervisor: Supervisor
  readonly config: ConfigStore
}

/**
 * 실제 의존성을 물린 에이전트를 만든다.
 *
 * Supervisor 는 모든 협력자를 주입받으므로, 테스트는 이 조립 함수를 건너뛰고
 * 가짜를 넣을 수 있다. 여기 있는 것은 오직 "무엇을 쓸지" 뿐이다.
 */
export const createAgent = (paths: AgentPaths, onStatus: (status: AgentStatus) => void): Agent => {
  const config = createConfigStore(paths.configFile)
  const ffmpegPath = resolveFfmpegPath()

  const supervisor = createSupervisor({
    config,
    spool: createSpoolStore(paths.spoolDir, config.read().spoolLimitBytes),
    spoolDir: paths.spoolDir,
    createRecorder: (args) => createSegmentRecorder({ ffmpegPath, ...args }),
    upload: uploadSegment,
    probeMedia: (path) => probeMedia(path),
    newSegmentId: () => ulid(),
    now: () => new Date(),
    delay: (ms) => sleep(ms),
    onStatus,
  })

  return { supervisor, config }
}
