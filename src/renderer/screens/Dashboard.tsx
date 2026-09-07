import type { AgentConfig, AgentStatus, CameraStatus, UploadStatus } from '../../shared/types'
import { Button, Card, Notice, Pill, Spinner, Stat } from '../components/ui'
import { useSnapshot } from '../hooks/useSnapshot'
import { api } from '../lib/api'
import { formatBytes, formatRelativeTime, formatSegmentLength } from '../lib/format'

const CAMERA_LABEL: Record<CameraStatus, { tone: 'ok' | 'warn' | 'bad' | 'idle'; text: string }> = {
  idle: { tone: 'idle', text: '대기 중' },
  connecting: { tone: 'warn', text: '연결 중' },
  streaming: { tone: 'ok', text: '연결됨' },
  reconnecting: { tone: 'warn', text: '재연결 중' },
  'auth-failed': { tone: 'bad', text: '인증 실패' },
}

const UPLOAD_LABEL: Record<UploadStatus, { tone: 'ok' | 'warn' | 'bad' | 'idle'; text: string }> = {
  idle: { tone: 'ok', text: '정상' },
  uploading: { tone: 'ok', text: '전송 중' },
  retrying: { tone: 'warn', text: '서버 응답 지연' },
  offline: { tone: 'warn', text: '끊김 — 보관 중' },
  'auth-failed': { tone: 'bad', text: '서버 인증 실패' },
  'payload-too-large': { tone: 'bad', text: '조각이 너무 큼' },
}

interface Props {
  readonly status: AgentStatus
  readonly config: AgentConfig
  readonly onStop: () => Promise<void>
  readonly onChangeCamera: () => void
}

export const Dashboard = ({ status, config, onStop, onChangeCamera }: Props) => {
  const camera = config.selectedCamera
  const preview = useSnapshot(status.running ? (camera?.rtspUri ?? null) : null, 5000)
  const cameraState = CAMERA_LABEL[status.camera]
  const uploadState = UPLOAD_LABEL[status.upload]

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Pill tone={status.running ? cameraState.tone : 'idle'}>
            {status.running ? '감시 중' : '감시 중지됨'}
          </Pill>
          <span className="text-sm text-slate-400">·</span>
          <span className="text-sm font-medium text-slate-700">{camera?.name ?? '카메라 없음'}</span>
        </div>
        <div className="flex gap-2">
          <Button onClick={onChangeCamera}>카메라 변경</Button>
          {status.running && (
            <Button tone="danger" onClick={() => void onStop()}>
              중지
            </Button>
          )}
        </div>
      </header>

      {status.upload === 'auth-failed' && (
        <Notice tone="bad">
          백엔드 서버가 인증을 거부했습니다. 조각은 안전하게 보관되고 있으니, 설정에서 기기 토큰을
          확인한 뒤 다시 시작하면 밀린 조각부터 순서대로 전송됩니다.
        </Notice>
      )}
      {status.camera === 'auth-failed' && (
        <Notice tone="bad">
          카메라 인증에 실패했습니다. 비밀번호가 바뀌었을 수 있습니다. [카메라 변경]에서 다시
          연결해 주세요.
        </Notice>
      )}
      {status.spoolEvicted && (
        <Notice tone="warn">
          저장 공간 상한({formatBytes(status.spoolLimitBytes)})을 넘어 오래된 조각을 버렸습니다.
          인터넷이 오래 끊겨 있었다면 그 구간은 분석되지 않습니다.
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex aspect-video items-center justify-center bg-slate-900">
            {preview.dataUrl ? (
              <img src={preview.dataUrl} alt="현재 화면" className="size-full object-contain" />
            ) : (
              <span className="flex items-center gap-2 text-sm text-slate-400">
                {status.running ? (
                  preview.error ? (
                    preview.error
                  ) : (
                    <>
                      <Spinner /> 화면을 불러오는 중…
                    </>
                  )
                ) : (
                  '감시가 중지되어 있습니다'
                )}
              </span>
            )}
          </div>
        </Card>

        <Card className="grid grid-cols-2 gap-4 p-4">
          <Stat label="업로드" value={status.uploadedCount.toLocaleString()} />
          <Stat label="대기 중" value={status.pendingCount.toLocaleString()} />
          <Stat label="마지막 전송" value={formatRelativeTime(status.lastUploadAt)} />
          <Stat label="오늘 사용량" value={formatBytes(status.bytesUploadedToday)} />
        </Card>
      </div>

      <Card className="divide-y divide-slate-100">
        <dl className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">카메라</dt>
            <dd className="mt-1">
              <Pill tone={status.running ? cameraState.tone : 'idle'}>
                {status.running ? cameraState.text : '중지됨'}
              </Pill>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">인터넷</dt>
            <dd className="mt-1">
              <Pill tone={status.running ? uploadState.tone : 'idle'}>
                {status.running ? uploadState.text : '중지됨'}
              </Pill>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">화질</dt>
            <dd className="mt-1 text-sm text-slate-700">
              {camera ? `${camera.width}×${camera.height}` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">조각 길이</dt>
            <dd className="mt-1 text-sm text-slate-700">
              {formatSegmentLength(config.segmentSeconds)}
            </dd>
          </div>
        </dl>

        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs text-slate-500">
            보관 중 {formatBytes(status.spoolBytes)} / 상한 {formatBytes(status.spoolLimitBytes)}
            {status.lastError ? ` · 최근 기록: ${status.lastError}` : ''}
          </span>
          <Button tone="ghost" onClick={() => void api.openSpoolFolder()}>
            보관 폴더 열기
          </Button>
        </div>
      </Card>
    </div>
  )
}
