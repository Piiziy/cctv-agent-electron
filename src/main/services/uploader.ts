import { openAsBlob } from 'node:fs'
import type { SegmentMeta } from '../../shared/types'

export type FatalCause = 'auth' | 'too-large' | 'rejected' | 'missing-file'

export type UploadResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'retry'; readonly reason: string }
  | { readonly kind: 'fatal'; readonly reason: string; readonly cause: FatalCause }

/** 일시적이라 기다리면 풀리는 4xx. 나머지 4xx 는 재시도해도 소용없다. */
const TRANSIENT_4XX = new Set([408, 429])

/**
 * 응답 코드를 재시도 정책으로 옮긴다.
 *
 * 핵심은 "되는 재시도"와 "안 되는 재시도"를 가르는 것이다. 네트워크·서버 장애는
 * 기다리면 해소되지만 토큰이 틀린 것은 백만 번 시도해도 해소되지 않는다.
 * 후자는 즉시 멈추고 사람을 불러야 한다.
 */
export const classifyStatus = (status: number): UploadResult => {
  if (status >= 200 && status < 300) return { kind: 'ok' }
  // 이미 받은 조각. 업로드는 성공했는데 응답만 못 받은 경우이므로 성공으로 취급한다.
  if (status === 409) return { kind: 'duplicate' }
  if (status === 401 || status === 403) {
    return { kind: 'fatal', reason: `인증 실패 (HTTP ${status})`, cause: 'auth' }
  }
  if (status === 413) {
    return { kind: 'fatal', reason: '조각이 너무 큽니다 (HTTP 413)', cause: 'too-large' }
  }
  if (status >= 400 && status < 500 && !TRANSIENT_4XX.has(status)) {
    return { kind: 'fatal', reason: `서버가 거부했습니다 (HTTP ${status})`, cause: 'rejected' }
  }
  return { kind: 'retry', reason: `HTTP ${status}` }
}

export interface UploadArgs {
  readonly baseUrl: string
  readonly token: string
  readonly meta: SegmentMeta
  readonly filePath: string
  readonly fetchImpl?: typeof fetch
}

export const segmentsEndpoint = (baseUrl: string): string =>
  `${baseUrl.replace(/\/+$/, '')}/v1/segments`

export const uploadSegment = async (args: UploadArgs): Promise<UploadResult> => {
  // openAsBlob 은 잘못된 경로에 대해 동기적으로 던지기도 하므로 try/catch 로 감싼다.
  const video = await (async () => {
    try {
      return await openAsBlob(args.filePath, { type: 'video/mp4' })
    } catch {
      return null
    }
  })()
  if (!video) {
    return { kind: 'fatal', reason: `조각 파일이 없습니다: ${args.filePath}`, cause: 'missing-file' }
  }

  const form = new FormData()
  form.append('meta', new Blob([JSON.stringify(args.meta)], { type: 'application/json' }))
  form.append('video', video, `${args.meta.segmentId}.mp4`)

  try {
    const response = await (args.fetchImpl ?? fetch)(segmentsEndpoint(args.baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${args.token}`,
        'idempotency-key': args.meta.segmentId,
      },
      body: form,
    })
    return classifyStatus(response.status)
  } catch (error) {
    // 네트워크에 닿지 못한 경우. 인터넷이 끊긴 상황이 여기로 온다.
    return { kind: 'retry', reason: error instanceof Error ? error.message : '네트워크 오류' }
  }
}
