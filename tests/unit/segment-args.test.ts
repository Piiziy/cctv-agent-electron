import { describe, it, expect } from 'vitest'
import { buildSegmentArgs } from '../../src/main/lib/segment-args'

const base = {
  rtspUri: 'rtsp://cam.local/live',
  spoolDir: '/tmp/spool',
  segmentSeconds: 300,
  includeAudio: false,
}

const joined = (o = base) => buildSegmentArgs(o).join(' ')

describe('buildSegmentArgs', () => {
  it('RTSP를 TCP로 강제한다 (NAT/방화벽 환경의 실무 기본값)', () => {
    expect(joined()).toContain('-rtsp_transport tcp')
  })

  it('재인코딩하지 않는다', () => {
    expect(joined()).toContain('-c:v copy')
    expect(joined()).not.toContain('libx264')
  })

  it('segment 머서와 조각 길이를 지정한다', () => {
    expect(joined()).toContain('-f segment')
    expect(joined()).toContain('-segment_time 300')
    expect(joined()).toContain('-segment_format mp4')
  })

  it('manifest를 반드시 지정한다 (조각 완성 신호)', () => {
    expect(joined()).toContain('-segment_list /tmp/spool/.writing/manifest.txt')
    expect(joined()).toContain('-segment_list_type flat')
  })

  it('manifest를 즉시 flush 하도록 +live 플래그를 준다', () => {
    expect(joined()).toContain('-segment_list_flags +live')
  })

  it('쓰는 중인 조각은 숨김 하위 폴더에 쓴다 (완성된 것과 물리적으로 분리)', () => {
    expect(joined()).toContain('/tmp/spool/.writing/part_%05d.mp4')
  })

  it('파일명에 시각(strftime)을 쓰지 않는다 — 초 단위라 짧은 조각에서 충돌한다', () => {
    expect(joined()).not.toContain('-strftime')
  })

  it('소켓 타임아웃을 건다 (응답 없는 카메라에 무한 대기 방지)', () => {
    expect(joined()).toContain('-timeout ')
  })

  it('오디오를 끄면 -an이 들어간다', () => {
    expect(buildSegmentArgs(base)).toContain('-an')
  })

  it('오디오를 켜면 -an 없이 오디오도 copy한다', () => {
    const args = buildSegmentArgs({ ...base, includeAudio: true })
    expect(args).not.toContain('-an')
    expect(args.join(' ')).toContain('-c:a copy')
  })

  it('입력(-i)이 출력 경로보다 먼저 온다', () => {
    const args = buildSegmentArgs(base)
    expect(args.indexOf('-i')).toBeLessThan(args.length - 1)
    expect(args[args.length - 1]).toBe('/tmp/spool/.writing/part_%05d.mp4')
  })
})
