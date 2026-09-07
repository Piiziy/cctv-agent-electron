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
  return config.selectedCamera ? 'dashboard' : 'select'
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

  const startMonitoring = useCallback(
    async (camera: SelectedCamera, segmentSeconds: number) => {
      await api.setConfig({ segmentSeconds, streamProfile: camera.streamProfile })
      await api.start(camera)
      setConfig(await api.getConfig())
      setStatus(await api.getStatus())
      setScreen('dashboard')
    },
    [],
  )

  const stopMonitoring = useCallback(async () => {
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
              setScreen(config.selectedCamera ? 'dashboard' : 'select')
            }}
            onCancel={
              config.backendBaseUrl && config.deviceToken && config.storeId
                ? () => setScreen(config.selectedCamera ? 'dashboard' : 'select')
                : null
            }
          />
        )}

        {screen === 'select' && (
          <CameraSelect
            onChoose={(next) => {
              setChoice(next)
              setScreen('setup')
            }}
          />
        )}

        {screen === 'setup' && choice && (
          <CameraSetup
            choice={choice}
            initialSegmentSeconds={config.segmentSeconds}
            onBack={() => setScreen('select')}
            onStart={startMonitoring}
          />
        )}

        {screen === 'dashboard' && (
          <Dashboard
            status={status}
            config={config}
            onStop={stopMonitoring}
            onChangeCamera={() => setScreen('select')}
          />
        )}
      </main>
    </div>
  )
}
