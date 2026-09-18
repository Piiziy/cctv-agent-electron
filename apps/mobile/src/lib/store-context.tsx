import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Store } from '@scene-stealer/api'
import { useApi } from './api'
import { config } from './config'
import { useSession } from './session'

interface StoreContextValue {
  readonly stores: readonly Store[]
  readonly selected: Store | null
  readonly loading: boolean
  select(storeId: string): void
  refresh(): Promise<void>
}

const StoreContext = createContext<StoreContextValue | null>(null)

/** 매장은 앱 전체가 공유한다 — 홈 상단 칩에서 바꾸면 기록·설정도 따라간다. */
export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const api = useApi()
  const { session } = useSession()
  const [stores, setStores] = useState<readonly Store[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const next = await api.listStores()
      setStores(next)
      // 실서버 시연은 노트북의 PC 화면과 같은 매장을 봐야 한다.
      const preferred = config.live && next.some((store) => store.id === config.liveStoreId) ? config.liveStoreId : null
      setSelectedId((current) => current ?? preferred ?? next[0]?.id ?? null)
    } finally {
      setLoading(false)
    }
  }, [api, session])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<StoreContextValue>(
    () => ({
      stores,
      selected: stores.find((s) => s.id === selectedId) ?? null,
      loading,
      select: setSelectedId,
      refresh,
    }),
    [stores, selectedId, loading, refresh],
  )
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useStores = (): StoreContextValue => {
  const value = useContext(StoreContext)
  if (!value) throw new Error('StoreProvider 안에서만 쓸 수 있습니다')
  return value
}
