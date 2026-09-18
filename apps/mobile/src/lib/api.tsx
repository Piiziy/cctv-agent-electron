import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createApiClient, createMockApi, type SceneStealerApi } from '@scene-stealer/api'
import { config, usingMockApi } from './config'
import { useSession } from './session'

const ApiContext = createContext<SceneStealerApi | null>(null)

export const ApiProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useSession()

  const api = useMemo<SceneStealerApi>(
    () =>
      usingMockApi
        ? createMockApi()
        : createApiClient({
            baseUrl: config.apiUrl,
            getToken: async () => session?.accessToken ?? null,
          }),
    [session?.accessToken],
  )

  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
}

export const useApi = (): SceneStealerApi => {
  const api = useContext(ApiContext)
  if (!api) throw new Error('ApiProvider 안에서만 쓸 수 있습니다')
  return api
}
