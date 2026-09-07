import { join } from 'node:path'

/** ffmpeg가 조각을 닫을 때마다 파일명 한 줄을 추가하는 목록 파일. */
export const MANIFEST_NAME = 'manifest.txt'

/** `-strftime 1` 과 함께 쓰여 파일명에 벽시계 시각이 박힌다. */
export const SEGMENT_FILE_PATTERN = 'seg_%Y%m%d_%H%M%S.mp4'

/** RTSP 소켓 I/O 타임아웃(마이크로초). ffmpeg 6.0 기준 옵션명은 `-timeout`. */
const SOCKET_TIMEOUT_US = 15_000_000

export interface SegmentArgsInput {
  readonly rtspUri: string
  readonly spoolDir: string
  readonly segmentSeconds: number
  readonly includeAudio: boolean
}

/**
 * RTSP 스트림을 재인코딩 없이 조각내는 ffmpeg 인자.
 *
 * 핵심 두 가지:
 * - `-c:v copy` : 재인코딩하지 않으므로 CPU를 거의 쓰지 않고 화질 손실이 없다.
 * - `-f segment`: 키프레임(IDR) 경계에서만 자른다. H.264/H.265는 임의 지점에서
 *   자르면 재생 불가능한 조각이 나오는데, 이 머서가 그 제약을 알아서 지킨다.
 */
export const buildSegmentArgs = (input: SegmentArgsInput): string[] => [
  '-hide_banner',
  '-loglevel', 'warning',
  '-nostdin',
  '-rtsp_transport', 'tcp',
  '-timeout', String(SOCKET_TIMEOUT_US),
  '-i', input.rtspUri,
  ...(input.includeAudio ? ['-c:a', 'copy'] : ['-an']),
  '-c:v', 'copy',
  '-f', 'segment',
  '-segment_time', String(input.segmentSeconds),
  '-segment_format', 'mp4',
  '-reset_timestamps', '1',
  '-strftime', '1',
  '-segment_list', join(input.spoolDir, MANIFEST_NAME),
  '-segment_list_type', 'flat',
  // +live 가 없으면 manifest 가 버퍼링되어 조각 완성 신호가 늦게 온다.
  '-segment_list_flags', '+live',
  join(input.spoolDir, SEGMENT_FILE_PATTERN),
]
