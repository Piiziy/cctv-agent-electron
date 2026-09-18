import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createApiClient, createMockApi, type SceneStealerApi } from '@scene-stealer/api'
import { config, usingMockApi } from './config'
import { useSession } from './session'

const ApiContext = createContext<SceneStealerApi | null>(null)

export const ApiProvider = ({ children }: { children: ReactNode }) => {
  const { session, accessToken } = useSession()

  const api = useMemo<SceneStealerApi>(
    () =>
      usingMockApi
        ? createMockApi(config.clipUrl ? { clipUrl: config.clipUrl } : {})
        : createApiClient({
            baseUrl: config.apiUrl,
            // 실서버 시연은 만료가 가까우면 데모 계정으로 다시 로그인한 토큰을 준다.
            getToken: config.live ? accessToken : async () => session?.accessToken ?? null,
          }),
    [session?.accessToken, accessToken],
  )

  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
}

export const useApi = (): SceneStealerApi => {
  const api = useContext(ApiContext)
  if (!api) throw new Error('ApiProvider 안에서만 쓸 수 있습니다')
  return api
}
