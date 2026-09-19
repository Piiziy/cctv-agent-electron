import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import type { NotificationSettings, Risk } from '@scene-stealer/api'
import { colors, radius, spacing } from '@scene-stealer/tokens'
import { Caption, Card, Divider, Heading, ListRow, Toggle } from '../../components/ui'
import { notify } from '../../lib/alert'
import { useApi } from '../../lib/api'
import { config, usingMockApi } from '../../lib/config'
import { useSession } from '../../lib/session'
import { useStores } from '../../lib/store-context'
import { elapsedLabel, phoneLabel, riskLabel } from '../../lib/format'
import { registerForPush, sendLocalTestNotification } from '../../lib/notifications'
import { type as type_ } from '../../lib/typography'
import { enableWebNotifications, isWeb, needsHomeScreenInstall, showLocalNotification } from '../../lib/web-push'

const RISKS: readonly Risk[] = ['low', 'medium', 'high']

/** 수면 구간을 처음 정할 때 쓰는 값 — 뼈대 2m 의 '01:00–07:00'. */
const SLEEP_DEFAULT = { start: '01:00', end: '07:00' } as const

const shiftHour = (value: string, delta: number): string => {
  const hour = (Number(value.slice(0, 2)) + delta + 24) % 24
  return `${String(hour).padStart(2, '0')}:00`
}

/**
 * 웹(휴대폰 브라우저)의 알림 상태. 네이티브 푸시가 없는 대신 브라우저 알림을 쓴다 —
 * 잠금화면 푸시(서비스워커 + 발송 서버)가 없으면 이 화면을 열어 둔 동안에만 온다. 그대로 말한다.
 */
const webNotificationState = (): string => {
  if (typeof Notification === 'undefined') {
    return needsHomeScreenInstall()
      ? "아이폰은 사파리 공유 버튼 → '홈 화면에 추가'한 앱에서 알림을 받을 수 있습니다"
      : '이 브라우저는 알림을 지원하지 않습니다'
  }
  if (Notification.permission === 'denied') return '알림이 꺼져 있습니다 — 브라우저의 사이트 설정에서 허용해 주세요'
  if (Notification.permission === 'default') return "'지금 보내기'를 누르면 알림을 받을지 묻습니다"
  const lockScreen = !config.live && Boolean(config.pushEndpoint && config.vapidPublicKey)
  return lockScreen ? '이 브라우저로 알림을 받습니다' : '이 화면을 열어 둔 동안 이 브라우저로 알림을 받습니다'
}

/**
 * 2m 설정.
 * 뼈대의 '위험 종류별 알림 6/7'은 없다 — 종류를 나누지 않으므로 PC 2g 처럼 '어떤 위험을 알려드릴까요'
 * 한 줄(낮음 이상 · 보통 이상 · 높음만)로 대체했다.
 * 카메라 추가·비밀번호는 로컬 네트워크가 필요해 PC 전용이다. 여기서는 안내만 한다.
 */
export default function SettingsScreen() {
  const api = useApi()
  const { session, signOut } = useSession()
  const { stores, selected, select } = useStores()
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [pushState, setPushState] = useState<string>('알림 권한 확인 중…')
  const [pushToken, setPushToken] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    if (!selected) return
    setSettings(await api.getNotificationSettings(selected.id))
  }, [api, selected])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  useEffect(() => {
    if (isWeb) {
      setPushState(webNotificationState())
      return
    }
    void (async () => {
      const result = await registerForPush()
      if (!result.ok) return setPushState(result.reason)
      await api.registerPushDevice('expo', result.token).catch(() => undefined)
      setPushToken(result.token)
      setPushState('이 기기로 알림을 받습니다')
    })()
  }, [api])

  /** 화면을 먼저 바꾸고 서버에 보낸다. 실패하면 되돌린다. */
  const save = useCallback(
    async (next: NotificationSettings) => {
      if (!selected || !settings) return
      const previous = settings
      setSettings(next)
      try {
        setSettings(await api.putNotificationSettings(selected.id, next))
      } catch {
        setSettings(previous)
        notify('저장하지 못했습니다', '잠시 후 다시 시도해 주세요.')
      }
    },
    [api, selected, settings],
  )

  /**
   * 웹은 브라우저 알림을 바로 하나 띄운다 — 이 브라우저가 실제로 받는 알림이 그것이다.
   * (서버의 테스트 발송은 앱 푸시로 가서 브라우저에는 오지 않는다.) 누른 순간이라 권한도 여기서 묻는다.
   */
  const testOnWeb = useCallback(async () => {
    const state = await enableWebNotifications()
    setPushState(webNotificationState())
    if (state.kind === 'denied') return notify('알림이 꺼져 있습니다', '브라우저의 사이트 설정에서 알림을 허용해 주세요.')
    if (state.kind === 'unsupported') return notify('알림을 띄울 수 없습니다', state.reason)
    const shown = await showLocalNotification(
      `${selected?.name ?? '씬스틸러'} · 테스트 알림`,
      '위험 신호가 생기면 이렇게 알려 드립니다.',
      '',
    )
    if (!shown) notify('알림을 띄울 수 없습니다', '브라우저의 사이트 설정에서 알림을 허용해 주세요.')
  }, [selected?.name])

  const test = useCallback(async () => {
    if (!selected) return
    setSending(true)
    try {
      if (isWeb) return await testOnWeb()
      await api.sendTestNotification(selected.id)
      // 가짜 서버는 푸시를 보내지 못한다 — 대신 기기 안에서 같은 모양의 알림을 띄운다 (evt_1 은 가짜 서버의 이벤트).
      if (usingMockApi) await sendLocalTestNotification('evt_1')
      notify('테스트 알림을 보냈습니다', '잠시 뒤 알림이 오면 탭해 보세요. 상세 화면으로 이동합니다.')
    } catch {
      notify('보내지 못했습니다', '서버에 연결할 수 없습니다.')
    } finally {
      setSending(false)
    }
  }, [api, selected, testOnWeb])

  const quiet = settings?.quietHours

  /**
   * 수면 구간은 시작·끝이 다 있어야 켜진다. 새 매장은 둘 다 비어 있어서, 한쪽을 처음 누르면
   * 다른 쪽도 뼈대 2m 의 예시(01:00–07:00)로 같이 채운다.
   */
  const setSleep = (patch: { sleepStart?: string; sleepEnd?: string }) => {
    if (!settings) return
    const current = settings.quietHours
    void save({
      ...settings,
      quietHours: {
        ...current,
        sleepStart: patch.sleepStart ?? current.sleepStart ?? SLEEP_DEFAULT.start,
        sleepEnd: patch.sleepEnd ?? current.sleepEnd ?? SLEEP_DEFAULT.end,
      },
    })
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Heading>설정</Heading>

        <View style={styles.section}>
          <Caption>알림</Caption>
          <Card>
            {/* PC 2g 와 같은 문장 · 같은 세그먼트(회색 바탕에 고른 칸만 흰색). */}
            <View style={styles.block}>
              <Text style={styles.rowTitle}>어떤 위험을 알려드릴까요</Text>
              <View style={styles.segments}>
                {RISKS.map((risk) => {
                  const active = settings?.minRisk === risk
                  return (
                    <Pressable
                      key={risk}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      disabled={!settings}
                      onPress={() => settings && void save({ ...settings, minRisk: risk })}
                      style={[styles.segment, active && styles.segmentActive]}
                    >
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                        {risk === 'high' ? '높음만' : `${riskLabel[risk]} 이상`}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              <Caption>고른 위험도 이상만 알립니다.</Caption>
            </View>

            <Divider />

            <ListRow
              label="영업 시간엔 '높음'만"
              value={
                <Toggle
                  value={quiet?.businessHoursHighOnly ?? false}
                  onChange={(next) =>
                    settings &&
                    void save({ ...settings, quietHours: { ...settings.quietHours, businessHoursHighOnly: next } })
                  }
                />
              }
            />
            <Divider />

            <View style={styles.block}>
              <View style={styles.sleepRow}>
                <Text style={styles.rowTitle}>방해금지 (수면)</Text>
                <Text style={styles.sleepValue}>
                  {quiet?.sleepStart && quiet.sleepEnd ? `${quiet.sleepStart}–${quiet.sleepEnd}` : '정하지 않음'}
                </Text>
              </View>
              <View style={styles.steppers}>
                <Stepper
                  caption="시작"
                  value={quiet?.sleepStart ?? null}
                  onChange={(sleepStart) => setSleep({ sleepStart })}
                />
                <Stepper
                  caption="종료"
                  value={quiet?.sleepEnd ?? null}
                  onChange={(sleepEnd) => setSleep({ sleepEnd })}
                />
              </View>
            </View>
            <Divider />

            <ListRow
              label="수면 중에도 '높음'은 알림"
              value={
                <Toggle
                  value={quiet?.overrideDndForHigh ?? false}
                  onChange={(next) =>
                    settings &&
                    void save({ ...settings, quietHours: { ...settings.quietHours, overrideDndForHigh: next } })
                  }
                />
              }
            />
            <Divider />

            {/* 뼈대 2m · PC 2g — 줄 오른쪽의 작은 '지금 보내기'. 아래에 이 기기가 알림을 받는 상태를 적는다. */}
            <View style={styles.block}>
              <View style={styles.testRow}>
                <Text style={styles.rowTitle}>테스트 알림 보내기</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={sending || !selected}
                  onPress={() => void test()}
                  style={({ pressed }) => [styles.smallButton, (pressed || sending) && { opacity: 0.6 }]}
                >
                  <Text style={styles.smallButtonText}>{sending ? '보내는 중…' : '지금 보내기'}</Text>
                </Pressable>
              </View>
              <Caption>{pushState}</Caption>
              {/* 서버가 없는 동안 실제 푸시를 쏘려면 이 토큰이 필요하다 (tools/send-push.mjs). */}
              {pushToken ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="푸시 토큰 복사"
                  onPress={() => {
                    void Clipboard.setStringAsync(pushToken)
                    notify('푸시 토큰을 복사했습니다', 'node tools/send-push.mjs <붙여넣기> 로 실제 푸시를 보낼 수 있습니다.')
                  }}
                  style={({ pressed }) => [styles.token, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.tokenText} numberOfLines={1}>{pushToken}</Text>
                  <Text style={styles.tokenCopy}>복사</Text>
                </Pressable>
              ) : null}
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <Caption>내 매장</Caption>
          <Card>
            {stores.map((store, index) => {
              const offline = !store.device?.online
              const since = store.device?.lastHeartbeatAt
                ? elapsedLabel((Date.now() - Date.parse(store.device.lastHeartbeatAt)) / 1000)
                : null
              return (
                <View key={store.id}>
                  {index > 0 ? <Divider /> : null}
                  <ListRow
                    label={store.name}
                    value={
                      <Text style={[styles.storeState, offline && { color: colors.danger }]}>
                        {offline
                          ? `PC 꺼짐${since ? ` (${since})` : ''} — 감시 중단`
                          : `PC 연결됨 · 카메라 ${store.cameraCount}대`}
                      </Text>
                    }
                    onPress={() => select(store.id)}
                  />
                </View>
              )
            })}
          </Card>
          <Caption>
            매장 추가와 카메라 등록은 같은 네트워크가 필요해 PC 앱에서만 됩니다. 선택한 매장: {selected?.name ?? '없음'}
          </Caption>
        </View>

        <View style={styles.section}>
          <Caption>계정</Caption>
          <Card>
            {/* 실서버 시연의 데모 계정은 번호가 없으면 이메일이 들어 있다 (lib/auth.ts). */}
            <ListRow label={session?.phone.includes('@') ? '이메일' : '전화번호'} value={session ? phoneLabel(session.phone) : '-'} />
            <Divider />
            <ListRow label="로그아웃" danger onPress={() => void signOut()} />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

/**
 * 네이티브 시간 선택기를 새로 붙이지 않고 1시간 단위로 움직인다 — 수면 구간엔 이 정도면 충분하다.
 * 값이 없으면(null) '--:--' 로 두고, 누르면 기본값에서 시작한다 (setSleep).
 */
const Stepper = ({
  caption, value, onChange,
}: {
  caption: string
  value: string | null
  onChange: (next: string | undefined) => void
}) => (
  <View style={styles.stepper}>
    <Text style={styles.stepperCaption}>{caption}</Text>
    <View style={styles.stepperControls}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${caption} 1시간 빼기`}
        hitSlop={8}
        onPress={() => onChange(value ? shiftHour(value, -1) : undefined)}
        style={styles.stepperButton}
      >
        <Text style={styles.stepperSign}>−</Text>
      </Pressable>
      <Text style={[styles.stepperValue, !value && { color: colors.textSecondary }]}>{value ?? '--:--'}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${caption} 1시간 더하기`}
        hitSlop={8}
        onPress={() => onChange(value ? shiftHour(value, 1) : undefined)}
        style={styles.stepperButton}
      >
        <Text style={styles.stepperSign}>+</Text>
      </Pressable>
    </View>
  </View>
)

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  section: { gap: spacing.sm },
  // 카드 안 칸. 옆 여백은 ListRow(16)와 같아야 글자 줄이 맞는다 — 없어서 카드 테두리에 붙어 있었다.
  block: { gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  rowTitle: { ...type_.body, color: colors.text },
  // PC 2g 세그먼트 — gray/100 바탕, 고른 칸만 흰색 + 옅은 그림자 (tokens.css --shadow-segment).
  segments: {
    flexDirection: 'row',
    gap: 2,
    padding: 4,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceSubtle,
  },
  segment: { flex: 1, paddingVertical: spacing.sm + 2, borderRadius: 6, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.bg, boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)' },
  segmentText: { ...type_.label, color: colors.textSecondary },
  segmentTextActive: { fontWeight: '600', color: colors.text },
  testRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  smallButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  smallButtonText: { ...type_.label, fontWeight: '600', color: colors.text },
  sleepRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sleepValue: { ...type_.label, color: colors.textSecondary },
  steppers: { flexDirection: 'row', gap: spacing.md },
  stepper: { flex: 1, gap: spacing.xs },
  stepperCaption: { ...type_.caption, color: colors.textSecondary },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  stepperButton: { paddingHorizontal: spacing.sm },
  stepperSign: { ...type_.heading, color: colors.accent },
  stepperValue: { ...type_.body, color: colors.text },
  storeState: { ...type_.caption, color: colors.textSecondary, maxWidth: 200, textAlign: 'right' },
  token: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tokenText: { ...type_.caption, color: colors.textSecondary, flex: 1 },
  tokenCopy: { ...type_.label, color: colors.accent },
})
