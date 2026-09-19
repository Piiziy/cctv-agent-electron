import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import type { EventListItem, Monitoring } from '@scene-stealer/api'
import { colors, spacing } from '@scene-stealer/tokens'
import { type as type_ } from '../../lib/typography'
import { Caption, Card, Chip, EmptyState, Heading } from '../../components/ui'
import { EventRow } from '../../components/EventRow'
import { DemoNotice } from '../../components/DemoNotice'
import { useApi } from '../../lib/api'
import { config } from '../../lib/config'
import { cameraStateLabel, elapsedLabel, EVENT_NAME, localDate, riskLabel, timeOf } from '../../lib/format'
import { useStores } from '../../lib/store-context'
import { showLocalNotification } from '../../lib/web-push'

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
  /** 이미 본 경고. 처음 읽은 목록은 본 것으로 친다 — 들어오자마자 옛 경고로 알림이 울리면 안 된다. */
  const seen = useRef<Set<string> | null>(null)

  /**
   * 실서버 시연은 잠금화면 푸시를 쓰지 않는다. 대신 이 페이지가 열려 있는 동안 새로 생긴
   * 미확인 경고를 휴대폰 알림으로 띄운다 (알림을 허용했을 때만 — showLocalNotification 이 확인한다).
   */
  const notifyNew = useCallback((items: readonly EventListItem[]) => {
    if (seen.current === null) {
      seen.current = new Set(items.map((item) => item.id))
      return
    }
    for (const item of items) {
      if (seen.current.has(item.id)) continue
      seen.current.add(item.id)
      if (item.state !== 'unconfirmed') continue
      void showLocalNotification(
        `${selected?.name ?? '매장'} · ${item.cameraName ?? '카메라'}`,
        `${EVENT_NAME}이 감지되었습니다 · 위험도 ${riskLabel[item.risk]}`,
        item.id,
      )
    }
  }, [selected?.name])

  const load = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!selected) return
    if (!options.silent) setBusy(true)
    try {
      const [status, page] = await Promise.all([
        api.getMonitoring(selected.id),
        api.listEvents(selected.id, { date: localDate(new Date().toISOString()) }),
      ])
      setMonitoring(status)
      setEvents(page.items)
      if (config.live) notifyNew(page.items)
    } catch {
      // 조용한 새로고침이 실패해도 지금 화면은 그대로 둔다. 당겨서 새로고침하면 다시 묻는다.
    } finally {
      if (!options.silent) setBusy(false)
    }
  }, [api, selected, notifyNew])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  // 매장을 바꾸면 그 매장의 목록을 처음부터 본 것으로 친다.
  useEffect(() => {
    seen.current = null
  }, [selected?.id])

  // 실서버 시연 — 서버 AI 판정은 몇십 초 간격으로 온다. 페이지가 열려 있는 동안 조용히 다시 읽는다.
  // 다른 앱으로 잠깐 가 있어도 돌게 둔다 — 그때 오는 경고가 알림의 쓸모다 (화면이 꺼지면 브라우저가 멈춘다).
  useEffect(() => {
    if (!config.live) return
    const timer = setInterval(() => void load({ silent: true }), 10_000)
    return () => clearInterval(timer)
  }, [load])

  const broken = monitoring?.cameras.filter((c) => c.state !== 'connected') ?? []
  const unconfirmed = events.filter((e) => e.state === 'unconfirmed').length
  const pcOffline = monitoring?.device?.online === false

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={() => { void refresh(); void load() }} />}
      >
        <DemoNotice />

        <View style={styles.chips}>
          {/* 뼈대 2k — 문제가 있는 매장(PC 꺼짐) 칩에 빨간 점. */}
          {stores.map((store) => (
            <Chip
              key={store.id}
              label={store.name}
              selected={store.id === selected?.id}
              tone={store.device?.online === false && store.id !== selected?.id ? 'danger' : 'default'}
              dot={store.device?.online === false ? 'danger' : undefined}
              onPress={() => select(store.id)}
            />
          ))}
        </View>

        <Card style={styles.statusCard}>
          {/* 뼈대 2k — 맨 위 한 문장 앞의 상태 점. PC 2c 와 같이 한 대라도 보고 있으면 초록이다 —
              끊긴 카메라는 바로 아래 빨간 줄이 말한다. PC 가 꺼졌거나 보는 카메라가 없으면 빨강. */}
          <View style={styles.headlineRow}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    pcOffline || (monitoring !== null && monitoring.monitoringCount === 0) ? colors.danger : colors.ok,
                },
              ]}
            />
            <Text style={styles.statusHeadline}>
              {pcOffline
                ? 'PC가 꺼져 있어 감시가 멈췄습니다'
                : `감시 중 · 카메라 ${monitoring?.monitoringCount ?? 0}/${monitoring?.totalCount ?? 0}대`}
            </Text>
          </View>
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
                  ? camera.name
                  : `${camera.name} · ${cameraStateLabel[camera.state]}${camera.disconnectedForSec ? ` ${elapsedLabel(camera.disconnectedForSec)}` : ''}`
              }
              dot={camera.state === 'connected' ? 'ok' : camera.state === 'unknown' ? 'idle' : 'danger'}
              tone={camera.state === 'connected' || camera.state === 'unknown' ? 'default' : 'danger'}
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
  headlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusHeadline: { ...type_.title, fontSize: 18, color: colors.text, flexShrink: 1 },
  warn: { ...type_.label, color: colors.danger },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  unconfirmed: { ...type_.label, color: colors.danger },
  moreLink: { ...type_.label, color: colors.accent, textAlign: 'center', paddingVertical: spacing.sm },
})
