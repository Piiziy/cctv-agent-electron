import { useState } from 'react'
import type {
  AgentConfig,
  AgentStatus,
  CameraRuntimeStatus,
  CameraStatus,
  SelectedCamera,
  UploadStatus,
} from '../../shared/types'
import { Button, Card, Notice, Pill, Spinner, Stat } from '../components/ui'
import { usePreview } from '../hooks/usePreview'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { formatBytes, formatRelativeTime, formatSegmentLength } from '../lib/format'

type Tone = 'ok' | 'warn' | 'bad' | 'idle'

const CAMERA_LABEL: Record<CameraStatus, { tone: Tone; text: string }> = {
  idle: { tone: 'idle', text: '대기 중' },
  connecting: { tone: 'warn', text: '연결 중' },
  streaming: { tone: 'ok', text: '연결됨' },
  reconnecting: { tone: 'warn', text: '재연결 중' },
  'auth-failed': { tone: 'bad', text: '인증 실패' },
}

const UPLOAD_LABEL: Record<UploadStatus, { tone: Tone; text: string }> = {
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
  readonly onAddCamera: () => void
  readonly onRemoveCamera: (cameraId: string) => Promise<void>
}

interface CameraCardProps {
  readonly entry: CameraRuntimeStatus
  readonly camera: SelectedCamera | undefined
  readonly running: boolean
  readonly selected: boolean
  readonly onSelect: () => void
  readonly onRemove: () => void
}

const CameraCard = ({ entry, camera, running, selected, onSelect, onRemove }: CameraCardProps) => {
  const label = CAMERA_LABEL[entry.camera]
  return (
    <Card
      className={cn(
        'overflow-hidden transition-colors',
        selected ? 'ring-2 ring-indigo-300' : 'hover:border-slate-300',
      )}
    >
      <button type="button" onClick={onSelect} className="block w-full text-left">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2">
            <Pill tone={running ? label.tone : 'idle'}>{entry.name}</Pill>
          </span>
          <span className="shrink-0 text-xs text-slate-500">
            {running ? label.text : '중지됨'}
          </span>
        </div>
        <dl className="grid grid-cols-3 gap-2 border-t border-slate-100 px-3 py-2.5 text-xs">
          <div>
            <dt className="text-slate-400">업로드</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-slate-800">
              {entry.uploadedCount.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">대기</dt>
            <dd
              className={cn(
                'mt-0.5 font-semibold tabular-nums',
                entry.pendingCount > 0 ? 'text-amber-600' : 'text-slate-800',
              )}
            >
              {entry.pendingCount.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">마지막</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-slate-800">
              {formatRelativeTime(entry.lastUploadAt)}
            </dd>
          </div>
        </dl>
      </button>
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
        <span className="truncate text-xs text-slate-400">
          {camera ? `${camera.width}×${camera.height} · ${camera.streamProfile}` : ''}
        </span>
        <Button tone="ghost" onClick={onRemove} className="px-2 py-1 text-xs">
          제외
        </Button>
      </div>
    </Card>
  )
}

export const Dashboard = ({ status, config, onStop, onAddCamera, onRemoveCamera }: Props) => {
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const focused =
    status.cameras.find((c) => c.cameraId === focusedId) ?? status.cameras[0] ?? null
  const focusedCamera = config.cameras.find((c) => c.id === focused?.cameraId)
  const preview = usePreview(status.running ? (focusedCamera?.rtspUri ?? null) : null)

  const uploadState = UPLOAD_LABEL[status.upload]
  const streaming = status.cameras.filter((c) => c.camera === 'streaming').length
  const pending = status.cameras.reduce((sum, c) => sum + c.pendingCount, 0)
  const evicted = status.cameras.filter((c) => c.spoolEvicted)
  const authFailed = status.cameras.filter((c) => c.camera === 'auth-failed')

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Pill tone={status.running ? (streaming > 0 ? 'ok' : 'warn') : 'idle'}>
            {status.running ? `카메라 ${streaming}/${status.cameras.length}대 감시 중` : '감시 중지됨'}
          </Pill>
          <span className="text-sm text-slate-400">·</span>
          <Pill tone={status.running ? uploadState.tone : 'idle'}>
            {status.running ? uploadState.text : '중지됨'}
          </Pill>
        </div>
        <div className="flex gap-2">
          <Button onClick={onAddCamera}>카메라 추가</Button>
          {status.running && (
            <Button tone="danger" onClick={() => void onStop()}>
              전체 중지
            </Button>
          )}
        </div>
      </header>

      {status.upload === 'auth-failed' && (
        <Notice tone="bad">
          백엔드 서버가 인증을 거부했습니다. 모든 카메라의 조각이 안전하게 보관되고 있으니,
          설정에서 기기 토큰을 확인한 뒤 다시 시작하면 밀린 조각부터 순서대로 전송됩니다.
        </Notice>
      )}
      {authFailed.length > 0 && (
        <Notice tone="bad">
          {authFailed.map((c) => c.name).join(', ')} 카메라 인증에 실패했습니다. 비밀번호가 바뀌었을
          수 있습니다. 해당 카메라를 제외한 뒤 다시 추가해 주세요. 나머지 카메라는 정상 동작합니다.
        </Notice>
      )}
      {evicted.length > 0 && (
        <Notice tone="warn">
          {evicted.map((c) => c.name).join(', ')} 카메라가 저장 공간 몫(
          {formatBytes(status.spoolLimitBytesPerCamera)})을 넘어 오래된 조각을 버렸습니다.
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex aspect-video items-center justify-center bg-slate-900">
            {preview.url ? (
              <img src={preview.url} alt="현재 화면" className="size-full object-contain" />
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
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            {focused ? `${focused.name} — 카드를 눌러 다른 카메라를 봅니다` : '카메라 없음'}
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {status.cameras.map((entry) => (
            <CameraCard
              key={entry.cameraId}
              entry={entry}
              camera={config.cameras.find((c) => c.id === entry.cameraId)}
              running={status.running}
              selected={entry.cameraId === focused?.cameraId}
              onSelect={() => setFocusedId(entry.cameraId)}
              onRemove={() => void onRemoveCamera(entry.cameraId)}
            />
          ))}
        </div>
      </div>

      <Card className="divide-y divide-slate-100">
        <dl className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <Stat label="오늘 사용량" value={formatBytes(status.bytesUploadedToday)} />
          <Stat label="대기 중 합계" value={pending.toLocaleString()} />
          <Stat label="조각 길이" value={formatSegmentLength(config.segmentSeconds)} />
          <Stat
            label="조각 경계"
            value={config.alignToClock ? '벽시계 정렬' : '각자 시작'}
          />
        </dl>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs text-slate-500">
            카메라당 보관 몫 {formatBytes(status.spoolLimitBytesPerCamera)}
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
