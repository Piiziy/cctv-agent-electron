/**
 * 타입 선언이 없는 벤더 패키지들.
 * onvif 는 콜백 기반 CommonJS 라이브러리라 우리 서비스 계층 뒤에 숨겨두고,
 * 여기서는 최소한의 형태만 선언한다.
 */
declare module 'onvif' {
  export const Discovery: {
    probe(
      options: { timeout?: number; resolve?: boolean },
      callback: (error: Error | null, found: unknown[]) => void,
    ): void
  }
  export const Cam: new (
    options: {
      hostname: string
      port?: number
      path?: string
      username?: string
      password?: string
      timeout?: number
    },
    callback: (error: Error | null) => void,
  ) => unknown
}

declare module 'ffprobe-static' {
  const ffprobe: { path: string }
  export default ffprobe
}
