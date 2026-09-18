import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import type { EventListItem, Monitoring } from '@scene-stealer/api'
import { colors, radius, spacing, type as type_ } from '@scene-stealer/tokens'
import { Caption, Card, Chip, EmptyState, Heading } from '../../components/ui'
import { EventRow } from '../../components/EventRow'
import { useApi } from '../../lib/api'
import { cameraStateLabel, elapsedLabel, localDate, timeOf } from '../../lib/format'
import { useStores } from '../../lib/store-context'

/**
 * 2k 홈.
 * 최상단은 '지금 안전한가' 한 문장이다. 카메라가 죽어 있으면 안전하다고 말하지 않는다.
 */
export default function HomeScreen() {
  const api = useApi()
  const { stores, selected, select, refresh } = useStores()
  const [monitoring, setMonitoring] = useState<Monitoring | null>(null)
  const [events, setEvents] = useState<readonly EventListItem[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!selected) return
    setBusy(true)
    try {
      const [status, page] = await Promise.all([
        api.getMonitoring(selected.id),
        api.listEvents(selected.id, { date: localDate(new Date().toISOString()) }),
      ])
      setMonitoring(status)
      setEvents(page.items)
    } finally {
      setBusy(false)
    }
  }, [api, selected])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const broken = monitoring?.cameras.filter((c) => c.state !== 'connected') ?? []
  const unconfirmed = events.filter((e) => e.state === 'unconfirmed').length
  const pcOffline = monitoring?.device?.online === false

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={() => { void refresh(); void load() }} />}
      >
        <View style={styles.chips}>
          {stores.map((store) => (
            <Chip
              key={store.id}
              label={store.name}
              selected={store.id === selected?.id}
              tone={store.device?.online === false ? 'danger' : 'default'}
              onPress={() => select(store.id)}
            />
          ))}
        </View>

        <Card style={styles.statusCard}>
          <Text style={styles.statusHeadline}>
            {pcOffline
              ? 'PC가 꺼져 있어 감시가 멈췄습니다'
              : `감시 중 · 카메라 ${monitoring?.monitoringCount ?? 0}/${monitoring?.totalCount ?? 0}대`}
          </Text>
          {broken.map((camera) => (
            <Text key={camera.id} style={styles.warn}>
              '{camera.name}' 카메라 {cameraStateLabel[camera.state]}
              {camera.disconnectedForSec ? ` ${elapsedLabel(camera.disconnectedForSec)}` : ''} → PC에서 확인 필요
            </Text>
          ))}
          <Caption>
            마지막 AI 분석 {monitoring?.lastAnalyzedAt ? timeOf(monitoring.lastAnalyzedAt) : '없음'} · 알림 지연 최대{' '}
            {elapsedLabel(monitoring?.segmentSeconds ?? 0)}
          </Caption>
        </Card>

        <View style={styles.sectionHead}>
          <Heading>오늘 위험 신호</Heading>
          {unconfirmed > 0 ? <Text style={styles.unconfirmed}>미확인 {unconfirmed}</Text> : null}
        </View>

        <Card>
          {events.length === 0 ? (
            // PC 가 꺼져 있으면 '위험 신호 없음'은 거짓말이다. 볼 수 없었을 뿐이다.
            <EmptyState
              text={pcOffline ? 'PC가 꺼져 있던 동안은 기록이 없습니다.' : '오늘은 아직 위험 신호가 없습니다.'}
            />
          ) : (
            events.slice(0, 3).map((event) => (
              <EventRow key={event.id} event={event} onPress={() => router.push(`/events/${event.id}`)} />
            ))
          )}
        </Card>

        {events.length > 3 ? (
          <Text style={styles.moreLink} onPress={() => router.push('/records')}>
            기록 전체 보기 ({events.length - 3}건 더)
          </Text>
        ) : null}

        <View style={styles.sectionHead}>
          <Heading>카메라 상태</Heading>
          <Caption>실시간 영상은 PC에서만</Caption>
        </View>
        <View style={styles.chips}>
          {(monitoring?.cameras ?? []).map((camera) => (
            <Chip
              key={camera.id}
              label={
                camera.state === 'connected'
                  ? `● ${camera.name}`
                  : `○ ${camera.name} · ${cameraStateLabel[camera.state]}${camera.disconnectedForSec ? ` ${elapsedLabel(camera.disconnectedForSec)}` : ''}`
              }
              tone={camera.state === 'connected' ? 'default' : 'danger'}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusCard: { padding: spacing.lg, gap: spacing.sm },
  statusHeadline: { ...type_.title, fontSize: 18, color: colors.text },
  warn: { ...type_.label, color: colors.danger },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  unconfirmed: { ...type_.label, color: colors.danger },
  moreLink: { ...type_.label, color: colors.accent, textAlign: 'center', paddingVertical: spacing.sm },
})
