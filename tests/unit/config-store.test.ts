import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConfigStore } from '../../src/main/services/config-store'

let dir = ''
let file = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cctv-cfg-'))
  file = join(dir, 'config.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('ConfigStore', () => {
  it('처음 읽으면 기본값이 나온다', () => {
    const config = createConfigStore(file).read()
    expect(config.segmentSeconds).toBe(300)
    expect(config.streamProfile).toBe('sub')
    expect(config.spoolLimitBytes).toBe(5 * 1024 ** 3)
    expect(config.selectedCamera).toBeNull()
  })

  it('deviceId를 자동 생성한다', () => {
    expect(createConfigStore(file).read().deviceId).toMatch(/^agent-[a-z0-9]{8,}$/)
  })

  it('deviceId는 재시작해도 유지된다', () => {
    const first = createConfigStore(file).read().deviceId
    expect(createConfigStore(file).read().deviceId).toBe(first)
  })

  it('부분 수정이 병합되고 영속된다', () => {
    createConfigStore(file).write({ storeId: 'store-gangnam-01' })
    const reloaded = createConfigStore(file).read()
    expect(reloaded.storeId).toBe('store-gangnam-01')
    expect(reloaded.segmentSeconds).toBe(300)
  })

  it('write는 갱신된 전체 설정을 반환한다', () => {
    const updated = createConfigStore(file).write({ segmentSeconds: 30 })
    expect(updated.segmentSeconds).toBe(30)
    expect(updated.deviceId).toMatch(/^agent-/)
  })

  it('sequence는 카메라마다 독립적으로 0부터 증가한다', () => {
    const store = createConfigStore(file)
    expect(store.nextSequence('cam-a')).toBe(0)
    expect(store.nextSequence('cam-a')).toBe(1)
    expect(store.nextSequence('cam-b')).toBe(0)
    expect(store.nextSequence('cam-a')).toBe(2)
  })

  it('sequence는 재시작 후에도 이어진다', () => {
    createConfigStore(file).nextSequence('cam-a')
    createConfigStore(file).nextSequence('cam-a')
    expect(createConfigStore(file).nextSequence('cam-a')).toBe(2)
  })

  it('깨진 JSON이면 기본값으로 복구한다 (전원 차단 대비)', () => {
    writeFileSync(file, '{ "storeId": "half-writ')
    const config = createConfigStore(file).read()
    expect(config.segmentSeconds).toBe(300)
    expect(config.deviceId).toMatch(/^agent-/)
  })

  it('알 수 없는 필드는 무시하고 기본값을 채운다', () => {
    writeFileSync(file, JSON.stringify({ storeId: 'x', bogusField: 1 }))
    const config = createConfigStore(file).read()
    expect(config.storeId).toBe('x')
    expect(config.streamProfile).toBe('sub')
    expect('bogusField' in config).toBe(false)
  })

  it('저장 파일은 사람이 읽을 수 있는 JSON이다', () => {
    createConfigStore(file).write({ storeId: 'store-1' })
    expect(JSON.parse(readFileSync(file, 'utf8')).storeId).toBe('store-1')
  })
})
