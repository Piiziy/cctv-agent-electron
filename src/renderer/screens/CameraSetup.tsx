import { useEffect, useState } from 'react'
import type { ProbeResult } from '../../shared/ipc'
import type { SelectedCamera, StreamProfile } from '../../shared/types'
import { Button, Card, Field, Notice, Spinner } from '../components/ui'
import { usePreview } from '../hooks/usePreview'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { formatDailyUsage, formatResolution } from '../lib/format'
import type { CameraChoice } from './CameraSelect'

const SEGMENT_OPTIONS = [
  { seconds: 30, label: '30초', note: '가장 빠른 감지' },
  { seconds: 60, label: '1분', note: '균형' },
  { seconds: 300, label: '5분', note: '기본' },
]

interface Props {
  readonly choice: CameraChoice
  readonly initialSegmentSeconds: number
  readonly onBack: () => void
  readonly onAdd: (camera: SelectedCamera, segmentSeconds: number) => Promise<void>
}

export const CameraSetup = ({ choice, initialSegmentSeconds, onBack, onAdd }: Props) => {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [probing, setProbing] = useState(false)
  const [result, setResult] = useState<ProbeResult | null>(null)
  const [selectedToken, setSelectedToken] = useState<string | null>(null)
  // ONVIF 의 name 은 보통 제조사명('HIKVISION')이라 위치 이름으로 쓸모가 없다.
  // 빈칸으로 두어 사용자가 '계산대' 같은 실제 위치를 적게 한다.
  const [name, setName] = useState('')
  const [segmentSeconds, setSegmentSeconds] = useState(initialSegmentSeconds)
  const [starting, setStarting] = useState(false)

  const profiles: readonly StreamProfile[] = result?.ok ? result.profiles : []
  const selected = profiles.find((profile) => profile.token === selectedToken) ?? null
  const preview = usePreview(selected?.rtspUri ?? null)

  const probe = async (): Promise<void> => {
    setProbing(true)
    const next =
      choice.kind === 'manual'
        ? await api.probeRtsp(choice.rtspUri)
        : await api.probe({ xaddr: choice.camera!.xaddr, username, password })
    setResult(next)
    setProbing(false)
    if (next.ok) {
      // 대역폭 절약이 목적이므로 서브스트림을 기본으로 고른다.
      const preferred = next.profiles.find((profile) => profile.kind === 'sub') ?? next.profiles[0]
      setSelectedToken(preferred?.token ?? null)
    }
  }

  // 수동 입력은 자격증명이 주소에 이미 들어 있으므로 바로 조사한다.
  useEffect(() => {
    if (choice.kind === 'manual') void probe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice.kind])

  const start = async (): Promise<void> => {
    if (!selected) return
    setStarting(true)
    await onAdd(
      {
        id: choice.camera?.id ?? selected.rtspUri,
        name: name.trim() || '카메라',
        manufacturer: choice.camera?.manufacturer ?? null,
        model: choice.camera?.model ?? null,
        rtspUri: selected.rtspUri,
        streamProfile: selected.kind,
        codec: selected.codec,
        width: selected.width,
        height: selected.height,
        fps: selected.fps,
      },
      segmentSeconds,
    )
    setStarting(false)
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <header className="flex items-center gap-3">
        <Button tone="ghost" onClick={onBack} className="px-2">
          ←
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {choice.camera
              ? `${choice.camera.manufacturer ?? '카메라'} ${choice.camera.model ?? ''}`.trim()
              : '직접 입력한 카메라'}
          </h1>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {choice.camera?.ip ?? choice.rtspUri}
          </p>
        </div>
      </header>

      {choice.kind === 'onvif' && (
        <Card className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="아이디"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
            />
            <Field
              label="비밀번호"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
              onKeyDown={(event) => {
                if (event.key === 'Enter') void probe()
              }}
            />
          </div>
          <div className="flex justify-end">
            <Button tone="primary" onClick={() => void probe()} disabled={probing}>
              {probing ? <Spinner /> : null}
              확인
            </Button>
          </div>
          {result && !result.ok && <Notice tone="bad">{result.message}</Notice>}
        </Card>
      )}

      {choice.kind === 'manual' && result && !result.ok && (
        <Notice tone="bad">{result.message}</Notice>
      )}

      {profiles.length > 0 && (
        <>
          <Card className="overflow-hidden">
            <div className="flex aspect-video items-center justify-center bg-slate-900">
              {preview.url ? (
                <img src={preview.url} alt="카메라 미리보기" className="size-full object-contain" />
              ) : (
                <span className="flex items-center gap-2 text-sm text-slate-400">
                  {preview.error ? preview.error : <><Spinner /> 화면을 불러오는 중…</>}
                </span>
              )}
            </div>
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              실시간 화면입니다. 계산대·출입문 등 원하는 곳이 맞는지 확인하세요.
            </p>
          </Card>

          <Card className="space-y-4 p-4">
            <Field
              label="카메라 이름"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="계산대"
              hint="알림에 표시될 이름입니다"
            />

            <div>
              <span className="mb-2 block text-sm font-medium text-slate-700">화질</span>
              <div className="space-y-2">
                {profiles.map((profile) => {
                  const usage = formatDailyUsage(profile.bitrateKbps)
                  const active = profile.token === selectedToken
                  return (
                    <button
                      key={profile.token}
                      type="button"
                      onClick={() => setSelectedToken(profile.token)}
                      className={cn(
                        'w-full rounded-lg border text-left transition-colors',
                        'flex items-start gap-3 px-3 py-2.5',
                        active
                          ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-200'
                          : 'border-slate-200 hover:bg-slate-50',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 rounded-full border-2',
                          'size-4 shrink-0',
                          active ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300',
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="text-sm font-medium text-slate-900">
                            {profile.kind === 'sub' ? '표준' : '고화질'}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatResolution(profile.width, profile.height)} · {profile.codec}
                            {profile.bitrateKbps ? ` · ${profile.bitrateKbps} kbps` : ''}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {profile.kind === 'sub'
                            ? `인터넷 사용량이 적습니다. AI 분석에는 이걸로 충분합니다.${usage ? ` 약 ${usage}` : ''}`
                            : `증거 보존에는 좋지만 회선을 많이 씁니다.${usage ? ` 약 ${usage}` : ''}`}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <span className="mb-2 block text-sm font-medium text-slate-700">조각 길이</span>
              <div className="flex gap-2">
                {SEGMENT_OPTIONS.map((option) => (
                  <button
                    key={option.seconds}
                    type="button"
                    onClick={() => setSegmentSeconds(option.seconds)}
                    className={cn(
                      'flex-1 rounded-lg border text-center transition-colors',
                      'px-3 py-2',
                      option.seconds === segmentSeconds
                        ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-200'
                        : 'border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    <span className="block text-sm font-medium text-slate-900">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{option.note}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                조각이 길수록 알림이 늦습니다. 5분으로 두면 이상행동 알림이 최대 5분 뒤에 옵니다.
                이 값은 모든 카메라에 함께 적용됩니다.
              </p>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                tone="primary"
                disabled={!selected || starting}
                onClick={() => void start()}
                className="px-6"
              >
                {starting ? <Spinner /> : null}
                감시 목록에 추가
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
