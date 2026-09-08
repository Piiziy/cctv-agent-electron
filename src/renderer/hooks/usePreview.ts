import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export interface PreviewState {
  readonly url: string | null
  readonly error: string | null
}

/**
 * 실시간 미리보기 스트림.
 *
 * 메인 프로세스가 ffmpeg 로 MJPEG 를 만들어 로컬 HTTP 로 내보내고, 여기서는
 * 그 URL 만 받아 <img src> 에 꽂는다. 브라우저가 multipart/x-mixed-replace 를
 * 그대로 재생하므로 렌더러에 디코딩 코드가 필요 없다.
 */
export const usePreview = (rtspUri: string | null): PreviewState => {
  const [state, setState] = useState<PreviewState>({ url: null, error: null })

  useEffect(() => {
    if (!rtspUri) {
      setState({ url: null, error: null })
      void api.previewStop()
      return
    }

    const control = { cancelled: false }
    setState({ url: null, error: null })
    void api.previewStart(rtspUri).then((result) => {
      if (control.cancelled) return
      setState(result.ok ? { url: result.url, error: null } : { url: null, error: result.message })
    })

    return () => {
      control.cancelled = true
      void api.previewStop()
    }
  }, [rtspUri])

  return state
}
