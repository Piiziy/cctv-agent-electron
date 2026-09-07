import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { MANIFEST_NAME } from '../lib/segment-args'

export interface SpoolEntry {
  readonly path: string
  readonly name: string
  readonly sizeBytes: number
  readonly startedAt: Date
}

export interface SpoolStore {
  /** 오래된 순으로 정렬된 완성 조각 목록. */
  list(): Promise<SpoolEntry[]>
  oldest(): Promise<SpoolEntry | null>
  remove(path: string): Promise<void>
  totalBytes(): Promise<number>
  /** 상한을 넘으면 오래된 것부터 지우고 삭제한 개수를 반환한다. */
  enforceLimit(): Promise<number>
}

const SEGMENT_NAME = /^seg_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.mp4$/

/**
 * 조각 파일명에서 시작 시각을 뽑는다.
 * ffmpeg의 `-strftime 1` 은 로컬 시각을 쓰므로 로컬 Date로 해석한다.
 */
export const parseSegmentStartedAt = (name: string): Date | null => {
  const matched = SEGMENT_NAME.exec(name)
  if (!matched) return null
  const [year, month, day, hour, minute, second] = matched.slice(1).map(Number) as number[]
  return new Date(year!, month! - 1, day!, hour!, minute!, second!)
}

export const createSpoolStore = (dir: string, limitBytes: number): SpoolStore => {
  const list = async (): Promise<SpoolEntry[]> => {
    // 스풀 디렉토리가 없거나 도중에 사라져도 목록 조회는 실패하지 않아야 한다.
    await mkdir(dir, { recursive: true }).catch(() => undefined)
    const names = await readdir(dir).catch(() => [] as string[])
    const entries = await Promise.all(
      names
        .filter((name) => name !== MANIFEST_NAME)
        .map(async (name) => {
          const startedAt = parseSegmentStartedAt(name)
          if (!startedAt) return null
          const path = join(dir, name)
          const stats = await stat(path).catch(() => null)
          return stats?.isFile() ? { path, name, sizeBytes: stats.size, startedAt } : null
        }),
    )
    return entries
      .filter((entry): entry is SpoolEntry => entry !== null)
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
  }

  const remove = async (path: string): Promise<void> => {
    await rm(path, { force: true })
  }

  const totalBytes = async (): Promise<number> =>
    (await list()).reduce((sum, entry) => sum + entry.sizeBytes, 0)

  return {
    list,
    remove,
    totalBytes,

    oldest: async () => (await list())[0] ?? null,

    enforceLimit: async () => {
      const entries = await list()
      const total = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0)
      if (total <= limitBytes) return 0

      // 오래된 것부터 상한 아래로 내려갈 때까지 버린다.
      const { evicted } = await entries.reduce(
        async (pending, entry) => {
          const state = await pending
          if (state.bytes <= limitBytes) return state
          await remove(entry.path)
          return { bytes: state.bytes - entry.sizeBytes, evicted: state.evicted + 1 }
        },
        Promise.resolve({ bytes: total, evicted: 0 }),
      )
      return evicted
    },
  }
}
