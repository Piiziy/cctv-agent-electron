import { useState } from 'react'
import type { AgentConfig } from '../../shared/types'
import { Button, Card, Field, Notice } from '../components/ui'

interface Props {
  readonly config: AgentConfig
  readonly onSave: (patch: Partial<AgentConfig>) => Promise<void>
  readonly onCancel: (() => void) | null
}

export const ServerSetup = ({ config, onSave, onCancel }: Props) => {
  const [baseUrl, setBaseUrl] = useState(config.backendBaseUrl)
  const [token, setToken] = useState(config.deviceToken)
  const [storeId, setStoreId] = useState(config.storeId)
  const [saving, setSaving] = useState(false)

  const urlError =
    baseUrl.length > 0 && !/^https?:\/\//.test(baseUrl) ? 'http:// 또는 https:// 로 시작해야 합니다' : null
  const complete = baseUrl.length > 0 && token.length > 0 && storeId.length > 0 && !urlError

  const save = async (): Promise<void> => {
    setSaving(true)
    await onSave({ backendBaseUrl: baseUrl.trim(), deviceToken: token.trim(), storeId: storeId.trim() })
    setSaving(false)
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">서버 설정</h1>
        <p className="mt-1 text-sm text-slate-500">
          잘라낸 영상을 보낼 곳입니다. 매장마다 한 번만 설정하면 됩니다.
        </p>
      </header>

      <Card className="space-y-4 p-4">
        <Field
          label="백엔드 주소"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="https://api.example.com"
          error={urlError}
          hint="영상 조각은 이 주소의 /v1/segments 로 전송됩니다"
        />
        <Field
          label="기기 토큰"
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="백엔드에서 발급받은 토큰"
        />
        <Field
          label="매장 ID"
          value={storeId}
          onChange={(event) => setStoreId(event.target.value)}
          placeholder="store-gangnam-01"
          hint="어느 매장에서 온 영상인지 구분하는 값입니다"
        />
        <Notice tone="info">
          기기 ID <span className="font-mono">{config.deviceId}</span> 는 이 PC 에 자동으로
          부여되었습니다. 백엔드에서 이 값으로 수집기를 구분합니다.
        </Notice>
        <div className="flex justify-end gap-2">
          {onCancel && <Button onClick={onCancel}>취소</Button>}
          <Button tone="primary" disabled={!complete || saving} onClick={() => void save()}>
            저장
          </Button>
        </div>
      </Card>
    </div>
  )
}
