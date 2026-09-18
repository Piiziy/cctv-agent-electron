import { useEffect } from 'react'
import { Stack, router, useRootNavigationState, useSegments } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ApiProvider } from '../lib/api'
import { eventIdFrom, pushSupported } from '../lib/notifications'
import { SessionProvider, useSession } from '../lib/session'
import { StoreProvider } from '../lib/store-context'

/** 로그인 전에는 로그인 화면 밖으로 못 나가고, 로그인 뒤에는 로그인 화면에 머물지 않는다. */
const useAuthGate = () => {
  const { session, loading } = useSession()
  const segments = useSegments()
  const navigationState = useRootNavigationState()

  useEffect(() => {
    if (loading || !navigationState?.key) return
    const onLogin = segments[0] === 'login'
    if (!session && !onLogin) router.replace('/login')
    if (session && onLogin) router.replace('/')
  }, [session, loading, segments, navigationState?.key])
}

/** 알림을 탭하면 그 이벤트 상세로 간다 — 앱이 꺼져 있다가 알림으로 열린 경우까지. */
const useNotificationRouting = () => {
  const { session } = useSession()

  useEffect(() => {
    // 웹 미리보기에는 알림 네이티브 모듈이 없다. 없는 걸 부르면 화면 전체가 죽는다.
    if (!session || !pushSupported) return
    let cancelled = false

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const eventId = eventIdFrom(response?.notification.request.content.data)
      if (!cancelled && eventId) router.push(`/events/${eventId}`)
    })

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const eventId = eventIdFrom(response.notification.request.content.data)
      if (eventId) router.push(`/events/${eventId}`)
    })
    return () => {
      cancelled = true
      subscription.remove()
    }
  }, [session])
}

const Gate = () => {
  useAuthGate()
  useNotificationRouting()
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="events/[id]" options={{ presentation: 'card' }} />
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <ApiProvider>
          <StoreProvider>
            <StatusBar style="dark" />
            <Gate />
          </StoreProvider>
        </ApiProvider>
      </SessionProvider>
    </SafeAreaProvider>
  )
}
