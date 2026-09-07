import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSpoolStore, parseSegmentStartedAt } from '../../src/main/services/spool-store'

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cctv-spool-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const seg = (name: string, bytes: number) =>
  writeFileSync(join(dir, name), Buffer.alloc(bytes, 1))

describe('parseSegmentStartedAt', () => {
  it('파일명에서 시각을 뽑는다 (ffmpeg strftime은 로컬 시각을 쓴다)', () => {
    const date = parseSegmentStartedAt('seg_20260907_143005.mp4')
    expect(date).not.toBeNull()
    expect(date!.getFullYear()).toBe(2026)
    expect(date!.getMonth()).toBe(8) // 0-based → 9월
    expect(date!.getDate()).toBe(7)
    expect(date!.getHours()).toBe(14)
    expect(date!.getMinutes()).toBe(30)
    expect(date!.getSeconds()).toBe(5)
  })

  it('형식이 안 맞으면 null', () => {
    expect(parseSegmentStartedAt('manifest.txt')).toBeNull()
    expect(parseSegmentStartedAt('seg_bad.mp4')).toBeNull()
  })
})

describe('SpoolStore', () => {
  it('seg_*.mp4만 목록에 넣는다 (manifest.txt 제외)', async () => {
    seg('seg_20260907_143000.mp4', 10)
    writeFileSync(join(dir, 'manifest.txt'), 'seg_20260907_143000.mp4\n')
    writeFileSync(join(dir, 'random.txt'), 'x')
    const entries = await createSpoolStore(dir, 1000).list()
    expect(entries.map((e) => e.name)).toEqual(['seg_20260907_143000.mp4'])
  })

  it('오래된 순으로 정렬한다', async () => {
    seg('seg_20260907_143500.mp4', 10)
    seg('seg_20260907_143000.mp4', 10)
    seg('seg_20260907_144000.mp4', 10)
    const entries = await createSpoolStore(dir, 1000).list()
    expect(entries.map((e) => e.name)).toEqual([
      'seg_20260907_143000.mp4',
      'seg_20260907_143500.mp4',
      'seg_20260907_144000.mp4',
    ])
  })

  it('oldest는 가장 오래된 조각을 반환한다', async () => {
    seg('seg_20260907_144000.mp4', 10)
    seg('seg_20260907_143000.mp4', 10)
    const entry = await createSpoolStore(dir, 1000).oldest()
    expect(entry?.name).toBe('seg_20260907_143000.mp4')
  })

  it('비어 있으면 oldest는 null', async () => {
    expect(await createSpoolStore(dir, 1000).oldest()).toBeNull()
  })

  it('totalBytes는 조각 크기 합계다', async () => {
    seg('seg_20260907_143000.mp4', 100)
    seg('seg_20260907_143500.mp4', 250)
    expect(await createSpoolStore(dir, 1000).totalBytes()).toBe(350)
  })

  it('상한 이하이면 아무것도 지우지 않는다', async () => {
    seg('seg_20260907_143000.mp4', 100)
    expect(await createSpoolStore(dir, 1000).enforceLimit()).toBe(0)
    expect(existsSync(join(dir, 'seg_20260907_143000.mp4'))).toBe(true)
  })

  it('상한을 넘으면 오래된 것부터 지운다', async () => {
    seg('seg_20260907_143000.mp4', 100)
    seg('seg_20260907_143500.mp4', 100)
    seg('seg_20260907_144000.mp4', 100)
    const evicted = await createSpoolStore(dir, 250).enforceLimit()
    expect(evicted).toBe(1)
    expect(existsSync(join(dir, 'seg_20260907_143000.mp4'))).toBe(false)
    expect(existsSync(join(dir, 'seg_20260907_144000.mp4'))).toBe(true)
  })

  it('remove는 파일을 지우고, 없는 파일이어도 던지지 않는다', async () => {
    seg('seg_20260907_143000.mp4', 10)
    const store = createSpoolStore(dir, 1000)
    await store.remove(join(dir, 'seg_20260907_143000.mp4'))
    expect(existsSync(join(dir, 'seg_20260907_143000.mp4'))).toBe(false)
    await expect(store.remove(join(dir, 'nope.mp4'))).resolves.toBeUndefined()
  })

  it('디렉토리가 없으면 만들고 빈 목록을 반환한다', async () => {
    const nested = join(dir, 'a', 'b')
    expect(await createSpoolStore(nested, 1000).list()).toEqual([])
  })
})
