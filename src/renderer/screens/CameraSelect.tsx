import { useCallback, useEffect, useState } from 'react'
import type { DiscoveredCamera } from '../../shared/types'
import { Button, Card, Notice, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { cn } from '../lib/cn'

export interface CameraChoice {
  readonly kind: 'onvif' | 'manual'
  readonly camera: DiscoveredCamera | null
  readonly rtspUri: string
}

interface Props {
  readonly onChoose: (choice: CameraChoice) => void
  /** 이미 감시 중인 카메라가 있을 때만 준다. 없으면 돌아갈 곳이 없다. */
  readonly onCancel: (() => void) | null
  /** 이미 감시 목록에 들어 있는 카메라 id. 중복 추가를 막는다. */
  readonly addedIds: readonly string[]
}

export const CameraSelect = ({ onChoose, onCancel, addedIds }: Props) => {
  const [cameras, setCameras] = useState<readonly DiscoveredCamera[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [scanning, setScanning] = useState(true)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualUri, setManualUri] = useState('')

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

  const added = new Set(addedIds)

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <header className="flex items-end justify-between">
        <div className="flex items-end gap-2">
          {onCancel && (
            <Button tone="ghost" onClick={onCancel} className="mb-0.5 px-2" aria-label="뒤로">
              ←
            </Button>
          )}
          <div>
            <h1 className="text-xl font-semibold text-slate-900">카메라 추가</h1>
            <p className="mt-1 text-sm text-slate-500">
              {scanning
                ? '주변 카메라를 찾는 중입니다…'
                : failure
                  ? '검색을 실행하지 못했습니다'
                  : `카메라 ${cameras.length}대를 찾았습니다`}
            </p>
          </div>
        </div>
        <Button onClick={() => void scan()} disabled={scanning}>
          {scanning ? <Spinner /> : null}
          다시 검색
        </Button>
      </header>

      {failure && (
        <Notice tone="bad">
          카메라 검색 기능에 문제가 있습니다. 아래에서 주소를 직접 입력하면 그대로 사용할 수
          있습니다.
          <span className="mt-1 block font-mono text-xs opacity-80">{failure}</span>
        </Notice>
      )}

      <Card>
        {scanning && cameras.length === 0 ? (
          <div className="flex items-center justify-center gap-3 px-4 py-12 text-sm text-slate-500">
            <Spinner />
            같은 네트워크의 ONVIF 카메라를 찾고 있습니다
          </div>
        ) : cameras.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            카메라를 찾지 못했습니다.
            <br />
            카메라가 같은 공유기에 연결되어 있는지 확인하거나, 아래에서 주소를 직접 입력하세요.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cameras.map((camera) => {
              const alreadyAdded = added.has(camera.id)
              return (
                <li key={camera.id}>
                  <button
                    type="button"
                    disabled={alreadyAdded}
                    onClick={() => onChoose({ kind: 'onvif', camera, rtspUri: '' })}
                    className={cn(
                      'w-full text-left transition-colors',
                      'flex items-center justify-between gap-4 px-4 py-3.5',
                      alreadyAdded
                        ? 'cursor-not-allowed opacity-55'
                        : 'hover:bg-slate-50 active:bg-slate-100',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {camera.manufacturer ?? '알 수 없는 카메라'}
                        {camera.model ? ` ${camera.model}` : ''}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {camera.ip} · ONVIF
                      </span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-sm font-medium',
                        alreadyAdded ? 'text-slate-400' : 'text-indigo-600',
                      )}
                    >
                      {alreadyAdded ? '추가됨' : '추가'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {manualOpen ? (
        <Card className="space-y-3 p-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">RTSP 주소</label>
            <input
              value={manualUri}
              onChange={(event) => setManualUri(event.target.value)}
              placeholder="rtsp://admin:비밀번호@192.168.0.64:554/Streaming/Channels/102"
              className={cn(
                'w-full rounded-lg border border-slate-300 bg-white',
                'px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400',
                'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200',
              )}
            />
          </div>
          <Notice tone="info">
            ONVIF 가 꺼져 있거나 다른 대역에 있는 카메라는 검색에 잡히지 않습니다. 카메라 설명서의
            RTSP 주소에 아이디와 비밀번호를 넣어 입력하세요.
          </Notice>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setManualOpen(false)}>취소</Button>
            <Button
              tone="primary"
              disabled={!manualUri.startsWith('rtsp://')}
              onClick={() => onChoose({ kind: 'manual', camera: null, rtspUri: manualUri.trim() })}
            >
              이 주소로 추가
            </Button>
          </div>
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          카메라가 안 보이나요? → 주소 직접 입력
        </button>
      )}
    </div>
  )
}
