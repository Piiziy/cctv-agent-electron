import { useCallback, useEffect, useState } from 'react'
import type { AgentConfig, AgentStatus, SelectedCamera } from '../shared/types'
import { Button, Spinner } from './components/ui'
import { api, isMock } from './lib/api'
import { CameraSelect, type CameraChoice } from './screens/CameraSelect'
import { CameraSetup } from './screens/CameraSetup'
import { Dashboard } from './screens/Dashboard'
import { ServerSetup } from './screens/ServerSetup'

type Screen = 'server' | 'select' | 'setup' | 'dashboard'

const initialScreen = (config: AgentConfig): Screen => {
  if (!config.backendBaseUrl || !config.deviceToken || !config.storeId) return 'server'
  return config.cameras.length > 0 ? 'dashboard' : 'select'
}

export const App = () => {
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [screen, setScreen] = useState<Screen>('server')
  const [choice, setChoice] = useState<CameraChoice | null>(null)

  useEffect(() => {
    void (async () => {
      const [loadedConfig, loadedStatus] = await Promise.all([api.getConfig(), api.getStatus()])
      setConfig(loadedConfig)
      setStatus(loadedStatus)
      setScreen(initialScreen(loadedConfig))
    })()
    return api.onStatus(setStatus)
  }, [])

  const saveConfig = useCallback(async (patch: Partial<AgentConfig>) => {
    setConfig(await api.setConfig(patch))
  }, [])

  /** 카메라 목록을 갈아끼우고 감시를 다시 건다. */
  const applyCameras = useCallback(async (cameras: readonly SelectedCamera[]) => {
    await api.start(cameras)
    setConfig(await api.getConfig())
    setStatus(await api.getStatus())
  }, [])

  const addCamera = useCallback(
    async (camera: SelectedCamera, segmentSeconds: number) => {
      await api.setConfig({ segmentSeconds, streamProfile: camera.streamProfile })
      const current = await api.getConfig()
      // 같은 카메라를 두 번 넣으면 같은 폴더를 두 프로세스가 쓰게 된다.
      const next = [...current.cameras.filter((c) => c.id !== camera.id), camera]
      await applyCameras(next)
      setScreen('dashboard')
    },
    [applyCameras],
  )

  const removeCamera = useCallback(
    async (cameraId: string) => {
      const current = await api.getConfig()
      const next = current.cameras.filter((c) => c.id !== cameraId)
      if (next.length === 0) {
        await api.stop()
        await api.setConfig({ cameras: [] })
        setConfig(await api.getConfig())
        setStatus(await api.getStatus())
        setScreen('select')
        return
      }
      await applyCameras(next)
    },
    [applyCameras],
  )

  const stopAll = useCallback(async () => {
    await api.stop()
    setStatus(await api.getStatus())
  }, [])

  if (!config || !status) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <Spinner />
      </div>
    )
  }

  const configured = Boolean(config.backendBaseUrl && config.deviceToken && config.storeId)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
        <span className="text-sm font-semibold text-slate-800">CCTV 수집기</span>
        <div className="flex items-center gap-2">
          {isMock && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              미리보기 모드
            </span>
          )}
          <Button tone="ghost" onClick={() => setScreen('server')}>
            서버 설정
          </Button>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto p-6">
        {screen === 'server' && (
          <ServerSetup
            config={config}
            onSave={async (patch) => {
              await saveConfig(patch)
              setScreen(config.cameras.length > 0 ? 'dashboard' : 'select')
            }}
            onCancel={
              configured ? () => setScreen(config.cameras.length > 0 ? 'dashboard' : 'select') : null
            }
          />
        )}

        {screen === 'select' && (
          <CameraSelect
            addedIds={config.cameras.map((c) => c.id)}
            onChoose={(next) => {
              setChoice(next)
              setScreen('setup')
            }}
            onCancel={config.cameras.length > 0 ? () => setScreen('dashboard') : null}
          />
        )}

        {screen === 'setup' && choice && (
          <CameraSetup
            choice={choice}
            initialSegmentSeconds={config.segmentSeconds}
            onBack={() => setScreen('select')}
            onAdd={addCamera}
          />
        )}

        {screen === 'dashboard' && (
          <Dashboard
            status={status}
            config={config}
            onStop={stopAll}
            onAddCamera={() => setScreen('select')}
            onRemoveCamera={removeCamera}
          />
        )}
      </main>
    </div>
  )
}
