import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { createMockAuth, createSupabaseAuth, type AuthBackend } from './auth'
import { config, usingMockAuth } from './config'
import type { Session } from './session-types'

const KEY = 'scene-stealer.session'

/** 데모 모드 전용 가짜 세션. 가짜 서버가 토큰을 보지 않으므로 값은 아무거나 된다. */
const DEMO_SESSION: Session = {
  accessToken: 'demo',
  refreshToken: null,
  expiresAt: null,
  userId: 'demo-owner',
  phone: '010-0000-0000',
}

/** 웹에는 SecureStore 가 없다. 개발용 미리보기라 localStorage 로 떨어뜨린다. */
const storage = {
  get: async (): Promise<string | null> =>
    Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) ?? null : SecureStore.getItemAsync(KEY),
  set: async (value: string): Promise<void> => {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, value)
    else await SecureStore.setItemAsync(KEY, value)
  },
  clear: async (): Promise<void> => {
    if (Platform.OS === 'web') globalThis.localStorage?.removeItem(KEY)
    else await SecureStore.deleteItemAsync(KEY)
  },
}

interface SessionContextValue {
  readonly session: Session | null
  readonly loading: boolean
  readonly auth: AuthBackend
  signIn(session: Session): Promise<void>
  signOut(): Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const auth = useMemo<AuthBackend>(
    () => (usingMockAuth ? createMockAuth() : createSupabaseAuth(config.supabaseUrl, config.supabaseAnonKey)),
    [],
  )

  useEffect(() => {
    void (async () => {
      const raw = await storage.get().catch(() => null)
      // 데모 페이지에서는 심사위원에게 로그인을 시키지 않는다. 볼 것은 로그인 화면이 아니다.
      setSession(raw ? (JSON.parse(raw) as Session) : config.demo ? DEMO_SESSION : null)
      setLoading(false)
    })()
  }, [])

  const signIn = useCallback(async (next: Session) => {
    await storage.set(JSON.stringify(next))
    setSession(next)
  }, [])

  const signOut = useCallback(async () => {
    await storage.clear()
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({ session, loading, auth, signIn, signOut }),
    [session, loading, auth, signIn, signOut],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export const useSession = (): SessionContextValue => {
  const value = useContext(SessionContext)
  if (!value) throw new Error('SessionProvider 안에서만 쓸 수 있습니다')
  return value
}
