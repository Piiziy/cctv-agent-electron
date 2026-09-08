import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CAMERA, makeHarness, waitFor, type Harness } from '../helpers/supervisor-harness'

let harness: Harness

const start = async (h: Harness = harness) => {
  await h.supervisor.start(CAMERA)
}

beforeEach(() => {
  harness = makeHarness()
})
afterEach(async () => {
  await harness.supervisor.stop()
  harness.cleanup()
})

describe('Supervisor — 업로드', () => {
  it('조각이 완성되면 meta 를 만들어 업로드한다', async () => {
    await start()
    harness.emitSegment('seg_20260907_143000_000.mp4')
    await waitFor(() => harness.uploads.length === 1)
    expect(harness.uploads[0]!.camera.name).toBe('계산대')
    expect(harness.uploads[0]!.storeId).toBe('store-1')
  })

  it('업로드에 성공하면 스풀에서 파일을 지운다', async () => {
    await start()
    harness.emitSegment('seg_20260907_143000_000.mp4')
    await waitFor(() => !existsSync(join(harness.spoolDir, 'seg_20260907_143000_000.mp4')))
    expect(harness.supervisor.status().uploadedCount).toBe(1)
  })

  it('409 duplicate 도 성공으로 보고 파일을 지운다', async () => {
    harness.setUploadResults([{ kind: 'duplicate' }])
    await start()
    harness.emitSegment('seg_20260907_143000_000.mp4')
    await waitFor(() => !existsSync(join(harness.spoolDir, 'seg_20260907_143000_000.mp4')))
  })

  it('retry 면 파일을 남기고 다시 시도한다', async () => {
    harness.setUploadResults([{ kind: 'retry', reason: 'ECONNREFUSED' }])
    await start()
    harness.emitSegment('seg_20260907_143000_000.mp4')
    await waitFor(() => harness.uploads.length >= 2)
    await waitFor(() => !existsSync(join(harness.spoolDir, 'seg_20260907_143000_000.mp4')))
  })

  it('재시도할 때 segmentId 와 sequence 를 그대로 재사용한다 (멱등성의 핵심)', async () => {
    harness.setUploadResults([
      { kind: 'retry', reason: 'ECONNREFUSED' },
      { kind: 'retry', reason: 'ECONNREFUSED' },
    ])
    await start()
    harness.emitSegment('seg_20260907_143000_000.mp4')
    await waitFor(() => harness.uploads.length >= 3)
    const ids = new Set(harness.uploads.slice(0, 3).map((m) => m.segmentId))
    const seqs = new Set(harness.uploads.slice(0, 3).map((m) => m.sequence))
    expect(ids.size).toBe(1)
    expect(seqs.size).toBe(1)
  })

  it('401 fatal 이면 업로드를 멈추고 auth-failed 로 바꾼다', async () => {
    harness.setUploadResults([{ kind: 'fatal', reason: '인증 실패', cause: 'auth' }])
    await start()
    harness.emitSegment('seg_20260907_143000_000.mp4')
    await waitFor(() => harness.supervisor.status().upload === 'auth-failed')
    const attempts = harness.uploads.length
    await new Promise((resolve) => setTimeout(resolve, 60))
    // 더 이상 두드리지 않는다
    expect(harness.uploads.length).toBe(attempts)
    // 파일은 남겨둔다 — 사람이 토큰을 고치면 보낼 수 있어야 하므로
    expect(existsSync(join(harness.spoolDir, 'seg_20260907_143000_000.mp4'))).toBe(true)
  })

  it('413 이면 payload-too-large 로 바꾼다', async () => {
    harness.setUploadResults([{ kind: 'fatal', reason: '너무 큼', cause: 'too-large' }])
    await start()
    harness.emitSegment('seg_20260907_143000_000.mp4')
    await waitFor(() => harness.supervisor.status().upload === 'payload-too-large')
  })

  it('ffprobe 가 실패한 조각(깨진 파일)은 버린다', async () => {
    harness.setProbeResult(null)
    await start()
    harness.emitSegment('seg_20260907_143000_000.mp4')
    await waitFor(() => !existsSync(join(harness.spoolDir, 'seg_20260907_143000_000.mp4')))
    expect(harness.uploads).toHaveLength(0)
  })

  it('sequence 는 조각 생성 순서대로 0 부터 부여된다', async () => {
    await start()
    harness.emitSegment('seg_20260907_143000_000.mp4')
    await waitFor(() => harness.uploads.length === 1)
    harness.emitSegment('seg_20260907_143500_000.mp4')
    await waitFor(() => harness.uploads.length === 2)
    expect(harness.uploads.map((m) => m.sequence)).toEqual([0, 1])
  })

  it('meta 의 startedAt/endedAt 은 파일명 시각과 실제 길이로 만든다', async () => {
    await start()
    harness.emitSegment('seg_20260907_143000_000.mp4')
    await waitFor(() => harness.uploads.length === 1)
    const meta = harness.uploads[0]!
    const span = Date.parse(meta.endedAt) - Date.parse(meta.startedAt)
    expect(span).toBe(5000)
    expect(new Date(meta.startedAt).getHours()).toBe(14)
  })
})

describe('Supervisor — 오프라인 보관', () => {
  it('업로드가 계속 실패하면 조각이 스풀에 쌓이고 pendingCount 가 늘어난다', async () => {
    harness.setUploadResults(Array.from({ length: 50 }, () => ({ kind: 'retry' as const, reason: 'offline' })))
    await start()
    harness.emitSegment('seg_20260907_143000_000.mp4')
    harness.emitSegment('seg_20260907_143500_000.mp4')
    await waitFor(() => harness.supervisor.status().pendingCount === 2)
    expect(harness.supervisor.status().upload).toBe('offline')
  })

  it('스풀 상한을 넘으면 오래된 조각부터 버리고 경고를 남긴다', async () => {
    await harness.supervisor.stop()
    harness.cleanup()
    harness = makeHarness({ spoolLimitBytes: 250 })
    harness.setUploadResults(Array.from({ length: 50 }, () => ({ kind: 'retry' as const, reason: 'offline' })))
    await start()
    harness.emitSegment('seg_20260907_143000_000.mp4', 100)
    harness.emitSegment('seg_20260907_143500_000.mp4', 100)
    harness.emitSegment('seg_20260907_144000_000.mp4', 100)
    await waitFor(() => harness.supervisor.status().spoolEvicted)
    expect(existsSync(join(harness.spoolDir, 'seg_20260907_143000_000.mp4'))).toBe(false)
    expect(existsSync(join(harness.spoolDir, 'seg_20260907_144000_000.mp4'))).toBe(true)
  })
})

describe('Supervisor — 카메라 복구', () => {
  it('recorder 가 죽으면 백오프 후 재시작한다', async () => {
    await start()
    expect(harness.recorderStarts()).toBe(1)
    harness.emitExit('Connection timed out')
    // 죽은 직후에는 reconnecting, 새 recorder 가 뜨면 connecting 으로 넘어간다
    expect(harness.supervisor.status().camera).toBe('reconnecting')
    await waitFor(() => harness.recorderStarts() === 2)
    expect(harness.supervisor.status().camera).toBe('connecting')
  })

  it('RTSP 인증 실패는 재시작하지 않는다 (재시도해도 소용없다)', async () => {
    await start()
    harness.emitExit('method DESCRIBE failed: 401 Unauthorized')
    await waitFor(() => harness.supervisor.status().camera === 'auth-failed')
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(harness.recorderStarts()).toBe(1)
  })

  it('조각이 완성되기 전에도 영상이 들어오면 streaming 이 된다', async () => {
    await start()
    expect(harness.supervisor.status().camera).toBe('connecting')
    harness.emitFlowing()
    await waitFor(() => harness.supervisor.status().camera === 'streaming')
  })

  it('조각이 오면 streaming 상태가 된다', async () => {
    await start()
    harness.emitSegment('seg_20260907_143000_000.mp4')
    await waitFor(() => harness.supervisor.status().camera === 'streaming')
  })

  it('조각 주기의 1.5배 동안 조각이 없으면 강제 재시작한다', async () => {
    await harness.supervisor.stop()
    harness.cleanup()
    harness = makeHarness({ stallTimeoutMs: 40 })
    await start()
    await waitFor(() => harness.recorderStarts() >= 2, { timeoutMs: 2000 })
  })
})

describe('Supervisor — 생명주기', () => {
  it('stop 하면 running 이 false 가 된다', async () => {
    await start()
    expect(harness.supervisor.status().running).toBe(true)
    await harness.supervisor.stop()
    expect(harness.supervisor.status().running).toBe(false)
  })

  it('stop 이후에는 recorder 를 재시작하지 않는다', async () => {
    await start()
    await harness.supervisor.stop()
    harness.emitExit()
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(harness.recorderStarts()).toBe(1)
  })

  it('선택한 카메라를 설정에 저장한다', async () => {
    await start()
    expect(harness.supervisor.status().running).toBe(true)
  })

  it('상태가 바뀔 때마다 onStatus 를 부른다', async () => {
    await start()
    await waitFor(() => harness.statuses.length > 0)
  })
})
