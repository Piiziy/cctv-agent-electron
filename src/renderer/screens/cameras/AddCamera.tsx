/**
 * 2b 카메라 추가 위저드 — ① 찾기 ② 연결 확인 ③ 이름·설정.
 * 값: design/씬스틸러 PC 앱.dc.html 의 2b 인라인 스타일.
 *
 * 로직은 예전 CameraSelect/CameraSetup 그대로다 (ONVIF 검색 → 자격증명으로 프로필
 * 조사 → 서브스트림 기본 선택 → 실시간 미리보기). 바뀐 건 세 칸을 한 화면에 펼치고
 * 차례가 아닌 칸을 opacity .55 로 흐리게 한 것, 그리고 서버에 카메라를 등록하는 것.
 *
 * 디자인과 다르게 한 것:
 *  - 미리보기 자리의 '2초마다 갱신'을 뺐다. 지금 미리보기는 스냅샷이 아니라 실시간
 *    스트림이라(22d8b8b 이후) 사실이 아니다.
 *  - 위치 태그에 '기타'를 더했다. 요구사항 2.1 의 태그 목록에 있다.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ProbeResult } from '../../../shared/ipc'
import type { LocationTag } from '../../../shared/server-types'
import type { DiscoveredCamera, SelectedCamera, StreamProfile } from '../../../shared/types'
import { useConnectedStore, useSession } from '../../app/session'
import { Button, Input, Notice, Segmented, Spinner, VideoSurface } from '../../components/ui'
import { usePreview } from '../../hooks/usePreview'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatDailyUsage, formatResolution } from '../../lib/format'
import { LOCATION_LABEL, LOCATION_ORDER, SPEED_OPTIONS } from '../../lib/labels'
import { createCamera, ServerError, updateStore } from '../../lib/server-api'
import { formatStamp } from '../../lib/time'

const MAX_CAMERAS = 8

type Step = 1 | 2 | 3

interface Choice {
  readonly kind: 'onvif' | 'manual'
  readonly camera: DiscoveredCamera | null
  readonly rtspUri: string
}

/* ------------------------------------------------------------------ 단계 표시 */

const StepMark = ({ index, label, current }: { index: Step; label: string; current: Step }) => {
  const done = index < current
  const active = index === current
  return (
    <span
      className={cn(
        'flex items-center gap-1.5',
        done && 'text-success-500',
        active && 'text-brand-sub',
        !done && !active && 'text-gray-600',
      )}
    >
      <span
        className={cn(
          'inline-flex size-6 items-center justify-center rounded-full text-[12px]',
          done && 'bg-success-500 text-white',
          active && 'bg-brand-sub text-white',
          !done && !active && 'shadow-[inset_0_0_0_1.5px_var(--gray-300)]',
        )}
      >
        {done ? '✓' : index}
      </span>
      {label}
    </span>
  )
}

const Panel = ({
  active,
  className,
  children,
}: {
  active: boolean
  className?: string
  children: ReactNode
}) => (
  <section
    aria-disabled={!active}
    className={cn(
      'flex min-h-0 flex-col rounded-card bg-surface p-6 shadow-card transition-opacity',
      // 2b — 차례가 아닌 칸은 opacity .55
      !active && 'pointer-events-none opacity-[.55]',
      className,
    )}
  >
    {children}
  </section>
)

const PanelTitle = ({ children }: { children: string }) => <h2 className="text-h3">{children}</h2>

const SubLabel = ({ main, hint }: { main: string; hint?: string }) => (
  <span className="text-body-sm font-semibold">
    {main}
    {hint && <span className="font-normal text-gray-600"> — {hint}</span>}
  </span>
)

/* ------------------------------------------------------------------- ① 찾기 */

const FindPanel = ({
  active,
  addedIds,
  addedNames,
  selected,
  onChoose,
}: {
  active: boolean
  addedIds: ReadonlySet<string>
  addedNames: ReadonlyMap<string, string>
  selected: Choice | null
  onChoose: (choice: Choice) => void
}) => {
  const [cameras, setCameras] = useState<readonly DiscoveredCamera[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [scanning, setScanning] = useState(true)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualUri, setManualUri] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)

  const scan = useCallback(async () => {
    setScanning(true)
    const result = await api.discover()
    setCameras(result.ok ? result.cameras : [])
    setFailure(result.ok ? null : result.message)
    setScanning(false)
  }, [])

  useEffect(() => {
    void scan()
  }, [scan])

  return (
    // ① 은 다른 단계에서도 다시 고를 수 있게 늘 켜 둔다.
    <Panel active={active || selected !== null} className="gap-3.5">
      <div className="flex items-center justify-between">
        <PanelTitle>① 찾은 카메라</PanelTitle>
        <button
          type="button"
          onClick={() => void scan()}
          disabled={scanning}
          className="text-body-sm font-semibold text-brand-sub disabled:text-gray-500"
        >
          {scanning ? '찾는 중…' : '다시 검색'}
        </button>
      </div>

      {failure && (
        <Notice tone="bad">
          카메라 검색 기능에 문제가 있습니다. 아래에서 주소를 직접 입력해 주세요.
        </Notice>
      )}

      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {scanning && cameras.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-8 text-body-sm font-normal text-gray-600">
            <Spinner className="size-4" />
            같은 공유기의 카메라를 찾고 있습니다
          </div>
        )}
        {!scanning && cameras.length === 0 && !failure && (
          <p className="py-6 text-center text-body-sm font-normal text-gray-600">카메라를 찾지 못했습니다.</p>
        )}
        {cameras.map((camera) => {
          const added = addedIds.has(camera.id)
          const isSelected = selected?.camera?.id === camera.id
          const title = [camera.manufacturer ?? '알 수 없는 카메라', camera.model].filter(Boolean).join(' ')
          return (
            <div
              key={camera.id}
              className={cn(
                'flex items-center justify-between gap-3 rounded-card px-4 py-3.5',
                isSelected
                  ? 'bg-blue-100 shadow-[inset_0_0_0_1.5px_var(--sub)]'
                  : 'shadow-[inset_0_0_0_1px_var(--gray-300)]',
                added && 'opacity-[.55]',
              )}
            >
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold">{title}</div>
                <div className="truncate text-caption text-gray-600">
                  {camera.ip} ·{' '}
                  {added ? `'${addedNames.get(camera.id) ?? '카메라'}'(으)로 등록됨` : 'ONVIF'}
                </div>
              </div>
              {added ? (
                <span className="shrink-0 text-caption text-gray-600">추가됨</span>
              ) : isSelected ? (
                <span className="shrink-0 rounded-chip bg-brand-sub px-3 py-1 text-caption font-semibold text-white">
                  선택됨
                </span>
              ) : (
                <Button
                  variant="secondary"
                  className="shrink-0 px-3.5 py-1.5 text-caption"
                  onClick={() => onChoose({ kind: 'onvif', camera, rtspUri: '' })}
                >
                  추가
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {manualOpen ? (
        <div className="flex flex-col gap-2">
          <Input
            label="RTSP 주소"
            placeholder="rtsp://admin:비밀번호@192.168.0.64:554/Streaming/Channels/102"
            value={manualUri}
            onChange={(event) => setManualUri(event.target.value)}
            hint="아이디·비밀번호를 주소 안에 넣어 입력하세요"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setManualOpen(false)}>
              취소
            </Button>
            <Button
              variant="action"
              disabled={!manualUri.trim().startsWith('rtsp://')}
              onClick={() => onChoose({ kind: 'manual', camera: null, rtspUri: manualUri.trim() })}
            >
              이 주소로 추가
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="self-start text-body-sm font-semibold text-brand-sub"
        >
          카메라가 안 보이나요? → 주소 직접 입력
        </button>
      )}

      <div className="mt-auto rounded-card bg-gray-100 px-4 py-3.5 text-caption leading-[1.55] text-gray-700">
        안 잡히는 흔한 이유: 카메라가 다른 공유기에 있음 / 카메라 ONVIF 설정이 꺼져 있음 →{' '}
        <button type="button" onClick={() => setHelpOpen((open) => !open)} className="font-semibold text-brand-sub">
          켜는 방법 보기
        </button>
        {helpOpen && (
          // 예전 인증 실패 안내에 있던 경로를 그대로 쓴다 (main/ipc.ts toProbeFailure).
          <p className="mt-2">
            카메라 웹설정 → 네트워크 → 고급 → ONVIF 에서 켜고, 계정을 추가하세요. 하이크비전 등 일부
            제조사는 관리자 계정과 별개로 ONVIF 전용 계정이 필요합니다.
          </p>
        )}
      </div>
    </Panel>
  )
}

/* --------------------------------------------------------------- ② 연결 확인 */

const VerifyPanel = ({
  active,
  choice,
  cameraNumber,
  profiles,
  onProbed,
  onReject,
  onAccept,
}: {
  active: boolean
  choice: Choice | null
  cameraNumber: number
  profiles: readonly StreamProfile[]
  onProbed: (result: ProbeResult) => void
  onReject: () => void
  onAccept: () => void
}) => {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [probing, setProbing] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [now, setNow] = useState(new Date().toISOString())

  // 미리보기는 서브스트림(표준 화질)으로 — 확인만 하면 되고 회선을 덜 쓴다.
  const preview = profiles.find((profile) => profile.kind === 'sub') ?? profiles[0] ?? null
  const live = usePreview(active ? (preview?.rtspUri ?? null) : null, { key: 'add-camera' })

  const probe = useCallback(async () => {
    if (!choice) return
    setProbing(true)
    setFailure(null)
    const result =
      choice.kind === 'manual'
        ? await api.probeRtsp(choice.rtspUri)
        : await api.probe({ xaddr: choice.camera?.xaddr ?? '', username, password })
    setProbing(false)
    if (!result.ok) setFailure(result.message)
    onProbed(result)
  }, [choice, username, password, onProbed])

  // 수동 입력은 자격증명이 주소에 이미 들어 있어 바로 조사한다.
  useEffect(() => {
    setFailure(null)
    if (choice?.kind === 'manual') void probe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <Panel active={active} className="gap-4">
      <PanelTitle>② 비밀번호 넣고 화면 확인</PanelTitle>

      {choice?.kind !== 'manual' && (
        <>
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2.5">
            <Input
              label="아이디"
              value={username}
              autoComplete="off"
              state={username ? 'done' : 'default'}
              onChange={(event) => setUsername(event.target.value)}
            />
            <Input
              label="비밀번호"
              type="password"
              value={password}
              autoComplete="off"
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void probe()
              }}
            />
            <Button variant="action" className="h-input" loading={probing} onClick={() => void probe()}>
              확인
            </Button>
          </div>
          <p className="-mt-1.5 text-caption text-gray-600">카메라 뒷면 스티커나 설치 기사님이 준 비밀번호입니다</p>
        </>
      )}

      {failure && <Notice tone="bad">{failure}</Notice>}

      <VideoSurface className="min-h-[300px] flex-1 rounded-card aspect-auto">
        {live.url ? (
          <img src={live.url} alt="카메라 미리보기" className="absolute inset-0 size-full object-contain" />
        ) : probing ? (
          <Spinner className="text-gray-500" />
        ) : (
          <span>{live.error ?? '실시간 미리보기'}</span>
        )}
        <span className="absolute left-3 top-3 rounded-[6px] bg-[rgb(0_0_0/.55)] px-2 py-1 text-[12px] text-white">
          CAM {String(cameraNumber).padStart(2, '0')} · {formatStamp(now)}
        </span>
        {preview && live.url && (
          <span className="absolute bottom-3 right-3 rounded-chip bg-success-500 px-2.5 py-1 text-[12px] font-semibold text-white">
            연결 성공 · {formatResolution(preview.width, preview.height)}
          </span>
        )}
      </VideoSurface>

      <div className="flex items-center justify-between">
        <span className="text-body font-semibold">이 화면이 맞나요?</span>
        <div className="flex gap-2.5">
          <Button variant="secondary" onClick={onReject}>
            아니요, 다른 카메라
          </Button>
          <Button variant="action" className="px-7" disabled={profiles.length === 0} onClick={onAccept}>
            네, 다음 →
          </Button>
        </div>
      </div>
    </Panel>
  )
}

/* ---------------------------------------------------------------- ③ 이름·설정 */

const QualityCard = ({
  profile,
  active,
  recommended,
  onSelect,
}: {
  profile: StreamProfile
  active: boolean
  recommended: boolean
  onSelect: () => void
}) => {
  const usage = formatDailyUsage(profile.bitrateKbps)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex-1 rounded-card px-3.5 py-3 text-left',
        active ? 'bg-blue-100 shadow-[inset_0_0_0_1.5px_var(--sub)]' : 'shadow-[inset_0_0_0_1px_var(--gray-300)]',
      )}
    >
      <div className="text-[15px] font-semibold">
        {profile.kind === 'sub' ? '표준' : '고화질'}
        {recommended && <span className="ml-1 text-caption text-brand-sub">권장</span>}
      </div>
      <div className="text-caption text-gray-600">
        {formatResolution(profile.width, profile.height)}
        {usage ? ` · 약 ${usage}` : ''}
      </div>
    </button>
  )
}

/* ------------------------------------------------------------------ 화면 */

export const AddCamera = () => {
  const navigate = useNavigate()
  const store = useConnectedStore()
  const { config, updateConfig, refreshStore } = useSession()

  const [choice, setChoice] = useState<Choice | null>(null)
  const [profiles, setProfiles] = useState<readonly StreamProfile[]>([])
  const [step, setStep] = useState<Step>(1)
  const [name, setName] = useState('')
  const [locationTag, setLocationTag] = useState<LocationTag | null>(null)
  const [profileToken, setProfileToken] = useState<string | null>(null)
  const [speed, setSpeed] = useState<30 | 60 | 300>(store.segmentSeconds)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addedIds = new Set(config.cameras.map((camera) => camera.id))
  const addedNames = new Map(config.cameras.map((camera) => [camera.id, camera.name]))
  const full = config.cameras.length >= MAX_CAMERAS
  const selectedProfile = profiles.find((profile) => profile.token === profileToken) ?? null

  const choose = (next: Choice) => {
    setChoice(next)
    setProfiles([])
    setProfileToken(null)
    setStep(2)
  }

  const onProbed = useCallback((result: ProbeResult) => {
    if (!result.ok) return setProfiles([])
    setProfiles(result.profiles)
    // 대역폭 절약이 목적이라 서브스트림(표준)을 기본으로 고른다.
    const preferred = result.profiles.find((profile) => profile.kind === 'sub') ?? result.profiles[0]
    setProfileToken(preferred?.token ?? null)
  }, [])

  const start = async () => {
    if (!choice || !selectedProfile) return
    setStarting(true)
    setError(null)
    const camera: SelectedCamera = {
      id: choice.camera?.id ?? selectedProfile.rtspUri,
      name: name.trim() || '카메라',
      manufacturer: choice.camera?.manufacturer ?? null,
      model: choice.camera?.model ?? null,
      rtspUri: selectedProfile.rtspUri,
      streamProfile: selectedProfile.kind,
      codec: selectedProfile.codec,
      width: selectedProfile.width,
      height: selectedProfile.height,
      fps: selectedProfile.fps,
    }

    try {
      // 서버에 먼저 등록한다. 서버가 모르는 카메라의 조각은 이벤트로 이어지지 않는다.
      // RTSP 주소·비밀번호는 올리지 않는다 — PC 로컬에만 둔다 (요구사항 2.1).
      await createCamera(store.id, {
        agentCameraId: camera.id,
        name: camera.name,
        locationTag,
        sortOrder: config.cameras.length + 1,
        streamProfile: camera.streamProfile,
      })
      // '알림 빠르기'는 매장 설정이 단일 출처다. PC 는 하트비트로 따라가지만 지금 바로 맞춘다.
      if (speed !== store.segmentSeconds) await updateStore(store.id, { segmentSeconds: speed })
      await updateConfig({ segmentSeconds: speed, streamProfile: camera.streamProfile })

      // 같은 카메라를 두 번 넣으면 같은 폴더를 두 프로세스가 쓰게 된다.
      const cameras = [...config.cameras.filter((existing) => existing.id !== camera.id), camera]
      await api.start(cameras)
      await updateConfig({ cameras })
      await refreshStore()
      navigate('/live', { replace: true })
    } catch (startError) {
      setError(startError instanceof ServerError ? startError.message : '카메라를 추가하지 못했습니다.')
      setStarting(false)
    }
  }

  return (
    <div className="flex h-full min-h-[760px] flex-col gap-5 px-page py-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-h1">카메라 추가</h1>
          <p className="mt-1 text-body-sm font-normal text-gray-600">
            {config.cameras.length} / {MAX_CAMERAS}대 등록됨 · 같은 공유기에 연결된 카메라를 자동으로 찾습니다
          </p>
        </div>
        <div className="flex items-center gap-2.5 text-body-sm font-semibold">
          <StepMark index={1} label="찾기" current={step} />
          <span className="h-px w-8 bg-gray-300" />
          <StepMark index={2} label="연결 확인" current={step} />
          <span className="h-px w-8 bg-gray-300" />
          <StepMark index={3} label="이름·설정" current={step} />
        </div>
      </div>

      {full && <Notice tone="warn">카메라는 매장당 {MAX_CAMERAS}대까지 등록할 수 있습니다. 설정 ▸ 카메라 관리에서 정리해 주세요.</Notice>}

      <div className="grid min-h-0 flex-1 grid-cols-[380px_1fr_400px] gap-4">
        <FindPanel
          active={!full && step === 1}
          addedIds={addedIds}
          addedNames={addedNames}
          selected={choice}
          onChoose={choose}
        />
        <VerifyPanel
          active={step === 2}
          choice={choice}
          cameraNumber={config.cameras.length + 1}
          profiles={profiles}
          onProbed={onProbed}
          onReject={() => {
            setChoice(null)
            setProfiles([])
            setStep(1)
          }}
          onAccept={() => setStep(3)}
        />
        <Panel active={step === 3} className="gap-4">
          <PanelTitle>③ 이름 · 위치 · 설정</PanelTitle>
          <div className="flex flex-col gap-1.5">
            <SubLabel main="이름" hint="알림에 이렇게 표시" />
            {/* ONVIF 이름은 보통 제조사명이라 쓸모가 없다. 빈칸으로 두고 실제 위치를 적게 한다. */}
            <Input placeholder="예: 계산대" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <SubLabel main="위치 태그" hint="AI 판단에 사용" />
            <div className="flex flex-wrap gap-1.5">
              {LOCATION_ORDER.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setLocationTag((current) => (current === tag ? null : tag))}
                  className={cn(
                    'inline-flex whitespace-nowrap rounded-chip px-3 py-1 text-caption font-semibold',
                    locationTag === tag
                      ? 'bg-brand-main text-white'
                      : 'text-gray-700 shadow-[inset_0_0_0_1px_var(--gray-300)] hover:bg-gray-100',
                  )}
                >
                  {LOCATION_LABEL[tag]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <SubLabel main="화질" />
            <div className="flex gap-2">
              {profiles.map((profile) => (
                <QualityCard
                  key={profile.token}
                  profile={profile}
                  active={profile.token === profileToken}
                  recommended={profile.kind === 'sub'}
                  onSelect={() => setProfileToken(profile.token)}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <SubLabel main="알림 빠르기" hint="모든 카메라 공통" />
            <Segmented fill value={String(speed)} onChange={(next) => setSpeed(Number(next) as 30 | 60 | 300)} options={SPEED_OPTIONS.map((option) => ({ value: String(option.value), label: option.label }))} />
            <p className="text-caption text-gray-600">알림은 최대 이 시간만큼 늦게 옵니다. 절도는 보통 30초 안에 끝납니다.</p>
          </div>
          {error && <Notice tone="bad">{error}</Notice>}
          <Button variant="primary" className="mt-auto" loading={starting} disabled={!selectedProfile} onClick={() => void start()}>
            감시 시작
          </Button>
        </Panel>
      </div>
    </div>
  )
}
