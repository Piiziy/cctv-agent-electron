import { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import type { NotificationSettings, Risk } from '@scene-stealer/api'
import { colors, radius, spacing, type as type_ } from '@scene-stealer/tokens'
import { Button, Caption, Card, Divider, Heading, ListRow, Toggle } from '../../components/ui'
import { useApi } from '../../lib/api'
import { useSession } from '../../lib/session'
import { useStores } from '../../lib/store-context'
import { elapsedLabel, riskLabel } from '../../lib/format'
import { registerForPush, sendLocalTestNotification } from '../../lib/notifications'

const RISKS: readonly Risk[] = ['low', 'medium', 'high']

const shiftHour = (value: string, delta: number): string => {
  const hour = (Number(value.slice(0, 2)) + delta + 24) % 24
  return `${String(hour).padStart(2, '0')}:00`
}

/**
 * 2m 설정.
 * 뼈대의 '위험 종류별 알림 6/7'은 없다 — 종류를 나누지 않으므로 '어느 위험도부터 알릴까' 한 줄로 대체했다.
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
        Alert.alert('저장하지 못했습니다', '잠시 후 다시 시도해 주세요.')
      }
    },
    [api, selected, settings],
  )

  const test = useCallback(async () => {
    if (!selected) return
    setSending(true)
    try {
      await api.sendTestNotification(selected.id)
      await sendLocalTestNotification('evt_1')
      Alert.alert('테스트 알림을 보냈습니다', '잠시 뒤 알림이 오면 탭해 보세요. 상세 화면으로 이동합니다.')
    } catch {
      Alert.alert('보내지 못했습니다', '서버에 연결할 수 없습니다.')
    } finally {
      setSending(false)
    }
  }, [api, selected])

  const quiet = settings?.quietHours

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Heading>설정</Heading>

        <View style={styles.section}>
          <Caption>알림</Caption>
          <Card>
            <View style={styles.block}>
              <Text style={styles.label}>어느 위험도부터 알릴까요</Text>
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
                      <Text style={[styles.segmentText, active && { color: colors.textInverse }]}>
                        {riskLabel[risk]}
                        {risk === 'low' ? ' 이상' : ' 이상'}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              <Caption>위험 종류는 나누지 않습니다. 알림 이름은 '이상 행동' 하나입니다.</Caption>
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
                <Text style={styles.label}>방해금지 (수면)</Text>
                <Text style={styles.sleepValue}>
                  {quiet?.sleepStart ?? '--:--'}–{quiet?.sleepEnd ?? '--:--'}
                </Text>
              </View>
              <View style={styles.steppers}>
                <Stepper
                  caption="시작"
                  value={quiet?.sleepStart ?? '00:00'}
                  onChange={(value) =>
                    settings && void save({ ...settings, quietHours: { ...settings.quietHours, sleepStart: value } })
                  }
                />
                <Stepper
                  caption="종료"
                  value={quiet?.sleepEnd ?? '00:00'}
                  onChange={(value) =>
                    settings && void save({ ...settings, quietHours: { ...settings.quietHours, sleepEnd: value } })
                  }
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

            <View style={styles.block}>
              <Text style={styles.label}>테스트 알림 보내기</Text>
              <Caption>{pushState}</Caption>
              <Button label="보내기" onPress={() => void test()} loading={sending} tone="primary" />
              {/* 서버가 없는 동안 실제 푸시를 쏘려면 이 토큰이 필요하다 (tools/send-push.mjs). */}
              {pushToken ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="푸시 토큰 복사"
                  onPress={() => {
                    void Clipboard.setStringAsync(pushToken)
                    Alert.alert('푸시 토큰을 복사했습니다', 'node tools/send-push.mjs <붙여넣기> 로 실제 푸시를 보낼 수 있습니다.')
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
            <ListRow label={session?.phone.includes('@') ? '이메일' : '전화번호'} value={session?.phone ?? '-'} />
            <Divider />
            <ListRow label="로그아웃" danger onPress={() => void signOut()} />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

/** 네이티브 시간 선택기를 새로 붙이지 않고 1시간 단위로 움직인다 — 수면 구간엔 이 정도면 충분하다. */
const Stepper = ({
  caption, value, onChange,
}: {
  caption: string
  value: string
  onChange: (next: string) => void
}) => (
  <View style={styles.stepper}>
    <Text style={styles.stepperCaption}>{caption}</Text>
    <View style={styles.stepperControls}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${caption} 1시간 빼기`}
        hitSlop={8}
        onPress={() => onChange(shiftHour(value, -1))}
        style={styles.stepperButton}
      >
        <Text style={styles.stepperSign}>−</Text>
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${caption} 1시간 더하기`}
        hitSlop={8}
        onPress={() => onChange(shiftHour(value, 1))}
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
  block: { gap: spacing.sm, paddingVertical: spacing.md },
  label: { ...type_.heading, color: colors.text },
  segments: { flexDirection: 'row', gap: spacing.sm },
  segment: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  segmentText: { ...type_.label, color: colors.text },
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
